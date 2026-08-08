// Focused regression coverage for Phase 1 of performance implementation notes.
// It drives the real Electron app and deliberately performs mutations through
// the exposed Atlas API while each affected page is already visible. A page
// change or reload would hide the stale-rendering bug this is meant to catch.
const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-freshness-'));
  let app;
  try {
    app = await electron.launch({
      args: [path.join(__dirname, '..')],
      env: { ...process.env, ATLAS_DATA_DIR: dataDir },
    });
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(500);

    const course = await window.evaluate(() => window.atlas.createCourse('Freshness verification course', 'FRESH101', 'Test'));

    await window.click('.sidebar-nav-item[data-page="resources"]');
    await window.waitForTimeout(250);
    const resource = await window.evaluate(async (courseId) => {
      const bytes = new TextEncoder().encode('# Fresh resource\n\nThis is a freshness test.');
      return window.atlas.uploadResourceBuffer(courseId, 'fresh-resource.md', bytes.buffer);
    }, course.id);
    if (!resource) throw new Error('Resource creation returned no row.');
    await window.waitForFunction(
      (id) => Boolean(document.querySelector(`[data-resource-id="${id}"]`)),
      resource.id
    );
    console.log('resource creation visible without navigation: PASS');

    await window.evaluate((id) => window.atlas.deleteResource(id), resource.id);
    await window.waitForFunction(
      (id) => !document.querySelector(`[data-resource-id="${id}"]`),
      resource.id
    );
    console.log('resource deletion visible without navigation: PASS');

    await window.click('.sidebar-nav-item[data-page="notes"]');
    await window.waitForTimeout(250);
    const note = await window.evaluate((courseId) => window.atlas.createNote(courseId), course.id);
    await window.waitForFunction(
      (id) => Boolean(document.querySelector(`[data-note-id="${id}"]`)),
      note.id
    );
    console.log('note creation visible without navigation: PASS');

    await window.evaluate((id) => window.atlas.updateNoteTitle(id, 'Freshly renamed note'), note.id);
    await window.waitForFunction(
      (id) => document.querySelector(`[data-note-id="${id}"]`)?.textContent?.includes('Freshly renamed note'),
      note.id
    );
    console.log('note title update visible without navigation: PASS');

    // Seed one event before first opening Calendar so its intentional
    // all-courses filter initialization has a course to include.
    await window.evaluate((courseId) =>
      window.atlas.createDeadline(courseId, 'Calendar filter seed', 'assignment', new Date().toISOString().slice(0, 10), null), course.id);
    await window.click('.sidebar-nav-item[data-page="calendar"]');
    await window.waitForTimeout(250);
    const deadline = await window.evaluate((courseId) =>
      window.atlas.createDeadline(courseId, 'Fresh deadline', 'assignment', new Date().toISOString().slice(0, 10), null), course.id);
    await window.waitForFunction(
      (title) => Array.from(document.querySelectorAll('.cal-event')).some((element) => element.textContent?.includes(title)),
      deadline.title
    );
    console.log('deadline creation visible without navigation: PASS');

    console.log('mutation freshness verification: PASS');
  } finally {
    if (app) await app.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
