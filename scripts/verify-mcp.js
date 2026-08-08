// Verifies the standalone MCP server (src/main/mcpServer.ts, Phase 4 architecture
// §6) end-to-end over the real MCP protocol — scripts/verify-app.js drives
// the Atlas *window* with Playwright and has no way to reach a separate
// background process, so this is its own script rather than folded in.
//
// Seeds a fresh temp Atlas-Storage (same ATLAS_DATA_DIR override
// verify-app.js uses) with real schema + test data, spawns the MCP server
// against it via the MCP SDK's own client/stdio transport, and calls every
// one of the 12 tools, asserting real responses rather than just "it didn't
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

  const fixtureDir = path.join(dataDir, 'visual-fixtures');
  fs.mkdirSync(fixtureDir, { recursive: true });
  const pdfPath = path.join(fixtureDir, 'textbook.pdf');
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'sample-scan.pdf'), pdfPath);
  const imagePath = path.join(fixtureDir, 'diagram.png');
  const { createCanvas } = require('@napi-rs/canvas');
  const imageCanvas = createCanvas(96, 64);
  const imageContext = imageCanvas.getContext('2d');
  imageContext.fillStyle = '#2c2c2c';
  imageContext.fillRect(0, 0, 96, 64);
  imageContext.fillStyle = '#f0b429';
  imageContext.fillRect(16, 16, 64, 32);
  fs.writeFileSync(imagePath, imageCanvas.toBuffer('image/png'));

  db.prepare(
    "INSERT INTO resources (course_id, title, kind, file_path, extraction_status) VALUES (?, 'Textbook.pdf', 'pdf', ?, 'done')"
  ).run(courseId, pdfPath);
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
    "INSERT INTO resources (course_id, title, kind, file_path, extraction_status) VALUES (?, 'ScannedBook.pdf', 'pdf', ?, 'done')"
  ).run(courseId, pdfPath);
  const scannedResourceId = db.prepare("SELECT id FROM resources WHERE title = 'ScannedBook.pdf'").get().id;
  db.prepare(
    "INSERT INTO document_parts (resource_id, ordinal, label, text, origin) VALUES (?, 1, 'Page 1', 'recovered scanned text', 'ocr')"
  ).run(scannedResourceId);

  const imageResourceId = Number(
    db
      .prepare("INSERT INTO resources (course_id, title, kind, file_path, extraction_status) VALUES (?, 'Reference diagram.png', 'image', ?, 'unsupported')")
      .run(courseId, imagePath).lastInsertRowid
  );
  const scanNoteId = Number(
    db
      .prepare("INSERT INTO notes (course_id, title, content_markdown, is_handwritten, image_path) VALUES (?, 'Handwritten scan', '', 1, ?)")
      .run(courseId, pdfPath).lastInsertRowid
  );

  const announcementId = Number(
    db
      .prepare(
        "INSERT INTO announcements (course_id, source, title, body, posted_at, classroom_announcement_id) VALUES (?, 'classroom', 'Midterm room change', 'The midterm is now in Room 204. Bring your calculator.', datetime('now'), 'announcement-1')"
      )
      .run(courseId).lastInsertRowid
  );
  const assignmentId = Number(
    db
      .prepare(
        "INSERT INTO assignments (course_id, title, description, due_at, source, status, classroom_coursework_id, posted_at) VALUES (?, 'Problem set 1', 'Complete questions 1 through 5 and show your working.', datetime('now', '+5 days'), 'classroom', 'open', 'coursework-1', datetime('now'))"
      )
      .run(courseId).lastInsertRowid
  );
  db.prepare(
    "INSERT INTO resources (course_id, title, kind, source, file_path, classroom_attachment_id, extraction_status) VALUES (?, 'Midterm instructions', 'link', 'classroom', 'https://classroom.google.com/announcement-attachment', 'announcement-1:https://classroom.google.com/announcement-attachment', 'unsupported')"
  ).run(courseId);
  db.prepare(
    "INSERT INTO resources (course_id, title, kind, source, file_path, classroom_attachment_id, extraction_status) VALUES (?, 'Problem set PDF', 'link', 'classroom', 'https://classroom.google.com/coursework-attachment', 'coursework-1:https://classroom.google.com/coursework-attachment', 'unsupported')"
  ).run(courseId);
  db.prepare("INSERT INTO search_index (entity_type, entity_id, course_id, title, body) VALUES ('announcement', ?, ?, 'Midterm room change', 'The midterm is now in Room 204. Bring your calculator.')").run(announcementId, courseId);
  db.prepare("INSERT INTO search_index (entity_type, entity_id, course_id, title, body) VALUES ('assignment', ?, ?, 'Problem set 1', 'Complete questions 1 through 5 and show your working.')").run(assignmentId, courseId);

  db.close();
  return { courseId, resourceId, duplicateNameCourseId, statsCourseId, scannedResourceId, imageResourceId, scanNoteId, announcementId, assignmentId };
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-verify-mcp-'));
  const { courseId, resourceId, duplicateNameCourseId, statsCourseId, scannedResourceId, imageResourceId, scanNoteId, announcementId, assignmentId } = seedTestData(dataDir);

  const transport = new StdioClientTransport({
    command: electronPath,
    args: [path.join(__dirname, '..', 'dist', 'main', 'mcpServer.js')],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ATLAS_DATA_DIR: dataDir },
  });
  const client = new Client({ name: 'atlas-verify', version: '1.0.0' });
  await client.connect(transport);

  const toolsList = await client.listTools();
  assert(toolsList.tools.length === 12, `12 tools registered (found ${toolsList.tools.length})`);

  const callTool = async (name, args) => {
    const result = await client.callTool({ name, arguments: args });
    return JSON.parse(result.content[0].text);
  };

  const overview = await callTool('atlas_overview', {});
  assert(overview.courses.some((c) => c.name === 'Microeconomics'), 'atlas_overview lists the seeded course');
  assert(overview.resourceCount === 5, 'atlas_overview counts the seeded resources');

  const briefing = await callTool('atlas_course_briefing', { course: 'statist' });
  assert(briefing.ok === true, 'atlas_course_briefing resolves a course by unique substring name');

  const fallBriefingById = await callTool('atlas_course_briefing', { course: courseId });
  assert(fallBriefingById.upcomingDeadlines.length === 1, 'atlas_course_briefing lists the seeded deadline');

  const readiness = await callTool('atlas_course_readiness', { course: courseId });
  assert(readiness.ok === true && readiness.total === 7 && readiness.readable === 3, 'atlas_course_readiness exposes the app readiness report');

  const announcement = await callTool('atlas_read_classroom_item', { item_type: 'announcement', item_id: announcementId });
  assert(
    announcement.ok === true && announcement.item.body.includes('Room 204') && announcement.item.attachments.length === 1,
    'atlas_read_classroom_item returns the full announcement and its attached resource'
  );
  const assignment = await callTool('atlas_read_classroom_item', { item_type: 'assignment', item_id: assignmentId });
  assert(
    assignment.ok === true && assignment.item.description.includes('questions 1 through 5') && assignment.item.attachments.length === 1,
    'atlas_read_classroom_item returns the full assignment and its attached resource'
  );

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
  assert(
    search.hits[0].resourceId === resourceId &&
      search.hits[0].resourceTitle === 'Textbook.pdf' &&
      search.hits[0].partOrdinal === 5,
    'document search hits include their parent resource and page ordinal'
  );
  assert(!search.hits[0].snippet.includes('More on elasticity'), 'atlas_search never returns full document text, only an excerpt');

  const resources = await callTool('atlas_list_resources', { course: courseId });
  const textbook = resources.resources.find((resource) => resource.title === 'Textbook.pdf');
  assert(textbook?.partCount === 2, 'atlas_list_resources reports part count');

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

  const generalNoteResult = await callTool('atlas_create_note', {
    title: 'General study method',
    content_markdown: 'This general note is useful across courses.',
  });
  assert(
    generalNoteResult.ok === true && generalNoteResult.courseId === null && generalNoteResult.courseName === 'General',
    'atlas_create_note can create an agent note in General when no course is supplied'
  );
  const generalSearch = await callTool('atlas_search', { query: 'general study method' });
  assert(
    generalSearch.hits.length === 1 && generalSearch.hits[0].courseId === null && generalSearch.hits[0].courseName === 'General',
    'General agent notes are immediately searchable and clearly labeled'
  );

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

  const pdfVisualResult = await client.callTool({ name: 'atlas_read_visual', arguments: { resource_id: resourceId, page: 1 } });
  const pdfVisualMeta = JSON.parse(pdfVisualResult.content.find((block) => block.type === 'text').text);
  const pdfVisualImage = pdfVisualResult.content.find((block) => block.type === 'image');
  assert(pdfVisualMeta.ok === true && pdfVisualMeta.page === 1 && pdfVisualImage?.mimeType === 'image/png' && pdfVisualImage.data.length > 100, 'atlas_read_visual returns a rendered PDF page as MCP image content');

  const imageVisualResult = await client.callTool({ name: 'atlas_read_visual', arguments: { resource_id: imageResourceId } });
  const imageVisualMeta = JSON.parse(imageVisualResult.content.find((block) => block.type === 'text').text);
  const imageVisualImage = imageVisualResult.content.find((block) => block.type === 'image');
  assert(imageVisualMeta.ok === true && imageVisualImage?.mimeType === 'image/png' && imageVisualImage.data.length > 100, 'atlas_read_visual returns a raw image resource through MCP');

  const noteVisualResult = await client.callTool({ name: 'atlas_read_visual', arguments: { note_id: scanNoteId, page: 1 } });
  const noteVisualMeta = JSON.parse(noteVisualResult.content.find((block) => block.type === 'text').text);
  const noteVisualImage = noteVisualResult.content.find((block) => block.type === 'image');
  assert(noteVisualMeta.ok === true && noteVisualMeta.target.type === 'note' && noteVisualImage?.mimeType === 'image/png', 'atlas_read_visual can inspect a handwritten PDF scan through its note id');

  const dbCheck = new Database(path.join(dataDir, 'atlas.db'));
  const createdNote = dbCheck.prepare('SELECT generated_by_agent FROM notes WHERE id = ?').get(noteResult.noteId);
  assert(createdNote.generated_by_agent === 1, 'the created note is flagged generated_by_agent, distinct from the user\'s own note');
  const createdGeneralNote = dbCheck.prepare('SELECT course_id, generated_by_agent FROM notes WHERE id = ?').get(generalNoteResult.noteId);
  assert(createdGeneralNote.course_id === null && createdGeneralNote.generated_by_agent === 1, 'the General note is stored without a course and remains agent-generated');
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
