// Launches the actual built Atlas app via Playwright's Electron driver and
// exercises the current UI, so functional changes can be self-verified from
// the terminal instead of always requiring a manual look at the window.
// Run with: npm run verify
const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

(async () => {
  // Use a fresh throwaway data dir per run, never the user's real
  // Downloads/Atlas-Storage — see ATLAS_DATA_DIR override in src/main/paths.ts.
  const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-verify-'));

  // A throwaway file to "upload" — dialog.showOpenDialog can't be driven by
  // Playwright, so main.ts has an ATLAS_TEST_UPLOAD_PATH escape hatch for tests.
  const testUploadPath = path.join(testDataDir, 'sample-lecture-notes.md');
  fs.writeFileSync(testUploadPath, '# Sample lecture notes\n\nUsed only by scripts/verify-app.js.');

  const app = await electron.launch({
    args: [path.join(__dirname, '..')],
    env: { ...process.env, ATLAS_DATA_DIR: testDataDir, ATLAS_TEST_UPLOAD_PATH: testUploadPath },
  });
  const window = await app.firstWindow();
  window.on('console', (msg) => console.log('[renderer console]', msg.type(), msg.text()));
  window.on('pageerror', (err) => console.log('[renderer error]', err));
  // Deletes now go through the in-app confirm modal (#confirm-overlay), not
  // a native dialog — if one ever appears it's a regression, but dismiss it
  // rather than leaving it open (which would hang the run) and log loudly.
  window.on('dialog', (dialog) => {
    console.error('UNEXPECTED native dialog (should be the in-app confirm modal):', dialog.message());
    dialog.dismiss();
  });
  await window.waitForLoadState('domcontentloaded');
  await window.waitForTimeout(500); // let the async init() finish

  const dataDirText = await window.textContent('#data-dir');
  console.log('data-dir text:', JSON.stringify(dataDirText));
  if (!dataDirText || !dataDirText.includes(testDataDir)) {
    throw new Error('FAIL: data-dir text missing or unexpected');
  }

  const beforeCount = (await window.$$('#course-list li')).length;
  console.log('courses before:', beforeCount);

  await window.fill('#course-name', 'Verify Script Test Course');
  await window.fill('#course-code', 'VERIFY101');
  await window.selectOption('#course-term', 'Monsoon 26');
  await window.click('#course-form button[type="submit"]');
  await window.waitForTimeout(300);

  const items = await window.$$eval('#course-list li', (els) => els.map((e) => e.textContent));
  console.log('courses after:', items);
  if (!items.some((t) => t && t.includes('Verify Script Test Course'))) {
    throw new Error('FAIL: added course did not appear in the list');
  }
  if (!items.some((t) => t && t.includes('Monsoon 26'))) {
    throw new Error('FAIL: term dropdown value did not persist/display');
  }

  // Semester filter: the course was created with term "Monsoon 26" above.
  // Filtering to a different term should hide it; filtering back (or to
  // "All semesters") should show it again. Reset to "All" before continuing
  // so the rest of the script can keep finding it via '#course-list li'.
  await window.selectOption('#semester-filter', 'Spring 27');
  await window.waitForTimeout(200);
  const itemsFilteredOut = await window.$$eval('#course-list li', (els) => els.map((e) => e.textContent));
  console.log('courses with Spring 27 filter (should exclude the Monsoon 26 course):', itemsFilteredOut);
  if (itemsFilteredOut.some((t) => t && t.includes('Verify Script Test Course'))) {
    throw new Error('FAIL: semester filter did not hide a course from a different term');
  }
  const persistedFilter = await window.evaluate(() => window.atlas.getSetting('semesterFilter'));
  if (persistedFilter !== 'Spring 27') {
    throw new Error(`FAIL: semester filter selection was not persisted, got ${persistedFilter}`);
  }

  await window.selectOption('#semester-filter', '');
  await window.waitForTimeout(200);
  const itemsAllSemesters = await window.$$eval('#course-list li', (els) => els.map((e) => e.textContent));
  if (!itemsAllSemesters.some((t) => t && t.includes('Verify Script Test Course'))) {
    throw new Error('FAIL: course did not reappear after resetting semester filter to "All semesters"');
  }
  console.log('semester filter: PASS');

  // Select the course, then upload a resource into it.
  await window.click('#course-list li');
  await window.waitForTimeout(200);

  const courseId = await window.$eval('#course-list li', (el) => Number(el.dataset.courseId));

  const resourcesHeading = await window.textContent('#resources-heading');
  console.log('resources heading:', resourcesHeading);
  if (!resourcesHeading || !resourcesHeading.includes('Verify Script Test Course')) {
    throw new Error('FAIL: resources section did not show the selected course');
  }

  await window.click('#upload-button');
  await window.waitForTimeout(300);

  const resourceItems = await window.$$eval('#resource-list li', (els) =>
    els.map((e) => e.textContent)
  );
  console.log('resources after upload:', resourceItems);
  if (!resourceItems.some((t) => t && t.includes('sample-lecture-notes.md'))) {
    throw new Error('FAIL: uploaded resource did not appear in the resource list');
  }

  // Captured now (list is markdown-only at this point) rather than later,
  // since a later upload (the test image) sorts before it by added_at and
  // would otherwise make "the first .resource-name" ambiguous.
  const markdownResourceId = await window.$eval('#resource-list li', (el) =>
    Number(el.dataset.resourceId)
  );

  // Click the filename (not a separate button) to open the in-app preview.
  // Safe to actually click here — markdown preview renders in-app, unlike
  // "Open in default app" which would launch a real external application.
  await window.click('#resource-list .resource-name');
  await window.waitForTimeout(300);

  const previewVisible = !(await window.isHidden('#preview-overlay'));
  console.log('preview overlay visible:', previewVisible);
  if (!previewVisible) throw new Error('FAIL: preview overlay did not open on filename click');

  const previewHtml = await window.innerHTML('#preview-body');
  console.log('preview body contains "Sample lecture notes":', previewHtml.includes('Sample lecture notes'));
  if (!previewHtml.includes('Sample lecture notes')) {
    throw new Error('FAIL: markdown preview did not render expected content');
  }

  // Regression check: zoom controls must stay hidden for a non-image
  // preview. This previously broke because #zoom-controls had an
  // unconditional `display: flex` on its ID selector, which outranked the
  // browser's default `[hidden] { display: none }` rule — same class of
  // bug already hit (and fixed) for #preview-overlay and #confirm-overlay.
  const zoomHiddenForMarkdown = await window.isHidden('#zoom-controls');
  console.log('zoom controls hidden for markdown preview:', zoomHiddenForMarkdown);
  if (!zoomHiddenForMarkdown) {
    throw new Error('FAIL: zoom controls visible for a non-image (markdown) preview');
  }

  await window.click('#preview-close');
  await window.waitForTimeout(200);
  if (!(await window.isHidden('#preview-overlay'))) {
    throw new Error('FAIL: preview overlay did not close');
  }

  // "Open in browser": the native context menu itself can't be automated,
  // so this hits the underlying local HTTP server directly (same server the
  // menu's "Open in browser" item points shell.openExternal at) to confirm
  // it actually serves usable content per file kind.
  const markdownBrowserUrl = await window.evaluate(
    (id) => window.atlas.getResourceBrowserUrl(id),
    markdownResourceId
  );
  console.log('markdown resource browser URL:', markdownBrowserUrl);
  const markdownResponse = await fetch(markdownBrowserUrl);
  const markdownBody = await markdownResponse.text();
  console.log('local server markdown response ok:', markdownResponse.ok, 'content-type:', markdownResponse.headers.get('content-type'));
  if (!markdownResponse.ok || !markdownBody.includes('Sample lecture notes')) {
    throw new Error('FAIL: local server did not serve rendered markdown HTML correctly');
  }
  if (!(markdownResponse.headers.get('content-type') || '').includes('text/html')) {
    throw new Error('FAIL: markdown resource served with unexpected content-type');
  }

  // Spreadsheet: write a minimal real .xlsx with the same 'xlsx' library
  // Atlas uses to read it, upload it, and confirm the local server renders
  // it as an HTML table (not just that the file round-trips).
  const XLSX = require('xlsx');
  const testXlsxPath = path.join(testDataDir, 'grades.xlsx');
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Assignment', 'Score'],
    ['Homework 1', 92],
    ['Midterm', 87],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Grades');
  XLSX.writeFile(wb, testXlsxPath);

  await app.evaluate((_electron, fp) => {
    process.env.ATLAS_TEST_UPLOAD_PATH = fp;
  }, testXlsxPath);
  // Uploads within the same second get an identical `added_at` (SQLite's
  // datetime() is 1-second resolution), so DOM order among near-simultaneous
  // uploads isn't reliable — call uploadResource directly to get the real ID
  // instead of guessing from list position, then force a UI refresh.
  const xlsxResource = await window.evaluate((cid) => window.atlas.uploadResource(cid), courseId);
  if (!xlsxResource) throw new Error('FAIL: xlsx upload did not return a resource');
  const xlsxResourceId = xlsxResource.id;
  await window.click('#course-list li');
  await window.waitForTimeout(200);
  const xlsxBrowserUrl = await window.evaluate(
    (id) => window.atlas.getResourceBrowserUrl(id),
    xlsxResourceId
  );
  const xlsxResponse = await fetch(xlsxBrowserUrl);
  const xlsxBody = await xlsxResponse.text();
  console.log('local server xlsx response ok:', xlsxResponse.ok, 'contains "Homework 1":', xlsxBody.includes('Homework 1'));
  if (!xlsxResponse.ok || !xlsxBody.includes('Homework 1') || !xlsxBody.includes('<table')) {
    throw new Error('FAIL: local server did not render the .xlsx resource as an HTML table');
  }

  // Image preview: centering + zoom controls. Swap ATLAS_TEST_UPLOAD_PATH
  // mid-run via app.evaluate (mutates the running main process's env
  // directly, which the upload handler re-reads on every call).
  const testImagePath = path.join(testDataDir, 'test-image.png');
  fs.writeFileSync(
    testImagePath,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    )
  );
  await app.evaluate((_electron, filePath) => {
    process.env.ATLAS_TEST_UPLOAD_PATH = filePath;
  }, testImagePath);
  const imageResource = await window.evaluate((cid) => window.atlas.uploadResource(cid), courseId);
  if (!imageResource) throw new Error('FAIL: image upload did not return a resource');
  const imageResourceId = imageResource.id;
  await window.click('#course-list li');
  await window.waitForTimeout(200);
  await window.click(`li[data-resource-id="${imageResourceId}"] .resource-name`);
  await window.waitForTimeout(300);

  const zoomControlsVisible = !(await window.isHidden('#zoom-controls'));
  console.log('zoom controls visible for image:', zoomControlsVisible);
  if (!zoomControlsVisible) throw new Error('FAIL: zoom controls did not show for an image preview');

  const imageBrowserUrl = await window.evaluate(
    (id) => window.atlas.getResourceBrowserUrl(id),
    imageResourceId
  );
  const imageResponse = await fetch(imageBrowserUrl);
  console.log('local server image content-type:', imageResponse.headers.get('content-type'));
  if (!imageResponse.ok || imageResponse.headers.get('content-type') !== 'image/png') {
    throw new Error('FAIL: local server did not serve the image resource as raw image/png');
  }

  const bodyClass = await window.getAttribute('#preview-body', 'class');
  if (!bodyClass || !bodyClass.includes('centered')) {
    throw new Error('FAIL: preview-body missing "centered" class for image preview');
  }

  await window.click('#zoom-in');
  await window.click('#zoom-in');
  const zoomedLevel = await window.textContent('#zoom-level');
  console.log('zoom level after 2 zoom-in clicks:', zoomedLevel);
  if (zoomedLevel !== '150%') throw new Error(`FAIL: expected 150% zoom, got ${zoomedLevel}`);

  const imgTransform = await window.$eval('#preview-body img', (el) => el.style.transform);
  if (!imgTransform.includes('1.5')) {
    throw new Error(`FAIL: image transform did not reflect zoom level (${imgTransform})`);
  }

  // Zoom is remembered per-resource: close and reopen the same image and
  // confirm it comes back at 150%, not reset to 100%.
  await window.click('#preview-close');
  await window.waitForTimeout(200);
  await window.click(`li[data-resource-id="${imageResourceId}"] .resource-name`);
  await window.waitForTimeout(300);
  const reopenedLevel = await window.textContent('#zoom-level');
  console.log('zoom level on reopen (should still be 150%):', reopenedLevel);
  if (reopenedLevel !== '150%') {
    throw new Error(`FAIL: zoom level did not persist across close/reopen, got ${reopenedLevel}`);
  }

  await window.click('#zoom-reset');
  await window.waitForTimeout(150);
  const resetLevel = await window.textContent('#zoom-level');
  if (resetLevel !== '100%') throw new Error(`FAIL: zoom reset did not return to 100%, got ${resetLevel}`);

  await window.click('#preview-close');
  await window.waitForTimeout(200);

  // Plain .txt (preview.type === 'text') — the exact case from the user's
  // bug report. Same regression guard as the markdown check above, for
  // the specific file type that actually surfaced it.
  const testTxtPath = path.join(testDataDir, 'raw-notes.txt');
  fs.writeFileSync(testTxtPath, 'Just some plain notes, no formatting.');
  await app.evaluate((_electron, fp) => {
    process.env.ATLAS_TEST_UPLOAD_PATH = fp;
  }, testTxtPath);
  const txtResource = await window.evaluate((cid) => window.atlas.uploadResource(cid), courseId);
  if (!txtResource) throw new Error('FAIL: .txt upload did not return a resource');
  await window.click('#course-list li');
  await window.waitForTimeout(200);
  await window.click(`li[data-resource-id="${txtResource.id}"] .resource-name`);
  await window.waitForTimeout(300);
  const zoomHiddenForTxt = await window.isHidden('#zoom-controls');
  console.log('zoom controls hidden for .txt preview:', zoomHiddenForTxt);
  if (!zoomHiddenForTxt) {
    throw new Error('FAIL: zoom controls visible for a .txt preview');
  }
  await window.click('#preview-close');
  await window.waitForTimeout(200);

  // Icon view toggle.
  await window.click('#view-icons');
  await window.waitForTimeout(200);
  const listClass = await window.getAttribute('#resource-list', 'class');
  console.log('resource-list class in icon mode:', listClass);
  if (!listClass || !listClass.includes('view-icons')) {
    throw new Error('FAIL: icon view mode did not apply');
  }
  const iconTiles = await window.$$('li.icon-tile');
  if (iconTiles.length === 0) throw new Error('FAIL: no icon tiles rendered in icon view');

  // View mode is meant to be a single app-wide, persisted preference (not
  // per-course, not reset on relaunch) — confirm the choice actually landed
  // in app_settings via the same getSetting() init() reads on startup.
  const savedViewMode = await window.evaluate(() => window.atlas.getSetting('viewMode'));
  console.log('persisted viewMode setting after switching to icons:', savedViewMode);
  if (savedViewMode !== 'icons') {
    throw new Error(`FAIL: view mode was not persisted, got ${savedViewMode}`);
  }

  await window.click('#view-list');
  await window.waitForTimeout(200);
  const savedViewModeAfterList = await window.evaluate(() => window.atlas.getSetting('viewMode'));
  if (savedViewModeAfterList !== 'list') {
    throw new Error(`FAIL: view mode did not persist back to list, got ${savedViewModeAfterList}`);
  }

  // Notes: create, type live-rendered markdown content (including the "- "
  // bullet-list shortcut — the whole reason Milkdown/Crepe was chosen over
  // Toast UI Editor, which didn't support it), confirm autosave, close/
  // reopen to confirm persistence, then delete.
  await window.click('#new-note-button');
  await window.waitForTimeout(500);
  const noteEditorVisible = !(await window.isHidden('#note-editor-overlay'));
  console.log('note editor overlay visible:', noteEditorVisible);
  if (!noteEditorVisible) throw new Error('FAIL: note editor did not open on "New note"');

  await window.fill('#note-title-input', 'W1L1');
  const noteEditableSelector = '.milkdown [contenteditable="true"]';
  await window.click(noteEditableSelector, { force: true });
  await window.keyboard.type('# Lecture 1');
  await window.keyboard.press('Enter');
  await window.keyboard.type('- ');
  await window.keyboard.type('Verify script note content.');
  await window.waitForTimeout(1200); // let the debounced autosave fire

  const saveStatus = await window.textContent('#note-save-status');
  console.log('note save status:', saveStatus);
  if (saveStatus !== 'Saved') throw new Error(`FAIL: note did not autosave, status was "${saveStatus}"`);

  // Regression guard for the actual reason the editor library was switched:
  // typing "- " must produce a real <li>, not the literal text "- ".
  const bulletCreated = (await window.$$('.milkdown li')).length > 0;
  console.log('typing "- " created a real bullet list item:', bulletCreated);
  if (!bulletCreated) throw new Error('FAIL: "- " did not convert to a real bullet list item');

  await window.click('#note-close');
  await window.waitForTimeout(300);

  const noteListAfterClose = await window.$$eval('#note-list li', (els) => els.map((e) => e.textContent));
  console.log('notes after close:', noteListAfterClose);
  if (!noteListAfterClose.some((t) => t && t.includes('W1L1'))) {
    throw new Error('FAIL: created note did not appear in the note list with its title');
  }

  const noteId = await window.$eval('#note-list li', (el) => Number(el.dataset.noteId));
  await window.click(`li[data-note-id="${noteId}"]`);
  await window.waitForTimeout(500);
  const reopenedNoteText = await window.textContent(noteEditableSelector);
  console.log('reopened note content:', reopenedNoteText);
  if (!reopenedNoteText.includes('Verify script note content.')) {
    throw new Error('FAIL: note content did not persist across close/reopen');
  }
  await window.click('#note-close');
  await window.waitForTimeout(200);

  // Delete via the underlying API (native context menu can't be automated,
  // same limitation as course/resource/watched-folder delete).
  await window.evaluate((id) => window.atlas.deleteNote(id), noteId);
  await window.click('#course-list li'); // reselect to force a refresh
  await window.waitForTimeout(300);
  const noteListAfterDelete = await window.$$eval('#note-list li', (els) => els.map((e) => e.textContent));
  console.log('notes after delete:', noteListAfterDelete);
  if (noteListAfterDelete.some((t) => t && t.includes('W1L1'))) {
    throw new Error('FAIL: note still present after delete');
  }

  // Confirm on-disk layout: course folder named after the course (not
  // course-<id>), and the uploaded file keeping its original filename.
  const expectedFilePath = path.join(
    testDataDir,
    'files',
    'Verify Script Test Course',
    'sample-lecture-notes.md'
  );
  console.log('expecting file at:', expectedFilePath);
  if (!fs.existsSync(expectedFilePath)) {
    throw new Error(`FAIL: expected file not found at ${expectedFilePath}`);
  }

  await window.screenshot({ path: path.join(__dirname, '..', 'verify-screenshot.png') });
  console.log('Screenshot saved to verify-screenshot.png');

  // Delete is now right-click-only (native OS context menu), which
  // Playwright cannot drive — there's no in-page element left to click.
  // So this exercises the underlying delete IPC + list-refresh path
  // directly (via the same window.atlas.* API the context menu's "Delete"
  // item calls), rather than the native menu interaction itself. The
  // right-click -> menu -> click path needs a manual check by the user.
  await window.evaluate((id) => window.atlas.deleteResource(id), markdownResourceId);
  await window.click('#course-list li'); // reselect to force a resources refresh
  await window.waitForTimeout(300);
  const resourcesAfterDelete = await window.$$eval('#resource-list li', (els) =>
    els.map((e) => e.textContent)
  );
  console.log('resources after delete:', resourcesAfterDelete);
  if (resourcesAfterDelete.some((t) => t && t.includes('sample-lecture-notes.md'))) {
    throw new Error('FAIL: resource still present after delete');
  }

  await window.evaluate((id) => window.atlas.deleteCourse(id), courseId);
  await window.reload();
  await window.waitForTimeout(500);
  const coursesAfterDelete = await window.$$eval('#course-list li', (els) =>
    els.map((e) => e.textContent)
  );
  console.log('courses after delete:', coursesAfterDelete);
  if (coursesAfterDelete.some((t) => t && t.includes('Verify Script Test Course'))) {
    throw new Error('FAIL: course still present after delete');
  }

  // Folder watching: re-create the course (the previous one was just
  // deleted above) and point a watched folder at a throwaway directory that
  // already has a file in it, confirming the pre-existing file gets picked
  // up automatically (not just future ones).
  await window.fill('#course-name', 'Watch Test Course');
  await window.selectOption('#course-term', 'Spring 27');
  await window.click('#course-form button[type="submit"]');
  await window.waitForTimeout(300);
  await window.click('#course-list li');
  await window.waitForTimeout(200);
  const watchCourseId = await window.$eval('#course-list li', (el) => Number(el.dataset.courseId));

  const watchFolderDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-watch-'));
  const preExistingFile = path.join(watchFolderDir, 'pre-existing-syllabus.txt');
  fs.writeFileSync(preExistingFile, 'Syllabus content dropped into the watched folder before Atlas watched it.');

  await app.evaluate((_electron, fp) => {
    process.env.ATLAS_TEST_WATCH_FOLDER_PATH = fp;
  }, watchFolderDir);
  await window.click('#add-watch-folder');
  await window.waitForTimeout(500);

  const watchedFolderItems = await window.$$eval('#watched-folder-list li', (els) =>
    els.map((e) => e.textContent)
  );
  console.log('watched folders:', watchedFolderItems);
  if (!watchedFolderItems.some((t) => t && t.includes(watchFolderDir))) {
    throw new Error('FAIL: watched folder did not appear in the list');
  }

  // Chokidar's initial scan is async; poll briefly rather than a fixed sleep.
  let resourcesAfterWatch = [];
  for (let i = 0; i < 10; i++) {
    resourcesAfterWatch = await window.$$eval('#resource-list li', (els) => els.map((e) => e.textContent));
    if (resourcesAfterWatch.some((t) => t && t.includes('pre-existing-syllabus.txt'))) break;
    await window.waitForTimeout(300);
  }
  console.log('resources after watching pre-populated folder:', resourcesAfterWatch);
  if (!resourcesAfterWatch.some((t) => t && t.includes('pre-existing-syllabus.txt'))) {
    throw new Error('FAIL: pre-existing file in watched folder was not auto-imported');
  }

  // Now drop a genuinely new file into the watched folder while it's live.
  const newFile = path.join(watchFolderDir, 'week1-notes.txt');
  fs.writeFileSync(newFile, 'New notes dropped in while the folder was already being watched.');
  let resourcesAfterNewFile = [];
  for (let i = 0; i < 10; i++) {
    resourcesAfterNewFile = await window.$$eval('#resource-list li', (els) =>
      els.map((e) => e.textContent)
    );
    if (resourcesAfterNewFile.some((t) => t && t.includes('week1-notes.txt'))) break;
    await window.waitForTimeout(300);
  }
  console.log('resources after new file dropped into watched folder:', resourcesAfterNewFile);
  if (!resourcesAfterNewFile.some((t) => t && t.includes('week1-notes.txt'))) {
    throw new Error('FAIL: new file dropped into an already-watched folder was not auto-imported');
  }

  // Deleting the source file out from under a watched folder should delete
  // the resource it produced too, not leave a broken "resource not found"
  // entry behind.
  fs.unlinkSync(preExistingFile);
  let resourcesAfterSourceDelete = resourcesAfterNewFile;
  for (let i = 0; i < 10; i++) {
    resourcesAfterSourceDelete = await window.$$eval('#resource-list li', (els) =>
      els.map((e) => e.textContent)
    );
    if (!resourcesAfterSourceDelete.some((t) => t && t.includes('pre-existing-syllabus.txt'))) break;
    await window.waitForTimeout(300);
  }
  console.log('resources after deleting source file from watched folder:', resourcesAfterSourceDelete);
  if (resourcesAfterSourceDelete.some((t) => t && t.includes('pre-existing-syllabus.txt'))) {
    throw new Error('FAIL: resource was not removed after its source file was deleted from the watched folder');
  }
  const managedCopyPath = path.join(testDataDir, 'files', 'Watch Test Course', 'pre-existing-syllabus.txt');
  if (fs.existsSync(managedCopyPath)) {
    throw new Error('FAIL: managed-storage copy was not deleted alongside the resource row');
  }

  // Stop watching via the underlying API (native context menu can't be
  // automated, same limitation as resource/course delete).
  const watchedFolderId = await window.$eval('#watched-folder-list li', (el) =>
    Number(el.dataset.folderId)
  );
  await window.evaluate((id) => window.atlas.removeWatchedFolder(id), watchedFolderId);
  console.log('folder watching: PASS');

  // Managed-storage watching: Atlas's own data folder is meant to be
  // user-browsable (ARCHITECTURE.md §2) — a file dropped straight into
  // Downloads/Atlas-Storage/files/<course>/ by hand (not via upload) should
  // be picked up, and one deleted from there should disappear from the app,
  // without any "watched folder" having to be configured for it.
  const managedCourseDir = path.join(testDataDir, 'files', 'Watch Test Course');
  const manuallyDroppedFile = path.join(managedCourseDir, 'dropped-in-by-hand.txt');
  fs.writeFileSync(manuallyDroppedFile, 'Placed directly into managed storage, not via Upload.');

  let resourcesAfterManualDrop = [];
  for (let i = 0; i < 10; i++) {
    resourcesAfterManualDrop = await window.$$eval('#resource-list li', (els) =>
      els.map((e) => e.textContent)
    );
    if (resourcesAfterManualDrop.some((t) => t && t.includes('dropped-in-by-hand.txt'))) break;
    await window.waitForTimeout(300);
  }
  console.log('resources after manually dropping a file into managed storage:', resourcesAfterManualDrop);
  if (!resourcesAfterManualDrop.some((t) => t && t.includes('dropped-in-by-hand.txt'))) {
    throw new Error('FAIL: file placed directly into managed storage was not auto-imported');
  }

  fs.unlinkSync(manuallyDroppedFile);
  let resourcesAfterManualStorageDelete = resourcesAfterManualDrop;
  for (let i = 0; i < 10; i++) {
    resourcesAfterManualStorageDelete = await window.$$eval('#resource-list li', (els) =>
      els.map((e) => e.textContent)
    );
    if (!resourcesAfterManualStorageDelete.some((t) => t && t.includes('dropped-in-by-hand.txt'))) break;
    await window.waitForTimeout(300);
  }
  console.log('resources after deleting that file from managed storage:', resourcesAfterManualStorageDelete);
  if (resourcesAfterManualStorageDelete.some((t) => t && t.includes('dropped-in-by-hand.txt'))) {
    throw new Error('FAIL: resource was not removed after its file was deleted directly from managed storage');
  }
  console.log('managed-storage watching: PASS');

  // Leave the view mode on icons, then fully relaunch the app against the
  // same data dir — this is the actual scenario the user asked about
  // ("even after a fresh launch"), not just that the setting persists in
  // the DB.
  await window.click('#view-icons');
  await window.waitForTimeout(200);
  await app.close();

  const relaunchedApp = await electron.launch({
    args: [path.join(__dirname, '..')],
    env: { ...process.env, ATLAS_DATA_DIR: testDataDir },
  });
  const relaunchedWindow = await relaunchedApp.firstWindow();
  await relaunchedWindow.waitForLoadState('domcontentloaded');
  await relaunchedWindow.waitForTimeout(500);
  const viewIconsActiveOnRelaunch = await relaunchedWindow.evaluate(() =>
    document.getElementById('view-icons').classList.contains('active')
  );
  console.log('icon view still active after a fresh relaunch:', viewIconsActiveOnRelaunch);
  if (!viewIconsActiveOnRelaunch) {
    throw new Error('FAIL: view mode did not survive a fresh app relaunch');
  }
  await relaunchedApp.close();

  // Throwaway data dirs, safe to delete entirely.
  fs.rmSync(testDataDir, { recursive: true, force: true });
  fs.rmSync(watchFolderDir, { recursive: true, force: true });

  console.log('PASS');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
