import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { watch, FSWatcher } from 'chokidar';
import { randomUUID } from 'crypto';
import { getDb, closeDb } from './db/database';
import { getDataDir, getFilesDir, getNoteImagesDir } from './paths';
import { getPreview } from './preview';
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

function reconcileCourseStorage(courseId: number): void {
  const db = getDb();
  const resources = db
    .prepare('SELECT id, file_path FROM resources WHERE course_id = ?')
    .all(courseId) as { id: number; file_path: string }[];
  for (const resource of resources) {
    if (fs.existsSync(resource.file_path)) continue;
    db.prepare('DELETE FROM resources WHERE id = ?').run(resource.id);
  }
}

function startWatchingCourseStorage(courseId: number, folderName: string): void {
  if (activeCourseStorageWatchers.has(courseId)) return;

  reconcileCourseStorage(courseId);

  const courseFilesDir = path.join(getFilesDir(), folderName);
  fs.mkdirSync(courseFilesDir, { recursive: true });

  const watcher = watch(courseFilesDir, { ignoreInitial: false, depth: undefined });

  watcher.on('add', (filePath) => {
    if (path.basename(filePath).startsWith('.')) return;

    const db = getDb();
    // Atlas's own upload/folder-watch code already inserts the resource row
    // synchronously right after copying the file, before this async fs
    // event can fire — so an existing match here means "our own copy just
    // landed," not a manually-added file, and should be skipped.
    const already = db.prepare('SELECT id FROM resources WHERE file_path = ?').get(filePath);
    if (already) return;

    db.prepare(
      `INSERT INTO resources (course_id, title, kind, source, file_path, original_filename)
       VALUES (?, ?, ?, 'manual', ?, ?)`
    ).run(courseId, path.basename(filePath), kindFromExtension(filePath), filePath, path.basename(filePath));
    if (mainWindow) mainWindow.webContents.send('resources:changed', courseId);
  });

  watcher.on('unlink', (filePath) => {
    const db = getDb();
    const resource = db.prepare('SELECT id FROM resources WHERE file_path = ?').get(filePath) as
      | { id: number }
      | undefined;
    if (!resource) return;

    db.prepare('DELETE FROM resources WHERE id = ?').run(resource.id);
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

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  for (const folderId of activeWatchers.keys()) stopWatchingFolder(folderId);
  for (const courseId of activeCourseStorageWatchers.keys()) stopWatchingCourseStorage(courseId);
  stopLocalServer();
  closeDb();
  if (process.platform !== 'darwin') app.quit();
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

  return db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
});

ipcMain.handle('app:dataDir', () => getDataDir());

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

ipcMain.handle('resources:getPreview', async (_event, resourceId: number) => {
  const db = getDb();
  const resource = db.prepare('SELECT * FROM resources WHERE id = ?').get(resourceId) as
    | { kind: string; file_path: string; zoom_level: number | null }
    | undefined;
  if (!resource) return { type: 'unsupported' };
  return getPreview(resource.kind, resource.file_path, resource.zoom_level);
});

ipcMain.handle('resources:setZoom', (_event, resourceId: number, zoom: number) => {
  const db = getDb();
  db.prepare('UPDATE resources SET zoom_level = ? WHERE id = ?').run(zoom, resourceId);
});

// Native right-click menu. "Open in browser" opens the local-server URL
// (see localServer.ts) in the OS's real default browser — not Electron's own
// preview panel — so files can live in real, switchable browser tabs.
ipcMain.on('resources:contextMenu', (event, resourceId: number) => {
  const db = getDb();
  const resource = db.prepare('SELECT * FROM resources WHERE id = ?').get(resourceId) as
    | { file_path: string; title: string }
    | undefined;
  if (!resource) return;

  const menu = Menu.buildFromTemplate([
    { label: 'Open in browser', click: () => shell.openExternal(getResourceBrowserUrl(resourceId)) },
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
    | { folder_name: string }
    | undefined;
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
  }
  db.prepare('DELETE FROM courses WHERE id = ?').run(courseId);
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
    | { file_path: string }
    | undefined;
  if (resource) fs.rmSync(resource.file_path, { force: true });
  db.prepare('DELETE FROM resources WHERE id = ?').run(resourceId);
});

// Course row has no "open in default app" equivalent — just Delete, but
// kept as a native menu (rather than an in-page button) for consistency
// with the resource context menu.
ipcMain.on('resources:courseContextMenu', (event, courseId: number) => {
  const menu = Menu.buildFromTemplate([
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
// Content is stored as markdown (docs/open-questions.md #1), edited live via
// the bundled Toast UI Editor in WYSIWYG mode.

ipcMain.handle('notes:listByCourse', (_event, courseId: number) => {
  const db = getDb();
  return db.prepare('SELECT * FROM notes WHERE course_id = ? ORDER BY updated_at DESC').all(courseId);
});

ipcMain.handle('notes:create', (_event, courseId: number) => {
  const db = getDb();
  const insertResult = db
    .prepare("INSERT INTO notes (course_id, title, content_markdown) VALUES (?, 'Untitled', '')")
    .run(courseId);
  return db.prepare('SELECT * FROM notes WHERE id = ?').get(insertResult.lastInsertRowid);
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
    const stripped = stripInlineFormatting(
      line
        .trim()
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
  const note = db.prepare('SELECT title_is_manual FROM notes WHERE id = ?').get(noteId) as
    | { title_is_manual: number }
    | undefined;
  if (!note) return null;

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
  return { title: title ?? null };
});

ipcMain.handle('notes:updateTitle', (_event, noteId: number, title: string) => {
  const db = getDb();
  db.prepare(
    "UPDATE notes SET title = ?, title_is_manual = 1, updated_at = datetime('now') WHERE id = ?"
  ).run(title || 'Untitled', noteId);
});

ipcMain.handle('notes:delete', (_event, noteId: number) => {
  const db = getDb();
  db.prepare('DELETE FROM notes WHERE id = ?').run(noteId);
});

// Images embedded in note content: copied into a stable, Atlas-owned
// location and served over the local HTTP server (see localServer.ts),
// rather than left as the blob: URL Crepe's image block defaults to —
// a blob: URL only lives as long as the renderer process that created it,
// so it went dead on every app restart and could never work in the
// read-only browser view at all (a separate process/origin entirely).
ipcMain.handle('notes:saveImage', (_event, buffer: ArrayBuffer, extension: string) => {
  const dir = getNoteImagesDir();
  fs.mkdirSync(dir, { recursive: true });
  const safeExt = /^\.[a-zA-Z0-9]+$/.test(extension) ? extension : '';
  const filename = `${randomUUID()}${safeExt}`;
  fs.writeFileSync(path.join(dir, filename), Buffer.from(buffer));
  return getNoteImageUrl(filename);
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
