import type Database from 'better-sqlite3';
import { readMemory, writeMemory } from './memoryFiles';

// The Phase 4 query layer (phase4-spec.md §6.3) — plain functions over a
// better-sqlite3 Database instance, with no dependency on Electron or IPC.
// Shared by two callers: the in-app static export (Part E, runs inside the
// Electron main process) and the standalone MCP server (Part D, runs as a
// separate Node process against the same on-disk database file). Neither
// caller is imported here, so this file stays usable from both without
// pulling in Electron.
//
// This is also where "relevance" is deliberately NOT decided (phase4-spec.md
// §2) — every function here returns data for the agent to judge, never a
// pre-filtered "best answer." The only judgment calls made here are response
// *size* limits (§6.4), enforced because an oversized response makes the
// agent's answer worse, not because Atlas is picking what matters.

export interface CourseRow {
  id: number;
  name: string;
  code: string | null;
  term: string | null;
  archived: number;
}

export type CourseLookup =
  | { ok: true; course: CourseRow }
  | { ok: false; error: string; candidates?: { id: number; name: string }[] };

// Every course-taking tool accepts either a numeric ID or a name
// (phase4-spec.md §6.2) — exact case-insensitive match first, then a unique
// substring match. An ambiguous name returns the candidates rather than
// guessing, since guessing here would silently answer about the wrong course.
export function findCourse(db: Database.Database, ref: string | number): CourseLookup {
  const asNumber = typeof ref === 'number' ? ref : /^\d+$/.test(ref.trim()) ? parseInt(ref.trim(), 10) : null;
  if (asNumber !== null) {
    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(asNumber) as CourseRow | undefined;
    if (!course) return { ok: false, error: `No course with id ${asNumber}.` };
    return { ok: true, course };
  }

  const name = String(ref).trim().toLowerCase();
  const all = db.prepare('SELECT * FROM courses').all() as CourseRow[];

  const exact = all.filter((c) => c.name.trim().toLowerCase() === name);
  if (exact.length === 1) return { ok: true, course: exact[0] };
  if (exact.length > 1) {
    return { ok: false, error: `Multiple courses named "${ref}".`, candidates: exact.map((c) => ({ id: c.id, name: c.name })) };
  }

  const substring = all.filter((c) => c.name.toLowerCase().includes(name));
  if (substring.length === 1) return { ok: true, course: substring[0] };
  if (substring.length > 1) {
    return {
      ok: false,
      error: `Multiple courses match "${ref}".`,
      candidates: substring.map((c) => ({ id: c.id, name: c.name })),
    };
  }
  return { ok: false, error: `No course matches "${ref}".` };
}

function activeCourses(db: Database.Database, semester: string | null): CourseRow[] {
  const all = db.prepare('SELECT * FROM courses WHERE archived = 0 ORDER BY name').all() as CourseRow[];
  return semester ? all.filter((c) => c.term === semester) : all;
}

