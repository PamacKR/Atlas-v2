import { google, classroom_v1 } from 'googleapis';
import { getDb } from './db/database';
import { getClassroomClient } from './googleAuth';

export interface ClassroomSyncError {
  courseId: number;
  courseName: string;
  message: string;
}

export interface ClassroomSyncResult {
  changed: boolean;
  errors: ClassroomSyncError[];
}

export interface ClassroomPendingCourse {
  id: number;
  classroom_course_id: string;
  name: string;
  section: string | null;
  suggested_course_id: number | null;
  detected_at: string;
}

function classroomApi(): classroom_v1.Classroom {
  const client = getClassroomClient();
  if (!client) throw new Error('Google Classroom is not connected.');
  return google.classroom({ version: 'v1', auth: client });
}

// A name-match suggestion only — pre-fills the review panel's picker but is
// never applied on its own. Which Atlas course a Classroom course maps to is
// always a user decision (docs/open-questions.md #11, "Atlas owns the data").
function suggestExistingCourse(classroomName: string): number | null {
  const db = getDb();
  const courses = db.prepare('SELECT id, name FROM courses WHERE archived = 0').all() as {
    id: number;
    name: string;
  }[];
  const normalized = classroomName.trim().toLowerCase();
  const match = courses.find((c) => c.name.trim().toLowerCase() === normalized);
  return match?.id ?? null;
}

// Lists Classroom courses not yet mapped to an Atlas course (courses.classroom_course_id)
// and not already staged for review, inserting new ones into
// classroom_pending_courses with a name-match suggestion. Also reconciles
// stale pending rows for courses no longer active/visible in Classroom
// before the user ever resolved them — same idea as scanDriveFolder's stale
// cleanup. Returns whether the pending list changed.
export async function scanClassroomCourses(): Promise<boolean> {
  const client = getClassroomClient();
  if (!client) return false;

  const classroom = classroomApi();
  const res = await classroom.courses.list({ courseStates: ['ACTIVE'], pageSize: 200 });
  const courses = res.data.courses ?? [];

  const db = getDb();
  const liveIds = new Set(courses.map((c) => c.id).filter((id): id is string => Boolean(id)));

  const pendingRows = db.prepare('SELECT classroom_course_id FROM classroom_pending_courses').all() as {
    classroom_course_id: string;
  }[];
  const deleteStalePending = db.prepare(
    'DELETE FROM classroom_pending_courses WHERE classroom_course_id = ?'
  );
  let changed = false;
  for (const row of pendingRows) {
    if (!liveIds.has(row.classroom_course_id)) {
      deleteStalePending.run(row.classroom_course_id);
      changed = true;
    }
  }

  const alreadyMapped = (classroomCourseId: string): boolean =>
    Boolean(
      db.prepare('SELECT 1 FROM courses WHERE classroom_course_id = ?').get(classroomCourseId)
    );

  const insertPending = db.prepare(
    'INSERT OR IGNORE INTO classroom_pending_courses (classroom_course_id, name, section, suggested_course_id) VALUES (?, ?, ?, ?)'
  );

  for (const course of courses) {
    if (!course.id || !course.name) continue;
    if (alreadyMapped(course.id)) continue;
    const suggestion = suggestExistingCourse(course.name);
    const result = insertPending.run(course.id, course.name, course.section ?? null, suggestion);
    if (result.changes > 0) changed = true;
  }
  return changed;
}

// Formats Classroom's structured { year, month, day } + optional
// { hours, minutes } due date/time into Atlas's existing deadlines.due_at
// convention ('YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM').
function formatDueAt(
  dueDate: classroom_v1.Schema$Date | undefined,
  dueTime: classroom_v1.Schema$TimeOfDay | undefined
): string | null {
  if (!dueDate?.year || !dueDate.month || !dueDate.day) return null;
  const date = `${dueDate.year}-${String(dueDate.month).padStart(2, '0')}-${String(dueDate.day).padStart(2, '0')}`;
  if (dueTime?.hours === undefined || dueTime.hours === null) return date;
  const hours = String(dueTime.hours).padStart(2, '0');
  const minutes = String(dueTime.minutes ?? 0).padStart(2, '0');
  return `${date}T${hours}:${minutes}`;
}

