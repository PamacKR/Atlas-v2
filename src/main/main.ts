import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { getDb, closeDb } from './db/database';
import { getDataDir } from './paths';

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
