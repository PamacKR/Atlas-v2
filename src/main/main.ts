import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { watch, FSWatcher } from 'chokidar';
import { randomUUID } from 'crypto';
import { getDb, closeDb } from './db/database';
import { getFilesDir, getNoteImagesDir, getScanImagesDir, getDataDir } from './paths';
import { getPreview } from './preview';
import { extractTextFromScan, endOcrBatch, OCR_PAGE_SEPARATOR } from './ocr';
import { extractDocumentParts } from './textExtraction';
import { processPendingRemoteResources, driveFileIdFromUrl } from './remoteSync';
import { ensureCourseMemoryFile, ensureGeneralMemoryFile, deleteCourseMemoryFile } from './memoryFiles';
import { toFtsQuery, getCourseBriefing } from './contextBuilder';
import {
  isGoogleDriveConnected,
  authorizeGoogleDrive,
  disconnectGoogleDrive,
  isGoogleClassroomConnected,
  authorizeGoogleClassroom,
  disconnectGoogleClassroom,
} from './googleAuth';
import {
  getDriveFolder,
  setDriveFolder,
  listPendingDriveFiles,
  scanDriveFolder,
  downloadDriveFileContent,
  removePendingDriveFile,
  ignoreDrivePendingFile,
  uploadResourceForPreview,
  deletePreviewCopy,
  clearAllPreviewCopies,
} from './googleDrive';
import {
  scanClassroom,
  listPendingClassroomCourses,
  ignorePendingClassroomCourse,
  removePendingClassroomCourse,
  linkClassroomCourseToExisting,
  listAvailableClassroomCoursesForLinking,
  ClassroomSyncError,
} from './googleClassroom';
import {
  getAshokaPlannerDbPath,
  setAshokaPlannerDbPath,
  listSecuredAshokaCourses,
  getAshokaSemesterHint,
  AshokaCourseCandidate,
} from './ashokaPlanner';
import {
  startLocalServer,
  stopLocalServer,
  getResourceBrowserUrl,
  getNoteBrowserUrl,
  getNoteImageUrl,
} from './localServer';

const KIND_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'pdf',
  '.ppt': 'pptx',
  '.pptx': 'pptx',
  '.doc': 'docx',
  '.docx': 'docx',
  '.xls': 'xlsx',
  '.xlsx': 'xlsx',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.gif': 'image',
  '.webp': 'image',
  '.txt': 'text',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.zip': 'zip',
};

function kindFromExtension(filePath: string): string {
  return KIND_BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? 'other';
}

// Full-text search (PRD §14) — rather than trying to keep `search_index` in
// perfect incremental sync with every resource/note mutation across several
// call sites (manual upload, folder watching, course-storage watching,
// reconciliation, notes CRUD), it's simply rebuilt from scratch on every
// mutation. At this app's scale (one user's own courses/resources/notes) a
// full rebuild is a handful of milliseconds, and "always correct, trivially
// simple" beats "fast but has to be kept in sync by hand at N call sites."
// Resource bodies are only indexed for kinds Atlas can read as plain text
// (text/markdown) — PDFs/DOCX/etc. aren't extracted for search in Phase 1;
// their titles are still searchable.
function rebuildSearchIndex(): void {
  const db = getDb();
  db.prepare('DELETE FROM search_index').run();
  const insert = db.prepare(
    'INSERT INTO search_index (entity_type, entity_id, course_id, title, body) VALUES (?, ?, ?, ?, ?)'
  );

  const resources = db.prepare('SELECT id, course_id, title, kind, file_path, ocr_text FROM resources').all() as {
    id: number;
    course_id: number;
    title: string;
    kind: string;
    file_path: string;
    ocr_text: string | null;
  }[];
  for (const resource of resources) {
    let body = '';
    if (resource.kind === 'text' || resource.kind === 'markdown') {
      try {
        body = fs.readFileSync(resource.file_path, 'utf-8');
      } catch {
        body = '';
      }
    } else if (resource.ocr_text) {
      body = resource.ocr_text;
    }
    insert.run('resource', resource.id, resource.course_id, resource.title, body);
  }

  const notes = db.prepare('SELECT id, course_id, title, content_markdown FROM notes').all() as {
    id: number;
    course_id: number;
    title: string;
    content_markdown: string;
  }[];
  for (const note of notes) {
    insert.run('note', note.id, note.course_id, note.title, note.content_markdown);
  }

  const announcements = db.prepare('SELECT id, course_id, title, body FROM announcements').all() as {
    id: number;
    course_id: number;
    title: string;
    body: string | null;
  }[];
  for (const announcement of announcements) {
    insert.run('announcement', announcement.id, announcement.course_id, announcement.title, announcement.body ?? '');
  }

  const assignments = db.prepare('SELECT id, course_id, title, description FROM assignments').all() as {
    id: number;
    course_id: number;
    title: string;
    description: string | null;
  }[];
  for (const assignment of assignments) {
    insert.run('assignment', assignment.id, assignment.course_id, assignment.title, assignment.description ?? '');
  }

  // Page-aware parts (phase4-spec.md §3.8) — indexed alongside their parent
  // resource so a hit can point the AI agent at "page 214" specifically
  // rather than just the resource's title. entity_id is the document_parts
  // row id, not the resource id, since a search hit resolves to one part.
  const parts = db
    .prepare(
      `SELECT document_parts.id, document_parts.label, document_parts.text, resources.course_id
       FROM document_parts JOIN resources ON resources.id = document_parts.resource_id`
    )
    .all() as { id: number; label: string; text: string; course_id: number }[];
  for (const part of parts) {
    insert.run('document_part', part.id, part.course_id, part.label, part.text);
  }
}

// Subfolder (inside each course's own managed-storage folder) where notes
// get exported as plain .md mirrors — see exportNoteToFile.
const NOTES_SUBFOLDER = 'notes';

// Windows forbids \ / : * ? " < > | in filenames; replace with '-' and trim
// the trailing dots/spaces Windows also disallows at the end of a name.
function sanitizeFolderName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '-').trim().replace(/[. ]+$/, '');
  return cleaned || 'course';
}

// Course folder names are computed once at creation (see courses:create) and
// must not collide with an existing folder on disk from another course.
function uniqueCourseFolderName(desired: string, filesDir: string): string {
  if (!fs.existsSync(path.join(filesDir, desired))) return desired;
  let counter = 2;
  let candidate = `${desired} (${counter})`;
  while (fs.existsSync(path.join(filesDir, candidate))) {
    counter++;
    candidate = `${desired} (${counter})`;
  }
  return candidate;
}

// Uploaded files keep their original filename; only disambiguated (Windows
// Explorer style, "name (2).ext") if that exact name already exists in the
// course's folder.
function uniqueDestPath(dir: string, filename: string): string {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let candidate = filename;
  let counter = 2;
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${base} (${counter})${ext}`;
    counter++;
  }
  return path.join(dir, candidate);
}

// Kinds textExtraction.ts knows how to read. Everything else (image, zip,
// other, link) is marked 'unsupported' immediately rather than left
// 'pending' forever — 'pending' is meant to mean "extraction hasn't run
// yet," not "never will."
const EXTRACTABLE_KINDS = new Set(['pdf', 'pptx', 'xlsx', 'docx', 'text', 'markdown']);

// Runs extraction in the background after a resource is inserted (import is
// not blocked on a large textbook's extraction) and writes the result back —
// document_parts rows plus resources.extraction_status, so the Context
// Builder (phase4-spec.md §3) and the "Run OCR" auto-suggest (§3.7) both see
// it. Fire-and-forget: callers don't await this, matching every other
// upload/import call site's existing non-blocking shape.
function scheduleExtraction(resourceId: number, kind: string, filePath: string): void {
  const db = getDb();
  if (!EXTRACTABLE_KINDS.has(kind)) {
    db.prepare("UPDATE resources SET extraction_status = 'unsupported', extracted_at = datetime('now') WHERE id = ?").run(
      resourceId
    );
    return;
  }

  void extractDocumentParts(kind, filePath).then((result) => {
    const db2 = getDb();
    const insertPart = db2.prepare(
      'INSERT INTO document_parts (resource_id, ordinal, label, text, origin) VALUES (?, ?, ?, ?, ?)'
    );
    db2.transaction(() => {
      db2.prepare("DELETE FROM document_parts WHERE resource_id = ? AND origin = 'extracted'").run(resourceId);
      for (const part of result.parts) {
        insertPart.run(resourceId, part.ordinal, part.label, part.text, 'extracted');
      }
      db2
        .prepare(
          "UPDATE resources SET extraction_status = ?, extraction_error = ?, extracted_at = datetime('now') WHERE id = ?"
        )
        .run(result.status, result.error ?? null, resourceId);
    })();
    rebuildSearchIndex();
    if (mainWindow) mainWindow.webContents.send('resources:extractionUpdated', resourceId);
  });
}

// Catches up any resource whose extraction never ran — pre-existing
// resources from before this column existed (all default to 'pending' via
// the migration) and anything left 'pending' by a crash mid-extraction.
// Needs no one-time app_settings flag the way repairClassroomResourceAddedAtOnce
// does: once a resource is processed its status is no longer 'pending', so
// re-running this on every launch naturally finds nothing left to do.
// Sequential rather than parallel — pdfjs/mammoth aren't known to be safe
// to run many-at-once, and this only ever runs once per resource in
// practice, so throughput doesn't matter. Progress is sent to the renderer
// since a real library's first backfill could take minutes, and silent
// multi-minute background work is exactly how the Classroom sync bug went
// unnoticed for weeks (STATUS.md).
// Bumped whenever the extractors change in a way that would produce better
// output for files already processed — everything is then re-extracted once.
// v2: extraction previously discarded every hyperlink target, skipped PPTX
// speaker notes entirely, and padded spreadsheets with tens of thousands of
// empty cells (remote-attachments-spec.md §2.2). Files extracted by v1 hold
// materially worse text than a re-run would produce, so a one-time re-extract
// is the only way existing resources benefit from the fix.
const EXTRACTION_LOGIC_VERSION = 2;

function resetExtractionForNewLogicVersion(): void {
  const db = getDb();
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'extraction_logic_version'").get() as
    | { value: string }
    | undefined;
  if (Number(row?.value ?? 0) >= EXTRACTION_LOGIC_VERSION) return;

  // Only 'extracted' parts belonging to a *local* resource are dropped —
  // OCR results were reviewed and accepted by the user by hand and must
  // never be silently discarded, and a remote (Classroom/Drive) resource's
  // extracted text has its own version-check cache (remote_fetched_version,
  // remote-attachments-spec.md §6) rather than this local-extractor-logic
  // versioning, so re-running its (potentially rate-limited) network fetch
  // just because a *local* PDF/DOCX extractor improved would be both wrong
  // and wasteful.
  db.exec(`
    DELETE FROM document_parts WHERE origin = 'extracted' AND resource_id IN (
      SELECT id FROM resources WHERE remote_source IS NULL
    )
  `);
  db.exec(
    "UPDATE resources SET extraction_status = 'pending', extraction_error = NULL, extracted_at = NULL WHERE extraction_status IN ('done','empty','failed') AND remote_source IS NULL"
  );
  db.prepare(
    "INSERT INTO app_settings (key, value) VALUES ('extraction_logic_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(String(EXTRACTION_LOGIC_VERSION));
}

// Classroom Drive-link attachments synced *before* remote-attachments-spec.md
// shipped (2026-07-29) were inserted with remote_source/remote_ref/link_kind
// all NULL and extraction_status forced to 'unsupported' — that's the state
// EXTRACTABLE_KINDS gave every 'link' resource before this feature existed.
// A later Classroom sync never revisits them (INSERT OR IGNORE no-ops on an
// already-present classroom_attachment_id), so without this one-time
// backfill they'd stay permanently unreadable even after reconnecting
// Classroom with the new Drive scope. Idempotent — only touches rows still
// at remote_source IS NULL, so it costs nothing on every later launch once
// they're all converted.
function backfillPreExistingRemoteAttachments(): void {
  const db = getDb();
  const candidates = db
    .prepare(
      `SELECT id, file_path FROM resources
       WHERE kind = 'link' AND source = 'classroom' AND remote_source IS NULL
         AND (file_path LIKE 'https://drive.google.com/file/%'
           OR file_path LIKE 'https://docs.google.com/document/%'
           OR file_path LIKE 'https://docs.google.com/presentation/%'
           OR file_path LIKE 'https://docs.google.com/spreadsheets/%')`
    )
    .all() as { id: number; file_path: string }[];
  if (candidates.length === 0) return;

  const update = db.prepare(
    "UPDATE resources SET remote_source = 'drive', remote_ref = ?, link_kind = 'driveFile', extraction_status = 'pending' WHERE id = ?"
  );
  for (const resource of candidates) {
    const fileId = driveFileIdFromUrl(resource.file_path);
    if (fileId) update.run(fileId, resource.id);
  }
}

async function extractAllPendingResources(): Promise<void> {
  const db = getDb();
  resetExtractionForNewLogicVersion();
  // remote_source IS NULL excludes Classroom Drive-link attachments — those
  // have no real file_path to read locally and are handled entirely by
  // processPendingRemoteResources (remoteSync.ts) instead
  // (remote-attachments-spec.md). Without this exclusion, every
  // driveFile-kind link resource would be marked 'unsupported' here before
  // remote fetching ever got a chance to run.
  const pending = db
    .prepare("SELECT id, kind, file_path FROM resources WHERE extraction_status = 'pending' AND remote_source IS NULL")
    .all() as { id: number; kind: string; file_path: string }[];
  if (pending.length === 0) return;

  const insertPart = db.prepare(
    'INSERT INTO document_parts (resource_id, ordinal, label, text, origin) VALUES (?, ?, ?, ?, ?)'
  );

  for (let i = 0; i < pending.length; i++) {
    const resource = pending[i];
    if (mainWindow) {
      mainWindow.webContents.send('extraction:backfillProgress', { done: i, total: pending.length });
    }

    if (!EXTRACTABLE_KINDS.has(resource.kind)) {
      db.prepare("UPDATE resources SET extraction_status = 'unsupported', extracted_at = datetime('now') WHERE id = ?").run(
        resource.id
      );
      continue;
    }

    const result = await extractDocumentParts(resource.kind, resource.file_path);
    db.transaction(() => {
      db.prepare("DELETE FROM document_parts WHERE resource_id = ? AND origin = 'extracted'").run(resource.id);
      for (const part of result.parts) {
        insertPart.run(resource.id, part.ordinal, part.label, part.text, 'extracted');
      }
      db
        .prepare(
          "UPDATE resources SET extraction_status = ?, extraction_error = ?, extracted_at = datetime('now') WHERE id = ?"
        )
        .run(result.status, result.error ?? null, resource.id);
    })();
  }

  rebuildSearchIndex();
  if (mainWindow) {
    mainWindow.webContents.send('extraction:backfillProgress', { done: pending.length, total: pending.length });
  }
}

// Shared by manual upload and folder watching: copies a source file into the
// course's managed storage folder (original filename preserved, disambiguated
// on collision) and inserts the resources row. `watchSourcePath` is set only
// when the import came from a watched folder, so a watcher restart can tell
// "already imported" apart from "new file" (see resources.watch_source_path).
function importFileIntoCourse(
  courseId: number,
  sourcePath: string,
  source: 'manual' | 'local_folder',
  watchSourcePath: string | null
): unknown {
  const db = getDb();
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId) as
    | { folder_name: string }
    | undefined;
  if (!course) return null;

  const originalFilename = path.basename(sourcePath);
  const courseFilesDir = path.join(getFilesDir(), course.folder_name);
  fs.mkdirSync(courseFilesDir, { recursive: true });

  const destPath = uniqueDestPath(courseFilesDir, originalFilename);
  fs.copyFileSync(sourcePath, destPath);

  const insertResult = db
    .prepare(
      `INSERT INTO resources (course_id, title, kind, source, file_path, original_filename, watch_source_path)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      courseId,
      originalFilename,
      kindFromExtension(originalFilename),
      source,
      destPath,
      originalFilename,
      watchSourcePath
    );

  rebuildSearchIndex();
  scheduleExtraction(Number(insertResult.lastInsertRowid), kindFromExtension(originalFilename), destPath);
  return db.prepare('SELECT * FROM resources WHERE id = ?').get(insertResult.lastInsertRowid);
}

