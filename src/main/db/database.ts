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

  const deadlineColumns = (
    db.prepare('PRAGMA table_info(deadlines)').all() as { name: string }[]
  ).map((c) => c.name);
  if (!deadlineColumns.includes('description')) {
    db.exec('ALTER TABLE deadlines ADD COLUMN description TEXT');
  }
  if (!deadlineColumns.includes('classroom_coursework_id')) {
    db.exec('ALTER TABLE deadlines ADD COLUMN classroom_coursework_id TEXT');
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
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
