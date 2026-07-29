// Verifies remote-attachment reading (remoteSync.ts/remoteFetch.ts,
// remote-attachments-spec.md) — local-copy-first resolution, link-following
// with its caps, and the failure-state rules, all without any live Google
// API access. Google's API calls are stubbed at the fetcher interface
// (fetchRemoteDriveFile) per §9 — the boundary the spec itself specifies —
// rather than mocking googleapis internals directly.
//
// Runs under Electron's Node (better-sqlite3's native binding requirement,
// same as verify-mcp.js/verify-extraction.js) via run-as-electron-node.js.
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

let failures = 0;
function assert(condition, message) {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`ok: ${message}`);
  }
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-verify-remote-'));
process.env.ATLAS_DATA_DIR = dataDir;

function seed() {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'atlas.db');
  const db = new Database(dbPath);
  db.exec(fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'db', 'schema.sql'), 'utf-8'));

  db.prepare("INSERT INTO courses (name, folder_name) VALUES ('ECO 2202', 'ECO 2202')").run();
  const courseId = db.prepare("SELECT id FROM courses WHERE name = 'ECO 2202'").get().id;

  // A YouTube material — never fetchable, must never be touched by remote
  // extraction at all (remote_source stays NULL for it, see
  // googleClassroom.ts's saveLinkResources).
  const ytId = db
    .prepare(
      "INSERT INTO resources (course_id, title, kind, source, file_path, link_kind, extraction_status, classroom_attachment_id) " +
        "VALUES (?, 'Lecture recap', 'link', 'classroom', 'https://youtube.com/x', 'youTubeVideo', 'pending', 'yt1')"
    )
    .run(courseId).lastInsertRowid;

  // A real local resource already imported (e.g. via the Drive inbox) that
  // happens to be the exact same Drive file a Classroom attachment points
  // at — the local-copy-first case (§3.3).
  const twinId = db
    .prepare(
      "INSERT INTO resources (course_id, title, kind, source, file_path, drive_file_id, extraction_status) " +
        "VALUES (?, 'Syllabus (local copy)', 'pdf', 'drive', '/fake/syllabus.pdf', 'FILE_TWIN', 'done')"
    )
    .run(courseId).lastInsertRowid;
  db.prepare(
    "INSERT INTO document_parts (resource_id, ordinal, label, text, origin) VALUES (?, 1, 'Page 1', 'syllabus text already local', 'extracted')"
  ).run(twinId);

  const twinLinkId = db
    .prepare(
      "INSERT INTO resources (course_id, title, kind, source, file_path, remote_source, remote_ref, link_kind, extraction_status, classroom_attachment_id) " +
        "VALUES (?, 'Syllabus', 'link', 'classroom', 'https://drive.google.com/file/d/FILE_TWIN/view', 'drive', 'FILE_TWIN', 'driveFile', 'pending', 'a-twin')"
    )
    .run(courseId).lastInsertRowid;

  const restrictedId = db
    .prepare(
      "INSERT INTO resources (course_id, title, kind, source, file_path, remote_source, remote_ref, link_kind, extraction_status, classroom_attachment_id) " +
        "VALUES (?, 'Restricted reading', 'link', 'classroom', 'https://drive.google.com/file/d/FILE_RESTRICTED/view', 'drive', 'FILE_RESTRICTED', 'driveFile', 'pending', 'a-restricted')"
    )
    .run(courseId).lastInsertRowid;

  // The real evidence case (§2.1): a course-index sheet whose extracted
  // text contains a link to another Drive file — must spawn a child
  // resource, not just sit there as an unfollowed URL.
  const indexId = db
    .prepare(
      "INSERT INTO resources (course_id, title, kind, source, file_path, remote_source, remote_ref, link_kind, extraction_status, classroom_attachment_id) " +
        "VALUES (?, 'Daily Plan', 'link', 'classroom', 'https://docs.google.com/spreadsheets/d/FILE_LINKS/edit', 'drive', 'FILE_LINKS', 'driveFile', 'pending', 'a-index')"
    )
    .run(courseId).lastInsertRowid;

  // Simulates a resource whose text was already fetched in a prior sync
  // (remote_fetched_version stored) but got reset to 'pending' since —
  // exercises the §6 unchanged-file-skip path.
  const cachedId = db
    .prepare(
      "INSERT INTO resources (course_id, title, kind, source, file_path, remote_source, remote_ref, link_kind, extraction_status, classroom_attachment_id, remote_fetched_version) " +
        "VALUES (?, 'Old handout', 'link', 'classroom', 'https://drive.google.com/file/d/FILE_CACHED/view', 'drive', 'FILE_CACHED', 'driveFile', 'pending', 'a-cached', 'V1')"
    )
    .run(courseId).lastInsertRowid;
  db.prepare(
    "INSERT INTO document_parts (resource_id, ordinal, label, text, origin) VALUES (?, 99, 'Sentinel', 'sentinel row — must survive an unchanged re-fetch', 'extracted')"
  ).run(cachedId);

  db.close();
  return { courseId, ytId, twinId, twinLinkId, restrictedId, indexId, cachedId };
}

