import type Database from 'better-sqlite3';
import { readMemory, writeMemory } from './memoryFiles';

// The Phase 4 query layer (Phase 4 architecture §6.3) — plain functions over a
// better-sqlite3 Database instance, with no dependency on Electron or IPC.
// Shared by two callers: the in-app static export (Part E, runs inside the
// Electron main process) and the standalone MCP server (Part D, runs as a
// separate Node process against the same on-disk database file). Neither
// caller is imported here, so this file stays usable from both without
// pulling in Electron.
//
// This is also where "relevance" is deliberately NOT decided (Phase 4 architecture
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
  // The unique, filesystem-safe, never-renamed identifier this course's
  // storage folder and memory file are both keyed by — see memoryFiles.ts.
  folder_name: string;
}

export type CourseLookup =
  | { ok: true; course: CourseRow }
  | { ok: false; error: string; candidates?: { id: number; name: string }[] };

// Every course-taking tool accepts either a numeric ID or a name
// (Phase 4 architecture §6.2) — exact case-insensitive match first, then a unique
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
  if (!name) return { ok: false, error: 'Course reference cannot be empty.' };
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

// The fresh-conversation bootstrap (PRD §18, Phase 4 architecture §6.3) — the
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

  const generalNoteCount = (db.prepare('SELECT COUNT(*) AS c FROM notes WHERE course_id IS NULL').get() as { c: number }).c;

  return {
    currentSemester,
    courses: courses.map((c) => ({ id: c.id, name: c.name, code: c.code, term: c.term })),
    resourceCount: count('resources'),
    // General notes are deliberately not tied to a semester or course, so
    // include them in the overall count even when a semester filter is active.
    noteCount: count('notes') + generalNoteCount,
    generalNoteCount,
    upcomingDeadlineCount: count(
      'deadlines',
      "AND completed = 0 AND classroom_removed = 0 AND due_at IS NOT NULL AND due_at >= datetime('now')"
    ),
    generalMemory: readMemory(null),
  };
}

const BRIEFING_LIST_LIMIT = 20;

// A course reached via link-following (remote-attachment architecture §5.5) can
// plausibly have 60+ resources and several thousand pages — the fixed
// top-20 lists below stay (still the right shape for "what's new"), but
// without a total count alongside them the agent has no way to tell "this
// is everything" from "this is the first 20 of 300" (§5.6). One extra
// COUNT(*) each, cheap at this app's scale.
function countFor(db: Database.Database, table: string, courseId: number, extraWhere = ''): number {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE course_id = ? ${extraWhere}`).get(courseId) as {
    c: number;
  };
  return row.c;
}

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

  const totalDocumentParts = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM document_parts
         JOIN resources ON resources.id = document_parts.resource_id
         WHERE resources.course_id = ?`
      )
      .get(course.id) as { c: number }
  ).c;

  return {
    ok: true as const,
    course: { id: course.id, name: course.name, code: course.code, term: course.term },
    memory: readMemory(course.folder_name),
    upcomingDeadlines: deadlines,
    upcomingDeadlineTotal: countFor(db, 'deadlines', course.id, "AND completed = 0 AND classroom_removed = 0 AND due_at IS NOT NULL"),
    recentAnnouncements: announcements,
    announcementTotal: countFor(db, 'announcements', course.id),
    resourceCountsByKind: resourceCounts,
    recentResources,
    // Lets the agent recognize a large course (§5.6) and choose to sample
    // broadly via atlas_list_resources' pagination rather than assume the
    // 20 shown here are everything, or read every one deeply.
    resourceTotal: countFor(db, 'resources', course.id),
    totalDocumentParts,
    recentNotes,
    noteTotal: countFor(db, 'notes', course.id),
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
  courseId: number | null;
  courseName: string;
  title: string;
  snippet: string;
  resourceId: number | null;
  resourceTitle: string | null;
  source: string | null;
  partOrdinal: number | null;
}

export type MaterialType = 'resource' | 'note' | 'announcement' | 'assignment';
export type MaterialAvailability = 'readable' | 'needs_ocr' | 'pending' | 'failed' | 'unsupported' | 'external';
export type MaterialReadTool = 'atlas_read_document' | 'atlas_read_note' | 'atlas_read_classroom_item';

export interface MaterialCandidate {
  type: MaterialType;
  id: number;
  title: string;
  kind: string | null;
  source: string | null;
  readTool: MaterialReadTool;
  availability: MaterialAvailability;
  availabilityDetail: string;
}

