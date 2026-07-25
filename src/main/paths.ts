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

// Images pasted/dropped into a note's editor — a flat store since they're
// not tied to the per-course files/ layout the way resources are; the note
// referencing an image is what ties it to a course, not its folder location.
export function getNoteImagesDir(): string {
  return path.join(getDataDir(), 'note-images');
}
