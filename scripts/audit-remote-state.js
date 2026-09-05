// Read-only audit of Atlas remote-resource extraction state.
// Run through Electron's Node ABI:
//   ATLAS_DATA_DIR=... node scripts/run-as-electron-node.js scripts/audit-remote-state.js
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = process.env.ATLAS_DATA_DIR || 'C:/Users/Pamac/Downloads/Atlas-Storage';
if (process.env.ATLAS_RUN_MIGRATION === '1') {
  const { getDb, closeDb } = require('../dist/main/db/database');
  process.env.ATLAS_DATA_DIR = dataDir;
  getDb();
  closeDb();
}
const db = new Database(path.join(dataDir, 'atlas.db'), { readonly: true, fileMustExist: true });

const counts = db
  .prepare("SELECT extraction_status AS status, COUNT(*) AS count FROM resources WHERE remote_source = 'drive' GROUP BY extraction_status ORDER BY status")
  .all();
const resourceColumns = db.prepare('PRAGMA table_info(resources)').all().map((column) => column.name);
const hasDetectedVersion = resourceColumns.includes('remote_detected_version');
const pending = db
  .prepare(
    "SELECT id, title, remote_ref, remote_fetched_version, " +
      (hasDetectedVersion ? 'remote_detected_version' : 'NULL AS remote_detected_version') +
      ", extraction_status FROM resources WHERE remote_source = 'drive' AND extraction_status = 'pending' ORDER BY id"
  )
  .all();
const failed = db
  .prepare(
    "SELECT id, title, remote_ref, extraction_error, remote_fetched_version, remote_detected_version " +
      "FROM resources WHERE remote_source = 'drive' AND extraction_status = 'failed' ORDER BY id"
  )
  .all();
const terminalMissingFetched = db
  .prepare(
    "SELECT extraction_status AS status, COUNT(*) AS count FROM resources " +
      "WHERE remote_source = 'drive' AND extraction_status IN ('done', 'empty', 'unsupported', 'failed') " +
      "AND remote_fetched_version IS NULL GROUP BY extraction_status ORDER BY status"
  )
  .all();

console.log(JSON.stringify({ dataDir, hasDetectedVersion, counts, pending, failed, terminalMissingFetched }, null, 2));
db.close();