// Drag-and-drop upload: the renderer only has the dropped File's contents
// (via arrayBuffer()), not a real filesystem path — Electron's exposure of
// File.path is deprecated/unavailable under contextIsolation, so this writes
// the buffer directly instead of going through importFileIntoCourse's
// copy-from-a-source-path flow. Otherwise identical (same filename
// collision handling via uniqueDestPath, same resources row shape).
function importBufferIntoCourse(
  courseId: number,
  originalFilename: string,
  buffer: Buffer,
  driveFileId: string | null = null
): unknown {
  const db = getDb();
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId) as
    | { folder_name: string }
    | undefined;
  if (!course) return null;

  const courseFilesDir = path.join(getFilesDir(), course.folder_name);
  fs.mkdirSync(courseFilesDir, { recursive: true });

  const destPath = uniqueDestPath(courseFilesDir, originalFilename);
  fs.writeFileSync(destPath, buffer);

  const insertResult = db
    .prepare(
      `INSERT INTO resources (course_id, title, kind, source, file_path, original_filename, drive_file_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      courseId,
      originalFilename,
      kindFromExtension(originalFilename),
      driveFileId ? 'drive' : 'manual',
      destPath,
      originalFilename,
      driveFileId
    );

  rebuildSearchIndex();
  scheduleExtraction(Number(insertResult.lastInsertRowid), kindFromExtension(originalFilename), destPath);
  return db.prepare('SELECT * FROM resources WHERE id = ?').get(insertResult.lastInsertRowid);
}

// One chokidar watcher per watched folder, keyed by watched_folders.id, so a
// single folder can be stopped/started independently of the others.
const activeWatchers = new Map<number, FSWatcher>();

// chokidar's 'unlink' only fires for deletions that happen while it's
// actively watching — a file removed from a watched folder while Atlas
// wasn't running would otherwise leave a stale, broken resource behind
// until the user notices. Run once whenever a folder's watcher (re)starts
// (app launch, or a folder just added) to catch anything missed.
function reconcileWatchedFolder(courseId: number, folderPath: string): void {
  const db = getDb();
  const resources = db
    .prepare(
      `SELECT id, file_path, watch_source_path FROM resources
       WHERE course_id = ? AND source = 'local_folder' AND watch_source_path IS NOT NULL`
    )
    .all(courseId) as { id: number; file_path: string; watch_source_path: string }[];

  const normalizedFolder = path.resolve(folderPath) + path.sep;
  for (const resource of resources) {
    if (!resource.watch_source_path.startsWith(normalizedFolder)) continue;
    if (fs.existsSync(resource.watch_source_path)) continue;
    fs.rmSync(resource.file_path, { force: true });
    db.prepare('DELETE FROM resources WHERE id = ?').run(resource.id);
  }
  rebuildSearchIndex();
}

function startWatchingFolder(folderId: number, courseId: number, folderPath: string): void {
  if (activeWatchers.has(folderId)) return;

  reconcileWatchedFolder(courseId, folderPath);

  const watcher = watch(folderPath, {
    ignoreInitial: false, // pick up files already in the folder, not just future ones
    depth: undefined, // recursive
  });

  watcher.on('add', (filePath) => {
    // Skip dotfiles (.DS_Store, Thumbs.db-style clutter) — never something
    // the user meant to bring into a course.
    if (path.basename(filePath).startsWith('.')) return;

    const db = getDb();
    const already = db
      .prepare('SELECT id FROM resources WHERE watch_source_path = ?')
      .get(filePath);
    if (already) return; // already imported in a previous watch session

    importFileIntoCourse(courseId, filePath, 'local_folder', filePath);
    if (mainWindow) mainWindow.webContents.send('resources:changed', courseId);
  });

  // Mirror deletion: if the source file disappears from the watched folder,
  // the resource it produced is removed from Atlas too, rather than being
  // left behind as a broken entry pointing at nothing.
  watcher.on('unlink', (filePath) => {
    const db = getDb();
    const resource = db.prepare('SELECT * FROM resources WHERE watch_source_path = ?').get(filePath) as
      | { id: number; file_path: string }
      | undefined;
    if (!resource) return;

    fs.rmSync(resource.file_path, { force: true });
    db.prepare('DELETE FROM resources WHERE id = ?').run(resource.id);
    rebuildSearchIndex();
    if (mainWindow) mainWindow.webContents.send('resources:changed', courseId);
  });

  activeWatchers.set(folderId, watcher);
}

function stopWatchingFolder(folderId: number): void {
  const watcher = activeWatchers.get(folderId);
  if (watcher) {
    watcher.close();
    activeWatchers.delete(folderId);
  }
}

// Every course's own managed storage folder is watched too — separately
// from user-configured "watched folders" above, and with no course-mapping
// decision to make, since a course's own folder is unambiguously that
// course's. This is what makes ARCHITECTURE.md §2's promise ("files stay
// somewhere the user can browse and manually add/remove from") actually
// true: without this, a file deleted by hand from
// Downloads/Atlas-Storage/files/<course>/ left a resource row behind that
// errored with "resource not found" when opened, since only external
// watched folders were being monitored for changes.
const activeCourseStorageWatchers = new Map<number, FSWatcher>();

// One-time cleanup for resources that were given a wrong "added" date by a
// past bug (see reconcileCourseStorage's kind != 'link' fix above): every
// Classroom attachment resource's added_at used to get overwritten to
// "right now" on every single app launch, so the Dashboard's "Recently
// added"/"What changed today" widgets falsely showed every synced Classroom
// file as brand new every time the app opened. This repairs the rows
// already sitting in the database from before that fix, using each
// resource's real Classroom posting time (already stored on the
// announcement/assignment/classwork item it came from) — never guessed.
// Gated by an app_settings flag so it only ever runs once; afterwards,
// insertLinkResource (googleClassroom.ts) sets the correct added_at itself
// at the moment a resource is first created, so there's nothing left to fix.
function repairClassroomResourceAddedAtOnce(): void {
  const db = getDb();
  const alreadyRepaired = db
    .prepare("SELECT 1 FROM app_settings WHERE key = 'classroom_resource_added_at_repaired'")
    .get();
  if (alreadyRepaired) return;

  const resources = db
    .prepare(
      "SELECT id, classroom_attachment_id FROM resources WHERE source = 'classroom' AND classroom_attachment_id IS NOT NULL"
    )
    .all() as { id: number; classroom_attachment_id: string }[];

  const findAnnouncementPostedAt = db.prepare(
    'SELECT posted_at FROM announcements WHERE classroom_announcement_id = ?'
  );
  const findAssignmentPostedAt = db.prepare(
    'SELECT posted_at FROM assignments WHERE classroom_coursework_id = ?'
  );
  const findClassworkPostedAt = db.prepare(
    'SELECT posted_at FROM classwork_materials WHERE classroom_coursework_material_id = ?'
  );
  const updateAddedAt = db.prepare('UPDATE resources SET added_at = ? WHERE id = ?');

  for (const resource of resources) {
    // classroom_attachment_id is built as `${ownerId}:${link.url}` (see
    // extractMaterialLinks/saveLinkResources in googleClassroom.ts) —
    // ownerId is a Classroom item ID, which never itself contains ':', so
    // splitting on the first one recovers it correctly even though a URL
    // (the rest of the string) usually does.
    const ownerId = resource.classroom_attachment_id.slice(0, resource.classroom_attachment_id.indexOf(':'));
    if (!ownerId) continue;

    const postedAt = (
      (findAnnouncementPostedAt.get(ownerId) as { posted_at: string | null } | undefined) ??
      (findAssignmentPostedAt.get(ownerId) as { posted_at: string | null } | undefined) ??
      (findClassworkPostedAt.get(ownerId) as { posted_at: string | null } | undefined)
    )?.posted_at;

    if (postedAt) updateAddedAt.run(postedAt, resource.id);
  }

  db.prepare(
    "INSERT INTO app_settings (key, value) VALUES ('classroom_resource_added_at_repaired', '1') ON CONFLICT(key) DO UPDATE SET value = '1'"
  ).run();
  rebuildSearchIndex();
}

function reconcileCourseStorage(courseId: number): void {
  const db = getDb();
  // kind = 'link' resources (Classroom attachments — see googleClassroom.ts)
  // store an external URL in file_path, not a path on this machine's disk —
  // fs.existsSync() on a URL always returns false, which used to make this
  // function delete every single one of them on every launch (they'd then
  // get re-inserted a moment later by the Classroom sync that follows,
  // producing a fresh added_at each time and making the Dashboard falsely
  // report them as "recently added"/"changed today"). Only resources this
  // function actually manages (a real file under this course's own storage
  // folder) should ever be reconciled here.
  const resources = db
    .prepare("SELECT id, file_path FROM resources WHERE course_id = ? AND kind != 'link'")
    .all(courseId) as { id: number; file_path: string }[];
  for (const resource of resources) {
    if (fs.existsSync(resource.file_path)) continue;
    db.prepare('DELETE FROM resources WHERE id = ?').run(resource.id);
  }
  rebuildSearchIndex();
}

function startWatchingCourseStorage(courseId: number, folderName: string): void {
  if (activeCourseStorageWatchers.has(courseId)) return;

  reconcileCourseStorage(courseId);

  const courseFilesDir = path.join(getFilesDir(), folderName);
  fs.mkdirSync(courseFilesDir, { recursive: true });

  const watcher = watch(courseFilesDir, { ignoreInitial: false, depth: undefined });
  const notesSubdir = path.join(courseFilesDir, NOTES_SUBFOLDER) + path.sep;

  watcher.on('add', (filePath) => {
    if (path.basename(filePath).startsWith('.')) return;
    // Atlas's own exported note mirrors (.md files + per-note .assets
    // image folders) live here — see exportNoteToFile. They aren't
    // user-added resources and must never get imported as one.
    if (filePath.startsWith(notesSubdir)) return;

    const db = getDb();
    // Atlas's own upload/folder-watch code already inserts the resource row
    // synchronously right after copying the file, before this async fs
    // event can fire — so an existing match here means "our own copy just
    // landed," not a manually-added file, and should be skipped.
    const already = db.prepare('SELECT id FROM resources WHERE file_path = ?').get(filePath);
    if (already) return;

    const kind = kindFromExtension(filePath);
    const insertResult = db
      .prepare(
        `INSERT INTO resources (course_id, title, kind, source, file_path, original_filename)
         VALUES (?, ?, ?, 'manual', ?, ?)`
      )
      .run(courseId, path.basename(filePath), kind, filePath, path.basename(filePath));
    rebuildSearchIndex();
    scheduleExtraction(Number(insertResult.lastInsertRowid), kind, filePath);
    if (mainWindow) mainWindow.webContents.send('resources:changed', courseId);
  });

  watcher.on('unlink', (filePath) => {
    if (filePath.startsWith(notesSubdir)) return;

    const db = getDb();
    const resource = db.prepare('SELECT id FROM resources WHERE file_path = ?').get(filePath) as
      | { id: number }
      | undefined;
    if (!resource) return;

    db.prepare('DELETE FROM resources WHERE id = ?').run(resource.id);
    rebuildSearchIndex();
    if (mainWindow) mainWindow.webContents.send('resources:changed', courseId);
  });

  activeCourseStorageWatchers.set(courseId, watcher);
}

function stopWatchingCourseStorage(courseId: number): void {
  const watcher = activeCourseStorageWatchers.get(courseId);
  if (watcher) {
    watcher.close();
    activeCourseStorageWatchers.delete(courseId);
  }
}

let mainWindow: BrowserWindow | null = null;

// Remembers the window's size/position/maximized state across launches
// (persisted in app_settings, same mechanism the renderer uses for its own
// preferences) — per the user's request that the app either open maximized
// or at least reopen the way it was left, rather than always resetting to a
// fixed 1280x800. No saved state (first run) defaults to maximized.
interface WindowState {
  width: number;
  height: number;
  x: number | undefined;
  y: number | undefined;
  isMaximized: boolean;
}

function loadWindowState(): WindowState | null {
  const db = getDb();
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('windowState') as
    | { value: string }
    | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as WindowState;
  } catch {
    return null;
  }
}

function saveWindowState(win: BrowserWindow): void {
  const isMaximized = win.isMaximized();
  // getBounds() while maximized reports the maximized size, not the
  // restored one — getNormalBounds() always reports the un-maximized
  // bounds regardless of current state, which is what should be restored
  // into next launch if the window is ever un-maximized.
  const bounds = win.getNormalBounds();
  const state: WindowState = { width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y, isMaximized };
  const db = getDb();
  db.prepare(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
  ).run('windowState', JSON.stringify(state), JSON.stringify(state));
}

function createWindow(): void {
  const savedState = loadWindowState();

  mainWindow = new BrowserWindow({
    width: savedState?.width ?? 1280,
    height: savedState?.height ?? 800,
    x: savedState?.x,
    y: savedState?.y,
    // Hidden by default to save screen space (per user request) — Alt still
    // reveals it temporarily, Electron/Chromium's standard behavior for an
    // auto-hidden menu bar on Windows/Linux. No effect on macOS, which never
    // renders an in-window menu bar to begin with.
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (savedState === null || savedState.isMaximized) mainWindow.maximize();

  // Debounced — resize/move fire continuously while dragging, and only the
  // final state after the user stops actually needs to be persisted.
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (mainWindow) saveWindowState(mainWindow);
    }, 500);
  };
  mainWindow.on('resize', scheduleSave);
  mainWindow.on('move', scheduleSave);
  mainWindow.on('maximize', scheduleSave);
  mainWindow.on('unmaximize', scheduleSave);
  mainWindow.on('close', () => {
    if (saveTimer) clearTimeout(saveTimer);
    if (mainWindow) saveWindowState(mainWindow);
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

// Electron's auto-generated default menu (File/Edit/View/Window/Help) is a
// dev-oriented template — Reload/Toggle DevTools/Force Reload under View,
// generic Undo/Cut/Copy/Paste under Edit — none of it corresponds to a real
// Atlas feature (no File > Open/Save flow, no custom View actions), and
// standard text-field editing (Ctrl+C/X/V, Ctrl+Z) already works natively in
// inputs/contenteditable regardless of whether an application menu exists.
// Removed entirely rather than left as unexplained, oddly-styled dead chrome
// that Alt happened to reveal.
Menu.setApplicationMenu(null);

app.whenReady().then(async () => {
  const db = getDb(); // initializes DB + schema in Downloads/Atlas on first launch
  await startLocalServer(); // backs "Open in browser" — see localServer.ts
  createWindow();

  const watchedFolders = db.prepare('SELECT * FROM watched_folders').all() as {
    id: number;
    course_id: number;
    folder_path: string;
  }[];
  for (const folder of watchedFolders) {
    startWatchingFolder(folder.id, folder.course_id, folder.folder_path);
  }

  const allCourses = db.prepare('SELECT id, folder_name FROM courses').all() as {
    id: number;
    folder_name: string;
  }[];
  for (const course of allCourses) {
    startWatchingCourseStorage(course.id, course.folder_name);
  }

  // Backfills any resources/notes that predate this feature and catches up
  // on anything the reconciliation passes above just cleaned out — cheap
  // enough at this app's scale to just do unconditionally on every launch.
  rebuildSearchIndex();

  // Google Drive "inbox folder" scan (Phase 3, open-questions.md #19) and
  // Google Classroom sync (Phase 3, ARCHITECTURE.md §4b): schedule per each
  // source's configured Off/On-launch/Every-N-minutes setting
  // (open-questions.md #2) — defaults reproduce the prior hardcoded
  // behavior exactly (Drive every 20s, Classroom launch-only), so this is a
  // pure generalization, not a behavior change, unless the user has
  // touched the new Settings controls. True push (Drive's changes.watch
  // webhook) needs a public HTTPS endpoint, which doesn't fit a local
  // desktop app — polling is the accepted near-real-time tradeoff. Both
  // no-op quietly if their source isn't connected yet.
  void applySyncSchedule('drive');
  // Awaited (rather than fire-and-forget) specifically so the one-time
  // added_at repair below can run right after it — that repair depends on
  // this same sync having just backfilled assignments.posted_at for any
  // pre-existing assignment rows (see upsertAssignment in googleClassroom.ts).
  void applySyncSchedule('classroom').then(() => repairClassroomResourceAddedAtOnce());
  void extractAllPendingResources();
  backfillPreExistingRemoteAttachments();
  // Independent of Classroom sync's own post-sync call (scanClassroomAndNotify)
  // — covers a resource left 'pending' from a previous run when Classroom
  // sync is set to Off, so remote attachments still get picked up on launch.
  void runRemoteExtractionAndNotify();
  ensureGeneralMemoryFile();
  // Courses created before Phase 4 shipped never got a memory file, since
  // ensureCourseMemoryFile only runs at creation time — without this every
  // pre-existing course reports `memory: null` to the agent forever.
  // Idempotent (skips any file that already exists), so it costs nothing to
  // run on every launch and also self-heals a file deleted by hand.
  for (const course of db.prepare('SELECT name, folder_name FROM courses').all() as {
    name: string;
    folder_name: string;
  }[]) {
    ensureCourseMemoryFile(course.folder_name, course.name);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  for (const folderId of activeWatchers.keys()) stopWatchingFolder(folderId);
  for (const courseId of activeCourseStorageWatchers.keys()) stopWatchingCourseStorage(courseId);
  stopLocalServer();
  closeDb();
  // The shared Tesseract worker (src/main/ocr.ts) may still be resident if a
  // scan was ever dropped via notes:importScanBuffer, which doesn't
  // terminate it itself (each drop is a separate IPC call, so terminating
  // after every single one would lose the point of reusing one worker
  // across a multi-file drop) — best-effort cleanup on the way out.
  void endOcrBatch();
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC: global search (FTS5, PRD §14) ---

ipcMain.handle('search:query', (_event, query: string) => {
  if (!query.trim()) return [];
  const db = getDb();
  return db
    .prepare(
      `SELECT search_index.entity_type AS entityType,
              search_index.entity_id AS entityId,
              search_index.course_id AS courseId,
              search_index.title AS title,
              courses.name AS courseName,
              snippet(search_index, 4, '<mark>', '</mark>', '…', 12) AS snippet
       FROM search_index
       JOIN courses ON courses.id = search_index.course_id
       WHERE search_index MATCH ?
       ORDER BY rank
       LIMIT 30`
    )
    .all(toFtsQuery(query));
});

// --- IPC: dashboard (PRD §13) ---
// Global (across every course, not scoped to whichever one is selected) —
// the dashboard's whole point is a homepage overview, so "per course" would
// defeat the purpose. v1 covers the three ROADMAP.md-scoped widgets;
// announcements/assignments widgets are v2, once those have real data
// behind them (see open-questions.md #13).

// A small stat-tile row shown above the four dashboard widgets — the user
// felt the dashboard "looks so empty" even with real data behind it; the
// four widgets are all lists that read as sparse/empty whenever the list
// itself is short, with no other visual weight on the page. A stats strip
// gives the top of the page real content regardless of how many items are
// in any one list below it.
ipcMain.handle('dashboard:stats', () => {
  const db = getDb();
  const courseCount = (
    db.prepare('SELECT COUNT(*) AS count FROM courses WHERE archived = 0').get() as { count: number }
  ).count;
  const resourceCount = (db.prepare('SELECT COUNT(*) AS count FROM resources').get() as { count: number }).count;
  const noteCount = (db.prepare('SELECT COUNT(*) AS count FROM notes').get() as { count: number }).count;
  // classroom_removed = 0 (open-questions.md #3): an assignment deleted at
  // the Classroom source shouldn't count toward "upcoming" — planning
  // around a deadline that no longer exists would be actively misleading,
  // unlike stale_import rows which are just old, not gone.
  const upcomingDeadlineCount = (
    db
      .prepare(
        'SELECT COUNT(*) AS count FROM deadlines WHERE completed = 0 AND due_at IS NOT NULL AND stale_import = 0 AND classroom_removed = 0'
      )
      .get() as { count: number }
  ).count;
  return { courseCount, resourceCount, noteCount, upcomingDeadlineCount };
});

ipcMain.handle('dashboard:upcomingDeadlines', () => {
  const db = getDb();
  // Only deadlines with an actual due date — an "upcoming" list is
  // inherently about a timeline, so a no-due-date entry (which the
  // per-course Deadlines list happily shows, sorted last) has nothing
  // meaningful to contribute here. stale_import = 0 excludes rows that were
  // already overdue at the moment they were synced/created (e.g. importing
  // an old Classroom course) — those aren't "upcoming" in any real sense,
  // but a deadline that was future when created and has since lapsed still
  // has stale_import = 0 and correctly shows up here as overdue. The full
  // Calendar page (deadlines:listAllWithCourse) intentionally has no such
  // filter, since past deadlines still belong there.
  return db
    .prepare(
      `SELECT deadlines.*, courses.name AS course_name
       FROM deadlines
       JOIN courses ON courses.id = deadlines.course_id
       WHERE deadlines.completed = 0 AND deadlines.due_at IS NOT NULL AND deadlines.stale_import = 0
         AND deadlines.classroom_removed = 0
       ORDER BY deadlines.due_at ASC
       LIMIT 8`
    )
    .all();
});

// `archived` param: false (default, and every existing caller that doesn't
// pass one) returns only active courses, matching the behavior this handler
// always had. Passing true switches to *only* archived courses instead — the
// Courses page's archived toggle shows one list or the other, never both at
// once, so there's no ambiguity about which state a course card shown here
// is in.
ipcMain.handle('dashboard:courseSummaries', (_event, archived = false) => {
  const db = getDb();
  return db
    .prepare(
      `SELECT courses.*,
              (SELECT COUNT(*) FROM resources WHERE resources.course_id = courses.id) AS resource_count,
              (SELECT COUNT(*) FROM deadlines WHERE deadlines.course_id = courses.id) AS deadline_count,
              (SELECT COUNT(*) FROM notes WHERE notes.course_id = courses.id) AS note_count
       FROM courses
       WHERE courses.archived = ?
       ORDER BY courses.name`
    )
    .all(archived ? 1 : 0);
});

// Archiving/unarchiving only ever flips this one flag — it deliberately
// leaves every file, note, and deadline exactly as-is (unlike Delete, which
// is destructive). An archived course is filtered out of the normal course
// list/pickers/Classroom auto-sync, but stays fully intact and searchable —
// see open-questions.md #4.
// Renaming/re-coding/re-terming a course only ever touches courses.name/
// code/term — never folder_name, which is computed once at creation and
// deliberately kept stable forever (see schema.sql) so every already-stored
// file path, and now every memory file (memoryFiles.ts, keyed by
// folder_name specifically so this rename can't orphan or collide anything)
// stays valid with zero extra work here.
ipcMain.handle('courses:update', (_event, courseId: number, name: string, code: string | null, term: string | null) => {
  const db = getDb();
  db.prepare('UPDATE courses SET name = ?, code = ?, term = ? WHERE id = ?').run(name, code, term, courseId);
  return db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
});

ipcMain.handle('courses:setArchived', (_event, courseId: number, archived: boolean) => {
  const db = getDb();
  db.prepare('UPDATE courses SET archived = ? WHERE id = ?').run(archived ? 1 : 0, courseId);
  return db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
});

// Phase 4 Part E (phase4-spec.md §7) — a plain-Markdown dump of one course's
// context (memory, deadlines, announcements, resource/note inventory) for
// pasting into an AI tool that can't use the MCP server (Part D) directly.
// Reuses getCourseBriefing rather than querying separately, so this and the
// MCP server's atlas_course_briefing can never drift apart on what "a
// course's context" means.
ipcMain.handle('courses:exportContext', (_event, courseId: number) => {
  const db = getDb();
  const briefing = getCourseBriefing(db, courseId);
  if (!briefing.ok) return { ok: false as const, error: briefing.error };

  const lines: string[] = [
    `# ${briefing.course.name}${briefing.course.code ? ` (${briefing.course.code})` : ''}`,
  ];
  if (briefing.course.term) lines.push(`Term: ${briefing.course.term}`);
  lines.push('', '## Memory (what your AI agent has learned about this course)', briefing.memory ?? '_Nothing recorded yet._');
  lines.push('', '## Upcoming deadlines');
  lines.push(
    ...(briefing.upcomingDeadlines.length
      ? briefing.upcomingDeadlines.map((d) => `- ${d.title} (${d.kind}) — due ${d.due_at}`)
      : ['_None._'])
  );
  lines.push('', '## Recent announcements');
  lines.push(
    ...(briefing.recentAnnouncements.length
      ? briefing.recentAnnouncements.map((a) => `- ${a.title} (${a.posted_at})`)
      : ['_None._'])
  );
  lines.push('', '## Resource inventory');
  lines.push(...briefing.resourceCountsByKind.map((rc) => `- ${rc.kind}: ${rc.count}`));
  lines.push('', '## Recent resources (id — title — kind — extraction status)');
  lines.push(...briefing.recentResources.map((r) => `- [#${r.id}] ${r.title} (${r.kind}, extraction: ${r.extraction_status})`));
  lines.push('', '## Notes');
  lines.push(...briefing.recentNotes.map((n) => `- [#${n.id}] ${n.title}${n.generated_by_agent ? ' (agent-generated)' : ''}`));

  const exportsDir = path.join(getDataDir(), 'exports');
  fs.mkdirSync(exportsDir, { recursive: true });
  const filePath = path.join(exportsDir, `atlas-context-${sanitizeFolderName(briefing.course.name)}.md`);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  shell.showItemInFolder(filePath);
  return { ok: true as const, filePath };
});