// The fresh-conversation bootstrap (PRD §18, phase4-spec.md §6.3) — the
// first call in any new chat. "Current semester" reuses the same
// app_settings key the renderer's own semester filter already persists
// (renderer.ts's semesterFilter), rather than inventing a second concept of
// "current" the user would have to keep in sync separately.
export function getOverview(db: Database.Database) {
  const semesterRow = db.prepare("SELECT value FROM app_settings WHERE key = 'semesterFilter'").get() as
    | { value: string }
    | undefined;
  const currentSemester = semesterRow?.value || null;
  const courses = activeCourses(db, currentSemester);
  const courseIds = courses.map((c) => c.id);
  const placeholders = courseIds.map(() => '?').join(',');

  const count = (table: string, extraWhere = ''): number => {
    if (courseIds.length === 0) return 0;
    const row = db
      .prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE course_id IN (${placeholders}) ${extraWhere}`)
      .get(...courseIds) as { c: number };
    return row.c;
  };

  return {
    currentSemester,
    courses: courses.map((c) => ({ id: c.id, name: c.name, code: c.code, term: c.term })),
    resourceCount: count('resources'),
    noteCount: count('notes'),
    upcomingDeadlineCount: count(
      'deadlines',
      "AND completed = 0 AND classroom_removed = 0 AND due_at IS NOT NULL AND due_at >= datetime('now')"
    ),
    generalMemory: readMemory(null),
  };
}

const BRIEFING_LIST_LIMIT = 20;

export function getCourseBriefing(db: Database.Database, ref: string | number) {
  const lookup = findCourse(db, ref);
  if (!lookup.ok) return lookup;
  const course = lookup.course;

  const deadlines = db
    .prepare(
      `SELECT id, title, kind, due_at FROM deadlines
       WHERE course_id = ? AND completed = 0 AND classroom_removed = 0 AND due_at IS NOT NULL
       ORDER BY due_at LIMIT ?`
    )
    .all(course.id, BRIEFING_LIST_LIMIT) as { id: number; title: string; kind: string; due_at: string }[];
  const announcements = db
    .prepare('SELECT id, title, posted_at FROM announcements WHERE course_id = ? ORDER BY posted_at DESC LIMIT ?')
    .all(course.id, BRIEFING_LIST_LIMIT) as { id: number; title: string; posted_at: string }[];
  const resourceCounts = db
    .prepare('SELECT kind, COUNT(*) AS count FROM resources WHERE course_id = ? GROUP BY kind')
    .all(course.id) as { kind: string; count: number }[];
  const recentResources = db
    .prepare('SELECT id, title, kind, extraction_status FROM resources WHERE course_id = ? ORDER BY added_at DESC LIMIT ?')
    .all(course.id, BRIEFING_LIST_LIMIT) as { id: number; title: string; kind: string; extraction_status: string }[];
  const recentNotes = db
    .prepare('SELECT id, title, generated_by_agent, updated_at FROM notes WHERE course_id = ? ORDER BY updated_at DESC LIMIT ?')
    .all(course.id, BRIEFING_LIST_LIMIT) as { id: number; title: string; generated_by_agent: number; updated_at: string }[];

  return {
    ok: true as const,
    course: { id: course.id, name: course.name, code: course.code, term: course.term },
    memory: readMemory(course.name),
    upcomingDeadlines: deadlines,
    recentAnnouncements: announcements,
    resourceCountsByKind: resourceCounts,
    recentResources,
    recentNotes,
  };
}

// User input isn't valid FTS5 query syntax as-is — quoting each
// whitespace-separated word as its own phrase and appending `*` gives
// simple, predictable prefix-matching per word without exposing FTS5's full
// query grammar. Moved here from main.ts's search:query handler so both the
// in-app search box and the MCP server's atlas_search use the exact same
// escaping instead of two copies drifting apart.
export function toFtsQuery(userInput: string): string {
  return userInput
    .trim()
    .split(/\s+/)
    .map((word) => `"${word.replace(/"/g, '""')}"*`)
    .join(' ');
}

export interface SearchHit {
  entityType: string;
  entityId: number;
  courseId: number;
  courseName: string;
  title: string;
  snippet: string;
}

const SEARCH_DEFAULT_LIMIT = 10;
const SEARCH_MAX_LIMIT = 25;
const SEARCH_EXCERPT_MAX_CHARS = 400;

// Never returns full text (phase4-spec.md §6.4) — a hit points at a
// location (title + short excerpt); atlas_read_document/atlas_read_note are
// how the agent actually reads something it found here. This is also where
// "page 214" becomes visible: a document_part hit's title is a page/slide/
// sheet/section label, not the resource's own title.
export function searchAtlas(
  db: Database.Database,
  query: string,
  opts: { course?: string | number; types?: string[]; limit?: number } = {}
): { hits: SearchHit[]; truncated: boolean } | { ok: false; error: string } {
  let courseId: number | null = null;
  if (opts.course !== undefined) {
    const lookup = findCourse(db, opts.course);
    if (!lookup.ok) return lookup;
    courseId = lookup.course.id;
  }

  const limit = Math.min(opts.limit ?? SEARCH_DEFAULT_LIMIT, SEARCH_MAX_LIMIT);
  // Over-fetch by one so truncation can be detected without a second COUNT
  // query, then trim back down to the real limit before returning.
  const rows = db
    .prepare(
      `SELECT search_index.entity_type AS entityType,
              search_index.entity_id AS entityId,
              search_index.course_id AS courseId,
              search_index.title AS title,
              courses.name AS courseName,
              snippet(search_index, 4, '', '', '…', 20) AS snippet
       FROM search_index
       JOIN courses ON courses.id = search_index.course_id
       WHERE search_index MATCH ?
       ORDER BY rank
       LIMIT ?`
    )
    .all(toFtsQuery(query), limit + 1) as SearchHit[];

  const filtered = rows
    .filter((r) => courseId === null || r.courseId === courseId)
    .filter((r) => !opts.types || opts.types.includes(r.entityType))
    .map((r) => ({ ...r, snippet: r.snippet.slice(0, SEARCH_EXCERPT_MAX_CHARS) }));

  return { hits: filtered.slice(0, limit), truncated: filtered.length > limit };
}

const LIST_DEFAULT_LIMIT = 50;
const LIST_MAX_LIMIT = 200;

