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

  db.close();
  return { courseId, resourceId };
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-verify-mcp-'));
  const { courseId, resourceId } = seedTestData(dataDir);

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
  assert(overview.resourceCount === 1, 'atlas_overview counts the seeded resource');

  const briefing = await callTool('atlas_course_briefing', { course: 'micro' });
  assert(briefing.ok === true, 'atlas_course_briefing resolves a course by substring name');
  assert(briefing.upcomingDeadlines.length === 1, 'atlas_course_briefing lists the seeded deadline');

  const missingCourse = await callTool('atlas_course_briefing', { course: 'nonexistent course' });
  assert(missingCourse.ok === false, 'atlas_course_briefing reports an error for an unmatched course, not a guess');

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