// Cross-course listings for the global Resources/Notes pages (§7/§8) — the
// per-course listResources/listNotes handlers still exist for course-scoped
// callers (deadline mentions, dashboard drill-through), these two just add
// the course name so a flat, unscoped list can still say which course each
// item belongs to.
ipcMain.handle('resources:listAll', () => {
  const db = getDb();
  return db
    .prepare(
      `SELECT resources.*, courses.name AS course_name
       FROM resources
       JOIN courses ON courses.id = resources.course_id
       ORDER BY resources.added_at DESC`
    )
    .all();
});

ipcMain.handle('notes:listAll', () => {
  const db = getDb();
  return db
    .prepare(
      `SELECT notes.*, courses.name AS course_name
       FROM notes
       JOIN courses ON courses.id = notes.course_id
       ORDER BY notes.updated_at DESC`
    )
    .all();
});

ipcMain.handle('dashboard:recentResources', () => {
  const db = getDb();
  return db
    .prepare(
      `SELECT resources.*, courses.name AS course_name
       FROM resources
       JOIN courses ON courses.id = resources.course_id
       ORDER BY resources.added_at DESC
       LIMIT 8`
    )
    .all();
});

// Returns a combined, timestamp-sorted feed of recently added resources and
// recently updated notes — deliberately more than a day's worth (the
// renderer filters down to "today" itself, comparing each UTC timestamp
// against the user's *local* calendar day, since a server-side SQLite
// date('now') comparison would use UTC's day boundary instead and could be
// wrong by a day depending on the user's timezone/time of day).
ipcMain.handle('dashboard:recentActivity', () => {
  const db = getDb();
  const resources = db
    .prepare(
      `SELECT id, course_id, title, added_at AS timestamp, 'resource' AS entity_type
       FROM resources ORDER BY added_at DESC LIMIT 15`
    )
    .all() as { id: number; course_id: number; title: string; timestamp: string; entity_type: string }[];
  const notes = db
    .prepare(
      `SELECT id, course_id, title, updated_at AS timestamp, 'note' AS entity_type
       FROM notes ORDER BY updated_at DESC LIMIT 15`
    )
    .all() as { id: number; course_id: number; title: string; timestamp: string; entity_type: string }[];

  const courses = db.prepare('SELECT id, name FROM courses').all() as { id: number; name: string }[];
  const courseNameById = new Map(courses.map((c) => [c.id, c.name]));

  return [...resources, ...notes]
    .map((item) => ({ ...item, course_name: courseNameById.get(item.course_id) ?? '' }))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 20);
});