export function listResources(
  db: Database.Database,
  ref: string | number,
  opts: { kind?: string; limit?: number; offset?: number } = {}
) {
  const lookup = findCourse(db, ref);
  if (!lookup.ok) return lookup;
  const limit = Math.min(opts.limit ?? LIST_DEFAULT_LIMIT, LIST_MAX_LIMIT);
  const offset = opts.offset ?? 0;

  const where = opts.kind ? 'AND kind = ?' : '';
  const params = opts.kind
    ? [lookup.course.id, opts.kind, limit + 1, offset]
    : [lookup.course.id, limit + 1, offset];
  const rows = db
    .prepare(
      `SELECT id, title, kind, extraction_status,
              (SELECT COUNT(*) FROM document_parts WHERE document_parts.resource_id = resources.id) AS partCount
       FROM resources WHERE course_id = ? ${where} ORDER BY added_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params);

  return { ok: true as const, resources: rows.slice(0, limit), truncated: rows.length > limit };
}

export function listDeadlines(db: Database.Database, ref?: string | number, days?: number) {
  let courseId: number | null = null;
  if (ref !== undefined) {
    const lookup = findCourse(db, ref);
    if (!lookup.ok) return lookup;
    courseId = lookup.course.id;
  }

  const conditions = ["completed = 0", "classroom_removed = 0", "due_at IS NOT NULL"];
  const params: (string | number)[] = [];
  if (courseId !== null) {
    conditions.push('course_id = ?');
    params.push(courseId);
  }
  if (days !== undefined) {
    conditions.push(`due_at <= datetime('now', '+${Math.max(0, Math.floor(days))} days')`);
  }

  const rows = db
    .prepare(
      `SELECT deadlines.id, deadlines.title, deadlines.kind, deadlines.due_at, courses.name AS courseName
       FROM deadlines JOIN courses ON courses.id = deadlines.course_id
       WHERE ${conditions.join(' AND ')} ORDER BY due_at`
    )
    .all(...params);

  return { ok: true as const, deadlines: rows };
}

const READ_PART_LIMIT = 25;
const READ_CHAR_CEILING = 60_000;

// This is how "chapters 5 to 8" actually gets read, after atlas_search
// locates them — `from`/`to` are 1-based ordinals into document_parts,
// matching the ordinal search results are labeled with.
export function readDocument(db: Database.Database, resourceId: number, from?: number, to?: number) {
  const resource = db.prepare('SELECT id, title, course_id FROM resources WHERE id = ?').get(resourceId) as
    | { id: number; title: string; course_id: number }
    | undefined;
  if (!resource) return { ok: false as const, error: `No resource with id ${resourceId}.` };

  const start = from ?? 1;
  const requestedEnd = to ?? start + READ_PART_LIMIT - 1;
  const end = Math.min(requestedEnd, start + READ_PART_LIMIT - 1);

  const parts = db
    .prepare(
      `SELECT ordinal, label, text FROM document_parts
       WHERE resource_id = ? AND origin = 'extracted' AND ordinal BETWEEN ? AND ?
       ORDER BY ordinal`
    )
    .all(resourceId, start, end) as { ordinal: number; label: string; text: string }[];

  let usedChars = 0;
  const included: typeof parts = [];
  for (const part of parts) {
    if (usedChars + part.text.length > READ_CHAR_CEILING && included.length > 0) break;
    included.push(part);
    usedChars += part.text.length;
  }

  return {
    ok: true as const,
    resource: { id: resource.id, title: resource.title },
    parts: included,
    truncated: included.length < parts.length || end < requestedEnd,
  };
}

export function readNote(db: Database.Database, noteId: number) {
  const note = db
    .prepare('SELECT id, title, content_markdown, generated_by_agent FROM notes WHERE id = ?')
    .get(noteId) as { id: number; title: string; content_markdown: string; generated_by_agent: number } | undefined;
  if (!note) return { ok: false as const, error: `No note with id ${noteId}.` };
  return { ok: true as const, note };
}

// course === undefined writes the general memory file (phase4-spec.md §5.0);
// otherwise the named course's. Silent per §5.3 — no confirmation, no review
// queue; the file being plain text in the user's own data folder is the
// oversight mechanism.
export function writeCourseOrGeneralMemory(db: Database.Database, course: string | number | undefined, content: string) {
  if (course === undefined) {
    writeMemory(null, content);
    return { ok: true as const };
  }
  const lookup = findCourse(db, course);
  if (!lookup.ok) return lookup;
  writeMemory(lookup.course.name, content);
  return { ok: true as const };
}

// Can only ever create — never overwrites or edits an existing note, so an
// agent can add a study guide but never touch something the user wrote
// (phase4-spec.md §4, a boundary the user explicitly asked for).
export function createAgentNote(db: Database.Database, course: string | number, title: string, contentMarkdown: string) {
  const lookup = findCourse(db, course);
  if (!lookup.ok) return lookup;
  const result = db
    .prepare('INSERT INTO notes (course_id, title, content_markdown, generated_by_agent) VALUES (?, ?, ?, 1)')
    .run(lookup.course.id, title, contentMarkdown);
  return { ok: true as const, noteId: Number(result.lastInsertRowid) };
}
