import * as fs from 'fs';
import * as path from 'path';
import { google } from 'googleapis';
import { getDb } from './db/database';
import { getDriveClient } from './googleAuth';

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

export interface DrivePendingFile {
  id: number;
  drive_file_id: string;
  name: string;
  mime_type: string;
  modified_time: string | null;
  detected_at: string;
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

// Accepts either a raw folder ID or a full Drive folder URL
// (https://drive.google.com/drive/folders/<ID>?...) — no Picker widget, the
// user just pastes whatever's in their browser's address bar.
function extractFolderId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : trimmed;
}

export function getDriveFolder(): { id: string; name: string } | null {
  const id = getSetting(FOLDER_ID_SETTING_KEY);
  if (!id) return null;
  return { id, name: getSetting(FOLDER_NAME_SETTING_KEY) ?? id };
}

// Validates the folder is real and accessible before saving it, so a bad
// paste (wrong link, no access) fails immediately with a clear reason rather
// than silently never finding files later.
export async function setDriveFolder(
  input: string
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const client = getDriveClient();
  if (!client) return { ok: false, error: 'Google Drive is not connected yet.' };

  const folderId = extractFolderId(input);
  const drive = google.drive({ version: 'v3', auth: client });
  try {
    const res = await drive.files.get({ fileId: folderId, fields: 'id, name, mimeType' });
    if (res.data.mimeType !== 'application/vnd.google-apps.folder') {
      return { ok: false, error: 'That link is not a folder.' };
    }
    setSetting(FOLDER_ID_SETTING_KEY, folderId);
    setSetting(FOLDER_NAME_SETTING_KEY, res.data.name ?? folderId);
    return { ok: true, name: res.data.name ?? folderId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function listPendingDriveFiles(): DrivePendingFile[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM drive_pending_files WHERE ignored = 0 ORDER BY detected_at DESC')
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
  drive: ReturnType<typeof google.drive>,
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
  const client = getDriveClient();
  const folder = getDriveFolder();
  if (!client || !folder) return false;

  // Recurses into any subfolders under the configured folder too — the user
  // organizes the watched folder with subfolders (e.g. one per course) and
  // still wants every file found anywhere underneath it to count.
  const drive = google.drive({ version: 'v3', auth: client });
  const files = await listDriveFilesRecursively(drive, folder.id);

  const db = getDb();

  // Mirror deletion: a file removed from Drive (or moved out of the folder)
  // before it was ever reviewed shouldn't linger in the pending list forever
  // — same reconciliation idea as local watched folders (reconcileWatchedFolder
  // in main.ts), just done on every scan here rather than only at watcher
  // start, since polling already runs regularly.
  const stillPresentIds = new Set(files.map((f) => f.id).filter((id): id is string => Boolean(id)));
  const pending = db.prepare('SELECT drive_file_id FROM drive_pending_files').all() as {
    drive_file_id: string;
  }[];
  const deleteStalePending = db.prepare('DELETE FROM drive_pending_files WHERE drive_file_id = ?');
  let changed = false;
  for (const row of pending) {
    if (!stillPresentIds.has(row.drive_file_id)) {
      deleteStalePending.run(row.drive_file_id);
      changed = true;
    }
  }

  const alreadyImported = (driveFileId: string): boolean => {
    const inResources = db.prepare('SELECT 1 FROM resources WHERE drive_file_id = ?').get(driveFileId);
    const inNotes = db.prepare('SELECT 1 FROM notes WHERE drive_file_id = ?').get(driveFileId);
    return Boolean(inResources || inNotes);
  };

  const insertPending = db.prepare(
    'INSERT OR IGNORE INTO drive_pending_files (drive_file_id, name, mime_type, modified_time) VALUES (?, ?, ?, ?)'
  );

  for (const file of files) {
    if (!file.id || !file.name) continue;
    if (file.mimeType?.startsWith(GOOGLE_NATIVE_MIME_PREFIX)) continue;
    if (alreadyImported(file.id)) continue;
    const result = insertPending.run(file.id, file.name, file.mimeType ?? 'application/octet-stream', file.modifiedTime ?? null);
    if (result.changes > 0) changed = true;
  }
  return changed;
}

// Downloads a pending file's raw content, handed off by the caller to the
// same import-from-buffer paths manual upload/drag-and-drop already use
// (see notes:importScanBuffer / resources:uploadBuffer in main.ts) —
// dispatched by the type the user assigns in the review panel, since a
// Drive file has no per-type distinction of its own until then.
export async function downloadDriveFileContent(driveFileId: string): Promise<Buffer> {
  const client = getDriveClient();
  if (!client) throw new Error('Google Drive is not connected.');
  const drive = google.drive({ version: 'v3', auth: client });
  const res = await drive.files.get({ fileId: driveFileId, alt: 'media' }, { responseType: 'arraybuffer' });
  return Buffer.from(res.data as ArrayBuffer);
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
  drive: ReturnType<typeof google.drive>,
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
async function ensurePreviewFolder(drive: ReturnType<typeof google.drive>): Promise<string> {
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
  drive: ReturnType<typeof google.drive>,
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

  const drive = google.drive({ version: 'v3', auth: client });
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
  const drive = google.drive({ version: 'v3', auth: client });
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