// --- IPC: renderer <-> canonical database ---

ipcMain.handle('courses:list', () => {
  const db = getDb();
  return db.prepare('SELECT * FROM courses WHERE archived = 0 ORDER BY name').all();
});

ipcMain.handle('courses:create', (_event, name: string, code: string | null, term: string | null) => {
  const db = getDb();
  const insertResult = db
    .prepare('INSERT INTO courses (name, code, term, folder_name) VALUES (?, ?, ?, ?)')
    .run(name, code, term, '');
  const courseId = insertResult.lastInsertRowid;

  const folderName = uniqueCourseFolderName(sanitizeFolderName(name), getFilesDir());
  db.prepare('UPDATE courses SET folder_name = ? WHERE id = ?').run(folderName, courseId);
  startWatchingCourseStorage(Number(courseId), folderName);
  ensureCourseMemoryFile(folderName, name);

  return db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
});

// --- Google Drive connection (Phase 3, open-questions.md #19) ---
// This is deliberately just the connect/disconnect handshake for now — the
// folder-scanning/review-panel work is a separate, not-yet-built step.
ipcMain.handle('google:isDriveConnected', () => isGoogleDriveConnected());

ipcMain.handle('google:connectDrive', async () => {
  try {
    await authorizeGoogleDrive();
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('google:disconnectDrive', () => {
  disconnectGoogleDrive();
});

// Deletes every resource's uploaded Drive preview copy (see
// uploadResourceForPreview in googleDrive.ts) and forgets them locally —
// the user's manual escape hatch for reclaiming Drive space or clearing out
// stale uploads, rather than needing to hunt them down by hand in Drive.
ipcMain.handle('google:clearDrivePreviewCache', async () => {
  try {
    await clearAllPreviewCopies();
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
});

// --- Sync configuration (open-questions.md #2) ---
// Every source's sync schedule used to be hardcoded and invisible (Drive
// polled every 20s no matter what, Classroom only on launch/"Sync now") —
// which is also how the Classroom adapter managed to fail on every single
// sync for weeks without the UI ever showing it (open-questions.md #21).
// This makes the schedule a real, visible, user-adjustable setting per
// source, stored as one app_settings string: 'off' | 'launch' |
// 'interval:<seconds>'. Defaults reproduce today's exact prior behavior —
// Drive polls every 20s, Classroom is launch-only — so nothing changes for
// an existing user unless they touch the new Settings controls themselves.
type SyncSource = 'drive' | 'classroom';
type SyncMode = 'off' | 'launch' | 'interval';

const DEFAULT_SYNC_CONFIG: Record<SyncSource, { mode: SyncMode; intervalSeconds: number }> = {
  drive: { mode: 'interval', intervalSeconds: 20 },
  classroom: { mode: 'launch', intervalSeconds: 300 },
};

function getSyncConfig(source: SyncSource): { mode: SyncMode; intervalSeconds: number } {
  const db = getDb();
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(`sync_config_${source}`) as
    | { value: string }
    | undefined;
  if (!row) return DEFAULT_SYNC_CONFIG[source];
  if (row.value === 'off') return { mode: 'off', intervalSeconds: DEFAULT_SYNC_CONFIG[source].intervalSeconds };
  if (row.value === 'launch') return { mode: 'launch', intervalSeconds: DEFAULT_SYNC_CONFIG[source].intervalSeconds };
  const match = row.value.match(/^interval:(\d+)$/);
  if (match) return { mode: 'interval', intervalSeconds: Number(match[1]) };
  return DEFAULT_SYNC_CONFIG[source];
}

function setSyncSetting(key: string, value: string): void {
  const db = getDb();
  db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').run(
    key,
    value,
    value
  );
}

function getSyncSetting(key: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

// Recorded on every automatic *and* manual sync attempt for a source — the
// "last synced"/"last error" the Settings UI shows. lastSuccess is only
// ever moved forward on an actual successful run; lastError is set on
// failure and cleared on a clean success, but a partial failure (some
// courses/files failed, others didn't) still moves lastSuccess forward
// *and* keeps the error visible, since a sync that mostly worked is still
// worth showing as "synced," just with a caveat attached.
function recordSyncResult(source: SyncSource, succeeded: boolean, errorMessage: string | null): void {
  if (succeeded) setSyncSetting(`sync_${source}_last_success`, new Date().toISOString());
  setSyncSetting(`sync_${source}_last_error`, errorMessage ?? '');
}

const syncIntervalTimers: Partial<Record<SyncSource, ReturnType<typeof setInterval>>> = {};

function clearSyncInterval(source: SyncSource): void {
  const timer = syncIntervalTimers[source];
  if (timer) {
    clearInterval(timer);
    delete syncIntervalTimers[source];
  }
}

function runSourceSync(source: SyncSource): Promise<void> {
  return source === 'drive' ? scanDriveAndNotify() : scanClassroomAndNotify().then(() => {});
}

// (Re)applies a source's current config: clears any existing interval
// timer, then — unless the mode is 'off' — runs one sync immediately and,
// for 'interval' mode, starts a new recurring timer at the configured
// period. Called once per source at launch, and again immediately whenever
// the user changes that source's setting, so a change takes effect without
// needing a relaunch. 'off' means no automatic sync at all, not even at
// launch — the user's explicit "Sync now"/per-course-connect actions still
// work regardless of this setting, since those are deliberate user actions,
// not the background schedule this setting controls.
function applySyncSchedule(source: SyncSource): Promise<void> {
  clearSyncInterval(source);
  const { mode, intervalSeconds } = getSyncConfig(source);
  if (mode === 'off') return Promise.resolve();

  const initial = runSourceSync(source);
  if (mode === 'interval') {
    syncIntervalTimers[source] = setInterval(() => void runSourceSync(source), intervalSeconds * 1000);
  }
  return initial;
}

ipcMain.handle('sync:getStatus', () => {
  const sources: SyncSource[] = ['drive', 'classroom'];
  const status: Record<string, unknown> = {};
  for (const source of sources) {
    const { mode, intervalSeconds } = getSyncConfig(source);
    status[source] = {
      mode,
      intervalSeconds,
      lastSuccess: getSyncSetting(`sync_${source}_last_success`),
      lastError: getSyncSetting(`sync_${source}_last_error`) || null,
    };
  }
  return status;
});

// value is 'off' | 'launch' | 'interval:<seconds>' — validated against
// that exact shape before being stored, so a malformed value can never end
// up silently disabling a source's sync or crashing the interval-seconds
// parse later.
ipcMain.handle('sync:setConfig', (_event, source: SyncSource, value: string) => {
  if (value !== 'off' && value !== 'launch' && !/^interval:\d+$/.test(value)) {
    throw new Error(`Invalid sync config value: ${value}`);
  }
  setSyncSetting(`sync_config_${source}`, value);
  void applySyncSchedule(source);
});

ipcMain.handle('sync:now', async (_event, source: SyncSource) => {
  await runSourceSync(source);
});

ipcMain.handle('sync:nowAll', async () => {
  await Promise.all([runSourceSync('drive'), runSourceSync('classroom')]);
});

// Scans the configured Drive folder and, if anything new turned up, tells
// the renderer to refresh its pending-files count/badge — same push-event
// pattern as resources:changed/notes:changed. Called once at launch, then
// on whatever interval the user's configured (see applySyncSchedule
// above — 20s by default, matching the prior hardcoded behavior), and once
// immediately after the user sets/changes the folder so the pending list
// doesn't wait for the next interval tick.
async function scanDriveAndNotify(): Promise<void> {
  try {
    const foundNew = await scanDriveFolder();
    if (foundNew && mainWindow) mainWindow.webContents.send('google:driveChanged');
    recordSyncResult('drive', true, null);
  } catch (err) {
    console.error('Google Drive scan failed:', err);
    recordSyncResult('drive', false, err instanceof Error ? err.message : String(err));
  }
}

ipcMain.handle('google:getDriveFolder', () => getDriveFolder());

ipcMain.handle('google:setDriveFolder', async (_event, link: string) => {
  const result = await setDriveFolder(link);
  if (result.ok) void scanDriveAndNotify();
  return result;
});

ipcMain.handle('google:listPendingDriveFiles', () => listPendingDriveFiles());

// Downloads a pending file's content and imports it via the same
// buffer-based paths manual upload/drag-and-drop already use, branching on
// the type the user assigns in the review panel — a scan/image becomes a
// handwritten note, a plain text/markdown file tagged "Note" becomes a typed
// note, anything tagged "Resource" lands exactly like a manual upload.
ipcMain.handle(
  'google:importDriveFile',
  async (_event, driveFileId: string, name: string, courseId: number, importAs: 'resource' | 'note') => {
    const buffer = await downloadDriveFileContent(driveFileId);

    let result: unknown;
    if (importAs === 'resource') {
      result = importBufferIntoCourse(courseId, name, buffer, driveFileId);
    } else if (isScanFile(name)) {
      result = importScanBufferIntoNote(courseId, name, buffer, driveFileId);
    } else {
      result = importTypedNoteFromBuffer(courseId, buffer, driveFileId);
    }

    removePendingDriveFile(driveFileId);
    return result;
  }
);

// The opposite of import — nothing is downloaded, the file just stops
// showing up as "new" (see ignoreDrivePendingFile for why the row stays
// rather than being deleted outright).
ipcMain.handle('google:ignoreDriveFile', (_event, driveFileId: string) => {
  ignoreDrivePendingFile(driveFileId);
});

// --- Google Classroom connection (Phase 3, ARCHITECTURE.md §4b) ---
// Separate connection from Drive's — expected to be the user's college
// Workspace account rather than the personal account Drive uses
// (open-questions.md #8). No folder-config step (Classroom has no
// folder concept) and no background polling interval, unlike Drive — see
// scanClassroomAndNotify below.
ipcMain.handle('classroom:isConnected', () => isGoogleClassroomConnected());

ipcMain.handle('classroom:connect', async () => {
  try {
    await authorizeGoogleClassroom();
    void scanClassroomAndNotify();
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('classroom:disconnect', () => {
  disconnectGoogleClassroom();
});

// Runs a full scan (new/unmapped courses, plus coursework/announcements/
// classwork for already-mapped courses) and tells the renderer if anything
// changed — same push-event pattern as scanDriveAndNotify. Called once at
// launch, from an explicit "Sync now" button, and on whatever interval the
// user's configured (see applySyncSchedule — launch-only by default,
// matching the prior hardcoded behavior; see ARCHITECTURE.md §4b for why
// that was the original default). Per-course sync errors (see
// syncClassroomCourseworkForMappedCourses) are returned rather than only
// console.error'd, so a real failure is visible in the UI instead of
// looking identical to "nothing new."
async function scanClassroomAndNotify(): Promise<{ changed: boolean; errors: ClassroomSyncError[] }> {
  try {
    const { changed, errors } = await scanClassroom();
    if (changed && mainWindow) mainWindow.webContents.send('classroom:changed');
    if (errors.length > 0) {
      console.error('Google Classroom sync errors:', errors);
      recordSyncResult('classroom', true, `${errors.length} course(s) failed: ${errors.map((e) => e.courseName || e.message).join(', ')}`);
    } else {
      recordSyncResult('classroom', true, null);
    }
    // Runs after coursework sync completes, sequentially, never blocking it
    // (remote-attachments-spec.md §8) — new Classroom attachments just
    // discovered above are exactly what this reads.
    void runRemoteExtractionAndNotify();
    return { changed, errors };
  } catch (err) {
    console.error('Google Classroom scan failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    recordSyncResult('classroom', false, message);
    return { changed: false, errors: [{ courseId: -1, courseName: '', message }] };
  }
}

// Fetches and extracts every pending Classroom Drive attachment (and follows
// links discovered inside them), reusing the same visible-progress channel
// as the local-file backfill (§8 — a silent multi-minute first sync is
// exactly how the original hyperlink-destroying bug went unnoticed for
// weeks, per STATUS.md). A hit discovery/fan-out cap is surfaced to the
// console rather than swallowed — the spec's "never silent" rule (§5.5.3).
async function runRemoteExtractionAndNotify(): Promise<void> {
  try {
    const { changed, capped } = await processPendingRemoteResources((progress) => {
      if (mainWindow) mainWindow.webContents.send('extraction:backfillProgress', progress);
    });
    if (changed) {
      rebuildSearchIndex();
      if (mainWindow) mainWindow.webContents.send('resources:changed');
    }
    if (capped) {
      console.warn('Remote attachment link-following stopped early: per-course discovery cap reached.');
    }
  } catch (err) {
    console.error('Remote attachment extraction failed:', err);
  }
}


ipcMain.handle('classroom:listAvailableCoursesForLinking', () => listAvailableClassroomCoursesForLinking());

// Only used to open a 'link'-kind resource's external URL (Drive file/link/
// YouTube/Form attachment, see preview.ts's 'link' Preview type) — never
// passed a renderer-supplied arbitrary string beyond what's already stored
// in that resource's own file_path.
ipcMain.handle('app:openExternalUrl', (_event, url: string) => {
  void shell.openExternal(url);
});

ipcMain.handle('classroom:listPendingCourses', () => listPendingClassroomCourses());

ipcMain.handle('classroom:ignorePendingCourse', (_event, classroomCourseId: string) => {
  ignorePendingClassroomCourse(classroomCourseId);
});

// Immediately syncs coursework/announcements for the just-mapped course
// after linking, rather than waiting for the next launch/"Sync now" click —
// same reasoning as setDriveFolder's immediate scan after saving a folder:
// the user shouldn't have to trigger a second, separate action to see the
// course they just confirmed actually populate.
ipcMain.handle(
  'classroom:mapCourseToExisting',
  async (_event, classroomCourseId: string, atlasCourseId: number) => {
    linkClassroomCourseToExisting(classroomCourseId, atlasCourseId);
    const { errors } = await scanClassroomAndNotify();
    return { errors };
  }
);

// Creates a brand-new Atlas course for a Classroom course, same steps as
// courses:create, then links it — reuses the exact folder-naming helpers
// courses:create does rather than duplicating course-creation logic in
// googleClassroom.ts, which has no reason to know about on-disk file layout.
ipcMain.handle(
  'classroom:mapCourseToNew',
  async (_event, classroomCourseId: string, name: string, code: string | null, term: string | null) => {
    const db = getDb();
    const insertResult = db
      .prepare('INSERT INTO courses (name, code, term, folder_name, source, classroom_course_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(name, code, term, '', 'classroom', classroomCourseId);
    const courseId = insertResult.lastInsertRowid;

    const folderName = uniqueCourseFolderName(sanitizeFolderName(name), getFilesDir());
    db.prepare('UPDATE courses SET folder_name = ? WHERE id = ?').run(folderName, courseId);
    startWatchingCourseStorage(Number(courseId), folderName);
    ensureCourseMemoryFile(folderName, name);

    removePendingClassroomCourse(classroomCourseId);
    const { errors } = await scanClassroomAndNotify();
    return { course: db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId), errors };
  }
);

// Links a course the user is already viewing (course detail page) directly
// to a Classroom course, via the per-course "Connect to Classroom" picker —
// distinct from the pending-courses review panel, which is for discovering
// new Classroom courses rather than acting on one already on screen.
ipcMain.handle(
  'classroom:connectCourseToClassroom',
  async (_event, atlasCourseId: number, classroomCourseId: string) => {
    linkClassroomCourseToExisting(classroomCourseId, atlasCourseId);
    const { errors } = await scanClassroomAndNotify();
    return { errors };
  }
);

// Disconnecting a course from Classroom also deletes everything that came
// from that link for this course (announcements/assignments/their mirrored
// deadlines/classwork/link-resources) — a real "undo" for connecting the
// wrong Classroom class, which otherwise had no fallback (the user hit this
// exact scenario in practice). The renderer confirms with the user before
// calling this, since it's destructive. Deleting classwork_materials first
// cascades any resources that reference it via classwork_material_id
// (foreign_keys pragma is ON); the resources delete afterward catches
// courseWork/announcement-attachment link-resources not already covered.
ipcMain.handle('classroom:disconnectCourse', (_event, atlasCourseId: number) => {
  const db = getDb();
  const run = db.transaction((courseId: number) => {
    db.prepare("DELETE FROM deadlines WHERE course_id = ? AND source = 'classroom'").run(courseId);
    db.prepare("DELETE FROM assignments WHERE course_id = ? AND source = 'classroom'").run(courseId);
    db.prepare("DELETE FROM announcements WHERE course_id = ? AND source = 'classroom'").run(courseId);
    db.prepare('DELETE FROM classwork_materials WHERE course_id = ?').run(courseId);
    db.prepare("DELETE FROM resources WHERE course_id = ? AND source = 'classroom'").run(courseId);
    db.prepare('UPDATE courses SET classroom_course_id = NULL WHERE id = ?').run(courseId);
  });
  run(atlasCourseId);
  rebuildSearchIndex();
});

// Backs the course-detail Announcements/Assignments/Classwork sections —
// only rendered when the course is actually connected to Classroom (see
// renderer.ts). Classwork's link resources are looked up by
// classwork_material_id; assignment link resources by matching
// classroom_attachment_id's "<courseworkId>:<url>" prefix (see
// googleClassroom.ts's saveLinkResources).
ipcMain.handle('classroom:getCourseContent', (_event, courseId: number) => {
  const db = getDb();
  // classroom_attachment_id is built as `${ownerId}:${link.url}` (see
  // googleClassroom.ts's saveLinkResources) — an announcement's attachments
  // use its own Classroom announcement ID as ownerId, exactly like an
  // assignment's use its courseWork ID below. This was previously missing
  // entirely: the renderer hardcoded an empty links array for every
  // announcement, so an attached Drive file/doc (e.g. a professor's
  // course-index spreadsheet posted as an announcement) never showed up in
  // the app at all, even though the resource itself was synced correctly.
  const linkResourcesForAnnouncement = db.prepare(
    "SELECT id, title, file_path FROM resources WHERE classwork_material_id IS NULL AND classroom_attachment_id LIKE ? || ':%'"
  );
  const announcements = (
    db.prepare('SELECT * FROM announcements WHERE course_id = ? ORDER BY posted_at DESC').all(courseId) as {
      id: number;
      classroom_announcement_id: string | null;
    }[]
  ).map((a) => ({
    ...a,
    links: a.classroom_announcement_id ? linkResourcesForAnnouncement.all(a.classroom_announcement_id) : [],
  }));
  const assignments = db
    .prepare('SELECT * FROM assignments WHERE course_id = ? ORDER BY due_at IS NULL, due_at ASC')
    .all(courseId) as { id: number; classroom_coursework_id: string | null }[];
  const classworkMaterials = db
    .prepare('SELECT * FROM classwork_materials WHERE course_id = ? ORDER BY posted_at DESC')
    .all(courseId) as { id: number }[];

  const linkResourcesForClasswork = db.prepare(
    'SELECT id, title, file_path FROM resources WHERE classwork_material_id = ?'
  );
  const classwork = classworkMaterials.map((item) => ({
    ...item,
    links: linkResourcesForClasswork.all(item.id),
  }));

  const linkResourcesForAssignment = db.prepare(
    "SELECT id, title, file_path FROM resources WHERE classwork_material_id IS NULL AND classroom_attachment_id LIKE ? || ':%'"
  );
  const assignmentsWithLinks = assignments.map((a) => ({
    ...a,
    links: a.classroom_coursework_id ? linkResourcesForAssignment.all(a.classroom_coursework_id) : [],
  }));

  return { announcements, assignments: assignmentsWithLinks, classwork };
});

// --- Ashoka Planner course import (open-questions.md #15) ---
// A one-shot, user-invoked import (never automatic, never polled) that reads
// the user's separate ashoka-planner app's own SQLite file directly —
// there's no network/OAuth involved, it's a local-file-to-local-file read.
// Atlas never writes back to planner.db.
ipcMain.handle('ashoka:getDbPath', () => getAshokaPlannerDbPath());

ipcMain.handle('ashoka:pickDbPath', async () => {
  if (!mainWindow) return { ok: false as const, error: 'No window available.' };
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'SQLite database', extensions: ['db', 'sqlite', 'sqlite3'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return { ok: false as const, error: null };
  return setAshokaPlannerDbPath(result.filePaths[0]);
});

ipcMain.handle('ashoka:listSecuredCourses', () => listSecuredAshokaCourses());

ipcMain.handle('ashoka:getSemesterHint', () => getAshokaSemesterHint());

// Creates a real Atlas course per selected candidate, same folder-creation
// steps as courses:create — reused directly since this is exactly a course
// creation, just with the name/code/description already known instead of
// typed in by hand. `term` is whatever the user confirmed in the review
// panel (planner.db has no reliable calendar-year term to derive one from
// automatically — see ashokaPlanner.ts). Dedup happens here, not at list
// time, since it depends on that confirmed term: a candidate matching an
// existing course by code + term is skipped rather than duplicated.
ipcMain.handle('ashoka:importCourses', (_event, candidates: AshokaCourseCandidate[], term: string) => {
  const db = getDb();
  const created: unknown[] = [];
  let skipped = 0;
  for (const candidate of candidates) {
    const exists = db.prepare('SELECT 1 FROM courses WHERE code = ? AND term = ?').get(candidate.code, term);
    if (exists) {
      skipped++;
      continue;
    }

    const insertResult = db
      .prepare('INSERT INTO courses (name, code, term, folder_name, description) VALUES (?, ?, ?, ?, ?)')
      .run(candidate.title, candidate.code, term, '', candidate.description);
    const courseId = insertResult.lastInsertRowid;

    const folderName = uniqueCourseFolderName(sanitizeFolderName(candidate.title), getFilesDir());
    db.prepare('UPDATE courses SET folder_name = ? WHERE id = ?').run(folderName, courseId);
    startWatchingCourseStorage(Number(courseId), folderName);
    ensureCourseMemoryFile(folderName, candidate.title);

    created.push(db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId));
  }
  return { created, skipped };
});

ipcMain.handle('app:getVersion', () => app.getVersion());

ipcMain.handle('app:getSetting', (_event, key: string) => {
  const db = getDb();
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
});

ipcMain.handle('app:setSetting', (_event, key: string, value: string) => {
  const db = getDb();
  db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').run(
    key,
    value,
    value
  );
});

ipcMain.handle('resources:browserUrl', (_event, resourceId: number) => getResourceBrowserUrl(resourceId));

ipcMain.handle('resources:listByCourse', (_event, courseId: number) => {
  const db = getDb();
  return db
    .prepare('SELECT * FROM resources WHERE course_id = ? ORDER BY added_at DESC')
    .all(courseId);
});

ipcMain.handle('resources:upload', async (_event, courseId: number) => {
  // Test hook: native OS file pickers can't be driven by Playwright, so
  // scripts/verify-app.js supplies a fixed path via this env var instead of
  // going through dialog.showOpenDialog. Never set in normal app usage.
  let sourcePath: string;
  if (process.env.ATLAS_TEST_UPLOAD_PATH) {
    sourcePath = process.env.ATLAS_TEST_UPLOAD_PATH;
  } else {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    sourcePath = result.filePaths[0];
  }

  return importFileIntoCourse(courseId, sourcePath, 'manual', null);
});

ipcMain.handle(
  'resources:uploadBuffer',
  (_event, courseId: number, filename: string, buffer: ArrayBuffer) =>
    importBufferIntoCourse(courseId, filename, Buffer.from(buffer))
);

ipcMain.handle('resources:getPreview', async (_event, resourceId: number) => {
  const db = getDb();
  const resource = db.prepare('SELECT * FROM resources WHERE id = ?').get(resourceId) as
    | { kind: string; file_path: string; zoom_level: number | null }
    | undefined;
  if (!resource) return { type: 'unsupported' };
  return getPreview(resource.kind, resource.file_path, resource.zoom_level);
});

// On-demand OCR for PDFs Atlas can't already read as text (e.g. a scanned
// book with no text layer) — open-questions.md #18. Same "never
// silently trusted" shape as notes:runOcr: returns extracted text only, the
// renderer shows it for review, and it's only written to the DB (and made
// searchable) if the user explicitly saves it via resources:saveOcrText.
ipcMain.handle('resources:runOcr', async (event, resourceId: number) => {
  const db = getDb();
  const resource = db.prepare('SELECT file_path, kind FROM resources WHERE id = ?').get(resourceId) as
    | { file_path: string; kind: string }
    | undefined;
  if (!resource || resource.kind !== 'pdf') return null;
  return extractTextFromScan(resource.file_path, (page, totalPages) => {
    event.sender.send('resources:ocrProgress', { resourceId, page, totalPages });
  });
});

ipcMain.handle('resources:saveOcrText', (_event, resourceId: number, text: string) => {
  const db = getDb();
  db.prepare('UPDATE resources SET ocr_text = ? WHERE id = ?').run(text, resourceId);

  // Split back into one document_parts row per page (phase4-spec.md §3.7) —
  // safe because the review step the user just accepted is display-only
  // (preview-ocr-review-text uses textContent, not an editable field), so
  // the separator ocr.ts joined with is guaranteed to still be intact here.
  // A single recognized image (no separator present) becomes one part.
  const insertPart = db.prepare(
    'INSERT INTO document_parts (resource_id, ordinal, label, text, origin) VALUES (?, ?, ?, ?, ?)'
  );
  const pages = text.split(OCR_PAGE_SEPARATOR).map((t) => t.trim());
  db.transaction(() => {
    db.prepare("DELETE FROM document_parts WHERE resource_id = ? AND origin = 'ocr'").run(resourceId);
    let ordinal = 1;
    for (const pageText of pages) {
      if (!pageText) continue;
      insertPart.run(resourceId, ordinal, `Page ${ordinal}`, pageText, 'ocr');
      ordinal++;
    }
    db.prepare("UPDATE resources SET extraction_status = 'done', extracted_at = datetime('now') WHERE id = ?").run(
      resourceId
    );
  })();
  rebuildSearchIndex();
});

ipcMain.handle('resources:setZoom', (_event, resourceId: number, zoom: number) => {
  const db = getDb();
  db.prepare('UPDATE resources SET zoom_level = ? WHERE id = ?').run(zoom, resourceId);
});

// --- Google Drive preview (open-questions.md #12, ARCHITECTURE.md §7) ---
// Uploads a .pptx/.docx/.xlsx to Atlas's dedicated Drive preview folder (or
// reuses the existing upload if the file hasn't changed) and opens Drive's
// own viewer for it in the user's browser — real slide/document layout,
// which the in-app preview deliberately can't render. Shared by both the
// resource context menu (click handler runs directly in the main process,
// no IPC round-trip needed) and the in-app preview modal's button (which
// does go through resources:openInGoogleDrive below, since that's
// renderer-invoked). Events keep both callers' UI in sync: 'driveOpenStart'
// so the renderer can show "Uploading…" immediately (there's no byte-level
// progress to report — see the comment on uploadResourceForPreview), then
// exactly one of 'driveOpenSuccess'/'driveOpenError'.
const OFFICE_PREVIEW_KINDS = new Set(['pptx', 'docx', 'xlsx']);

async function openResourceInGoogleDrive(resourceId: number, sender: Electron.WebContents): Promise<void> {
  sender.send('resources:driveOpenStart', resourceId);
  try {
    if (!isGoogleDriveConnected()) {
      throw new Error('Google Drive is not connected. Connect it in Settings first.');
    }
    const { viewUrl } = await uploadResourceForPreview(resourceId);
    void shell.openExternal(viewUrl);
    sender.send('resources:driveOpenSuccess', resourceId);
  } catch (err) {
    sender.send('resources:driveOpenError', resourceId, err instanceof Error ? err.message : String(err));
  }
}

// Renderer-invoked entry point (the preview modal's "Open in Google Drive"
// button) — the context menu below calls openResourceInGoogleDrive directly
// instead, since its click handler already runs in the main process.
ipcMain.handle('resources:openInGoogleDrive', (event, resourceId: number) =>
  openResourceInGoogleDrive(resourceId, event.sender)
);

// Native right-click menu. "Open in browser" opens the local-server URL
// (see localServer.ts) in the OS's real default browser — not Electron's own
// preview panel — so files can live in real, switchable browser tabs.
ipcMain.on('resources:contextMenu', (event, resourceId: number) => {
  const db = getDb();
  const resource = db.prepare('SELECT * FROM resources WHERE id = ?').get(resourceId) as
    | { file_path: string; title: string; kind: string }
    | undefined;
  if (!resource) return;

  // A 'link' resource (Classroom Drive-file/link/YouTube/Form attachment,
  // see googleClassroom.ts) has no local file — file_path is the external
  // URL itself, so "open" always means opening that URL directly rather
  // than routing through the local preview server.
  const isLink = resource.kind === 'link';
  const menu = Menu.buildFromTemplate([
    {
      label: isLink ? 'Open link' : 'Open in browser',
      click: () => shell.openExternal(isLink ? resource.file_path : getResourceBrowserUrl(resourceId)),
    },
    // Only for the file kinds where Drive's viewer actually offers something
    // the in-app preview can't (real slide/document layout) — PDFs/images
    // already render natively, and this would just be clutter there.
    ...(OFFICE_PREVIEW_KINDS.has(resource.kind)
      ? [
          {
            label: 'Open in Google Drive',
            click: () => void openResourceInGoogleDrive(resourceId, event.sender),
          },
        ]
      : []),
    { type: 'separator' },
    {
      label: 'Delete',
      click: () => {
        event.sender.send('resources:contextMenuDelete', resourceId);
      },
    },
  ]);
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) menu.popup({ window: win });
});

ipcMain.handle('courses:delete', (_event, courseId: number) => {
  const db = getDb();
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId) as
    | { folder_name: string; name: string }
    | undefined;
  // The resources themselves cascade-delete below via the FK, which would
  // otherwise leave their Drive preview copies (if any) orphaned in Atlas's
  // preview folder forever — collect them first while the rows still exist.
  // Best-effort/not awaited, same reasoning as resources:delete above.
  const previewFileIds = db
    .prepare("SELECT drive_preview_file_id FROM resources WHERE course_id = ? AND drive_preview_file_id IS NOT NULL")
    .all(courseId) as { drive_preview_file_id: string }[];
  for (const row of previewFileIds) void deletePreviewCopy(row.drive_preview_file_id);
  // Stop watching any folders mapped to this course before the watched_folders
  // rows cascade-delete — an orphaned live watcher would keep importing files
  // into a course that no longer exists.
  const foldersToStop = db
    .prepare('SELECT id FROM watched_folders WHERE course_id = ?')
    .all(courseId) as { id: number }[];
  for (const folder of foldersToStop) stopWatchingFolder(folder.id);
  // Same reasoning for the course's own managed-storage watcher — otherwise
  // the recursive rmSync below fires an 'unlink' per file, racing the
  // cascade-delete below for no benefit.
  stopWatchingCourseStorage(courseId);
  // Remove the course's files from disk; the resources rows cascade-delete
  // via the FK (foreign_keys pragma is on, see db/database.ts).
  if (course) {
    const courseFilesDir = path.join(getFilesDir(), course.folder_name);
    fs.rmSync(courseFilesDir, { recursive: true, force: true });
    deleteCourseMemoryFile(course.folder_name);
  }
  db.prepare('DELETE FROM courses WHERE id = ?').run(courseId);
  rebuildSearchIndex();
});

// --- IPC: local folder watching ---

ipcMain.handle('folders:listWatched', (_event, courseId: number) => {
  const db = getDb();
  return db
    .prepare('SELECT * FROM watched_folders WHERE course_id = ? ORDER BY created_at')
    .all(courseId);
});

ipcMain.handle('folders:add', async (_event, courseId: number) => {
  // Same test-hook pattern as resources:upload — native folder pickers can't
  // be driven by Playwright.
  let folderPath: string;
  if (process.env.ATLAS_TEST_WATCH_FOLDER_PATH) {
    folderPath = process.env.ATLAS_TEST_WATCH_FOLDER_PATH;
  } else {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    folderPath = result.filePaths[0];
  }

  const db = getDb();
  const existing = db
    .prepare('SELECT * FROM watched_folders WHERE folder_path = ?')
    .get(folderPath) as { id: number; course_id: number } | undefined;
  if (existing) {
    // Already watched (by this course or another) — surface as-is rather
    // than erroring; folder_path is UNIQUE so a second INSERT would fail.
    return existing;
  }

  const insertResult = db
    .prepare('INSERT INTO watched_folders (course_id, folder_path) VALUES (?, ?)')
    .run(courseId, folderPath);
  const folderId = Number(insertResult.lastInsertRowid);
  startWatchingFolder(folderId, courseId, folderPath);

  return db.prepare('SELECT * FROM watched_folders WHERE id = ?').get(folderId);
});

ipcMain.handle('folders:remove', (_event, folderId: number) => {
  stopWatchingFolder(folderId);
  const db = getDb();
  db.prepare('DELETE FROM watched_folders WHERE id = ?').run(folderId);
});

ipcMain.on('folders:contextMenu', (event, folderId: number) => {
  const menu = Menu.buildFromTemplate([
    {
      label: 'Stop watching',
      click: () => {
        event.sender.send('folders:contextMenuRemove', folderId);
      },
    },
  ]);
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) menu.popup({ window: win });
});

ipcMain.handle('resources:delete', (_event, resourceId: number) => {
  const db = getDb();
  const resource = db.prepare('SELECT * FROM resources WHERE id = ?').get(resourceId) as
    | { file_path: string; drive_preview_file_id: string | null }
    | undefined;
  if (resource) fs.rmSync(resource.file_path, { force: true });
  // Best-effort, not awaited — deleting the resource locally must succeed
  // regardless of whether Drive is reachable right now; a stray leftover
  // file in the preview folder is a cosmetic issue, not a data-loss one.
  if (resource?.drive_preview_file_id) void deletePreviewCopy(resource.drive_preview_file_id);
  db.prepare('DELETE FROM resources WHERE id = ?').run(resourceId);
  rebuildSearchIndex();
});

// Course row has no "open in default app" equivalent — just Archive/Unarchive
// and Delete, kept as a native menu (rather than in-page buttons) for
// consistency with the resource context menu. The Archive label reflects
// this course's current state, looked up fresh each time the menu opens.
ipcMain.on('resources:courseContextMenu', (event, courseId: number) => {
  const db = getDb();
  const course = db.prepare('SELECT archived FROM courses WHERE id = ?').get(courseId) as
    | { archived: number }
    | undefined;
  const isArchived = course?.archived === 1;
  const menu = Menu.buildFromTemplate([
    {
      label: 'Edit',
      click: () => {
        event.sender.send('resources:courseContextMenuEdit', courseId);
      },
    },
    {
      label: isArchived ? 'Unarchive' : 'Archive',
      click: () => {
        event.sender.send('resources:courseContextMenuToggleArchive', courseId, !isArchived);
      },
    },
    { type: 'separator' },
    {
      label: 'Delete',
      click: () => {
        event.sender.send('resources:courseContextMenuDelete', courseId);
      },
    },
  ]);
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) menu.popup({ window: win });
});

// --- IPC: notes ---
// Flat per-course list (no folders/subfolders — the user's own workflow was
// "course > session-titled notes", e.g. W1L1/W1L2; Atlas already provides
// the course-level grouping, so a second manual folder layer isn't needed).
// Content is stored as markdown (open-questions.md #1), edited live via
// the bundled Toast UI Editor in WYSIWYG mode.

ipcMain.handle('notes:listByCourse', (_event, courseId: number) => {
  const db = getDb();
  return db.prepare('SELECT * FROM notes WHERE course_id = ? ORDER BY updated_at DESC').all(courseId);
});

// Notes are edited from the database (their real, live source of truth —
// see the comment on the notes table above) but also mirrored out to a
// plain .md file under files/<course>/notes/<title>.md on every save, purely
// so the note is usable outside Atlas (grep, copy elsewhere, hand to another
// tool). One-way: Atlas never reads this file back — editing it externally
// just gets overwritten on the note's next save. Embedded images are copied
// into a per-note <title>.assets/ folder alongside it and referenced by
// relative path, so the exported file + its images work standalone even if
// moved somewhere Atlas can't reach (the in-app/browser-view copies still
// use the local-server URL, which only resolves while Atlas is running).
function sanitizeNoteFilename(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|]/g, '-').trim().replace(/[. ]+$/, '');
  return cleaned || 'Untitled';
}

function uniqueNoteExportPath(dir: string, filename: string, excluding: string | null): string {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let candidate = filename;
  let counter = 2;
  while (true) {
    const candidatePath = path.join(dir, candidate);
    if (candidatePath === excluding || !fs.existsSync(candidatePath)) return candidatePath;
    candidate = `${base} (${counter})${ext}`;
    counter++;
  }
}

function removeNoteExport(exportedPath: string): void {
  fs.rmSync(exportedPath, { force: true });
  const assetsDir = path.join(path.dirname(exportedPath), `${path.basename(exportedPath, '.md')}.assets`);
  fs.rmSync(assetsDir, { recursive: true, force: true });
}

function exportNoteToFile(noteId: number): void {
  const db = getDb();
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId) as
    | { course_id: number; title: string; content_markdown: string; exported_path: string | null }
    | undefined;
  if (!note) return;

  const course = db.prepare('SELECT folder_name FROM courses WHERE id = ?').get(note.course_id) as
    | { folder_name: string }
    | undefined;
  if (!course) return;

  const notesDir = path.join(getFilesDir(), course.folder_name, NOTES_SUBFOLDER);
  fs.mkdirSync(notesDir, { recursive: true });

  const desiredPath = uniqueNoteExportPath(
    notesDir,
    `${sanitizeNoteFilename(note.title)}.md`,
    note.exported_path
  );

  // Relative link straight back to this course's own note-images/ store
  // (files/<course>/notes/note-images/), not a per-note copy — one physical
  // file, not two. Both live under the same notes/ folder, so the link is
  // always just "note-images/<filename>" and travels safely with the whole
  // notes/ folder if it's copied elsewhere; only a single .md file lifted out
  // on its own would leave the link broken. Forward slashes always,
  // regardless of OS, since that's what Markdown/browsers expect in a link.
  const relativeImagesPath = path
    .relative(notesDir, getNoteImagesDir(course.folder_name))
    .split(path.sep)
    .join('/');
  const rewritten = note.content_markdown.replace(
    /http:\/\/127\.0\.0\.1:\d+\/note-image\/\d+\/([\w-]+\.\w+)/g,
    (_whole, filename) => `${relativeImagesPath}/${filename}`
  );

  if (note.exported_path && note.exported_path !== desiredPath && fs.existsSync(note.exported_path)) {
    removeNoteExport(note.exported_path);
  }

  fs.writeFileSync(desiredPath, rewritten, 'utf-8');
  db.prepare('UPDATE notes SET exported_path = ? WHERE id = ?').run(desiredPath, noteId);
}

