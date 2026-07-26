import { google, classroom_v1 } from 'googleapis';
import { getDb } from './db/database';
import { getClassroomClient, getDriveClient } from './googleAuth';

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

// Pulls courseWork (assignments) and announcements for every already-mapped
// course, upserting by their Classroom external IDs. Unlike Drive's
// per-file review panel, new assignments/announcements within an already
// user-confirmed course import directly with no separate per-item gate —
// the ambiguity a review step exists to resolve (which course, which type)
// doesn't apply here since Classroom's API already returns typed,
// course-scoped data. Only which Atlas course a Classroom course maps to is
// gated (see scanClassroomCourses). Returns whether anything changed.
export async function syncClassroomCourseworkForMappedCourses(): Promise<boolean> {
  const client = getClassroomClient();
  if (!client) return false;

  const classroom = classroomApi();
  const db = getDb();
  const mappedCourses = db
    .prepare('SELECT id, classroom_course_id FROM courses WHERE classroom_course_id IS NOT NULL')
    .all() as { id: number; classroom_course_id: string }[];

  let changed = false;

  const upsertAssignment = db.prepare(`
    INSERT INTO assignments (course_id, title, description, due_at, source, classroom_coursework_id, updated_at)
    VALUES (?, ?, ?, ?, 'classroom', ?, ?)
    ON CONFLICT (classroom_coursework_id) DO UPDATE SET
      title = excluded.title, description = excluded.description,
      due_at = excluded.due_at, updated_at = excluded.updated_at
    WHERE classroom_coursework_id IS NOT NULL
  `);
  const upsertDeadline = db.prepare(`
    INSERT INTO deadlines (course_id, title, kind, due_at, source, classroom_coursework_id)
    VALUES (?, ?, 'assignment', ?, 'classroom', ?)
    ON CONFLICT (classroom_coursework_id) DO UPDATE SET
      title = excluded.title, due_at = excluded.due_at
    WHERE classroom_coursework_id IS NOT NULL
  `);
  const upsertAnnouncement = db.prepare(`
    INSERT INTO announcements (course_id, source, title, body, posted_at, classroom_announcement_id)
    VALUES (?, 'classroom', ?, ?, ?, ?)
    ON CONFLICT (classroom_announcement_id) DO UPDATE SET
      title = excluded.title, body = excluded.body
    WHERE classroom_announcement_id IS NOT NULL
  `);
  const upsertAttachment = db.prepare(`
    INSERT OR IGNORE INTO resources (course_id, title, kind, source, file_path, original_filename, classroom_attachment_id)
    VALUES (?, ?, ?, 'classroom', ?, ?, ?)
  `);

  for (const course of mappedCourses) {
    const courseWorkRes = await classroom.courses.courseWork.list({ courseId: course.classroom_course_id, pageSize: 200 });
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
      const deadlineResult = upsertDeadline.run(course.id, work.title, dueAt, work.id);
      if (deadlineResult.changes > 0) changed = true;

      // Attachments: only Drive-file materials are imported, and only when
      // Drive is connected and can actually fetch content — a courseWork
      // item's link/YouTube/Forms materials have nothing downloadable to
      // store as a `resources` row (file_path is required), so they're
      // skipped this phase rather than half-imported (see docs/open-questions.md).
      for (const material of work.materials ?? []) {
        const driveFile = material.driveFile?.driveFile;
        if (!driveFile?.id || !driveFile.title) continue;
        const attachmentKey = `${work.id}:${driveFile.id}`;
        const alreadyImported = db
          .prepare('SELECT 1 FROM resources WHERE classroom_attachment_id = ?')
          .get(attachmentKey);
        if (alreadyImported) continue;
        const driveClient = getDriveClient();
        if (!driveClient) continue; // retried on a future sync once Drive is connected
        try {
          const drive = google.drive({ version: 'v3', auth: driveClient });
          const contentRes = await drive.files.get(
            { fileId: driveFile.id, alt: 'media' },
            { responseType: 'arraybuffer' }
          );
          const buffer = Buffer.from(contentRes.data as ArrayBuffer);
          const filePath = await saveClassroomAttachment(course.id, driveFile.title, buffer);
          const attachResult = upsertAttachment.run(
            course.id,
            driveFile.title,
            resourceKindFromFilename(driveFile.title),
            filePath,
            driveFile.title,
            attachmentKey
          );
          if (attachResult.changes > 0) changed = true;
        } catch (err) {
          console.error(`Failed to import Classroom attachment "${driveFile.title}":`, err);
        }
      }
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
    }
  }

  return changed;
}

// Set by main.ts at startup — copies a downloaded attachment buffer into the
// mapped course's managed storage folder and returns the path, reusing the
// same on-disk layout as manual uploads. Injected rather than imported
// directly to avoid a circular dependency with main.ts's file-path helpers.
let saveAttachmentFn: ((courseId: number, filename: string, buffer: Buffer) => Promise<string>) | null = null;
export function registerAttachmentSaver(fn: (courseId: number, filename: string, buffer: Buffer) => Promise<string>): void {
  saveAttachmentFn = fn;
}
async function saveClassroomAttachment(courseId: number, filename: string, buffer: Buffer): Promise<string> {
  if (!saveAttachmentFn) throw new Error('Classroom attachment saver not registered');
  return saveAttachmentFn(courseId, filename, buffer);
}

function resourceKindFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'pptx' || ext === 'ppt') return 'pptx';
  if (ext === 'docx' || ext === 'doc') return 'docx';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image';
  if (ext === 'md') return 'markdown';
  if (ext === 'txt') return 'text';
  return 'other';
}

// Orchestrator called by main.ts on launch and from the "Sync now" button —
// no background polling interval (unlike Drive's 20s), see ARCHITECTURE.md
// §4b: Classroom content changes far less often than a Drive inbox, and this
// avoids unnecessary API load against the college account while
// docs/open-questions.md #2's general sync-frequency policy stays open.
export async function scanClassroom(): Promise<boolean> {
  const coursesChanged = await scanClassroomCourses();
  const courseworkChanged = await syncClassroomCourseworkForMappedCourses();
  return coursesChanged || courseworkChanged;
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
