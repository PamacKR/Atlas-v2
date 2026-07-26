import Database from 'better-sqlite3';
import * as fs from 'fs';
import { getDb } from './db/database';

const DB_PATH_SETTING_KEY = 'ashoka_planner_db_path';

export interface AshokaCourseCandidate {
  code: string;
  title: string;
  category: string | null;
  faculty: string | null;
  credits: number | null;
  description: string | null;
}

function getSetting(key: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function setSetting(key: string, value: string): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
  ).run(key, value, value);
}

export function getAshokaPlannerDbPath(): string | null {
  return getSetting(DB_PATH_SETTING_KEY);
}

// Validates the path is actually a readable ashoka-planner database (has the
// tables this import needs) before remembering it — a bad pick should fail
// immediately with a clear reason, not silently produce an empty course list
// later. Opened read-only throughout this module: Atlas never writes back
// to planner.db, this is a one-shot, user-invoked import, not a live sync
// (docs/open-questions.md #15).
export function setAshokaPlannerDbPath(dbPath: string): { ok: true } | { ok: false; error: string } {
  if (!fs.existsSync(dbPath)) {
    return { ok: false, error: 'That file does not exist.' };
  }
  try {
    const plannerDb = new Database(dbPath, { readonly: true, fileMustExist: true });
    const tables = new Set(
      (plannerDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(
        (t) => t.name
      )
    );
    plannerDb.close();
    for (const required of ['slot', 'course_description', 'student_profile']) {
      if (!tables.has(required)) {
        return { ok: false, error: `That file doesn't look like an ashoka-planner database (missing "${required}" table).` };
      }
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  setSetting(DB_PATH_SETTING_KEY, dbPath);
  return { ok: true };
}

interface CourseSnapshot {
  code?: string;
  title?: string;
  category?: string;
  faculty?: string;
  credits?: number;
}

// planner.db's student_profile only stores the bare season name
// ("Monsoon"/"Spring", confirmed against real data) plus current_year as an
// ordinal program-year (e.g. 3), not a calendar year — there's no reliable
// way to derive a concrete term string like Atlas's own "Monsoon 26" from
// this alone. Returned as a raw hint to pre-fill the term the user confirms
// in the review panel before import, never used to silently guess one.
export function getAshokaSemesterHint(): string | null {
  const dbPath = getAshokaPlannerDbPath();
  if (!dbPath) return null;
  const plannerDb = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const row = plannerDb.prepare('SELECT current_semester FROM student_profile WHERE id = 1').get() as
      | { current_semester: string | null }
      | undefined;
    return row?.current_semester ?? null;
  } finally {
    plannerDb.close();
  }
}

// Reads every currently-secured course (status === 'secured') from the
// user's ashoka-planner database — the "finalized courses" concept
// docs/open-questions.md #15 identified — joined against that course's
// description (by section code). Read-only, one-shot: called only when the
// user explicitly presses the import button, never automatically. Which
// term these land under isn't decided here — see getAshokaSemesterHint and
// ashoka:importCourses, which does the actual code+term dedup once the user
// has confirmed a real term.
export function listSecuredAshokaCourses(): AshokaCourseCandidate[] {
  const dbPath = getAshokaPlannerDbPath();
  if (!dbPath) return [];

  const plannerDb = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const securedSlots = plannerDb
      .prepare("SELECT current_code, current_course_snapshot_json FROM slot WHERE status = 'secured'")
      .all() as { current_code: string | null; current_course_snapshot_json: string | null }[];

    const candidates: AshokaCourseCandidate[] = [];
    for (const slot of securedSlots) {
      if (!slot.current_course_snapshot_json) continue;
      const snapshot = JSON.parse(slot.current_course_snapshot_json) as CourseSnapshot;
      const code = snapshot.code ?? slot.current_code;
      if (!code || !snapshot.title) continue;

      const descriptionRow = plannerDb
        .prepare('SELECT overview FROM course_description WHERE section_code = ?')
        .get(code) as { overview: string | null } | undefined;

      candidates.push({
        code,
        title: snapshot.title,
        category: snapshot.category ?? null,
        faculty: snapshot.faculty ?? null,
        credits: snapshot.credits ?? null,
        description: descriptionRow?.overview ?? null,
      });
    }
    return candidates;
  } finally {
    plannerDb.close();
  }
}