ipcMain.handle('notes:create', (_event, courseId: number) => {
  const db = getDb();
  const insertResult = db
    .prepare("INSERT INTO notes (course_id, title, content_markdown) VALUES (?, 'Untitled', '')")
    .run(courseId);
  const noteId = Number(insertResult.lastInsertRowid);
  exportNoteToFile(noteId);
  rebuildSearchIndex();
  return db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId);
});

// Google-Docs-style default title: the first non-empty line, with common
// markdown prefixes (heading marks, list/checkbox markers, blockquote)
// stripped, so "# W1L1" or "- W1L1" both just become "W1L1".
// Strips inline emphasis marks (bold/italic/strikethrough/code) so a title
// derived from "**W1L1**" or "_W1L1_" is just "W1L1" — the user shouldn't
// have to avoid formatting their first line to keep the title clean.
function stripInlineFormatting(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`(.+?)`/g, '$1');
}

function deriveTitleFromMarkdown(markdown: string): string {
  for (const line of markdown.split('\n')) {
    const trimmedLine = line.trim();
    // A line that's only an image (e.g. right after inserting one with no
    // caption yet) isn't meaningful title material — skip to the next line
    // rather than turning the image's alt text/URL into the title.
    if (/^!\[[^\]]*\]\([^)]*\)$/.test(trimmedLine)) continue;

    const stripped = stripInlineFormatting(
      trimmedLine
        .replace(/^#{1,6}\s+/, '')
        .replace(/^[-*+]\s+(\[[ xX]\]\s+)?/, '')
        .replace(/^\d+\.\s+/, '')
        .replace(/^>\s+/, '')
        .trim()
    ).trim();
    if (stripped) return stripped.slice(0, 100);
  }
  return 'Untitled';
}

