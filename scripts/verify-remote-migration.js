// Regression test for the remote-version migration. It creates a pre-fix
// schema in a temporary directory, runs the real database migration, and
// verifies that legacy pending rows move their old marker to detected-version
// while clearing the false fetched-version marker.
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-verify-remote-migration-'));
process.env.ATLAS_DATA_DIR = dataDir;
const schemaPath = path.join(__dirname, '..', 'src', 'main', 'db', 'schema.sql');
const currentSchema = fs.readFileSync(schemaPath, 'utf8');
const oldSchema = currentSchema.replace(
  /\n  -- The latest Drive version observed during import\/metadata refresh\.[\s\S]*?\n  remote_detected_version TEXT,\n/,
  '\n'
);

const fixtureDb = new Database(path.join(dataDir, 'atlas.db'));
fixtureDb.exec(oldSchema);
fixtureDb.prepare("INSERT INTO courses (name, folder_name) VALUES ('Migration fixture', 'migration-fixture')").run();
const courseId = fixtureDb.prepare('SELECT id FROM courses').get().id;
fixtureDb
  .prepare(
    "INSERT INTO resources (course_id, title, kind, source, file_path, remote_source, remote_ref, extraction_status, remote_fetched_version) " +
      "VALUES (?, 'Legacy pending PDF', 'link', 'classroom', 'https://drive.google.com/file/d/fixture/view', 'drive', 'fixture', 'pending', 'VERSION-1')"
  )
  .run(courseId);
fixtureDb
  .prepare(
    "INSERT INTO resources (course_id, title, kind, source, file_path, remote_source, remote_ref, extraction_status, remote_fetched_version) " +
      "VALUES (?, 'Completed PDF', 'link', 'classroom', 'https://drive.google.com/file/d/completed/view', 'drive', 'completed', 'done', 'VERSION-2')"
  )
  .run(courseId);
fixtureDb.close();

const { getDb, closeDb } = require('../dist/main/db/database');
const db = getDb();
const columns = db.prepare('PRAGMA table_info(resources)').all().map((column) => column.name);
if (!columns.includes('remote_detected_version')) throw new Error('remote_detected_version was not added');

const pending = db.prepare("SELECT remote_fetched_version, remote_detected_version FROM resources WHERE remote_ref = 'fixture'").get();
if (pending.remote_fetched_version !== null || pending.remote_detected_version !== 'VERSION-1') {
  throw new Error(`legacy pending row was not repaired correctly: ${JSON.stringify(pending)}`);
}

const completed = db.prepare("SELECT remote_fetched_version, remote_detected_version FROM resources WHERE remote_ref = 'completed'").get();
if (completed.remote_fetched_version !== 'VERSION-2' || completed.remote_detected_version !== 'VERSION-2') {
  throw new Error(`completed row was changed incorrectly: ${JSON.stringify(completed)}`);
}

console.log('PASS remote migration fixture');
closeDb();
fs.rmSync(dataDir, { recursive: true, force: true });
