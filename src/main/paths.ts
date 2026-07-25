import { app } from 'electron';
import * as path from 'path';
import * as os from 'os';

// The managed data directory lives in Downloads/Atlas-Storage rather than a
// hidden app-data path, so the user can browse/add/remove files by hand.
// Deliberately a *separate* folder from the Atlas source repo (which also
// happens to live under Downloads) so dev/git operations never touch real
// user data. See ARCHITECTURE.md §2 and docs/open-questions.md #6.
export function getDataDir(): string {
  // Override for automated verification (scripts/verify-app.js), so test
  // runs never touch the user's real Downloads/Atlas-Storage data.
  if (process.env.ATLAS_DATA_DIR) return process.env.ATLAS_DATA_DIR;

  const downloads = app.getPath('downloads') || path.join(os.homedir(), 'Downloads');
  return path.join(downloads, 'Atlas-Storage');
}

export function getDbPath(): string {
  return path.join(getDataDir(), 'atlas.db');
}

export function getFilesDir(): string {
  return path.join(getDataDir(), 'files');
}

// Images pasted/dropped into a note's editor — stored inside that course's
// own notes/ folder (files/<course>/notes/note-images/), right alongside the
// exported .md that references them, rather than a global flat store. Keeps
// everything for a course self-contained under its own folder, and means the
// exported note's image links are always a short, same-folder-tree relative
// path instead of reaching back out to a shared top-level directory.
export function getNoteImagesDir(courseFolderName: string): string {
  return path.join(getFilesDir(), courseFolderName, 'notes', 'note-images');
}