ipcMain.handle('notes:updateContent', (_event, noteId: number, contentMarkdown: string) => {
  const db = getDb();
  const note = db.prepare('SELECT title_is_manual, content_markdown, title FROM notes WHERE id = ?').get(noteId) as
    | { title_is_manual: number; content_markdown: string; title: string }
    | undefined;
  if (!note) return null;

  // Second layer of the same "opening/closing a note shouldn't count as a
  // change" guard the renderer already applies (renderer.ts's
  // noteContentAtOpen) — kept here too so any other caller of this same
  // handler gets the same protection, rather than relying on the renderer
  // never accidentally sending an unchanged save.
  if (contentMarkdown === note.content_markdown) return { title: note.title_is_manual ? null : note.title };

  const title = note.title_is_manual ? undefined : deriveTitleFromMarkdown(contentMarkdown);
  if (title !== undefined) {
    db.prepare(
      "UPDATE notes SET content_markdown = ?, title = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(contentMarkdown, title, noteId);
  } else {
    db.prepare("UPDATE notes SET content_markdown = ?, updated_at = datetime('now') WHERE id = ?").run(
      contentMarkdown,
      noteId
    );
  }
  exportNoteToFile(noteId);
  rebuildSearchIndex();
  return { title: title ?? null };
});

ipcMain.handle('notes:updateTitle', (_event, noteId: number, title: string) => {
  const db = getDb();
  db.prepare(
    "UPDATE notes SET title = ?, title_is_manual = 1, updated_at = datetime('now') WHERE id = ?"
  ).run(title || 'Untitled', noteId);
  exportNoteToFile(noteId);
  rebuildSearchIndex();
});

ipcMain.handle('notes:delete', (_event, noteId: number) => {
  const db = getDb();
  const note = db.prepare('SELECT exported_path FROM notes WHERE id = ?').get(noteId) as
    | { exported_path: string | null }
    | undefined;
  if (note?.exported_path) removeNoteExport(note.exported_path);
  db.prepare('DELETE FROM notes WHERE id = ?').run(noteId);
  rebuildSearchIndex();
});

// Images embedded in note content: copied into a stable, Atlas-owned
// location and served over the local HTTP server (see localServer.ts),
// rather than left as the blob: URL Crepe's image block defaults to —
// a blob: URL only lives as long as the renderer process that created it,
// so it went dead on every app restart and could never work in the
// read-only browser view at all (a separate process/origin entirely).
ipcMain.handle('notes:saveImage', (_event, courseId: number, buffer: ArrayBuffer, extension: string) => {
  const db = getDb();
  const course = db.prepare('SELECT folder_name FROM courses WHERE id = ?').get(courseId) as
    | { folder_name: string }
    | undefined;
  if (!course) return null;

  const dir = getNoteImagesDir(course.folder_name);
  fs.mkdirSync(dir, { recursive: true });
  const safeExt = /^\.[a-zA-Z0-9]+$/.test(extension) ? extension : '';
  const filename = `${randomUUID()}${safeExt}`;
  fs.writeFileSync(path.join(dir, filename), Buffer.from(buffer));
  return getNoteImageUrl(courseId, filename);
});

ipcMain.handle('notes:browserUrl', (_event, noteId: number) => getNoteBrowserUrl(noteId));

// Read-only in the browser, deliberately — an editable browser copy would
// mean two live editing surfaces (the app's Crepe instance and the browser
// tab) writing to the same note with no conflict resolution between them.
// This is for viewing/reference alongside other tabs while working, same
// role "Open in browser" plays for resources.
ipcMain.on('notes:contextMenu', (event, noteId: number) => {
  const menu = Menu.buildFromTemplate([
    { label: 'Open in browser', click: () => shell.openExternal(getNoteBrowserUrl(noteId)) },
    { type: 'separator' },
    {
      label: 'Delete',
      click: () => {
        event.sender.send('notes:contextMenuDelete', noteId);
      },
    },
  ]);
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) menu.popup({ window: win });
});