export interface MaterialClarification {
  kind: 'choose_material';
  question: string;
  options: { type: MaterialType; id: number; label: string }[];
}

export type MaterialResolution =
  | {
      ok: true;
      status: 'found';
      nextAction: 'read_match' | 'handle_availability';
      course: { id: number; name: string; code: string | null; term: string | null };
      query: string;
      match: MaterialCandidate;
    }
  | {
      ok: true;
      status: 'ambiguous';
      nextAction: 'ask_user' | 'stop';
      course: { id: number; name: string; code: string | null; term: string | null };
      query: string;
      candidates: MaterialCandidate[];
      clarification: MaterialClarification;
    }
  | {
      ok: true;
      status: 'not_found';
      nextAction: 'stop';
      course: { id: number; name: string; code: string | null; term: string | null };
      query: string;
      candidates: [];
    };

function materialTitleKey(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/\.(pdf|pptx|docx|xlsx|txt|md|csv|tsv|png|jpg|jpeg|webp)$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function numberedTitle(value: string): { prefix: string; start: number; end: number } | null {
  const normalized = materialTitleKey(value);
  const match = normalized.match(/^(.*?)(?:\s+)(\d+)(?:\s*[-–—]\s*(\d+))?$/);
  if (!match) return null;
  return {
    prefix: match[1].trim(),
    start: Number(match[2]),
    end: Number(match[3] ?? match[2]),
  };
}

function resourceAvailability(row: {
  kind: string;
  source: string;
  extractionStatus: string;
  extractionError: string | null;
  ocrText: string | null;
  linkKind: string | null;
  partCount: number;
}): { availability: MaterialAvailability; availabilityDetail: string } {
  if (row.extractionStatus === 'done' && (row.partCount > 0 || !!row.ocrText?.trim())) {
    return { availability: 'readable', availabilityDetail: 'Text is available to the agent.' };
  }
  if (row.extractionStatus === 'pending') {
    return { availability: 'pending', availabilityDetail: 'Atlas is still extracting this file.' };
  }
  if (row.extractionStatus === 'empty') {
    return row.kind === 'pdf'
      ? { availability: 'needs_ocr', availabilityDetail: 'No text layer was found; OCR may be required.' }
      : { availability: 'unsupported', availabilityDetail: 'No readable text was found.' };
  }
  if (row.extractionStatus === 'failed') {
    return { availability: 'failed', availabilityDetail: row.extractionError || 'Atlas could not extract text from this file.' };
  }
  if (row.kind === 'link' && row.linkKind !== 'driveFile') {
    return { availability: 'external', availabilityDetail: 'This is an external link and has no Atlas text copy.' };
  }
  return { availability: 'unsupported', availabilityDetail: 'This source has no readable Atlas text.' };
}

function noteAvailability(row: {
  contentMarkdown: string;
  ocrText: string | null;
  isHandwritten: number;
  imagePath: string | null;
}): { availability: MaterialAvailability; availabilityDetail: string } {
  if (row.contentMarkdown.trim() || row.ocrText?.trim()) {
    return { availability: 'readable', availabilityDetail: 'Note text is available to the agent.' };
  }
  if (row.isHandwritten && row.imagePath) {
    return { availability: 'needs_ocr', availabilityDetail: 'This scan has no accepted text yet; the visual source may still be readable.' };
  }
  return { availability: 'unsupported', availabilityDetail: 'This note does not contain readable text yet.' };
}

// Resolves a named piece of material inside one already-selected course. This
// deliberately does not perform semantic search: it gives the agent a safe
// first step for requests such as "Lecture 10" and makes the three possible
// outcomes explicit (found, ambiguous, or not_found). The agent can then read
// the exact match, pause for the user, or stop without launching a desperate
// sequence of broader searches.
export function resolveMaterial(
  db: Database.Database,
  ref: string | number,
  query: string
): MaterialResolution | { ok: false; error: string; candidates?: { id: number; name: string }[] } {
  const lookup = findCourse(db, ref);
  if (!lookup.ok) return lookup;

  const trimmedQuery = query.trim();
  if (!trimmedQuery) return { ok: false, error: 'Material query cannot be empty.' };

  const course = lookup.course;
  const candidates: MaterialCandidate[] = [];
  const resources = db
    .prepare(
      `SELECT resources.id, resources.title, resources.kind, resources.source,
              resources.extraction_status AS extractionStatus,
              resources.extraction_error AS extractionError,
              resources.ocr_text AS ocrText, resources.link_kind AS linkKind,
              (SELECT COUNT(*) FROM document_parts WHERE document_parts.resource_id = resources.id) AS partCount
       FROM resources WHERE resources.course_id = ? ORDER BY resources.title`
    )
    .all(course.id) as {
    id: number;
    title: string;
    kind: string;
    source: string;
    extractionStatus: string;
    extractionError: string | null;
    ocrText: string | null;
    linkKind: string | null;
    partCount: number;
  }[];
  for (const resource of resources) {
    const readiness = resourceAvailability(resource);
    candidates.push({
      type: 'resource',
      id: resource.id,
      title: resource.title,
      kind: resource.kind,
      source: resource.source,
      readTool: 'atlas_read_document',
      ...readiness,
    });
  }

  const notes = db
    .prepare(
      `SELECT id, title, content_markdown AS contentMarkdown, ocr_text AS ocrText,
              is_handwritten AS isHandwritten, image_path AS imagePath
       FROM notes WHERE course_id = ? ORDER BY title`
    )
    .all(course.id) as {
    id: number;
    title: string;
    contentMarkdown: string;
    ocrText: string | null;
    isHandwritten: number;
    imagePath: string | null;
  }[];
  for (const note of notes) {
    const readiness = noteAvailability(note);
    candidates.push({
      type: 'note',
      id: note.id,
      title: note.title,
      kind: null,
      source: 'note',
      readTool: 'atlas_read_note',
      ...readiness,
    });
  }

  const announcements = db
    .prepare(
      `SELECT id, title, source, body
       FROM announcements WHERE course_id = ? ORDER BY title`
    )
    .all(course.id) as { id: number; title: string; source: string; body: string | null }[];
  for (const announcement of announcements) {
    candidates.push({
      type: 'announcement',
      id: announcement.id,
      title: announcement.title,
      kind: null,
      source: announcement.source,
      readTool: 'atlas_read_classroom_item',
      availability: announcement.body?.trim() ? 'readable' : 'unsupported',
      availabilityDetail: announcement.body?.trim()
        ? 'Announcement text is available to the agent.'
        : 'This announcement has no stored body text.',
    });
  }

  const assignments = db
    .prepare(
      `SELECT id, title, source, description
       FROM assignments WHERE course_id = ? ORDER BY title`
    )
    .all(course.id) as { id: number; title: string; source: string; description: string | null }[];
  for (const assignment of assignments) {
    candidates.push({
      type: 'assignment',
      id: assignment.id,
      title: assignment.title,
      kind: null,
      source: assignment.source,
      readTool: 'atlas_read_classroom_item',
      availability: assignment.description?.trim() ? 'readable' : 'unsupported',
      availabilityDetail: assignment.description?.trim()
        ? 'Assignment description is available to the agent.'
        : 'This assignment has no stored description text.',
    });
  }

  const queryKey = materialTitleKey(trimmedQuery);
  const exact = candidates.filter((candidate) => materialTitleKey(candidate.title) === queryKey);
  if (exact.length === 1) {
    return {
      ok: true,
      status: 'found',
      nextAction: exact[0].availability === 'readable' ? 'read_match' : 'handle_availability',
      course: { id: course.id, name: course.name, code: course.code, term: course.term },
      query: trimmedQuery,
      match: exact[0],
    };
  }

  const numberedQuery = numberedTitle(trimmedQuery);
  const nearby = numberedQuery
    ? candidates
        .map((candidate) => ({ candidate, numbered: numberedTitle(candidate.title) }))
        .filter(
          (item): item is { candidate: MaterialCandidate; numbered: { prefix: string; start: number; end: number } } =>
            item.numbered !== null &&
            item.numbered.prefix === numberedQuery.prefix &&
            (item.numbered.end === numberedQuery.start - 1 || item.numbered.start === numberedQuery.end + 1)
        )
        .sort(
          (a, b) =>
            Math.abs(a.numbered.start - numberedQuery.start) - Math.abs(b.numbered.start - numberedQuery.start) ||
            a.numbered.start - b.numbered.start
        )
        .map((item) => item.candidate)
        .slice(0, 8)
    : [];

  const clarificationCandidates = exact.length > 0 ? exact : nearby;
  if (clarificationCandidates.length > 0) {
    const labels = clarificationCandidates.map((candidate) => candidate.title).join(', ');
    return {
      ok: true,
      status: 'ambiguous',
      nextAction: 'ask_user',
      course: { id: course.id, name: course.name, code: course.code, term: course.term },
      query: trimmedQuery,
      candidates: clarificationCandidates,
      clarification: {
        kind: 'choose_material',
        question: `I couldn't find "${trimmedQuery}" in ${course.name}. I found ${labels}. Which one did you mean?`,
        options: clarificationCandidates.map((candidate) => ({
          type: candidate.type,
          id: candidate.id,
          label: candidate.title,
        })),
      },
    };
  }

  return {
    ok: true,
    status: 'not_found',
    nextAction: 'stop',
    course: { id: course.id, name: course.name, code: course.code, term: course.term },
    query: trimmedQuery,
    candidates: [],
  };
}

const SEARCH_DEFAULT_LIMIT = 10;
const SEARCH_MAX_LIMIT = 25;
// A course-scoped search is already narrowed to one course's own content —
// 25 hits is thin when the agent is sweeping a whole semester (exam-scale
// access, §5.6), so a course-scoped call gets a higher ceiling. An
// unscoped, whole-library search keeps the lower ceiling: it's ranked
// across every course at once, so a large N there is far more likely to be
// noise than a genuinely broad but relevant result set.
const SEARCH_MAX_LIMIT_COURSE_SCOPED = 100;
const SEARCH_EXCERPT_MAX_CHARS = 400;

// Never returns full text (Phase 4 architecture §6.4) — a hit points at a
// location (title + short excerpt); atlas_read_document/atlas_read_note are
// how the agent actually reads something it found here. This is also where
// "page 214" becomes visible: a document_part hit's title is a page/slide/
// sheet/section label, not the resource's own title.
export function searchAtlas(
  db: Database.Database,
  query: string,
  opts: { course?: string | number; types?: string[]; limit?: number } = {}
): { hits: SearchHit[]; truncated: boolean } | { ok: false; error: string } {
  if (!query.trim()) return { ok: false, error: 'Search query cannot be empty.' };
  let courseId: number | null = null;
  if (opts.course !== undefined) {
    const lookup = findCourse(db, opts.course);
    if (!lookup.ok) return lookup;
    courseId = lookup.course.id;
  }

  const maxLimit = courseId !== null ? SEARCH_MAX_LIMIT_COURSE_SCOPED : SEARCH_MAX_LIMIT;
  const limit = Math.min(opts.limit ?? SEARCH_DEFAULT_LIMIT, maxLimit);

  // Course/type filtering MUST happen inside the SQL, before LIMIT — doing
  // it in JavaScript afterwards was a real bug: a course-scoped search would
  // silently return nothing whenever the globally top-ranked N hits all
  // belonged to other courses, even though real matches existed in the
  // requested one. That's precisely the "agent confidently answers from a
  // partial view" failure Phase 4 architecture §6.4 exists to prevent.
  const conditions = ['search_index MATCH ?'];
  const params: (string | number)[] = [toFtsQuery(query)];
  if (courseId !== null) {
    conditions.push('search_index.course_id = ?');
    params.push(courseId);
  }
  if (opts.types && opts.types.length > 0) {
    conditions.push(`search_index.entity_type IN (${opts.types.map(() => '?').join(',')})`);
    params.push(...opts.types);
  }
  // Over-fetch by one so truncation can be detected without a second COUNT
  // query, then trim back down to the real limit before returning.
  params.push(limit + 1);

  const rows = db
    .prepare(
      `SELECT search_index.entity_type AS entityType,
              search_index.entity_id AS entityId,
              search_index.course_id AS courseId,
              search_index.title AS title,
              COALESCE(courses.name, 'General') AS courseName,
              CASE
                WHEN search_index.entity_type IN ('resource', 'document_part') THEN matched_resource.id
                ELSE NULL
              END AS resourceId,
              CASE
                WHEN search_index.entity_type IN ('resource', 'document_part') THEN matched_resource.title
                ELSE NULL
              END AS resourceTitle,
              matched_resource.source AS source,
              parts.ordinal AS partOrdinal,
              snippet(search_index, 4, '', '', '…', 20) AS snippet
       FROM search_index
       LEFT JOIN courses ON courses.id = search_index.course_id
       LEFT JOIN document_parts AS parts
         ON search_index.entity_type = 'document_part' AND parts.id = search_index.entity_id
       LEFT JOIN resources AS matched_resource
         ON matched_resource.id = CASE
           WHEN search_index.entity_type = 'resource' THEN search_index.entity_id
           WHEN search_index.entity_type = 'document_part' THEN parts.resource_id
           ELSE NULL
         END
       WHERE ${conditions.join(' AND ')}
       ORDER BY rank
       LIMIT ?`
    )
    .all(...params) as SearchHit[];

  const hits = rows.slice(0, limit).map((r) => ({ ...r, snippet: r.snippet.slice(0, SEARCH_EXCERPT_MAX_CHARS) }));
  return { hits, truncated: rows.length > limit };
}

export type ClassroomItemType = 'announcement' | 'assignment';

interface ClassroomAttachment {
  id: number;
  title: string;
  kind: string;
  source: string;
  linkKind: string | null;
}

function classroomAttachments(db: Database.Database, classroomItemId: string | null): ClassroomAttachment[] {
  if (!classroomItemId) return [];
  return db
    .prepare(
      `SELECT id, title, kind, source, link_kind AS linkKind
       FROM resources
       WHERE classwork_material_id IS NULL
         AND classroom_attachment_id LIKE ? || ':%'
       ORDER BY added_at`
    )
    .all(classroomItemId) as ClassroomAttachment[];
}

// Classroom sync stores the complete announcement/assignment body in Atlas.
// This reads that canonical local copy; it does not make a Google API request
// and it never returns local filesystem paths.
export function readClassroomItem(db: Database.Database, type: ClassroomItemType, id: number) {
  if (type === 'announcement') {
    const row = db
      .prepare(
        `SELECT announcements.id, announcements.title, announcements.body,
                announcements.posted_at AS postedAt, announcements.source,
                announcements.dashboard_pinned AS dashboardPinned,
                announcements.classroom_announcement_id AS classroomAnnouncementId,
                courses.id AS courseId, courses.name AS courseName,
                courses.code AS courseCode, courses.term AS courseTerm
         FROM announcements
         JOIN courses ON courses.id = announcements.course_id
         WHERE announcements.id = ?`
      )
      .get(id) as
      | {
          id: number;
          title: string;
          body: string | null;
          postedAt: string;
          source: string;
          dashboardPinned: number;
          classroomAnnouncementId: string | null;
          courseId: number;
          courseName: string;
          courseCode: string | null;
          courseTerm: string | null;
        }
      | undefined;
    if (!row) return { ok: false as const, error: `No announcement with id ${id}.` };
    return {
      ok: true as const,
      course: { id: row.courseId, name: row.courseName, code: row.courseCode, term: row.courseTerm },
      item: {
        id: row.id,
        type,
        title: row.title,
        body: row.body,
        postedAt: row.postedAt,
        source: row.source,
        dashboardPinned: row.dashboardPinned === 1,
        classroomAnnouncementId: row.classroomAnnouncementId,
        attachments: classroomAttachments(db, row.classroomAnnouncementId),
      },
    };
  }

  const row = db
    .prepare(
      `SELECT assignments.id, assignments.title, assignments.description,
              assignments.due_at AS dueAt, assignments.source, assignments.status,
              assignments.updated_at AS updatedAt, assignments.posted_at AS postedAt,
              assignments.classroom_coursework_id AS classroomCourseworkId,
              assignments.classroom_removed AS classroomRemoved,
              courses.id AS courseId, courses.name AS courseName,
              courses.code AS courseCode, courses.term AS courseTerm
       FROM assignments
       JOIN courses ON courses.id = assignments.course_id
       WHERE assignments.id = ?`
    )
    .get(id) as
    | {
        id: number;
        title: string;
        description: string | null;
        dueAt: string | null;
        source: string;
        status: string;
        updatedAt: string | null;
        postedAt: string | null;
        classroomCourseworkId: string | null;
        classroomRemoved: number;
        courseId: number;
        courseName: string;
        courseCode: string | null;
        courseTerm: string | null;
      }
    | undefined;
  if (!row) return { ok: false as const, error: `No assignment with id ${id}.` };
  return {
    ok: true as const,
    course: { id: row.courseId, name: row.courseName, code: row.courseCode, term: row.courseTerm },
    item: {
      id: row.id,
      type,
      title: row.title,
      description: row.description,
      dueAt: row.dueAt,
      source: row.source,
      status: row.status,
      updatedAt: row.updatedAt,
      postedAt: row.postedAt,
      classroomCourseworkId: row.classroomCourseworkId,
      classroomRemoved: row.classroomRemoved === 1,
      attachments: classroomAttachments(db, row.classroomCourseworkId),
    },
  };
}

export type ReadinessStatus = 'ready' | 'needs_ocr' | 'pending' | 'failed' | 'unsupported' | 'external';

export interface ReadinessItem {
  id: number;
  type: 'resource' | 'note';
  title: string;
  status: ReadinessStatus;
  detail: string;
  kind?: string;
  source?: string;
  canRetry?: boolean;
}

// The same deterministic report powers the in-app Readiness tab and the MCP
// tool. It reports text availability only, not comprehension or progress.
export function getCourseReadiness(db: Database.Database, ref: string | number) {
  const lookup = findCourse(db, ref);
  if (!lookup.ok) return lookup;
  const course = lookup.course;
  const resources = db
    .prepare(
      `SELECT resources.id, resources.title, resources.kind, resources.source,
              resources.extraction_status AS extractionStatus,
              resources.extraction_error AS extractionError,
              resources.ocr_text AS ocrText,
              resources.remote_source AS remoteSource,
              resources.link_kind AS linkKind,
              (SELECT COUNT(*) FROM document_parts
               WHERE document_parts.resource_id = resources.id) AS partCount
       FROM resources
       WHERE resources.course_id = ?
       ORDER BY resources.added_at DESC`
    )
    .all(course.id) as {
    id: number;
    title: string;
    kind: string;
    source: string;
    extractionStatus: 'pending' | 'done' | 'empty' | 'unsupported' | 'failed';
    extractionError: string | null;
    ocrText: string | null;
    remoteSource: 'drive' | 'gmail' | null;
    linkKind: 'driveFile' | 'youTubeVideo' | 'link' | 'form' | null;
    partCount: number;
  }[];
  const notes = db
    .prepare(
      `SELECT id, title, content_markdown AS contentMarkdown, is_handwritten AS isHandwritten,
              image_path AS imagePath, ocr_text AS ocrText
       FROM notes
       WHERE course_id = ?
       ORDER BY updated_at DESC`
    )
    .all(course.id) as {
    id: number;
    title: string;
    contentMarkdown: string;
    isHandwritten: number;
    imagePath: string | null;
    ocrText: string | null;
  }[];

  const counts: Record<ReadinessStatus, number> = {
    ready: 0,
    needs_ocr: 0,
    pending: 0,
    failed: 0,
    unsupported: 0,
    external: 0,
  };
  const issues: ReadinessItem[] = [];
  const add = (item: ReadinessItem): void => {
    counts[item.status] += 1;
    if (item.status !== 'ready') issues.push(item);
  };

  for (const resource of resources) {
    let status: ReadinessStatus;
    let detail: string;
    let canRetry = false;
    if (resource.extractionStatus === 'done' && (resource.partCount > 0 || !!resource.ocrText?.trim())) {
      status = 'ready';
      detail = 'Text is available to the agent.';
    } else if (resource.extractionStatus === 'pending') {
      status = 'pending';
      detail = 'Atlas is still extracting this file.';
    } else if (resource.extractionStatus === 'empty') {
      status = resource.kind === 'pdf' ? 'needs_ocr' : 'unsupported';
      detail = resource.kind === 'pdf' ? 'No text layer was found. Run OCR and review the result.' : 'No readable text was found.';
    } else if (resource.extractionStatus === 'failed') {
      status = 'failed';
      detail = resource.extractionError || 'Atlas could not extract text from this file.';
      canRetry = !resource.remoteSource && ['pdf', 'pptx', 'xlsx', 'docx', 'text', 'markdown'].includes(resource.kind);
    } else if (resource.kind === 'link' && resource.linkKind !== 'driveFile') {
      status = 'external';
      detail = 'External material; Atlas does not extract this link into course text.';
    } else {
      status = 'unsupported';
      detail = 'This file type is not included in Atlas text extraction.';
    }
    add({
      id: resource.id,
      type: 'resource',
      title: resource.title,
      status,
      detail,
      kind: resource.kind,
      source: resource.source,
      canRetry,
    });
  }

  for (const note of notes) {
    if (note.contentMarkdown.trim() || note.ocrText?.trim()) {
      add({ id: note.id, type: 'note', title: note.title, status: 'ready', detail: 'Note text is available to the agent.' });
    } else if (note.isHandwritten && note.imagePath) {
      add({
        id: note.id,
        type: 'note',
        title: note.title,
        status: 'needs_ocr',
        detail: 'This scan has no accepted text yet. Run OCR or ask the external agent to inspect the scan.',
      });
    } else {
      add({ id: note.id, type: 'note', title: note.title, status: 'unsupported', detail: 'This note does not contain text yet.' });
    }
  }

  return {
    ok: true as const,
    course: { id: course.id, name: course.name, code: course.code, term: course.term },
    total: resources.length + notes.length,
    readable: counts.ready,
    counts,
    issues,
  };
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

  const totalParams = opts.kind ? [lookup.course.id, opts.kind] : [lookup.course.id];
  const total = (
    db
      .prepare(`SELECT COUNT(*) AS count FROM resources WHERE course_id = ? ${where}`)
      .get(...totalParams) as { count: number }
  ).count;

  return {
    ok: true as const,
    resources: rows.slice(0, limit),
    total,
    limit,
    offset,
    truncated: rows.length > limit,
  };
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
// matching the ordinal search results are labeled with. Called with
// neither argument, this instead returns an outline (every part's label,
// no text) — cheap navigation for exam-scale access (§5.6): the agent can
// see "847 pages, Chapter 5 starts at 214" before pulling any actual text,
// which is what makes "access every file in the course" tractable instead
// of a blind, expensive guess-and-check over hundreds of pages.
export function readDocument(db: Database.Database, resourceId: number, from?: number, to?: number) {
  const resource = db.prepare('SELECT id, title, course_id FROM resources WHERE id = ?').get(resourceId) as
    | { id: number; title: string; course_id: number }
    | undefined;
  if (!resource) return { ok: false as const, error: `No resource with id ${resourceId}.` };

  if (from === undefined && to === undefined) {
    const hasExtracted = db
      .prepare("SELECT 1 FROM document_parts WHERE resource_id = ? AND origin = 'extracted' LIMIT 1")
      .get(resourceId);
    const origin = hasExtracted ? 'extracted' : 'ocr';
    const outline = db
      .prepare('SELECT ordinal, label FROM document_parts WHERE resource_id = ? AND origin = ? ORDER BY ordinal')
      .all(resourceId, origin) as { ordinal: number; label: string }[];
    return {
      ok: true as const,
      resource: { id: resource.id, title: resource.title },
      outline,
      totalParts: outline.length,
    };
  }

  const start = from ?? 1;
  const requestedEnd = to ?? start + READ_PART_LIMIT - 1;
  const end = Math.min(requestedEnd, start + READ_PART_LIMIT - 1);

  // Prefer the real text layer, fall back to OCR. Restricting this to
  // origin = 'extracted' was a real bug: a scanned textbook the user ran OCR
  // on would appear in search results (search indexes both origins) but
  // return zero content when the agent tried to actually read the page it
  // had just been pointed at. Chosen per-resource rather than per-ordinal
  // because a PDF either has a usable text layer or it doesn't — mixing the
  // two sources within one document would make page numbering incoherent.
  const hasExtracted = db
    .prepare("SELECT 1 FROM document_parts WHERE resource_id = ? AND origin = 'extracted' LIMIT 1")
    .get(resourceId);
  const origin = hasExtracted ? 'extracted' : 'ocr';

  const parts = db
    .prepare(
      `SELECT ordinal, label, text FROM document_parts
       WHERE resource_id = ? AND origin = ? AND ordinal BETWEEN ? AND ?
       ORDER BY ordinal`
    )
    .all(resourceId, origin, start, end) as { ordinal: number; label: string; text: string }[];

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

export interface VisualSource {
  ok: true;
  targetType: 'resource' | 'note';
  id: number;
  title: string;
  kind: 'pdf' | 'image';
  filePath: string;
  course: { id: number; name: string } | null;
}

// Resolve a visual target by an Atlas id, never by a caller-supplied path.
// The MCP layer keeps filePath internal and only returns image bytes, which
// prevents the visual tool from becoming an arbitrary local-file reader.
export function resolveVisualSource(
  db: Database.Database,
  target: { resourceId?: number; noteId?: number }
): VisualSource | { ok: false; error: string } {
  if ((target.resourceId === undefined) === (target.noteId === undefined)) {
    return { ok: false, error: 'Provide exactly one of resource_id or note_id.' };
  }

  if (target.resourceId !== undefined) {
    const row = db
      .prepare(
        `SELECT resources.id, resources.title, resources.kind, resources.file_path AS filePath,
                courses.id AS courseId, courses.name AS courseName
         FROM resources
         LEFT JOIN courses ON courses.id = resources.course_id
         WHERE resources.id = ?`
      )
      .get(target.resourceId) as
      | { id: number; title: string; kind: string; filePath: string; courseId: number | null; courseName: string | null }
      | undefined;
    if (!row) return { ok: false, error: `No resource with id ${target.resourceId}.` };
    if (row.kind !== 'pdf' && row.kind !== 'image') {
      return { ok: false, error: `Resource ${target.resourceId} is ${row.kind}, not a PDF or image.` };
    }
    return {
      ok: true,
      targetType: 'resource',
      id: row.id,
      title: row.title,
      kind: row.kind,
      filePath: row.filePath,
      course: row.courseId !== null && row.courseName ? { id: row.courseId, name: row.courseName } : null,
    };
  }

  const row = db
    .prepare(
      `SELECT notes.id, notes.title, notes.image_path AS filePath,
              courses.id AS courseId, courses.name AS courseName
       FROM notes
       LEFT JOIN courses ON courses.id = notes.course_id
       WHERE notes.id = ?`
    )
    .get(target.noteId) as
    | { id: number; title: string; filePath: string | null; courseId: number | null; courseName: string | null }
    | undefined;
  if (!row) return { ok: false, error: `No note with id ${target.noteId}.` };
  if (!row.filePath) return { ok: false, error: `Note ${target.noteId} has no image or PDF scan attached.` };
  return {
    ok: true,
    targetType: 'note',
    id: row.id,
    title: row.title,
    kind: /\.pdf$/i.test(row.filePath) ? 'pdf' : 'image',
    filePath: row.filePath,
    course: row.courseId !== null && row.courseName ? { id: row.courseId, name: row.courseName } : null,
  };
}

// course === undefined writes the general memory file (Phase 4 architecture §5.0);
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
  writeMemory(lookup.course.folder_name, content);
  return { ok: true as const };
}

// Agent-owned notes can be revised in place, but user-authored notes remain
// outside the MCP write boundary. This keeps the useful persistence workflow
// editable without giving the external agent authority over Pamac's own notes.
export function createAgentNote(
  db: Database.Database,
  course: string | number | null | undefined,
  title: string,
  contentMarkdown: string
) {
  if (course === undefined || course === null) {
    const result = db
      .prepare('INSERT INTO notes (course_id, title, content_markdown, generated_by_agent) VALUES (NULL, ?, ?, 1)')
      .run(title, contentMarkdown);
    return { ok: true as const, noteId: Number(result.lastInsertRowid), courseId: null, courseName: 'General' };
  }
  const lookup = findCourse(db, course);
  if (!lookup.ok) return lookup;
  const result = db
    .prepare('INSERT INTO notes (course_id, title, content_markdown, generated_by_agent) VALUES (?, ?, ?, 1)')
    .run(lookup.course.id, title, contentMarkdown);
  return { ok: true as const, noteId: Number(result.lastInsertRowid), courseId: lookup.course.id, courseName: lookup.course.name };
}

export function updateAgentNote(
  db: Database.Database,
  noteId: number,
  contentMarkdown: string,
  title?: string
) {
  const note = db
    .prepare('SELECT id, course_id, title, generated_by_agent FROM notes WHERE id = ?')
    .get(noteId) as
    | { id: number; course_id: number | null; title: string; generated_by_agent: number }
    | undefined;

  if (!note) return { ok: false as const, error: `No note with id ${noteId}.` };
  if (note.generated_by_agent !== 1) {
    return { ok: false as const, error: `Note ${noteId} is user-authored and cannot be edited through Atlas MCP.` };
  }

  const nextTitle = title === undefined ? note.title : title.trim() || 'Untitled';
  if (title === undefined) {
    db.prepare("UPDATE notes SET content_markdown = ?, updated_at = datetime('now') WHERE id = ?").run(
      contentMarkdown,
      noteId
    );
  } else {
    db.prepare(
      "UPDATE notes SET content_markdown = ?, title = ?, title_is_manual = 1, updated_at = datetime('now') WHERE id = ?"
    ).run(contentMarkdown, nextTitle, noteId);
  }

  return {
    ok: true as const,
    noteId,
    courseId: note.course_id,
    title: nextTitle,
  };
}
