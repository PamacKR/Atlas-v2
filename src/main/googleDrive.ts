import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { auth as googleAuth, drive as driveApi } from 'googleapis/build/src/apis/drive';
import { getDb } from './db/database';
import { getBackupsDir } from './paths';
import { getClassroomClient, getDriveClient } from './googleAuth';

const FOLDER_ID_SETTING_KEY = 'google_drive_folder_id';
const FOLDER_NAME_SETTING_KEY = 'google_drive_folder_name';

// Separate from the inbox folder above — this one holds resources Atlas has
// uploaded *to* Drive so they can be viewed there with real layout fidelity
// (open-questions.md #12, ARCHITECTURE.md §7), created and named by Atlas
// itself rather than pointed at by the user.
const PREVIEW_FOLDER_ID_SETTING_KEY = 'google_drive_preview_folder_id';
const PREVIEW_FOLDER_NAME = 'Atlas Previews';

const DRIVE_PREVIEW_MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const IMAGE_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

// Google's own native file types (Docs/Sheets/Slides/...) can't be fetched
// via `alt: 'media'` — that only works for regular binary/text files, which
// is all the phone-scan/tablet-note workflow this is built for actually
// produces (open-questions.md #19). Skipped at scan time rather than
// surfaced as an importable-then-failing item.
const GOOGLE_NATIVE_MIME_PREFIX = 'application/vnd.google-apps.';

type OAuth2Client = InstanceType<typeof googleAuth.OAuth2>;

export interface DrivePendingFile {
  id: number;
  drive_file_id: string;
  source_id: number | null;
  source_name: string | null;
  default_course_id: number | null;
  name: string;
  mime_type: string;
  modified_time: string | null;
  detected_at: string;
}

export interface DriveSource {
  id: number;
  folder_id: string;
  folder_name: string;
  default_course_id: number | null;
  enabled: number;
}

function getSetting(key: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function setSetting(key: string, value: string): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
  ).run(key, value, value);
}

function deleteSetting(key: string): void {
  getDb().prepare('DELETE FROM app_settings WHERE key = ?').run(key);
}

// A folder may be shared to the college account used for Classroom rather
// than the personal account used for Atlas-created Drive previews. Classroom
// already requests drive.readonly for Classroom-linked material, so it is a
// valid read path for a folder explicitly selected by the user. Keep the
// personal Drive client as a fallback for existing inboxes shared there.
function folderAccessClients(): OAuth2Client[] {
  const clients: OAuth2Client[] = [];
  const classroomClient = getClassroomClient();
  if (classroomClient) clients.push(classroomClient);
  const driveClient = getDriveClient();
  if (driveClient) clients.push(driveClient);
  return clients;
}

export function isDriveFolderAccessAvailable(): boolean {
  return folderAccessClients().length > 0;
}

// Accepts either a raw folder ID or a full Drive folder URL
// (https://drive.google.com/drive/folders/<ID>?...) — no Picker widget, the
// user just pastes whatever's in their browser's address bar.
function extractFolderId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : trimmed;
}

function ensureLegacyDriveSource(): void {
  const legacyId = getSetting(FOLDER_ID_SETTING_KEY);
  if (!legacyId) return;
  const db = getDb();
  const existing = db.prepare('SELECT id FROM drive_sources WHERE folder_id = ?').get(legacyId) as { id: number } | undefined;
  if (existing) {
    db.prepare('UPDATE drive_pending_files SET source_id = ? WHERE source_id IS NULL').run(existing.id);
    return;
  }
  const result = db.prepare('INSERT INTO drive_sources (folder_id, folder_name) VALUES (?, ?)').run(
    legacyId,
    getSetting(FOLDER_NAME_SETTING_KEY) ?? legacyId
  );
  db.prepare('UPDATE drive_pending_files SET source_id = ? WHERE source_id IS NULL').run(Number(result.lastInsertRowid));

  // The previous single-folder setting was overwritten whenever the user
  // switched inboxes. If a dated Atlas backup still contains the old value,
  // recover it as a second source once, so upgrading does not lose a folder
  // the user had already configured.
  const recovered = getSetting('drive_sources_recovered_from_backups');
  if (recovered === '1') return;
  try {
    const backupDir = getBackupsDir();
    const backupNames = fs.readdirSync(backupDir).filter((name) => name.endsWith('.db')).sort().reverse();
    for (const backupName of backupNames) {
      const backup = new Database(path.join(backupDir, backupName), { readonly: true });
      try {
        const oldId = (backup.prepare("SELECT value FROM app_settings WHERE key = 'google_drive_folder_id'").get() as { value: string } | undefined)?.value;
        const oldName = (backup.prepare("SELECT value FROM app_settings WHERE key = 'google_drive_folder_name'").get() as { value: string } | undefined)?.value;
        if (oldId && oldId !== legacyId) {
          db.prepare('INSERT OR IGNORE INTO drive_sources (folder_id, folder_name) VALUES (?, ?)').run(oldId, oldName ?? oldId);
        }
      } finally {
        backup.close();
      }
    }
  } catch {
    // Backups are optional. The Settings UI still allows the user to add any
    // missing folder manually if none can be recovered.
  }
  setSetting('drive_sources_recovered_from_backups', '1');
}

