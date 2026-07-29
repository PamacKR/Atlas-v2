import { app } from 'electron';
import * as path from 'path';
import * as os from 'os';

// The managed data directory lives in Downloads/Atlas-Storage rather than a
// hidden app-data path, so the user can browse/add/remove files by hand.
// Deliberately a *separate* folder from the Atlas source repo (which also
// happens to live under Downloads) so dev/git operations never touch real
// user data. See ARCHITECTURE.md §2 and open-questions.md #6.
export function getDataDir(): string {
  // Override for automated verification (scripts/verify-app.js), so test
  // runs never touch the user's real Downloads/Atlas-Storage data. Also how
  // the standalone MCP server (phase4-spec.md §6.1) points itself at the
  // right Atlas-Storage without needing Electron at all.
  if (process.env.ATLAS_DATA_DIR) return process.env.ATLAS_DATA_DIR;

  // `app` is only a real object inside a running Electron app window. This
  // module is also reached from the MCP server, launched via Electron's
  // binary under ELECTRON_RUN_AS_NODE=1 (needed for better-sqlite3's native
  // binding to match — see mcp/README or ARCHITECTURE.md §4e) — in that mode
  // requiring 'electron' yields no usable `app`, so this falls back to the
  // same OS-default Downloads path Electron itself would normally resolve to.
  const downloads = app?.getPath?.('downloads') || path.join(os.homedir(), 'Downloads');
  return path.join(downloads, 'Atlas-Storage');
}

export function getDbPath(): string {
  return path.join(getDataDir(), 'atlas.db');
}

export function getFilesDir(): string {
  return path.join(getDataDir(), 'files');
}

// App config that isn't per-course data — currently just the user's own
// bring-your-own Google OAuth client credentials (open-questions.md
// #7). Lives alongside the DB/files per the data-directory decision
// (open-questions.md #6), never in the git repo — this is the user's
// own credential, tied to their own Google Cloud project.
export function getConfigDir(): string {
  return path.join(getDataDir(), 'config');
}

export function getGoogleCredentialsPath(): string {
  return path.join(getConfigDir(), 'google-oauth-client.json');
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

// Original scans (photos/PDFs) imported as handwritten notes — kept
// alongside note-images/ under the same course's notes/ folder, so
// everything for a course's notes still lives under one subtree. See
// src/main/ocr.ts and ARCHITECTURE.md §3.
export function getScanImagesDir(courseFolderName: string): string {
  return path.join(getFilesDir(), courseFolderName, 'notes', 'scans');
}

// Phase 4 persistent memory (phase4-spec.md §5) — plain Markdown files an AI
// agent reads/writes directly, kept in the user's own data folder (not the
// app's source repo, not shown in the Atlas UI) so they're readable in any
// text editor and survive switching chats or AI tools entirely.
export function getMemoryFilesDir(): string {
  return path.join(getDataDir(), 'course-profiles');
}