async function main() {
  const ids = seed();

  // --- Structural guarantee (§9 item 3): remoteFetch.ts must never even
  // reference the local managed-files directory — it only ever writes to
  // os.tmpdir(), and only ever for the duration of one extraction call.
  // Checked at the source level since the actual Google API calls are
  // stubbed for every other check below, which would make a purely dynamic
  // "no file appeared" check vacuous.
  const remoteFetchSource = fs.readFileSync(path.join(__dirname, '..', 'dist', 'main', 'remoteFetch.js'), 'utf-8');
  assert(!/getFilesDir/.test(remoteFetchSource), 'remoteFetch.ts never references the local managed-files directory');
  assert(/tmpdir/.test(remoteFetchSource), 'remoteFetch.ts writes only to the OS temp directory');

  const remoteFetch = require('../dist/main/remoteFetch');
  const fetchCalls = {};
  const stubs = {
    FILE_RESTRICTED: {
      status: 'failed',
      parts: [],
      discoveredLinks: [],
      error: "restricted by the file's owner",
    },
    FILE_LINKS: {
      status: 'done',
      parts: [{ ordinal: 1, label: 'Sheet: Daily Plan', text: 'Week 1 (https://docs.google.com/document/d/CHILD1/edit)' }],
      discoveredLinks: [{ url: 'https://docs.google.com/document/d/CHILD1/edit', label: 'Week 1', partOrdinal: 1 }],
      mimeType: 'application/vnd.google-apps.spreadsheet', // exercises the Google-native export branch's result shape
      fetchedVersion: 'v1',
    },
    CHILD1: {
      status: 'done',
      parts: [{ ordinal: 1, label: 'Part 1', text: 'practice questions text' }],
      discoveredLinks: [],
      mimeType: 'application/vnd.google-apps.document',
      fetchedVersion: 'v2',
    },
    FILE_CACHED: {
      status: 'done',
      parts: [{ ordinal: 1, label: 'Page 1', text: 'handout content' }],
      discoveredLinks: [],
      mimeType: 'application/pdf',
      fetchedVersion: 'V1', // matches the already-stored remote_fetched_version — "unchanged"
    },
  };
  remoteFetch.fetchRemoteDriveFile = async (fileId) => {
    fetchCalls[fileId] = (fetchCalls[fileId] || 0) + 1;
    if (fileId === 'FILE_TWIN') {
      throw new Error('fetchRemoteDriveFile must never be called for a file with an existing local copy');
    }
    return stubs[fileId] ?? { status: 'unsupported', parts: [], discoveredLinks: [] };
  };

  const { processPendingRemoteResources } = require('../dist/main/remoteSync');
  const { changed, capped } = await processPendingRemoteResources();
  assert(changed === true, 'processPendingRemoteResources reports it made changes');
  assert(capped === false, 'no cap was hit with this small fixture set');

  const db = new Database(path.join(dataDir, 'atlas.db'));
  const statusOf = (id) => db.prepare('SELECT extraction_status, extraction_error, local_twin_id FROM resources WHERE id = ?').get(id);
  const partsOf = (id) => db.prepare('SELECT ordinal, label, text FROM document_parts WHERE resource_id = ? ORDER BY ordinal').all(id);

  // --- YouTube material: never touched at all ---
  const yt = statusOf(ids.ytId);
  assert(yt.extraction_status === 'pending', "a YouTube material's status is untouched by remote extraction (main.ts's own local backfill marks it unsupported instead)");

  // --- Local-copy-first (§3.3): zero network calls, twin's text reused ---
  assert(fetchCalls['FILE_TWIN'] === undefined, 'a Drive file with an existing local copy performs zero network calls');
  const twinLink = statusOf(ids.twinLinkId);
  assert(twinLink.extraction_status === 'done' && twinLink.local_twin_id === ids.twinId, 'the local twin is found and recorded');
  assert(
    partsOf(ids.twinLinkId).some((p) => p.text.includes('syllabus text already local')),
    "the local twin's already-extracted text is reused verbatim"
  );

  // --- Permission failure surfaces the real reason (§7) ---
  const restricted = statusOf(ids.restrictedId);
  assert(
    restricted.extraction_status === 'failed' && restricted.extraction_error === "restricted by the file's owner",
    'a permission failure surfaces the real reason rather than being swallowed'
  );

  // --- Link-following (§5.5): a child resource is created and itself fetched ---
  const index = statusOf(ids.indexId);
  assert(index.extraction_status === 'done', 'the index sheet itself extracts successfully');
  const child = db
    .prepare("SELECT id, extraction_status FROM resources WHERE remote_ref = 'CHILD1'")
    .get();
  assert(!!child, 'a Drive link discovered inside the index sheet spawns a child resource');
  if (child) {
    const childRow = db.prepare('SELECT parent_resource_id, discovery_depth FROM resources WHERE id = ?').get(child.id);
    assert(childRow.parent_resource_id === ids.indexId, "the child resource's parent is recorded");
    assert(childRow.discovery_depth === 1, 'the child resource is recorded at discovery depth 1');
    assert(child.extraction_status === 'done', 'the discovered child is itself fetched and extracted within the same sync');
    assert(fetchCalls['CHILD1'] === 1, 'the child was fetched exactly once');
  }

  // --- Unchanged file on re-sync is skipped (§6) ---
  const cachedBefore = partsOf(ids.cachedId);
  assert(cachedBefore.some((p) => p.label === 'Sentinel'), 'sanity: the sentinel row exists before the run');
  db.prepare("UPDATE resources SET extraction_status = 'pending' WHERE id = ?").run(ids.cachedId); // simulate a later pass
  await processPendingRemoteResources();
  const cachedAfter = partsOf(ids.cachedId);
  assert(
    cachedAfter.some((p) => p.label === 'Sentinel'),
    'an unchanged remote file is skipped on re-sync — its document_parts are left untouched, not rewritten'
  );

  db.close();
  // database.ts's getDb() (used internally by remoteSync.ts) caches its own
  // module-level connection, separate from the one this script opened above
  // — must be closed too, or its WAL lock leaves the temp dir un-removable
  // on Windows.
  require('../dist/main/db/database').closeDb();
  fs.rmSync(dataDir, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`\n${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log('\nPASS');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