export function listDriveSources(): DriveSource[] {
  ensureLegacyDriveSource();
  return getDb().prepare('SELECT id, folder_id, folder_name, default_course_id, enabled FROM drive_sources ORDER BY id').all() as DriveSource[];
}

export function getDriveFolder(): { id: string; name: string } | null {
  const sources = listDriveSources();
  const source = sources.find((item) => item.enabled) ?? sources[0];
  if (source) return { id: source.folder_id, name: source.folder_name };
  return null;
}

// Validates the folder is real and accessible before saving it, so a bad
// paste (wrong link, no access) fails immediately with a clear reason rather
// than silently never finding files later.
export async function setDriveFolder(
  input: string
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const result = await addDriveSource(input);
  if (result.ok) {
    setSetting(FOLDER_ID_SETTING_KEY, result.folderId);
    setSetting(FOLDER_NAME_SETTING_KEY, result.name);
    return { ok: true, name: result.name };
  }
  return result;
}

export async function addDriveSource(
  input: string,
  defaultCourseId: number | null = null
): Promise<{ ok: true; folderId: string; name: string } | { ok: false; error: string }> {
  const folderId = extractFolderId(input);
  const clients = folderAccessClients();
  if (clients.length === 0) return { ok: false, error: 'Google Drive or Classroom is not connected yet.' };

  let lastError: unknown;
  for (const client of clients) {
    const driveClient = driveApi({ version: 'v3', auth: client });
    try {
      const res = await driveClient.files.get({ fileId: folderId, fields: 'id, name, mimeType' });
      if (res.data.mimeType !== 'application/vnd.google-apps.folder') {
        return { ok: false, error: 'That link is not a folder.' };
      }
      const db = getDb();
      const name = res.data.name ?? folderId;
      const existing = db.prepare('SELECT id FROM drive_sources WHERE folder_id = ?').get(folderId) as { id: number } | undefined;
      if (existing) {
        db.prepare("UPDATE drive_sources SET folder_name = ?, default_course_id = COALESCE(?, default_course_id), enabled = 1, updated_at = datetime('now') WHERE id = ?")
          .run(name, defaultCourseId, existing.id);
      } else {
        db.prepare('INSERT INTO drive_sources (folder_id, folder_name, default_course_id) VALUES (?, ?, ?)')
          .run(folderId, name, defaultCourseId);
      }
      return { ok: true, folderId, name };
    } catch (err) {
      lastError = err;
    }
  }
  return { ok: false, error: lastError instanceof Error ? lastError.message : String(lastError) };
}

export function listPendingDriveFiles(): DrivePendingFile[] {
  ensureLegacyDriveSource();
  const db = getDb();
  return db
    .prepare(`SELECT drive_pending_files.*, drive_sources.folder_name AS source_name,
                     drive_sources.default_course_id
              FROM drive_pending_files
              LEFT JOIN drive_sources ON drive_sources.id = drive_pending_files.source_id
              WHERE drive_pending_files.ignored = 0
              ORDER BY drive_pending_files.detected_at DESC`)
    .all() as DrivePendingFile[];
}

// Marks a pending file as intentionally skipped — the row stays (so the
// UNIQUE constraint on drive_file_id keeps a future scan from re-adding it
// as "new"), it just stops showing up in the pending count/review list.
// Nothing is downloaded or copied anywhere; this is the opposite of import.
export function ignoreDrivePendingFile(driveFileId: string): void {
  const db = getDb();
  db.prepare('UPDATE drive_pending_files SET ignored = 1 WHERE drive_file_id = ?').run(driveFileId);
}

interface DriveFileEntry {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string | null;
}

