import { google } from 'googleapis';
import { getDb } from './db/database';
import { getDriveClient } from './googleAuth';

const FOLDER_ID_SETTING_KEY = 'google_drive_folder_id';
const FOLDER_NAME_SETTING_KEY = 'google_drive_folder_name';

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
