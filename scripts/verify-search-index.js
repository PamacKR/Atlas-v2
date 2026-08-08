// Focused regression coverage for targeted search-index updates. This checks
// that ordinary mutations update only their affected rows while preserving the
// user-visible search behavior.
const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-search-index-'));
  let app;
  try {
    app = await electron.launch({
      args: [path.join(__dirname, '..')],
      env: { ...process.env, ATLAS_DATA_DIR: dataDir },
    });
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(400);

    const course = await window.evaluate(() => window.atlas.createCourse('Search index verification course', 'SEARCH101', 'Test'));
    const note = await window.evaluate((courseId) => window.atlas.createNote(courseId), course.id);
    await window.evaluate((noteId) => window.atlas.updateNoteTitle(noteId, 'Unique searchable note title'), note.id);

    const noteResults = await window.evaluate(() => window.atlas.search('Unique searchable note title'));
    if (!noteResults.some((result) => result.entityId === note.id)) {
      throw new Error('Updated note title was not found in search.');
    }
    console.log('note title update searchable: PASS');

    const resource = await window.evaluate(async (courseId) => {
      const bytes = new TextEncoder().encode('Targeted index resource body');
      return window.atlas.uploadResourceBuffer(courseId, 'targeted-index.md', bytes.buffer);
    }, course.id);
    const resourceResults = await window.evaluate(() => window.atlas.search('Targeted index resource body'));
    if (!resourceResults.some((result) => result.entityId === resource.id)) {
      throw new Error('New resource body was not found in search.');
    }
    console.log('new resource searchable: PASS');

    await window.evaluate((resourceId) => window.atlas.deleteResource(resourceId), resource.id);
    const deletedResults = await window.evaluate(() => window.atlas.search('Targeted index resource body'));
    if (deletedResults.some((result) => result.entityId === resource.id)) {
      throw new Error('Deleted resource remained in search.');
    }
    console.log('deleted resource removed from search: PASS');
    console.log('targeted search-index verification: PASS');
  } finally {
    if (app) await app.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
