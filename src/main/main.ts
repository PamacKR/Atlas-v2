import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { getDb, closeDb } from './db/database';
import { getDataDir, getFilesDir } from './paths';
import { getPreview } from './preview';

const KIND_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'pdf',
  '.ppt': 'pptx',
  '.pptx': 'pptx',
  '.doc': 'docx',
  '.docx': 'docx',
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

app.whenReady().then(() => {
  getDb(); // initializes DB + schema in Downloads/Atlas on first launch
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
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

  return db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
});

ipcMain.handle('app:dataDir', () => getDataDir());

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
      `INSERT INTO resources (course_id, title, kind, source, file_path, original_filename)
       VALUES (?, ?, ?, 'manual', ?, ?)`
    )
    .run(courseId, originalFilename, kindFromExtension(originalFilename), destPath, originalFilename);

  return db.prepare('SELECT * FROM resources WHERE id = ?').get(insertResult.lastInsertRowid);
});

ipcMain.handle('resources:open', async (_event, resourceId: number) => {
  const db = getDb();
  const resource = db.prepare('SELECT * FROM resources WHERE id = ?').get(resourceId) as
    | { file_path: string }
    | undefined;
  if (!resource) return;
  await shell.openPath(resource.file_path);
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

// Native right-click menu, so "Open in default app" feels like a real file
// manager rather than another in-page button.
ipcMain.on('resources:contextMenu', (event, resourceId: number) => {
  const db = getDb();
  const resource = db.prepare('SELECT * FROM resources WHERE id = ?').get(resourceId) as
    | { file_path: string; title: string }
    | undefined;
  if (!resource) return;

  const menu = Menu.buildFromTemplate([
    { label: 'Open in default app', click: () => shell.openPath(resource.file_path) },
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
  // Remove the course's files from disk; the resources rows cascade-delete
  // via the FK (foreign_keys pragma is on, see db/database.ts).
  if (course) {
    const courseFilesDir = path.join(getFilesDir(), course.folder_name);
    fs.rmSync(courseFilesDir, { recursive: true, force: true });
  }
  db.prepare('DELETE FROM courses WHERE id = ?').run(courseId);
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
