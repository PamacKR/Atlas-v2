// Verifies the standalone MCP server (src/main/mcpServer.ts, phase4-spec.md
// §6) end-to-end over the real MCP protocol — scripts/verify-app.js drives
// the Atlas *window* with Playwright and has no way to reach a separate
// background process, so this is its own script rather than folded in.
//
// Seeds a fresh temp Atlas-Storage (same ATLAS_DATA_DIR override
// verify-app.js uses) with real schema + test data, spawns the MCP server
// against it via the MCP SDK's own client/stdio transport, and calls every
// one of the 9 tools, asserting real responses rather than just "it didn't
// crash."
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const electronPath = require('electron');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

let failures = 0;
function assert(condition, message) {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`ok: ${message}`);
  }
}

function seedTestData(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'atlas.db');
  const db = new Database(dbPath);
  db.exec(fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'db', 'schema.sql'), 'utf-8'));

  db.prepare(
    "INSERT INTO courses (name, code, term, folder_name) VALUES ('Microeconomics', 'ECON101', 'Fall', 'Microeconomics')"
  ).run();
  const courseId = db.prepare("SELECT id FROM courses WHERE name = 'Microeconomics'").get().id;

  db.prepare(
    "INSERT INTO resources (course_id, title, kind, file_path, extraction_status) VALUES (?, 'Textbook.pdf', 'pdf', '/tmp/x.pdf', 'done')"
  ).run(courseId);
  const resourceId = db.prepare("SELECT id FROM resources WHERE title = 'Textbook.pdf'").get().id;
  db.prepare(
    "INSERT INTO document_parts (resource_id, ordinal, label, text, origin) VALUES (?, 5, 'Page 5', 'Chapter 5: Supply and Demand basics', 'extracted')"
  ).run(resourceId);
  db.prepare(
    "INSERT INTO document_parts (resource_id, ordinal, label, text, origin) VALUES (?, 6, 'Page 6', 'More on elasticity', 'extracted')"
  ).run(resourceId);
  db.prepare(
    "INSERT INTO search_index (entity_type, entity_id, course_id, title, body) SELECT 'document_part', id, ?, label, text FROM document_parts WHERE resource_id = ?"
  ).run(courseId, resourceId);

  db.prepare("INSERT INTO deadlines (course_id, title, kind, due_at) VALUES (?, 'Midterm', 'exam', datetime('now', '+3 days'))").run(
    courseId
  );
  db.prepare("INSERT INTO notes (course_id, title, content_markdown) VALUES (?, 'My own notes', 'stuff I wrote')").run(courseId);

  // --- Regression fixtures for three bugs found while auditing Phase 4 ---

  // (1) A second course whose display name is IDENTICAL to the first (same
  // subject, different term) — these must not share one memory file.
  db.prepare(
    "INSERT INTO courses (name, code, term, folder_name) VALUES ('Microeconomics', 'ECON101', 'Spring', 'Microeconomics (2)')"
  ).run();
  const duplicateNameCourseId = db.prepare("SELECT id FROM courses WHERE term = 'Spring'").get().id;

  // (2) A course whose matches are all out-ranked globally — course-scoped
  // search must still find its one real hit rather than returning nothing.
  db.prepare("INSERT INTO courses (name, code, term, folder_name) VALUES ('Statistics', 'STAT1', 'Fall', 'Statistics')").run();
  const statsCourseId = db.prepare("SELECT id FROM courses WHERE name = 'Statistics'").get().id;
  for (let i = 1; i <= 20; i++) {
    db.prepare(
      "INSERT INTO search_index (entity_type, entity_id, course_id, title, body) VALUES ('document_part', ?, ?, ?, ?)"
    ).run(1000 + i, courseId, `Page ${i}`, `elasticity discussion number ${i}`);
  }
  db.prepare(
    "INSERT INTO search_index (entity_type, entity_id, course_id, title, body) VALUES ('document_part', ?, ?, ?, ?)"
  ).run(2001, statsCourseId, 'Page 99', 'elasticity in a statistics context');

  // (3) A scanned resource with ONLY OCR-derived parts — must be readable,
  // not just searchable.
  db.prepare(
    "INSERT INTO resources (course_id, title, kind, file_path, extraction_status) VALUES (?, 'ScannedBook.pdf', 'pdf', '/tmp/scan.pdf', 'done')"
  ).run(courseId);
  const scannedResourceId = db.prepare("SELECT id FROM resources WHERE title = 'ScannedBook.pdf'").get().id;
  db.prepare(
    "INSERT INTO document_parts (resource_id, ordinal, label, text, origin) VALUES (?, 1, 'Page 1', 'recovered scanned text', 'ocr')"
  ).run(scannedResourceId);

  db.close();
  return { courseId, resourceId, duplicateNameCourseId, statsCourseId, scannedResourceId };
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-verify-mcp-'));
  const { courseId, resourceId, duplicateNameCourseId, statsCourseId, scannedResourceId } = seedTestData(dataDir);

  const transport = new StdioClientTransport({
    command: electronPath,
    args: [path.join(__dirname, '..', 'dist', 'main', 'mcpServer.js')],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ATLAS_DATA_DIR: dataDir },
  });
  const client = new Client({ name: 'atlas-verify', version: '1.0.0' });
  await client.connect(transport);

  const toolsList = await client.listTools();
  assert(toolsList.tools.length === 9, `9 tools registered (found ${toolsList.tools.length})`);

  const callTool = async (name, args) => {
    const result = await client.callTool({ name, arguments: args });
    return JSON.parse(result.content[0].text);
  };

  const overview = await callTool('atlas_overview', {});
  assert(overview.courses.some((c) => c.name === 'Microeconomics'), 'atlas_overview lists the seeded course');
  assert(overview.resourceCount === 2, 'atlas_overview counts the seeded resources');

  const briefing = await callTool('atlas_course_briefing', { course: 'statist' });
  assert(briefing.ok === true, 'atlas_course_briefing resolves a course by unique substring name');

  const fallBriefingById = await callTool('atlas_course_briefing', { course: courseId });
  assert(fallBriefingById.upcomingDeadlines.length === 1, 'atlas_course_briefing lists the seeded deadline');

  const missingCourse = await callTool('atlas_course_briefing', { course: 'nonexistent course' });
  assert(missingCourse.ok === false, 'atlas_course_briefing reports an error for an unmatched course, not a guess');

  // Two courses are genuinely named "Microeconomics" here — the agent must be
  // told which ones matched rather than silently answering about the wrong one.
  const ambiguous = await callTool('atlas_course_briefing', { course: 'Microeconomics' });
  assert(
    ambiguous.ok === false && Array.isArray(ambiguous.candidates) && ambiguous.candidates.length === 2,
    'an ambiguous course name returns the candidates instead of guessing one'
  );

  const search = await callTool('atlas_search', { query: 'chapter 5' });
  assert(search.hits.length === 1 && search.hits[0].title === 'Page 5', 'atlas_search finds the right page, not just the file');
  assert(!search.hits[0].snippet.includes('More on elasticity'), 'atlas_search never returns full document text, only an excerpt');

  const resources = await callTool('atlas_list_resources', { course: courseId });
  assert(resources.resources[0].partCount === 2, 'atlas_list_resources reports part count');

  const deadlines = await callTool('atlas_list_deadlines', { course: courseId });
  assert(deadlines.deadlines.length === 1 && deadlines.deadlines[0].title === 'Midterm', 'atlas_list_deadlines lists the seeded deadline');

  const doc = await callTool('atlas_read_document', { resource_id: resourceId, from: 5, to: 6 });
  assert(doc.parts.length === 2 && doc.parts[0].label === 'Page 5', 'atlas_read_document returns the requested page range with labels');

  const memoryWrite = await callTool('atlas_write_memory', { course: courseId, content: '# Test memory\nUser is comfortable with elasticity.' });
  assert(memoryWrite.ok === true, 'atlas_write_memory succeeds');
  const memoryPath = path.join(dataDir, 'course-profiles', 'Microeconomics.md');
  assert(
    fs.existsSync(memoryPath) && fs.readFileSync(memoryPath, 'utf-8').includes('comfortable with elasticity'),
    'atlas_write_memory actually wrote a plain, readable file to disk'
  );

  const noteResult = await callTool('atlas_create_note', {
    course: courseId,
    title: 'Agent-generated study guide',
    content_markdown: '# Study guide\nCovers supply and demand.',
  });
  assert(noteResult.ok === true, 'atlas_create_note succeeds');

  // --- Regressions for the three bugs found auditing Phase 4 ---

  // (1) Two courses sharing a display name must have independent memory.
  await callTool('atlas_write_memory', { course: duplicateNameCourseId, content: '# Spring term memory' });
  const springBriefing = await callTool('atlas_course_briefing', { course: duplicateNameCourseId });
  const fallBriefing = await callTool('atlas_course_briefing', { course: courseId });
  assert(
    springBriefing.memory.includes('Spring term memory') && fallBriefing.memory.includes('comfortable with elasticity'),
    'two courses with the same name keep separate memory files (not one shared/overwritten file)'
  );

  // (2) Course-scoped search must not be starved by higher-ranked hits elsewhere.
  const scopedSearch = await callTool('atlas_search', { query: 'elasticity', course: statsCourseId });
  assert(
    scopedSearch.hits.length === 1 && scopedSearch.hits[0].title === 'Page 99',
    'course-scoped search finds a match even when other courses dominate the global ranking'
  );

  // (3) An OCR'd scan must be readable, not merely searchable.
  const scannedRead = await callTool('atlas_read_document', { resource_id: scannedResourceId, from: 1, to: 1 });
  assert(
    scannedRead.parts.length === 1 && scannedRead.parts[0].text.includes('recovered scanned text'),
    "an OCR'd scanned PDF can actually be read, not just found in search"
  );

  const dbCheck = new Database(path.join(dataDir, 'atlas.db'));
  const createdNote = dbCheck.prepare('SELECT generated_by_agent FROM notes WHERE id = ?').get(noteResult.noteId);
  assert(createdNote.generated_by_agent === 1, 'the created note is flagged generated_by_agent, distinct from the user\'s own note');
  const userNote = dbCheck.prepare("SELECT generated_by_agent FROM notes WHERE title = 'My own notes'").get();
  assert(userNote.generated_by_agent === 0, "the user's pre-existing note is untouched by the agent's write");
  const searchHitForNewNote = dbCheck
    .prepare("SELECT 1 FROM search_index WHERE entity_type = 'note' AND entity_id = ?")
    .get(noteResult.noteId);
  assert(!!searchHitForNewNote, 'the agent-created note is immediately searchable, not just saved');
  dbCheck.close();

  await client.close();
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
