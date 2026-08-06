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
      const mathematics = (await window.atlas.listCourses()).find((course) => course.code === 'MATH101');
      if (!mathematics) throw new Error('Mathematics course was not created.');
      await window.atlas.setCourseArchived(mathematics.id, true);
      const developmentEconomics = (await window.atlas.listCourses()).find((course) => course.code === 'DEV201');
      if (!developmentEconomics) throw new Error('Development Economics course was not created.');
      await window.atlas.createDeadline(developmentEconomics.id, 'Palette verification deadline', 'assignment', '2026-08-15', null);
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
    await window.waitForTimeout(200);
    const chromeOpacityWhileOverlayOpen = await window.evaluate(() => getComputedStyle(document.getElementById('window-chrome')).opacity);
    if (chromeOpacityWhileOverlayOpen === '1') throw new Error('Window chrome did not dim while the command palette overlay was open.');
    const initialCommands = await window.textContent('#command-palette-results');
    for (const label of ['Run OCR', 'Move note to course', 'Open resource in Google Drive', 'Edit course', 'Archive or unarchive course', 'Edit deadline', 'Delete note', 'Create backup now']) {
      if (!initialCommands.includes(label)) throw new Error(`Initial command list omitted: ${label}`);
    }
    if (await window.locator('#command-palette-input').inputValue() !== '') throw new Error('Palette did not open with an empty input.');
    if (await window.evaluate(() => document.activeElement?.id) !== 'command-palette-input') throw new Error('Palette input did not receive focus.');
    await window.fill('#command-palette-input', 'calendar');
    if (await window.isHidden('#command-palette-clear') !== false) throw new Error('The themed search clear control did not appear after typing.');
    if (await window.evaluate(() => getComputedStyle(document.getElementById('command-palette-clear')).display) === 'none') throw new Error('The search clear control stayed visually hidden after typing.');
    await window.click('#command-palette-clear');
    const clearState = await window.evaluate(() => ({ value: document.getElementById('command-palette-input').value, hidden: document.getElementById('command-palette-clear').hidden }));
    if (clearState.value !== '' || !clearState.hidden) throw new Error(`The search clear control did not reset the palette: ${JSON.stringify(clearState)}`);
    if (await window.evaluate(() => getComputedStyle(document.getElementById('command-palette-clear')).display) !== 'none') throw new Error('The search clear control remained visually visible after clearing.');
    const activeOption = await window.getAttribute('#command-palette-input', 'aria-activedescendant');
    if (activeOption !== 'command-palette-option-0') throw new Error(`The active palette option was not exposed to the input: ${activeOption}`);
    await window.keyboard.press('Tab');
    if (await window.evaluate(() => document.activeElement?.id) !== 'command-palette-option-0') throw new Error('Tab did not move from the input to the first palette result.');
    await window.keyboard.press('Shift+Tab');
    if (await window.evaluate(() => document.activeElement?.id) !== 'command-palette-input') throw new Error('Shift+Tab did not return focus to the palette input.');
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
    if (await window.getAttribute('#command-palette-input', 'aria-activedescendant') !== null) throw new Error('Ambiguous course selection preselected a course.');
    await window.keyboard.press('Enter');
    if (await window.isHidden('#command-palette-overlay')) throw new Error('Ambiguous course selection executed without an explicit choice.');
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
    await window.fill('#command-palette-input', 'mark deadline palette verification');
    await window.keyboard.press('Enter');
    await window.waitForTimeout(300);
    const completedDeadline = await window.evaluate(async () => {
      const deadlines = await window.atlas.listAllDeadlinesWithCourse();
      return deadlines.find((deadline) => deadline.title === 'Palette verification deadline');
    });
    if (!completedDeadline || completedDeadline.completed !== 1) throw new Error('Deadline completion command did not update the deadline.');

    await window.keyboard.press('Control+k');
    await window.fill('#command-palette-input', 'edit deadline palette verification');
    await window.keyboard.press('Enter');
    await window.waitForSelector('#deadline-editor-overlay:not([hidden])');
    await window.click('#deadline-edit-close');

    await window.keyboard.press('Control+k');
    await window.fill('#command-palette-input', 'delete deadline palette verification');
    await window.keyboard.press('Enter');
    await window.waitForSelector('#confirm-overlay:not([hidden])');
    await window.click('#confirm-cancel');

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
    await window.fill('#command-palette-input', 'unarchive course mathematics');
    await window.keyboard.press('Enter');
    if (!(await window.textContent('#command-palette-results')).includes('Unarchive course · Mathematics')) throw new Error('Archived course did not expose the Unarchive action.');
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
    await window.fill('#command-palette-input', 'create backup');
    await window.keyboard.press('Enter');
    await window.waitForTimeout(400);
    if (await window.getAttribute('#page-settings', 'hidden') !== null) throw new Error('Create backup command did not open Settings.');

    await window.keyboard.press('Control+k');
    await window.fill('#command-palette-input', 'reset shortcuts');
    await window.keyboard.press('Enter');
    await window.waitForSelector('#confirm-overlay:not([hidden])');
    await window.click('#confirm-cancel');

    await window.keyboard.press('Control+k');
    await window.waitForSelector('#command-palette-overlay:not([hidden])');
    await window.waitForTimeout(100);
    await window.screenshot({ path: path.join(__dirname, '..', 'verify-command-palette.png') });
    await window.fill('#command-palette-input', 'light theme');
    await window.keyboard.press('Enter');
    await window.waitForTimeout(200);
    if (await window.getAttribute('html', 'data-theme') !== 'light') throw new Error('Light-theme command did not switch the document theme.');
    await window.keyboard.press('Control+k');
    await window.waitForSelector('#command-palette-overlay:not([hidden])');
    await window.screenshot({ path: path.join(__dirname, '..', 'verify-command-palette-light.png') });
    await window.keyboard.press('Escape');
    await window.keyboard.press('Control+k');
    await window.fill('#command-palette-input', 'dark theme');
    await window.keyboard.press('Enter');
    await window.waitForTimeout(200);
    if (await window.getAttribute('html', 'data-theme') !== 'dark') throw new Error('Dark-theme command did not switch the document theme back.');
    console.log('command palette verify: PASS');
  } finally {
    await app.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
