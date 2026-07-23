import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { getDb, closeDb } from './db/database';
import { getDataDir, getFilesDir } from './paths';

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
  const result = db
    .prepare('INSERT INTO courses (name, code, term) VALUES (?, ?, ?)')
    .run(name, code, term);
  return db.prepare('SELECT * FROM courses WHERE id = ?').get(result.lastInsertRowid);
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
  const originalFilename = path.basename(sourcePath);
  const courseFilesDir = path.join(getFilesDir(), `course-${courseId}`);
  fs.mkdirSync(courseFilesDir, { recursive: true });

  // Prefix with a timestamp so re-uploading a same-named file never collides.
  const destFilename = `${Date.now()}-${originalFilename}`;
  const destPath = path.join(courseFilesDir, destFilename);
  fs.copyFileSync(sourcePath, destPath);

  const db = getDb();
  const insertResult = db
    .prepare(
      `INSERT INTO resources (course_id, title, kind, source, file_path, original_filename)
       VALUES (?, ?, ?, 'manual', ?, ?)`
    )
    .run(courseId, originalFilename, kindFromExtension(originalFilename), destPath, originalFilename);

  return db.prepare('SELECT * FROM resources WHERE id = ?').get(insertResult.lastInsertRowid);
});

ipcMain.handle('courses:delete', (_event, courseId: number) => {
  const db = getDb();
  // Remove the course's files from disk; the resources rows cascade-delete
  // via the FK (foreign_keys pragma is on, see db/database.ts).
  const courseFilesDir = path.join(getFilesDir(), `course-${courseId}`);
  fs.rmSync(courseFilesDir, { recursive: true, force: true });
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