// A courseWork/courseWorkMaterial item's attachment materials as Drive
// links only — no download, so a link/YouTube/Forms material (which has no
// downloadable file at all) is just as representable as a Drive file one.
// Returns one { title, url } per material that actually has a link to show.
function extractMaterialLinks(
  materials: classroom_v1.Schema$Material[] | undefined
): { title: string; url: string }[] {
  const links: { title: string; url: string }[] = [];
  for (const material of materials ?? []) {
    const driveFile = material.driveFile?.driveFile;
    if (driveFile?.alternateLink && driveFile.title) {
      links.push({ title: driveFile.title, url: driveFile.alternateLink });
    } else if (material.link?.url) {
      links.push({ title: material.link.title || material.link.url, url: material.link.url });
    } else if (material.youtubeVideo?.alternateLink) {
      links.push({ title: material.youtubeVideo.title || 'YouTube video', url: material.youtubeVideo.alternateLink });
    } else if (material.form?.formUrl) {
      links.push({ title: material.form.title || 'Form', url: material.form.formUrl });
    }
  }
  return links;
}

// Pulls courseWork (assignments), announcements and courseWorkMaterials
// (the ungraded "Classwork" tab) for every already-mapped course, upserting
// by their Classroom external IDs. Unlike Drive's per-file review panel, new
// items within an already user-confirmed course import directly with no
// separate per-item gate — the ambiguity a review step exists to resolve
// (which course, which type) doesn't apply here since Classroom's API
// already returns typed, course-scoped data. Only which Atlas course a
// Classroom course maps to is gated (see scanClassroomCourses).
//
// Each mapped course is wrapped in its own try/catch: one course's API call
// throwing (expired token, transient error, etc.) must not abort every
// other mapped course's sync — this was the confirmed root cause of a real
// bug report ("none of the content from each class carried over") where a
// single unguarded loop meant one failure silently zeroed out the whole
// sync. Collected errors are returned so the caller can surface them
// instead of only console.error-ing them into invisibility.
export async function syncClassroomCourseworkForMappedCourses(): Promise<ClassroomSyncResult> {
  const client = getClassroomClient();
  if (!client) return { changed: false, errors: [] };

  const classroom = classroomApi();
  const db = getDb();
  const mappedCourses = db
    .prepare('SELECT id, classroom_course_id, name FROM courses WHERE classroom_course_id IS NOT NULL')
    .all() as { id: number; classroom_course_id: string; name: string }[];

  let changed = false;
  const errors: ClassroomSyncError[] = [];

  // The ON CONFLICT target here is a *partial* unique index (WHERE ... IS
  // NOT NULL, see database.ts's migrate() — a plain UNIQUE column
  // constraint can't be added to an already-existing table via ALTER TABLE,
  // so these use a partial index instead). SQLite requires a partial
  // index's WHERE predicate to be restated immediately after the conflict
  // column list (`ON CONFLICT(col) WHERE ... DO UPDATE`) — a trailing
  // `DO UPDATE SET ... WHERE ...` is a different clause (filters which
  // conflicting row gets updated) and does NOT satisfy that requirement.
  // Getting this wrong made db.prepare() itself throw
  // ("ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE
  // constraint") every single time — since these three prepare() calls run
  // unconditionally before the per-course try/catch loop even starts, that
  // exception was probably the *actual* root cause of every past report of
  // "nothing synced," not just the missing per-course guard.
  const upsertAssignment = db.prepare(`
    INSERT INTO assignments (course_id, title, description, due_at, source, classroom_coursework_id, updated_at)
    VALUES (?, ?, ?, ?, 'classroom', ?, ?)
    ON CONFLICT (classroom_coursework_id) WHERE classroom_coursework_id IS NOT NULL DO UPDATE SET
      title = excluded.title, description = excluded.description,
      due_at = excluded.due_at, updated_at = excluded.updated_at
  `);
  const upsertDeadline = db.prepare(`
    INSERT INTO deadlines (course_id, title, kind, due_at, source, classroom_coursework_id, stale_import)
    VALUES (?, ?, 'assignment', ?, 'classroom', ?, ?)
    ON CONFLICT (classroom_coursework_id) WHERE classroom_coursework_id IS NOT NULL DO UPDATE SET
      title = excluded.title, due_at = excluded.due_at
  `);
  // Today's date (YYYY-MM-DD), computed once per sync — due_at is either a
  // bare date or date+time in that same format, so a lexical compare against
  // this is enough to tell "already overdue as of this sync" without a full
  // date-parse. Only used to set stale_import on first insert (see schema.sql);
  // ON CONFLICT above deliberately never touches it, so a course re-synced
  // after this ships doesn't retroactively unflag rows imported before it.
  const todayStr = new Date().toISOString().slice(0, 10);
  const upsertAnnouncement = db.prepare(`
    INSERT INTO announcements (course_id, source, title, body, posted_at, classroom_announcement_id)
    VALUES (?, 'classroom', ?, ?, ?, ?)
    ON CONFLICT (classroom_announcement_id) WHERE classroom_announcement_id IS NOT NULL DO UPDATE SET
      title = excluded.title, body = excluded.body
  `);
  const upsertClasswork = db.prepare(`
    INSERT INTO classwork_materials (course_id, title, description, posted_at, classroom_coursework_material_id)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (classroom_coursework_material_id) DO UPDATE SET
      title = excluded.title, description = excluded.description
  `);
  const insertLinkResource = db.prepare(`
    INSERT OR IGNORE INTO resources (course_id, title, kind, source, file_path, original_filename, classroom_attachment_id, classwork_material_id)
    VALUES (?, ?, 'link', 'classroom', ?, ?, ?, ?)
  `);

  const saveLinkResources = (
    courseId: number,
    ownerId: string,
    links: { title: string; url: string }[],
    classworkMaterialRowId: number | null
  ): boolean => {
    let any = false;
    for (const link of links) {
      const attachmentKey = `${ownerId}:${link.url}`;
      const result = insertLinkResource.run(courseId, link.title, link.url, link.title, attachmentKey, classworkMaterialRowId);
      if (result.changes > 0) any = true;
    }
    return any;
  };

  for (const course of mappedCourses) {
    try {
      const courseWorkRes = await classroom.courses.courseWork.list({
        courseId: course.classroom_course_id,
        pageSize: 200,
      });
      for (const work of courseWorkRes.data.courseWork ?? []) {
        if (!work.id || !work.title) continue;
        const dueAt = formatDueAt(work.dueDate ?? undefined, work.dueTime ?? undefined);
        const insertResult = upsertAssignment.run(
          course.id,
          work.title,
          work.description ?? null,
          dueAt,
          work.id,
          work.updateTime ?? null
        );
        if (insertResult.changes > 0) changed = true;
        const deadlineResult = upsertDeadline.run(
          course.id,
          work.title,
          dueAt,
          work.id,
          dueAt && dueAt.slice(0, 10) < todayStr ? 1 : 0
        );
        if (deadlineResult.changes > 0) changed = true;

        if (saveLinkResources(course.id, work.id, extractMaterialLinks(work.materials), null)) changed = true;
      }

      const announcementsRes = await classroom.courses.announcements.list({
        courseId: course.classroom_course_id,
        pageSize: 200,
      });
      for (const announcement of announcementsRes.data.announcements ?? []) {
        if (!announcement.id) continue;
        const result = upsertAnnouncement.run(
          course.id,
          announcement.text?.slice(0, 80) || 'Announcement',
          announcement.text ?? null,
          announcement.creationTime ?? new Date().toISOString(),
          announcement.id
        );
        if (result.changes > 0) changed = true;

        if (saveLinkResources(course.id, announcement.id, extractMaterialLinks(announcement.materials), null)) {
          changed = true;
        }
      }

      const materialsRes = await classroom.courses.courseWorkMaterials.list({
        courseId: course.classroom_course_id,
        pageSize: 200,
      });
      for (const item of materialsRes.data.courseWorkMaterial ?? []) {
        if (!item.id || !item.title) continue;
        const result = upsertClasswork.run(
          course.id,
          item.title,
          item.description ?? null,
          item.creationTime ?? null,
          item.id
        );
        if (result.changes > 0) changed = true;

        const classworkRow = db
          .prepare('SELECT id FROM classwork_materials WHERE classroom_coursework_material_id = ?')
          .get(item.id) as { id: number } | undefined;
        if (classworkRow && saveLinkResources(course.id, item.id, extractMaterialLinks(item.materials), classworkRow.id)) {
          changed = true;
        }
      }
    } catch (err) {
      errors.push({
        courseId: course.id,
        courseName: course.name,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { changed, errors };
}

// Orchestrator called by main.ts on launch and from the "Sync now" button —
// no background polling interval (unlike Drive's 20s), see ARCHITECTURE.md
// §4b: Classroom content changes far less often than a Drive inbox, and this
// avoids unnecessary API load against the college account while
// docs/open-questions.md #2's general sync-frequency policy stays open.
export async function scanClassroom(): Promise<ClassroomSyncResult> {
  const coursesChanged = await scanClassroomCourses();
  const courseworkResult = await syncClassroomCourseworkForMappedCourses();
  return { changed: coursesChanged || courseworkResult.changed, errors: courseworkResult.errors };
}

export function listPendingClassroomCourses(): ClassroomPendingCourse[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM classroom_pending_courses WHERE ignored = 0 ORDER BY detected_at DESC')
    .all() as ClassroomPendingCourse[];
}

// Same soft-hide semantics as ignoreDrivePendingFile — the row stays so the
// UNIQUE constraint keeps a future scan from re-adding it as "new."
export function ignorePendingClassroomCourse(classroomCourseId: string): void {
  const db = getDb();
  db.prepare('UPDATE classroom_pending_courses SET ignored = 1 WHERE classroom_course_id = ?').run(
    classroomCourseId
  );
}

export function removePendingClassroomCourse(classroomCourseId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM classroom_pending_courses WHERE classroom_course_id = ?').run(classroomCourseId);
}

// Links a Classroom course to an Atlas course the user already has — the
// course itself is left exactly as-is (not renamed, source stays whatever it
// was), only classroom_course_id is set so future syncs know to pull its
// coursework/announcements into it.
export function linkClassroomCourseToExisting(classroomCourseId: string, atlasCourseId: number): void {
  const db = getDb();
  db.prepare('UPDATE courses SET classroom_course_id = ? WHERE id = ?').run(classroomCourseId, atlasCourseId);
  removePendingClassroomCourse(classroomCourseId);
}

export interface ClassroomLinkableCourse {
  classroom_course_id: string;
  name: string;
  section: string | null;
}

// Live Classroom courses not yet mapped to any Atlas course — backs the
// per-course "Connect to Classroom" picker (course detail page), which is a
// direct map-to-this-course action rather than going through the pending-
// courses review panel (that panel is for *discovering* new Classroom
// courses; this is for a course the user is already looking at).
export async function listAvailableClassroomCoursesForLinking(): Promise<ClassroomLinkableCourse[]> {
  const client = getClassroomClient();
  if (!client) return [];

  const classroom = classroomApi();
  const res = await classroom.courses.list({ courseStates: ['ACTIVE'], pageSize: 200 });
  const courses = res.data.courses ?? [];

  const db = getDb();
  const mappedIds = new Set(
    (db.prepare('SELECT classroom_course_id FROM courses WHERE classroom_course_id IS NOT NULL').all() as {
      classroom_course_id: string;
    }[]).map((r) => r.classroom_course_id)
  );

  return courses
    .filter((c): c is classroom_v1.Schema$Course & { id: string; name: string } =>
      Boolean(c.id && c.name && !mappedIds.has(c.id))
    )
    .map((c) => ({ classroom_course_id: c.id, name: c.name, section: c.section ?? null }));
}
