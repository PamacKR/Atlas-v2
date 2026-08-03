// Focused Electron verification for the deterministic command palette.
// Uses a throwaway data directory and the real built renderer.
const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-command-palette-'));
  const app = await electron.launch({
    args: [path.join(__dirname, '..')],
    env: { ...process.env, ATLAS_DATA_DIR: dataDir, ATLAS_TEST_NO_REVEAL: '1' },
  });
  try {
    const window = await app.firstWindow();
    window.on('pageerror', (error) => console.error('[renderer error]', error));
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(500);

    await window.evaluate(async () => {
      await window.atlas.createCourse('Development Economics', 'DEV201', 'Monsoon 26');
      await window.atlas.createCourse('Mathematics', 'MATH101', 'Monsoon 26');
    });
    const scanFixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-scan.pdf'));
    const scanNoteTitle = await window.evaluate(async (bytes) => {
      const course = (await window.atlas.listCourses()).find((item) => item.code === 'DEV201');
      if (!course) throw new Error('Seed course was not created.');
      await window.atlas.createNote(course.id);
      const note = await window.atlas.importScanBuffer(course.id, 'sample-scan.pdf', new Uint8Array(bytes).buffer);
      if (!note) throw new Error('Scan note was not imported.');
      return note.title;
    }, Array.from(scanFixture));
    await window.click('.sidebar-nav-item[data-page="dashboard"]');
    await window.waitForTimeout(250);

    await window.locator('#search-input').focus();
    await window.keyboard.press('Control+k');
    await window.waitForSelector('#command-palette-overlay:not([hidden])');
    if (await window.locator('#command-palette-input').inputValue() !== '') throw new Error('Palette did not open with an empty input.');
    if (await window.evaluate(() => document.activeElement?.id) !== 'command-palette-input') throw new Error('Palette input did not receive focus.');
    await window.keyboard.press('Escape');
    if (await window.evaluate(() => document.activeElement?.id) !== 'search-input') throw new Error('Focus did not return to the previous control.');

    await window.keyboard.press('Control+k');
    await window.fill('#command-palette-input', 'export for ai dev eco');
    await window.waitForTimeout(100);
    if (!(await window.textContent('#command-palette-results')).includes('Export course for AI · Development Economics')) throw new Error('Course name argument did not resolve the export target.');
    await window.keyboard.press('Enter');
    await window.waitForTimeout(400);
    if (!await window.isHidden('#command-palette-overlay')) throw new Error('Palette did not close after selecting an export target.');
    const exportDir = path.join(dataDir, 'exports');
    const exported = fs.existsSync(exportDir) && fs.readdirSync(exportDir).some((name) => name.startsWith('atlas-context-Development Economics'));
    if (!exported) throw new Error('Export for AI did not create the course context file.');

    await window.keyboard.press('Control+k');
    await window.fill('#command-palette-input', 'export for ai');
    await window.waitForTimeout(100);
    if (!(await window.textContent('#command-palette-results')).includes('Choose a course to continue')) throw new Error('Export without a course did not ask for a course.');
    await window.keyboard.press('Enter');
    if (!(await window.getAttribute('#command-palette-input', 'placeholder')).includes('Choose a course')) throw new Error('Export course-selection step did not open.');
    await window.keyboard.press('Escape');
    if (await window.isHidden('#command-palette-overlay')) throw new Error('Escape closed the palette instead of returning from course selection.');
    await window.keyboard.press('Escape');

    await window.keyboard.press('Control+k');
    await window.fill('#command-palette-input', 'add deadline');
    await window.keyboard.press('Enter');
    await window.waitForSelector('#course-picker-overlay:not([hidden])');
    await window.locator('#course-picker-list li').first().click();
    await window.waitForSelector('#deadline-editor-overlay:not([hidden])');
    await window.click('#deadline-edit-close');

    await window.keyboard.press('Control+k');
    await window.fill('#command-palette-input', `move note ${scanNoteTitle}`);
    await window.waitForSelector('#command-palette-results');
    await window.keyboard.press('Enter');
    await window.waitForSelector('#course-picker-overlay:not([hidden])');
    await window.click('#course-picker-close');

    await window.keyboard.press('Control+k');
    await window.fill('#command-palette-input', `edit course development economics`);
    await window.keyboard.press('Enter');
    await window.waitForSelector('#course-edit-overlay:not([hidden])');
    await window.click('#course-edit-close');

    await window.keyboard.press('Control+k');
    await window.fill('#command-palette-input', `archive course development economics`);
    await window.keyboard.press('Enter');
    await window.waitForSelector('#confirm-overlay:not([hidden])');
    await window.click('#confirm-cancel');

    await window.keyboard.press('Control+k');
    await window.fill('#command-palette-input', `run ocr ${scanNoteTitle}`);
    await window.keyboard.press('Enter');
    await window.waitForSelector('#note-overlay:not([hidden])');
    await window.click('#note-close');
    await window.waitForTimeout(100);

    await window.keyboard.press('Control+k');
    await window.fill('#command-palette-input', 'new note');
    await window.waitForTimeout(100);
    await window.keyboard.press('Enter');
    await window.waitForSelector('#course-picker-overlay:not([hidden])');
    await window.locator('#course-picker-list li').first().click();
    await window.waitForSelector('#note-overlay:not([hidden])');
    await window.click('#note-close');
    await window.waitForTimeout(100);

    await window.keyboard.press('Control+k');
    await window.fill('#command-palette-input', 'calendar');
    await window.keyboard.press('Enter');
    await window.waitForTimeout(200);
    if (await window.getAttribute('#page-calendar', 'hidden') !== null) throw new Error('Calendar navigation command did not switch pages.');

    await window.keyboard.press('Control+k');
    await window.waitForSelector('#command-palette-overlay:not([hidden])');
    await window.waitForTimeout(100);
    await window.screenshot({ path: path.join(__dirname, '..', 'verify-command-palette.png') });
    console.log('command palette verify: PASS');
  } finally {
    await app.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
