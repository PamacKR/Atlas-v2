import { app } from 'electron';
import * as path from 'path';
import * as os from 'os';

// The managed data directory lives in Downloads/Atlas rather than a hidden
// app-data path, so the user can browse/add/remove files by hand.
// See ARCHITECTURE.md §2 and docs/open-questions.md #6.
export function getDataDir(): string {
  const downloads = app.getPath('downloads') || path.join(os.homedir(), 'Downloads');
  return path.join(downloads, 'Atlas');
}

export function getDbPath(): string {
  return path.join(getDataDir(), 'atlas.db');
}

export function getFilesDir(): string {
  return path.join(getDataDir(), 'files');
}
