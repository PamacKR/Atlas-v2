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
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
