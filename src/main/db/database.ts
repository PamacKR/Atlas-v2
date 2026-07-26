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

  const drivePendingColumns = (
    db.prepare('PRAGMA table_info(drive_pending_files)').all() as { name: string }[]
  ).map((c) => c.name);
  if (!drivePendingColumns.includes('ignored')) {
    db.exec('ALTER TABLE drive_pending_files ADD COLUMN ignored INTEGER NOT NULL DEFAULT 0');
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
