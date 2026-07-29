import * as fs from 'fs';
import * as path from 'path';
import { getMemoryFilesDir } from './paths';

// Persistent AI-agent memory (phase4-spec.md §5) — plain Markdown, one file
// per course plus one general file, deliberately never parsed or validated
// by Atlas (§5.2): Atlas stores and serves this text, the agent decides what
// it means. Not exposed anywhere in the Atlas UI (user decision) — the file
// being plain text in their own data folder is the oversight mechanism.

export const GENERAL_MEMORY_NAME = '_general';

// Windows forbids \ / : * ? " < > | in filenames — same restriction
// sanitizeFolderName in main.ts already works around for course storage
// folders, duplicated here in miniature rather than imported, since pulling
// in main.ts here would create a circular import (main.ts calls into this
// module too).
function sanitizeFilenameStem(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '-').trim().replace(/[. ]+$/, '');
  return cleaned || 'course';
}

function memoryFilePath(courseName: string | null): string {
  const stem = courseName === null ? GENERAL_MEMORY_NAME : sanitizeFilenameStem(courseName);
  return path.join(getMemoryFilesDir(), `${stem}.md`);
}

function seedTemplate(courseName: string | null): string {
  const heading = courseName === null ? 'General' : courseName;
  return `<!--
This file is read and written directly by your AI agent (Phase 4) — Atlas
itself never reads or acts on its contents. Nothing here is shown inside
the Atlas app; this is the only place it lives, so it's yours to read or
edit freely.

Suggested things worth keeping track of, entirely up to the agent and you:
- How you like material explained for this ${courseName === null ? 'in general' : 'course'} (detail
  level, worked examples vs. terse notes, use of derivations, citations)
- What you're comfortable with vs. still shaky on
- How the course actually runs (exam format, what the professor emphasizes,
  whether practice material comes with answers)
- Study plans made, topics already revised, practice already attempted
-->

# ${heading}
`;
}

// Called once at course creation (every course-creation path: manual,
// Classroom mapping, Ashoka Planner import) so the file exists from the
// start rather than only appearing the first time an agent happens to write
// to it. Idempotent — does nothing if the file already exists, so it's also
// safe to call defensively before a read.
export function ensureCourseMemoryFile(courseName: string): void {
  const dir = getMemoryFilesDir();
  fs.mkdirSync(dir, { recursive: true });
  const filePath = memoryFilePath(courseName);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, seedTemplate(courseName), 'utf-8');
  }
}

export function ensureGeneralMemoryFile(): void {
  const dir = getMemoryFilesDir();
  fs.mkdirSync(dir, { recursive: true });
  const filePath = memoryFilePath(null);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, seedTemplate(null), 'utf-8');
  }
}

// Reads a memory file's raw content — courseName === null reads the general
// file. Returns null if it doesn't exist yet rather than throwing, since a
// brand-new course/install may not have one until ensure*/write* is called.
export function readMemory(courseName: string | null): string | null {
  const filePath = memoryFilePath(courseName);
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

// Full-replace write, used by the MCP server's atlas_write_memory tool
// (phase4-spec.md §6.3) — the agent sends back the complete file each time,
// not a diff, since Atlas never parses or merges this content (§5.2).
export function writeMemory(courseName: string | null, content: string): void {
  const dir = getMemoryFilesDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(memoryFilePath(courseName), content, 'utf-8');
}

// Deletes a course's memory file when the course itself is deleted (not
// archived — archiving keeps everything, deletion is the permanent action)
// mirroring how courses:delete already removes the course's files/ folder.
// No rename equivalent exists yet because Atlas has no course-rename feature
// at all today — whoever adds one should rename this file alongside the
// course's own logic, the same way file-folder renaming would need to.
export function deleteCourseMemoryFile(courseName: string): void {
  const filePath = memoryFilePath(courseName);
  fs.rmSync(filePath, { force: true });
}