// Recurses into subfolders too — the user wants to organize the watched
// folder with subfolders (e.g. one per course) and still have every file
// anywhere underneath it show up as a new file to review, not just the ones
// sitting directly in the top-level folder. Depth-capped only as a sanity
// guard against a pathological/cyclical folder structure, not a real
// expected limit for a personal inbox folder.
async function listDriveFilesRecursively(
  drive: ReturnType<typeof driveApi>,
  folderId: string,
  depth = 0
): Promise<DriveFileEntry[]> {
  if (depth > 20) return [];

  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, modifiedTime)',
    pageSize: 200,
  });
  const entries = res.data.files ?? [];

  const files: DriveFileEntry[] = [];
  for (const entry of entries) {
    if (!entry.id || !entry.name) continue;
    if (entry.mimeType === `${GOOGLE_NATIVE_MIME_PREFIX}folder`) {
      files.push(...(await listDriveFilesRecursively(drive, entry.id, depth + 1)));
    } else {
      files.push({
        id: entry.id,
        name: entry.name,
        mimeType: entry.mimeType ?? 'application/octet-stream',
        modifiedTime: entry.modifiedTime ?? null,
      });
    }
  }
  return files;
}

// Scans the configured Drive folder for files not already imported (as a
// resource/note) or already sitting in the pending review list, inserting
// any new ones and removing pending entries for files that disappeared from
// Drive before ever being reviewed. Called once on launch and on a ~20s
// interval while the app is open (see main.ts) — true push would need a
// public HTTPS endpoint, which doesn't fit a local desktop app
// (open-questions.md #19). Returns whether the pending list actually
// changed, so the caller only needs to notify the renderer when it did.
export async function scanDriveFolder(): Promise<boolean> {
  const sources = listDriveSources().filter((source) => source.enabled);
  const clients = folderAccessClients();
  if (clients.length === 0 || sources.length === 0) return false;

  const db = getDb();
  let changed = false;
  for (const source of sources) {
    // Recurses into any subfolders under the configured folder too — the user
    // can organize each source with subfolders and still have every file
    // underneath it appear in one review inbox.
    let files: DriveFileEntry[] | null = null;
    let lastError: unknown;
    for (const client of clients) {
      try {
      const drive = driveApi({ version: 'v3', auth: client });
        files = await listDriveFilesRecursively(drive, source.folder_id);
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (!files) throw lastError instanceof Error ? lastError : new Error(String(lastError));

    // Mirror deletion, but only within this source. A file removed from one
    // folder must not clear a pending item found in another active folder.
    const stillPresentIds = new Set(files.map((f) => f.id).filter((id): id is string => Boolean(id)));
    const pending = db.prepare('SELECT drive_file_id FROM drive_pending_files WHERE source_id = ?').all(source.id) as {
      drive_file_id: string;
    }[];
    const deleteStalePending = db.prepare('DELETE FROM drive_pending_files WHERE drive_file_id = ? AND source_id = ?');
    for (const row of pending) {
      if (!stillPresentIds.has(row.drive_file_id)) {
        deleteStalePending.run(row.drive_file_id, source.id);
        changed = true;
      }
    }

    const alreadyImported = (driveFileId: string): boolean => {
      const inResources = db
        .prepare("SELECT 1 FROM resources WHERE drive_file_id = ? OR (remote_source = 'drive' AND remote_ref = ?)")
        .get(driveFileId, driveFileId);
      const inNotes = db.prepare('SELECT 1 FROM notes WHERE drive_file_id = ?').get(driveFileId);
      return Boolean(inResources || inNotes);
    };

    const insertPending = db.prepare(
      'INSERT OR IGNORE INTO drive_pending_files (drive_file_id, source_id, name, mime_type, modified_time) VALUES (?, ?, ?, ?, ?)'
    );

    for (const file of files) {
      if (!file.id || !file.name) continue;
      if (file.mimeType?.startsWith(GOOGLE_NATIVE_MIME_PREFIX)) continue;
      if (alreadyImported(file.id)) continue;
      const result = insertPending.run(
        file.id,
        source.id,
        file.name,
        file.mimeType ?? 'application/octet-stream',
        file.modifiedTime ?? null
      );
      if (result.changes > 0) changed = true;
    }
  }
  return changed;
}

// Downloads a pending file's raw content, handed off by the caller to the
// same import-from-buffer paths manual upload/drag-and-drop already use
// (see notes:importScanBuffer / resources:uploadBuffer in main.ts) —
// dispatched by the type the user assigns in the review panel, since a
// Drive file has no per-type distinction of its own until then.
export async function downloadDriveFileContent(driveFileId: string): Promise<Buffer> {
  const clients = folderAccessClients();
  if (clients.length === 0) throw new Error('Google Drive or Classroom is not connected.');

  let lastError: unknown;
  for (const client of clients) {
    try {
        const drive = driveApi({ version: 'v3', auth: client });
      const res = await drive.files.get({ fileId: driveFileId, alt: 'media' }, { responseType: 'arraybuffer' });
      return Buffer.from(res.data as ArrayBuffer);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function updateDriveSource(sourceId: number, defaultCourseId: number | null, enabled: boolean): void {
  getDb()
    .prepare("UPDATE drive_sources SET default_course_id = ?, enabled = ?, updated_at = datetime('now') WHERE id = ?")
    .run(defaultCourseId, enabled ? 1 : 0, sourceId);
}

export function removeDriveSource(sourceId: number): void {
  const db = getDb();
  const source = db.prepare('SELECT folder_id FROM drive_sources WHERE id = ?').get(sourceId) as { folder_id: string } | undefined;
  db.prepare('DELETE FROM drive_sources WHERE id = ?').run(sourceId);
  if (source?.folder_id === getSetting(FOLDER_ID_SETTING_KEY)) {
    deleteSetting(FOLDER_ID_SETTING_KEY);
    deleteSetting(FOLDER_NAME_SETTING_KEY);
  }
}

export function removePendingDriveFile(driveFileId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM drive_pending_files WHERE drive_file_id = ?').run(driveFileId);
}

// --- Office file preview via Google Drive (open-questions.md #12) ---
//
// Uploads a local .pptx/.docx/.xlsx to a dedicated Drive folder so it can be
// opened in Drive's own viewer — real slide layout/images/formatting, which
// Atlas's local preview (preview.ts) deliberately doesn't attempt. This is
// the reverse direction of the inbox-folder scan above: a file the user
// already has locally, copied *up* to Drive purely so Drive's viewer can
// show it, not something being imported into Atlas.

function driveViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

// Shared by the root "Atlas Previews" folder and each course's subfolder
// inside it (see ensureCoursePreviewSubfolder) — verifies a remembered
// folder ID still exists and isn't trashed before reusing it (the user
// could delete it by hand in Drive), creating a fresh one otherwise rather
// than every later upload failing with a confusing "not found" against a
// stale parent ID.
async function ensureFolder(
  drive: ReturnType<typeof driveApi>,
  name: string,
  parentId: string | null,
  existingId: string | null
): Promise<string> {
  if (existingId) {
    try {
      const res = await drive.files.get({ fileId: existingId, fields: 'id, trashed' });
      if (!res.data.trashed) return existingId;
    } catch {
      // Folder no longer exists or isn't accessible — fall through and
      // create a fresh one rather than surfacing this as an error.
    }
  }

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    },
    fields: 'id',
  });
  return created.data.id!;
}

// Created once, on first use — named and owned entirely by Atlas, unlike
// the inbox folder (which the user points at by pasting a link).
async function ensurePreviewFolder(drive: ReturnType<typeof driveApi>): Promise<string> {
  const folderId = await ensureFolder(drive, PREVIEW_FOLDER_NAME, null, getSetting(PREVIEW_FOLDER_ID_SETTING_KEY));
  setSetting(PREVIEW_FOLDER_ID_SETTING_KEY, folderId);
  return folderId;
}

// One subfolder per course inside the root preview folder, named after the
// course — otherwise every uploaded file lands in one flat folder under
// just its original filename, and several courses' files sharing an
// identical name (e.g. every course's own "lecture-slides.pptx") would be
// indistinguishable from each other if the user ever looks in Drive
// directly. Folder ID is remembered on the course row itself
// (courses.drive_preview_folder_id), same pattern as the root folder.
async function ensureCoursePreviewSubfolder(
  drive: ReturnType<typeof driveApi>,
  rootFolderId: string,
  courseId: number
): Promise<string> {
  const db = getDb();
  const course = db.prepare('SELECT name, drive_preview_folder_id FROM courses WHERE id = ?').get(courseId) as
    | { name: string; drive_preview_folder_id: string | null }
    | undefined;
  if (!course) throw new Error('Course not found.');

  const folderId = await ensureFolder(drive, course.name, rootFolderId, course.drive_preview_folder_id);
  if (folderId !== course.drive_preview_folder_id) {
    db.prepare('UPDATE courses SET drive_preview_folder_id = ? WHERE id = ?').run(folderId, courseId);
  }
  return folderId;
}

export interface DrivePreviewResult {
  viewUrl: string;
  uploaded: boolean; // false when an already-current cached copy was reused
}

// Uploads (or re-uploads, if the local file changed since last time) a
// resource's file to the preview folder, and returns the URL to open it at.
// A resource whose drive_preview_file_id already points at a copy matching
// the file's current size/mtime is reused as-is — no network call at all —
// which is what makes every open after the first one instant rather than
// re-uploading a multi-megabyte deck every time. There's no byte-level
// upload progress reported (main.ts just tells the renderer "uploading" vs.
// "done") — the googleapis client library's own onUploadProgress hook is
// marked deprecated/ignored in the version this project pins, so it
// wouldn't actually fire; showing a fake percentage from a hook that never
// calls back would be worse than an honest indeterminate spinner.
export async function uploadResourceForPreview(resourceId: number): Promise<DrivePreviewResult> {
  const client = getDriveClient();
  if (!client) throw new Error('Google Drive is not connected.');

  const db = getDb();
  const resource = db
    .prepare(
      'SELECT course_id, file_path, kind, drive_preview_file_id, drive_preview_synced_size, drive_preview_synced_mtime_ms FROM resources WHERE id = ?'
    )
    .get(resourceId) as
    | {
        course_id: number;
        file_path: string;
        kind: string;
        drive_preview_file_id: string | null;
        drive_preview_synced_size: number | null;
        drive_preview_synced_mtime_ms: number | null;
      }
    | undefined;
  if (!resource) throw new Error('Resource not found.');

  const mimeType = resource.kind === 'image'
    ? IMAGE_MIME_TYPES[path.extname(resource.file_path).toLowerCase()]
    : DRIVE_PREVIEW_MIME_TYPES[resource.kind];
  if (!mimeType) throw new Error(`Unsupported file type for Google Drive preview: ${resource.kind}`);

  const stat = fs.statSync(resource.file_path);
  const mtimeMs = Math.round(stat.mtimeMs);

  if (
    resource.drive_preview_file_id &&
    resource.drive_preview_synced_size === stat.size &&
    resource.drive_preview_synced_mtime_ms === mtimeMs
  ) {
    return { viewUrl: driveViewUrl(resource.drive_preview_file_id), uploaded: false };
  }

  const drive = driveApi({ version: 'v3', auth: client });
  const rootFolderId = await ensurePreviewFolder(drive);
  const folderId = await ensureCoursePreviewSubfolder(drive, rootFolderId, resource.course_id);

  // A stream, not a Buffer — googleapis/gaxios switches to a resumable
  // upload automatically once the body is large enough to need it, so a
  // multi-hundred-MB lecture deck doesn't need special-casing here.
  const media = { mimeType, body: fs.createReadStream(resource.file_path) };

  let fileId: string;
  if (resource.drive_preview_file_id) {
    // Re-upload in place (files.update keeps the same file ID) rather than
    // creating a second copy and orphaning the old one in the preview
    // folder — the point of caching by ID is exactly one Drive file per
    // resource, ever.
    const updated = await drive.files.update({ fileId: resource.drive_preview_file_id, media, fields: 'id' });
    fileId = updated.data.id!;
  } else {
    const created = await drive.files.create({
      requestBody: { name: resource.file_path.split(/[/\\]/).pop(), parents: [folderId] },
      media,
      fields: 'id',
    });
    fileId = created.data.id!;
  }

  db.prepare(
    'UPDATE resources SET drive_preview_file_id = ?, drive_preview_synced_size = ?, drive_preview_synced_mtime_ms = ? WHERE id = ?'
  ).run(fileId, stat.size, mtimeMs, resourceId);

  return { viewUrl: driveViewUrl(fileId), uploaded: true };
}

// Best-effort — called when a resource (or its whole course) is deleted, so
// the preview folder doesn't accumulate copies for resources that no longer
// exist in Atlas. Never allowed to block or fail the actual local delete:
// the caller fires this without awaiting/catching, since losing a stray
// Drive file is a cosmetic issue, not a data-loss one.
export async function deletePreviewCopy(driveFileId: string): Promise<void> {
  const client = getDriveClient();
  if (!client) return;
  const drive = driveApi({ version: 'v3', auth: client });
  try {
    await drive.files.delete({ fileId: driveFileId });
  } catch {
    // Already gone, or Drive unreachable — nothing more to do.
  }
}

// Powers the Settings "Clear Drive preview cache" action — deletes every
// uploaded preview copy from Drive and forgets them locally, so a stale or
// unwanted set of uploads can be wiped in one action rather than needing the
// user to hunt down and delete them by hand in Drive.
export async function clearAllPreviewCopies(): Promise<void> {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, drive_preview_file_id FROM resources WHERE drive_preview_file_id IS NOT NULL")
    .all() as { id: number; drive_preview_file_id: string }[];

  for (const row of rows) {
    await deletePreviewCopy(row.drive_preview_file_id);
  }

  db.prepare(
    'UPDATE resources SET drive_preview_file_id = NULL, drive_preview_synced_size = NULL, drive_preview_synced_mtime_ms = NULL WHERE drive_preview_file_id IS NOT NULL'
  ).run();
}