// --- Handwritten notes: import a scan (PDF or image) and create one note
// per imported file — one file always becomes one note, however many pages
// a PDF has, matching how the user actually scans (one Adobe Scan PDF per
// lecture). No schema change needed, since notes.image_path/ocr_text were
// already added ahead of this feature.
//
// OCR is deliberately NOT run automatically at import. It was at first, but
// the user found local Tesseract's accuracy on their actual handwriting too
// poor to be worth it automatically — and pointed out that reading a scan
// via the connected AI agent's vision (already possible today, no Atlas feature needed)
// is a better fit for handwriting anyway. OCR is now an explicit per-note
// action (notes:runOcr below) the user opts into and reviews before
// accepting, rather than something that runs and gets silently trusted.
const SCAN_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp']);

function isScanFile(filePath: string): boolean {
  return SCAN_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

// Shared by the native-dialog and drag-and-drop import paths once the scan
// file is already copied into the course's own scans/ folder: creates a
// blank note pointing at it, titled from the original filename (a real title
// isn't derivable yet with no OCR text — renaming, or later accepting an OCR
// result, both naturally replace it).
function finishScanImport(
  courseId: number,
  destPath: string,
  titleGuess: string,
  driveFileId: string | null = null
): unknown {
  const db = getDb();
  const insertResult = db
    .prepare(
      `INSERT INTO notes (course_id, title, content_markdown, is_handwritten, image_path, drive_file_id)
       VALUES (?, ?, '', 1, ?, ?)`
    )
    .run(courseId, titleGuess || 'Untitled scan', destPath, driveFileId);
  const noteId = Number(insertResult.lastInsertRowid);
  exportNoteToFile(noteId);
  rebuildSearchIndex();
  return db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId);
}

