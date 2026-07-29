import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { getDbPath, getDataDir, getFilesDir } from '../paths';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(getFilesDir(), { recursive: true });

  db = new Database(getDbPath());
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);
  migrate(db);

  return db;
}

// CREATE TABLE IF NOT EXISTS in schema.sql only handles brand-new databases;
// it can't add columns to a table that already exists from an earlier
// version of the schema. This runs any such catch-up column additions.
function migrate(db: Database.Database): void {
  const courseColumns = (db.prepare('PRAGMA table_info(courses)').all() as { name: string }[]).map(
    (c) => c.name
  );
  if (!courseColumns.includes('folder_name')) {
    db.exec("ALTER TABLE courses ADD COLUMN folder_name TEXT NOT NULL DEFAULT ''");
  }
  if (!courseColumns.includes('source')) {
    db.exec("ALTER TABLE courses ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'");
  }
  if (!courseColumns.includes('classroom_course_id')) {
    db.exec('ALTER TABLE courses ADD COLUMN classroom_course_id TEXT');
  }
  if (!courseColumns.includes('description')) {
    db.exec('ALTER TABLE courses ADD COLUMN description TEXT');
  }
  // The Drive folder ID for this course's own subfolder inside Atlas's
  // "Atlas Previews" folder (open-questions.md #12, ARCHITECTURE.md §7) —
  // keeps uploaded Office-file preview copies organized by course instead
  // of dumped flat into one folder, where several courses' files sharing
  // the same original filename (e.g. every course's own "lecture-slides.pptx")
  // would otherwise be indistinguishable from each other. NULL until the
  // first Drive preview upload for that course.
  if (!courseColumns.includes('drive_preview_folder_id')) {
    db.exec('ALTER TABLE courses ADD COLUMN drive_preview_folder_id TEXT');
  }

  const resourceColumns = (
    db.prepare('PRAGMA table_info(resources)').all() as { name: string }[]
  ).map((c) => c.name);
  if (!resourceColumns.includes('zoom_level')) {
    db.exec('ALTER TABLE resources ADD COLUMN zoom_level REAL');
  }
  if (!resourceColumns.includes('watch_source_path')) {
    db.exec('ALTER TABLE resources ADD COLUMN watch_source_path TEXT');
  }
  if (!resourceColumns.includes('ocr_text')) {
    db.exec('ALTER TABLE resources ADD COLUMN ocr_text TEXT');
  }
  if (!resourceColumns.includes('drive_file_id')) {
    db.exec('ALTER TABLE resources ADD COLUMN drive_file_id TEXT');
  }
  if (!resourceColumns.includes('classroom_attachment_id')) {
    db.exec('ALTER TABLE resources ADD COLUMN classroom_attachment_id TEXT');
  }
  if (!resourceColumns.includes('classwork_material_id')) {
    db.exec('ALTER TABLE resources ADD COLUMN classwork_material_id INTEGER REFERENCES classwork_materials(id) ON DELETE CASCADE');
  }
  // Tracks this resource's uploaded copy in Atlas's dedicated Drive preview
  // folder (open-questions.md #12, ARCHITECTURE.md §7) — distinct from
  // drive_file_id above, which means "this resource was *imported from* a
  // Drive file" (the inbox-scan feature, §4a). This is the opposite
  // direction: a local file Atlas uploaded *to* Drive so it can be viewed
  // there with real layout fidelity. drive_preview_synced_size/mtime_ms are
  // the local file's stat() values as of the last successful upload — a
  // mismatch on either means the file changed since, so the cached Drive
  // copy is stale and needs re-uploading rather than reused.
  if (!resourceColumns.includes('drive_preview_file_id')) {
    db.exec('ALTER TABLE resources ADD COLUMN drive_preview_file_id TEXT');
  }
  if (!resourceColumns.includes('drive_preview_synced_size')) {
    db.exec('ALTER TABLE resources ADD COLUMN drive_preview_synced_size INTEGER');
  }
  if (!resourceColumns.includes('drive_preview_synced_mtime_ms')) {
    db.exec('ALTER TABLE resources ADD COLUMN drive_preview_synced_mtime_ms INTEGER');
  }
  // Page-aware text extraction (phase4-spec.md §3). Existing resources
  // predate this column and would otherwise default to 'pending' forever —
  // extractAllPendingResources() in main.ts is what actually processes them,
  // gated by its own app_settings flag so it only runs its one-time backfill
  // pass once.
  if (!resourceColumns.includes('extraction_status')) {
    db.exec("ALTER TABLE resources ADD COLUMN extraction_status TEXT NOT NULL DEFAULT 'pending'");
  }
  if (!resourceColumns.includes('extraction_error')) {
    db.exec('ALTER TABLE resources ADD COLUMN extraction_error TEXT');
  }
  if (!resourceColumns.includes('extracted_at')) {
    db.exec('ALTER TABLE resources ADD COLUMN extracted_at TEXT');
  }
  // Remote-attachment reading (remote-attachments-spec.md §4) — see
  // schema.sql for the full field-by-field reasoning.
  if (!resourceColumns.includes('remote_source')) {
    db.exec('ALTER TABLE resources ADD COLUMN remote_source TEXT');
  }
  if (!resourceColumns.includes('remote_ref')) {
    db.exec('ALTER TABLE resources ADD COLUMN remote_ref TEXT');
  }
  if (!resourceColumns.includes('remote_mime_type')) {
    db.exec('ALTER TABLE resources ADD COLUMN remote_mime_type TEXT');
  }
  if (!resourceColumns.includes('remote_fetched_version')) {
    db.exec('ALTER TABLE resources ADD COLUMN remote_fetched_version TEXT');
  }
  if (!resourceColumns.includes('link_kind')) {
    db.exec('ALTER TABLE resources ADD COLUMN link_kind TEXT');
  }
  if (!resourceColumns.includes('local_twin_id')) {
    db.exec('ALTER TABLE resources ADD COLUMN local_twin_id INTEGER REFERENCES resources(id) ON DELETE SET NULL');
  }
  if (!resourceColumns.includes('parent_resource_id')) {
    db.exec('ALTER TABLE resources ADD COLUMN parent_resource_id INTEGER REFERENCES resources(id) ON DELETE CASCADE');
  }
  if (!resourceColumns.includes('discovery_depth')) {
    db.exec('ALTER TABLE resources ADD COLUMN discovery_depth INTEGER NOT NULL DEFAULT 0');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS document_parts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL,
      label TEXT NOT NULL,
      text TEXT NOT NULL,
      origin TEXT NOT NULL DEFAULT 'extracted',
      UNIQUE(resource_id, ordinal, origin)
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_document_parts_resource ON document_parts(resource_id)');

  const noteColumns = (db.prepare('PRAGMA table_info(notes)').all() as { name: string }[]).map(
    (c) => c.name
  );
  if (!noteColumns.includes('title_is_manual')) {
    db.exec('ALTER TABLE notes ADD COLUMN title_is_manual INTEGER NOT NULL DEFAULT 0');
  }
  if (!noteColumns.includes('exported_path')) {
    db.exec('ALTER TABLE notes ADD COLUMN exported_path TEXT');
  }
  if (!noteColumns.includes('drive_file_id')) {
    db.exec('ALTER TABLE notes ADD COLUMN drive_file_id TEXT');
  }
  if (!noteColumns.includes('generated_by_agent')) {
    db.exec('ALTER TABLE notes ADD COLUMN generated_by_agent INTEGER NOT NULL DEFAULT 0');
  }

  const deadlineColumns = (
    db.prepare('PRAGMA table_info(deadlines)').all() as { name: string }[]
  ).map((c) => c.name);
  if (!deadlineColumns.includes('description')) {
    db.exec('ALTER TABLE deadlines ADD COLUMN description TEXT');
  }
  if (!deadlineColumns.includes('classroom_coursework_id')) {
    db.exec('ALTER TABLE deadlines ADD COLUMN classroom_coursework_id TEXT');
  }
  if (!deadlineColumns.includes('stale_import')) {
    db.exec('ALTER TABLE deadlines ADD COLUMN stale_import INTEGER NOT NULL DEFAULT 0');
    // Backfill: any deadline already overdue at the moment this column is
    // introduced was necessarily synced/entered before stale_import existed
    // to flag it (e.g. an old Classroom import) — treat it the same as a
    // freshly-inserted stale row so it stops flooding the Upcoming widget.
    db.exec("UPDATE deadlines SET stale_import = 1 WHERE due_at IS NOT NULL AND due_at < datetime('now')");
  }
  // Conflict handling for Classroom-synced deadlines (open-questions.md #3)
  // — see schema.sql for the full field-by-field reasoning.
  if (!deadlineColumns.includes('local_overrides')) {
    db.exec('ALTER TABLE deadlines ADD COLUMN local_overrides TEXT');
  }
  if (!deadlineColumns.includes('classroom_title')) {
    db.exec('ALTER TABLE deadlines ADD COLUMN classroom_title TEXT');
  }
  if (!deadlineColumns.includes('classroom_due_at')) {
    db.exec('ALTER TABLE deadlines ADD COLUMN classroom_due_at TEXT');
  }
  if (!deadlineColumns.includes('classroom_removed')) {
    db.exec('ALTER TABLE deadlines ADD COLUMN classroom_removed INTEGER NOT NULL DEFAULT 0');
    // Backfill: an existing Classroom-sourced deadline's classroom_title/
    // classroom_due_at have never been populated before this column existed
    // — seed them from the deadline's own current title/due_at (the last
    // value Classroom set, since nothing local could have overridden a
    // field this migration didn't track yet) so "Reset to Classroom
    // version" and the shadow-value display aren't blank on first upgrade.
    db.exec(
      "UPDATE deadlines SET classroom_title = title, classroom_due_at = due_at WHERE classroom_coursework_id IS NOT NULL"
    );
  }

  const drivePendingColumns = (
    db.prepare('PRAGMA table_info(drive_pending_files)').all() as { name: string }[]
  ).map((c) => c.name);
  if (!drivePendingColumns.includes('ignored')) {
    db.exec('ALTER TABLE drive_pending_files ADD COLUMN ignored INTEGER NOT NULL DEFAULT 0');
  }

  const announcementColumns = (
    db.prepare('PRAGMA table_info(announcements)').all() as { name: string }[]
  ).map((c) => c.name);
  if (!announcementColumns.includes('classroom_announcement_id')) {
    db.exec('ALTER TABLE announcements ADD COLUMN classroom_announcement_id TEXT');
  }

  const assignmentColumns = (
    db.prepare('PRAGMA table_info(assignments)').all() as { name: string }[]
  ).map((c) => c.name);
  if (!assignmentColumns.includes('classroom_coursework_id')) {
    db.exec('ALTER TABLE assignments ADD COLUMN classroom_coursework_id TEXT');
  }
  if (!assignmentColumns.includes('updated_at')) {
    db.exec('ALTER TABLE assignments ADD COLUMN updated_at TEXT');
  }
  if (!assignmentColumns.includes('posted_at')) {
    // Classroom's own creationTime for the courseWork item — mirrors
    // announcements.posted_at/classwork_materials.posted_at, which already
    // existed. Needed so a synced assignment's attachment resources can be
    // given their real "added" date instead of defaulting to sync time (see
    // googleClassroom.ts) — assignments previously had no equivalent field
    // to source that from at all.
    db.exec('ALTER TABLE assignments ADD COLUMN posted_at TEXT');
  }
  if (!assignmentColumns.includes('classroom_removed')) {
    db.exec('ALTER TABLE assignments ADD COLUMN classroom_removed INTEGER NOT NULL DEFAULT 0');
  }

  // Partial unique indexes (rather than a UNIQUE column constraint, which
  // SQLite's ALTER TABLE ADD COLUMN can't add to an existing table) — give
  // `INSERT ... ON CONFLICT(classroom_x_id) DO UPDATE` a real conflict target
  // for re-syncing already-imported Classroom coursework/announcements,
  // while leaving manually-created rows (classroom_x_id IS NULL) unaffected.
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_classroom_course_id ON courses(classroom_course_id) WHERE classroom_course_id IS NOT NULL'
  );
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_classroom_coursework_id ON assignments(classroom_coursework_id) WHERE classroom_coursework_id IS NOT NULL'
  );
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_deadlines_classroom_coursework_id ON deadlines(classroom_coursework_id) WHERE classroom_coursework_id IS NOT NULL'
  );
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_announcements_classroom_announcement_id ON announcements(classroom_announcement_id) WHERE classroom_announcement_id IS NOT NULL'
  );

  // resources never got the same partial-unique-index treatment as the
  // four tables above, even though its insertLinkResource/importBuffer... an
  // upsert-by-external-id path (classroom_attachment_id, drive_file_id) that
  // assumes one. INSERT OR IGNORE only actually de-duplicates once a real
  // constraint exists to conflict against — without it, a re-sync/re-scan
  // can silently create duplicate rows for the same external file. A stale
  // reconciliation bug (see reconcileCourseStorage) masked this in practice
  // by deleting and re-inserting every Classroom-linked resource on every
  // launch, so duplicates never had a chance to build up — now that that
  // bug is fixed, this index is what actually prevents them going forward.
  // Any duplicates already sitting in an existing database (extremely
  // unlikely given the above, but not impossible) are collapsed down to the
  // earliest row per key first, since CREATE UNIQUE INDEX fails outright if
  // duplicate values are already present.
  db.exec(`
    DELETE FROM resources WHERE id NOT IN (
      SELECT MIN(id) FROM resources WHERE classroom_attachment_id IS NOT NULL GROUP BY classroom_attachment_id
    ) AND classroom_attachment_id IS NOT NULL
  `);
  db.exec(`
    DELETE FROM resources WHERE id NOT IN (
      SELECT MIN(id) FROM resources WHERE drive_file_id IS NOT NULL GROUP BY drive_file_id
    ) AND drive_file_id IS NOT NULL
  `);
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_resources_classroom_attachment_id ON resources(classroom_attachment_id) WHERE classroom_attachment_id IS NOT NULL'
  );
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_resources_drive_file_id ON resources(drive_file_id) WHERE drive_file_id IS NOT NULL'
  );
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