function importScanFileIntoNote(courseId: number, sourcePath: string): unknown {
  const db = getDb();
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId) as
    | { folder_name: string }
    | undefined;
  if (!course) return null;

  const scansDir = getScanImagesDir(course.folder_name);
  fs.mkdirSync(scansDir, { recursive: true });
  const originalFilename = path.basename(sourcePath);
  const destPath = uniqueDestPath(scansDir, originalFilename);
  fs.copyFileSync(sourcePath, destPath);

  return finishScanImport(courseId, destPath, path.basename(originalFilename, path.extname(originalFilename)));
}

// Drag-and-drop variant — same reasoning as importBufferIntoCourse for
// resources: the renderer only has the dropped File's contents, not a real
// filesystem path, under contextIsolation. Also reused by the Google Drive
// import path (google:importDriveFile below) once a pending file is tagged
// "handwritten note" — a downloaded Drive file is just a buffer too.
function importScanBufferIntoNote(
  courseId: number,
  originalFilename: string,
  buffer: Buffer,
  driveFileId: string | null = null
): unknown {
  const db = getDb();
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId) as
    | { folder_name: string }
    | undefined;
  if (!course) return null;

  const scansDir = getScanImagesDir(course.folder_name);
  fs.mkdirSync(scansDir, { recursive: true });
  const destPath = uniqueDestPath(scansDir, originalFilename);
  fs.writeFileSync(destPath, buffer);

  return finishScanImport(
    courseId,
    destPath,
    path.basename(originalFilename, path.extname(originalFilename)),
    driveFileId
  );
}

// A file tagged "typed note" from the Google Drive review panel — the file's
// own text content becomes the note's content_markdown directly, title
// derived the same way a normal edit would (deriveTitleFromMarkdown below).
function importTypedNoteFromBuffer(courseId: number, buffer: Buffer, driveFileId: string): unknown {
  const db = getDb();
  const content = buffer.toString('utf-8');
  const title = deriveTitleFromMarkdown(content);
  const insertResult = db
    .prepare('INSERT INTO notes (course_id, title, content_markdown, drive_file_id) VALUES (?, ?, ?, ?)')
    .run(courseId, title, content, driveFileId);
  const noteId = Number(insertResult.lastInsertRowid);
  exportNoteToFile(noteId);
  rebuildSearchIndex();
  return db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId);
}

ipcMain.handle('notes:importScan', async (_event, courseId: number) => {
  // Test hook mirroring ATLAS_TEST_UPLOAD_PATH (resources:upload) — native
  // multi-file pickers can't be driven by Playwright. Multiple paths are
  // delimiter-separated (path.delimiter: ';' on Windows, ':' elsewhere).
  let sourcePaths: string[];
  if (process.env.ATLAS_TEST_SCAN_PATHS) {
    sourcePaths = process.env.ATLAS_TEST_SCAN_PATHS.split(path.delimiter);
  } else {
    if (!mainWindow) return [];
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Scans', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return [];
    sourcePaths = result.filePaths.filter(isScanFile);
  }

  return sourcePaths.map((sourcePath) => importScanFileIntoNote(courseId, sourcePath)).filter(Boolean);
});

// Reuses the exact same Preview shape/rendering the Resources preview modal
// already uses (getPreview() from preview.ts) — a handwritten note's scan is
// just a PDF or image file on disk, no different from a resource's.
ipcMain.handle('notes:getScanPreview', (_event, noteId: number) => {
  const db = getDb();
  const note = db.prepare('SELECT image_path FROM notes WHERE id = ?').get(noteId) as
    | { image_path: string | null }
    | undefined;
  if (!note?.image_path) return null;
  return getPreview(kindFromExtension(note.image_path), note.image_path);
});

ipcMain.handle('notes:importScanBuffer', (_event, courseId: number, filename: string, buffer: ArrayBuffer) => {
  if (!isScanFile(filename)) return null;
  return importScanBufferIntoNote(courseId, filename, Buffer.from(buffer));
});

// On-demand OCR (see the comment above importScanFileIntoNote for why this
// isn't automatic). Deliberately does NOT write anything to the database —
// it just returns the extracted text for the renderer to show the user, who
// then explicitly accepts it (via the existing notes:updateContent, same as
// any other edit) or discards it. Nothing is "silently trusted."
ipcMain.handle('notes:runOcr', async (event, noteId: number) => {
  const db = getDb();
  const note = db.prepare('SELECT image_path FROM notes WHERE id = ?').get(noteId) as
    | { image_path: string | null }
    | undefined;
  if (!note?.image_path) return null;
  return extractTextFromScan(note.image_path, (page, totalPages) => {
    event.sender.send('notes:ocrProgress', { noteId, page, totalPages });
  });
});

// --- IPC: deadlines ---
// One unified per-course timeline (PRD §12) — assignments/readings/quizzes/
// labs/projects/exams/manual tasks all live in the same `deadlines` table,
// distinguished by `kind`, rather than a separate "Assignments" concept.
// The schema also has a distinct `assignments` table, but that one's real
// purpose is holding synced Google Classroom data (title/description/
// submission status) in Phase 3 — building a second, overlapping manual-entry
// UI for it now would just be busywork today with no sync to populate the
// status field it exists for. Deferred; see open-questions.md #13.

// Backs the Calendar page — unlike dashboard:upcomingDeadlines (future-only,
// limited to 8 for the dashboard widget), the Calendar needs every deadline
// with a due date, past or future, to fill in a full month grid.
ipcMain.handle('deadlines:listAllWithCourse', () => {
  const db = getDb();
  return db
    .prepare(
      `SELECT deadlines.*, courses.name AS course_name
       FROM deadlines
       JOIN courses ON courses.id = deadlines.course_id
       WHERE deadlines.due_at IS NOT NULL`
    )
    .all();
});

ipcMain.handle('deadlines:listByCourse', (_event, courseId: number) => {
  const db = getDb();
  // Incomplete first, then soonest due date first within each group; items
  // with no due date sort after ones that have one, in the same group.
  return db
    .prepare(
      `SELECT * FROM deadlines
       WHERE course_id = ?
       ORDER BY completed ASC, (due_at IS NULL) ASC, due_at ASC`
    )
    .all(courseId);
});

ipcMain.handle(
  'deadlines:create',
  (
    _event,
    courseId: number,
    title: string,
    kind: string,
    dueAt: string | null,
    description: string | null
  ) => {
    const db = getDb();
    const staleImport = dueAt && dueAt.slice(0, 10) < new Date().toISOString().slice(0, 10) ? 1 : 0;
    const insertResult = db
      .prepare(
        'INSERT INTO deadlines (course_id, title, kind, due_at, description, stale_import) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(courseId, title, kind, dueAt, description, staleImport);
    return db.prepare('SELECT * FROM deadlines WHERE id = ?').get(insertResult.lastInsertRowid);
  }
);

// Splits a comma-delimited override-field list into a Set, and back — kept
// as plain comma-delimited text in the DB (see schema.sql) rather than JSON,
// since the only two possible tokens ('title', 'due_at') never collide as
// substrings and this avoids depending on SQLite's JSON1 extension being
// present in this better-sqlite3 build.
function parseOverrides(stored: string | null): Set<string> {
  return new Set((stored ?? '').split(',').filter(Boolean));
}
function serializeOverrides(overrides: Set<string>): string | null {
  return overrides.size > 0 ? [...overrides].join(',') : null;
}

ipcMain.handle(
  'deadlines:update',
  (
    _event,
    deadlineId: number,
    title: string,
    kind: string,
    dueAt: string | null,
    description: string | null
  ) => {
    const db = getDb();
    const current = db
      .prepare('SELECT title, due_at, classroom_coursework_id, local_overrides FROM deadlines WHERE id = ?')
      .get(deadlineId) as
      | { title: string; due_at: string | null; classroom_coursework_id: string | null; local_overrides: string | null }
      | undefined;

    // Conflict handling (open-questions.md #3): only a Classroom-synced
    // deadline can have an "override" in the first place — a manually
    // created deadline has nothing from Classroom to protect against. Only
    // the two fields Classroom's sync actually writes (title, due_at) are
    // ever tracked; kind/description are exclusively user-owned already and
    // a re-sync never touches them, so there's nothing to protect there.
    let overrides = parseOverrides(current?.local_overrides ?? null);
    if (current?.classroom_coursework_id) {
      if (title !== current.title) overrides.add('title');
      if (dueAt !== current.due_at) overrides.add('due_at');
    }

    db.prepare(
      'UPDATE deadlines SET title = ?, kind = ?, due_at = ?, description = ?, local_overrides = ? WHERE id = ?'
    ).run(title, kind, dueAt, description, serializeOverrides(overrides), deadlineId);
    return db.prepare('SELECT * FROM deadlines WHERE id = ?').get(deadlineId);
  }
);

// "Reset to Classroom version" (open-questions.md #3) — discards the
// user's local edits to title/due_at and restores Classroom's current
// values, which every sync keeps shadowed in classroom_title/
// classroom_due_at regardless of any override in place. Purely local: no
// live Classroom API call needed, and works offline. Clears local_overrides
// entirely rather than per-field, since this is the deliberately simple
// "undo my changes to this item" action — the protection itself stays
// per-field, but discarding it is all-or-nothing for one deadline.
ipcMain.handle('deadlines:resetClassroomOverrides', (_event, deadlineId: number) => {
  const db = getDb();
  const current = db
    .prepare('SELECT classroom_title, classroom_due_at FROM deadlines WHERE id = ?')
    .get(deadlineId) as { classroom_title: string | null; classroom_due_at: string | null } | undefined;
  if (!current) return null;

  db.prepare(
    'UPDATE deadlines SET title = COALESCE(classroom_title, title), due_at = classroom_due_at, local_overrides = NULL WHERE id = ?'
  ).run(deadlineId);
  return db.prepare('SELECT * FROM deadlines WHERE id = ?').get(deadlineId);
});

ipcMain.handle('deadlines:setCompleted', (_event, deadlineId: number, completed: boolean) => {
  const db = getDb();
  db.prepare('UPDATE deadlines SET completed = ? WHERE id = ?').run(completed ? 1 : 0, deadlineId);
});

ipcMain.handle('deadlines:delete', (_event, deadlineId: number) => {
  const db = getDb();
  db.prepare('DELETE FROM deadlines WHERE id = ?').run(deadlineId);
});

ipcMain.on('deadlines:contextMenu', (event, deadlineId: number) => {
  const menu = Menu.buildFromTemplate([
    {
      label: 'Delete',
      click: () => {
        event.sender.send('deadlines:contextMenuDelete', deadlineId);
      },
    },
  ]);
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) menu.popup({ window: win });
});
