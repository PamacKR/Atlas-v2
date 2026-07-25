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

  // "F" toggles preview fullscreen, so the user doesn't have to reach for
  // the button — guarded to not fire while typing, so pressing "f" here
  // (with no text field focused) should toggle it on, then off again.
  await window.keyboard.press('f');
  await window.waitForTimeout(200);
  let previewFullscreen = await window.evaluate(() =>
    document.getElementById('preview-overlay').classList.contains('fullscreen')
  );
  console.log('preview fullscreen after pressing "f":', previewFullscreen);
  if (!previewFullscreen) throw new Error('FAIL: pressing "f" did not enter fullscreen preview');
  await window.keyboard.press('f');
  await window.waitForTimeout(200);
  previewFullscreen = await window.evaluate(() =>
    document.getElementById('preview-overlay').classList.contains('fullscreen')
  );
  console.log('preview fullscreen after pressing "f" again:', previewFullscreen);
  if (previewFullscreen) throw new Error('FAIL: pressing "f" again did not exit fullscreen preview');

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

  // "F" toggles note fullscreen, but only when not actually typing in the
  // note — typing "f" into the editor itself must produce a literal "f",
  // never hijacked into a fullscreen toggle.
  await window.keyboard.type('f');
  await window.waitForTimeout(200);
  let noteFullscreenWhileTyping = await window.evaluate(() =>
    document.getElementById('note-editor-overlay').classList.contains('fullscreen')
  );
  console.log('note fullscreen after typing "f" inside the editor (should stay false):', noteFullscreenWhileTyping);
  if (noteFullscreenWhileTyping) {
    throw new Error('FAIL: typing "f" inside the note editor incorrectly toggled fullscreen');
  }
  const contentIncludesTypedF = await window.textContent(noteEditableSelector);
  if (!contentIncludesTypedF.includes('f')) {
    throw new Error('FAIL: the literal "f" was not typed into the note content');
  }

  // Now blur out of the editor and confirm "F" does toggle fullscreen from
  // there. Blurred directly via JS rather than clicking some other element
  // in the header, since the header's child <input>/buttons fill nearly all
  // of its clickable area and a coordinate-based click risks landing on one
  // of them instead (refocusing a text field, not blurring away from one).
  await window.evaluate(() => document.activeElement && document.activeElement.blur());
  await window.keyboard.press('f');
  await window.waitForTimeout(200);
  let noteFullscreen = await window.evaluate(() =>
    document.getElementById('note-editor-overlay').classList.contains('fullscreen')
  );
  console.log('note fullscreen after pressing "f" outside a text field:', noteFullscreen);
  if (!noteFullscreen) throw new Error('FAIL: pressing "f" did not enter note fullscreen');
  await window.keyboard.press('f');
  await window.waitForTimeout(200);
  noteFullscreen = await window.evaluate(() =>
    document.getElementById('note-editor-overlay').classList.contains('fullscreen')
  );
  console.log('note fullscreen after pressing "f" again:', noteFullscreen);
  if (noteFullscreen) throw new Error('FAIL: pressing "f" again did not exit note fullscreen');

  await window.click('#note-close');
  await window.waitForTimeout(300);

  // Notes follow the same shared list/icon view toggle as resources.
  await window.click('#view-icons');
  await window.waitForTimeout(200);
  const noteListClassInIcons = await window.getAttribute('#note-list', 'class');
  console.log('note-list class in icon mode:', noteListClassInIcons);
  if (!noteListClassInIcons || !noteListClassInIcons.includes('view-icons')) {
    throw new Error('FAIL: icon view mode did not apply to the note list');
  }
  if ((await window.$$('#note-list li.icon-tile')).length === 0) {
    throw new Error('FAIL: no icon tiles rendered for notes in icon view');
  }
  await window.click('#view-list');
  await window.waitForTimeout(200);

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

  // Notes are one-way exported to a plain .md file under
  // files/<course>/notes/ for use outside Atlas — never read back, just
  // kept in sync on every save/rename, and removed on delete.
  const notesExportDir = path.join(testDataDir, 'files', 'Verify Script Test Course', 'notes');
  const exportedNotePath = path.join(notesExportDir, 'W1L1.md');
  console.log('exported note file exists:', fs.existsSync(exportedNotePath));
  if (!fs.existsSync(exportedNotePath)) {
    throw new Error(`FAIL: note was not exported to ${exportedNotePath}`);
  }
  const exportedContent = fs.readFileSync(exportedNotePath, 'utf-8');
  if (!exportedContent.includes('Verify script note content.')) {
    throw new Error('FAIL: exported note file does not contain the note content');
  }

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
  if (fs.existsSync(exportedNotePath)) {
    throw new Error('FAIL: exported note file was not removed after the note was deleted');
  }

  // Exported note files/assets must never get picked up by the
  // managed-storage watcher and re-imported as a resource — the real
  // regression this could otherwise cause.
  const resourcesAfterNoteExport = await window.evaluate((id) => window.atlas.listResources(id), courseId);
  console.log('resources after note export/delete (should be untouched):', resourcesAfterNoteExport.length);
  if (resourcesAfterNoteExport.some((r) => r.file_path && r.file_path.includes(`${path.sep}notes${path.sep}`))) {
    throw new Error('FAIL: an exported note file was incorrectly imported as a resource');
  }

  // Title auto-derivation must strip inline formatting (bold/italic/etc.),
  // not just block-level markers — a bolded first line should produce a
  // plain-text title, not one with literal ** in it.
  await window.click('#new-note-button');
  await window.waitForTimeout(500);
  await window.click(noteEditableSelector, { force: true });
  await window.keyboard.type('W2L3 Recap');
  await window.waitForTimeout(150);
  await window.keyboard.press('Control+a');
  await window.keyboard.press('Control+b');
  await window.waitForTimeout(1200);
  const boldNoteId = await window.evaluate(() => {
    const li = document.querySelector('#note-list li');
    return li ? Number(li.dataset.noteId) : null;
  });
  await window.click('#note-close');
  await window.waitForTimeout(300);
  const boldTitleInList = await window.$eval('#note-list li', (el) => el.textContent);
  console.log('title derived from a bolded first line:', boldTitleInList);
  if (!boldTitleInList.includes('W2L3 Recap') || boldTitleInList.includes('**')) {
    throw new Error(`FAIL: title should be "W2L3 Recap" with no markdown markers, got "${boldTitleInList}"`);
  }
  await window.evaluate((id) => window.atlas.deleteNote(id), boldNoteId);
  await window.click('#course-list li');
  await window.waitForTimeout(200);

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

  // Global search (FTS5 over search_index) — the markdown resource uploaded
  // earlier ("sample-lecture-notes.md") is still the only thing in the
  // index at this point (the notes created above were already deleted), so
  // a search for its content should surface exactly that one result and
  // clicking it should open the resource preview.
  await window.fill('#search-input', 'lecture');
  await window.waitForTimeout(500); // debounce (250ms) + IPC round-trip
  const searchResultTexts = await window.$$eval('#search-results li', (els) => els.map((e) => e.textContent));
  console.log('search results for "lecture":', searchResultTexts);
  if (!searchResultTexts.some((t) => t && t.includes('Sample lecture notes') && t.includes('Verify Script Test Course'))) {
    throw new Error(`FAIL: search did not find the expected resource, got ${JSON.stringify(searchResultTexts)}`);
  }
  await window.click('#search-results li');
  await window.waitForTimeout(400);
  const previewVisibleAfterSearchClick = !(await window.isHidden('#preview-overlay'));
  console.log('preview opened from a search result:', previewVisibleAfterSearchClick);
  if (!previewVisibleAfterSearchClick) {
    throw new Error('FAIL: clicking a search result did not open the resource preview');
  }
  const searchInputClearedAfterClick = await window.inputValue('#search-input');
  if (searchInputClearedAfterClick !== '') {
    throw new Error('FAIL: search input was not cleared after selecting a result');
  }
  await window.click('#preview-close');
  await window.waitForTimeout(200);

  // Keyboard navigation: Arrow Down should highlight a result (not require
  // the mouse at all), and Enter should open it — same as a click would.
  await window.fill('#search-input', 'lecture');
  await window.waitForTimeout(500);
  await window.press('#search-input', 'ArrowDown');
  const activeAfterArrowDown = await window.$eval('#search-results li', (el) => el.classList.contains('active'));
  console.log('first search result active after ArrowDown:', activeAfterArrowDown);
  if (!activeAfterArrowDown) {
    throw new Error('FAIL: ArrowDown did not mark the first search result as active');
  }
  await window.press('#search-input', 'Enter');
  await window.waitForTimeout(400);
  const previewVisibleAfterKeyboardNav = !(await window.isHidden('#preview-overlay'));
  console.log('preview opened via keyboard nav (ArrowDown + Enter):', previewVisibleAfterKeyboardNav);
  if (!previewVisibleAfterKeyboardNav) {
    throw new Error('FAIL: ArrowDown + Enter did not open the search result');
  }
  await window.click('#preview-close');
  await window.waitForTimeout(200);

  // Enter alone (no ArrowDown first) should pick the top result, so the
  // user isn't forced to press ArrowDown just to confirm an obvious match.
  await window.fill('#search-input', 'lecture');
  await window.waitForTimeout(500);
  await window.press('#search-input', 'Enter');
  await window.waitForTimeout(400);
  const previewVisibleAfterBareEnter = !(await window.isHidden('#preview-overlay'));
  console.log('preview opened via bare Enter (no ArrowDown):', previewVisibleAfterBareEnter);
  if (!previewVisibleAfterBareEnter) {
    throw new Error('FAIL: Enter alone did not open the top search result');
  }
  await window.click('#preview-close');
  await window.waitForTimeout(200);

  // A query matching nothing should show the "No matches" state, not an
  // empty/hidden dropdown that looks like the search silently did nothing.
  await window.fill('#search-input', 'zzz-nonexistent-query-zzz');
  await window.waitForTimeout(500);
  const noMatchText = await window.textContent('#search-results');
  console.log('search results for a query with no matches:', JSON.stringify(noMatchText));
  if (!noMatchText || !noMatchText.includes('No matches')) {
    throw new Error(`FAIL: expected "No matches" state, got ${JSON.stringify(noMatchText)}`);
  }
  await window.fill('#search-input', '');
  await window.keyboard.press('Escape');

  // Ctrl+L jumps focus to search from anywhere, browser-address-bar style —
  // click somewhere else first so this actually proves focus moved.
  await window.click('#course-list li');
  await window.keyboard.press('Control+l');
  await window.waitForTimeout(100);
  const focusedElementId = await window.evaluate(() => document.activeElement?.id);
  console.log('focused element after Ctrl+L:', focusedElementId);
  if (focusedElementId !== 'search-input') {
    throw new Error(`FAIL: Ctrl+L did not focus the search input, focused "${focusedElementId}" instead`);
  }
  (await window.$('#search-input'))?.evaluate((el) => el.blur());

  // Deadlines: one unified per-course timeline (assignment/reading/quiz/
  // .../manual), sorted incomplete-first then soonest-due-first, with
  // completed items struck through. No separate "Assignments" tab was
  // built — see docs/open-questions.md #13 for why that's deferred.
  // Added via the add/edit modal (typed dd-mm-yyyy date, optional time,
  // optional description with @-mention autocomplete) rather than an inline
  // form, per later user feedback wanting more fields (time, description,
  // file/note references) than an inline row could reasonably hold.
  async function fillDeadlineForm({ title, kind, date, time, description }) {
    await window.fill('#deadline-edit-title', title);
    if (kind) await window.selectOption('#deadline-edit-kind', kind);
    if (date) await window.fill('#deadline-edit-date-text', date);
    if (time) await window.fill('#deadline-edit-time', time);
    if (description) await window.fill('#deadline-edit-description', description);
  }

  await window.click('#new-deadline-button');
  await window.waitForTimeout(300);
  await fillDeadlineForm({ title: 'Midterm exam', kind: 'exam', date: '15-08-2026' });
  await window.click('#deadline-save-button');
  await window.waitForTimeout(300);

  await window.click('#new-deadline-button');
  await window.waitForTimeout(300);
  await fillDeadlineForm({ title: 'Homework 1', kind: 'assignment', date: '01-08-2026', time: '23:59' });
  await window.click('#deadline-save-button');
  await window.waitForTimeout(300);

  await window.click('#new-deadline-button');
  await window.waitForTimeout(300);
  await fillDeadlineForm({ title: 'Read syllabus', kind: 'reading' }); // no due date
  await window.click('#deadline-save-button');
  await window.waitForTimeout(300);

  const deadlineTitlesInOrder = await window.$$eval('#deadline-list li.deadline-item .deadline-title', (els) =>
    els.map((e) => e.textContent)
  );
  console.log('deadline order (soonest due date first, no-due-date last):', deadlineTitlesInOrder);
  if (JSON.stringify(deadlineTitlesInOrder) !== JSON.stringify(['Homework 1', 'Midterm exam', 'Read syllabus'])) {
    throw new Error(`FAIL: unexpected deadline order: ${JSON.stringify(deadlineTitlesInOrder)}`);
  }

  // Typed dd-mm-yyyy + optional time should format as a plain date with the
  // time appended (not "Today"/"Tomorrow", since 2026-08-15 is neither
  // relative to whenever this test happens to run).
  const homeworkDueText = await window.textContent(
    `li[data-deadline-id] .deadline-due >> nth=0`
  );
  console.log('first deadline due text (should include a time):', homeworkDueText);
  if (!homeworkDueText.includes('23:59') && !homeworkDueText.toLowerCase().includes('11:59')) {
    throw new Error(`FAIL: due time was not included in the formatted due date: ${homeworkDueText}`);
  }

  const deadlineIds = await window.$$eval('#deadline-list li.deadline-item', (els) =>
    els.map((e) => Number(e.dataset.deadlineId))
  );
  // Complete the soonest one (Homework 1) and confirm it both shows
  // struck-through and re-sorts to the bottom (incomplete-first ordering).
  await window.click(`li[data-deadline-id="${deadlineIds[0]}"] input[type="checkbox"]`);
  await window.waitForTimeout(300);
  const deadlineTitlesAfterComplete = await window.$$eval(
    '#deadline-list li.deadline-item .deadline-title',
    (els) => els.map((e) => e.textContent)
  );
  console.log('deadline order after completing "Homework 1":', deadlineTitlesAfterComplete);
  if (deadlineTitlesAfterComplete[deadlineTitlesAfterComplete.length - 1] !== 'Homework 1') {
    throw new Error(
      `FAIL: completed deadline did not sort to the bottom: ${JSON.stringify(deadlineTitlesAfterComplete)}`
    );
  }
  const completedItemClass = await window.getAttribute(`li[data-deadline-id="${deadlineIds[0]}"]`, 'class');
  if (!completedItemClass || !completedItemClass.includes('completed')) {
    throw new Error('FAIL: completed deadline is missing the "completed" styling class');
  }
  // Undo, so later assertions about this deadline (edit, description,
  // mentions) aren't operating on a struck-through/completed item.
  await window.click(`li[data-deadline-id="${deadlineIds[0]}"] input[type="checkbox"]`);
  await window.waitForTimeout(300);

  // Icon view: deadlines share the app-wide list/icon toggle with
  // resources/notes (no separate per-section toggle), and each kind gets
  // its own icon.
  await window.click('#view-icons');
  await window.waitForTimeout(200);
  const deadlineListClassInIcons = await window.getAttribute('#deadline-list', 'class');
  console.log('deadline-list class in icon mode:', deadlineListClassInIcons);
  if (!deadlineListClassInIcons || !deadlineListClassInIcons.includes('view-icons')) {
    throw new Error('FAIL: icon view mode did not apply to the deadline list');
  }
  if ((await window.$$('#deadline-list li.icon-tile')).length === 0) {
    throw new Error('FAIL: no icon tiles rendered for deadlines in icon view');
  }
  await window.click('#view-list');
  await window.waitForTimeout(200);

  // Viewer + @-mention: open "Homework 1", add a description referencing the
  // markdown resource uploaded earlier via @, save, then confirm the viewer
  // renders it as a clickable link and clicking it opens that resource.
  // Selected via keyboard (ArrowDown + Enter), not a mouse click, per the
  // user's explicit ask to be able to navigate mention suggestions without
  // a mouse — same as the global search results dropdown.
  await window.click(`li[data-deadline-id="${deadlineIds[0]}"] .deadline-title`);
  await window.waitForTimeout(300);
  await window.click('#deadline-edit-button');
  await window.waitForTimeout(300);
  await window.click('#deadline-edit-description');
  await window.keyboard.type('See @sample');
  await window.waitForTimeout(400);
  const mentionSuggestionVisible = !(await window.isHidden('#deadline-mention-suggestions'));
  console.log('mention autocomplete suggestions visible:', mentionSuggestionVisible);
  if (!mentionSuggestionVisible) {
    throw new Error('FAIL: typing "@sample" did not show mention autocomplete suggestions');
  }
  await window.press('#deadline-edit-description', 'ArrowDown');
  const mentionActiveAfterArrowDown = await window.$eval('#deadline-mention-suggestions li', (el) =>
    el.classList.contains('active')
  );
  console.log('first mention suggestion active after ArrowDown:', mentionActiveAfterArrowDown);
  if (!mentionActiveAfterArrowDown) {
    throw new Error('FAIL: ArrowDown did not mark the first mention suggestion as active');
  }
  await window.press('#deadline-edit-description', 'Enter');
  await window.waitForTimeout(200);
  const descriptionAfterMentionInsert = await window.inputValue('#deadline-edit-description');
  console.log('description after ArrowDown+Enter mention insert:', descriptionAfterMentionInsert);
  if (!descriptionAfterMentionInsert.includes('@[sample-lecture-notes.md](resource:')) {
    throw new Error(`FAIL: ArrowDown+Enter did not insert a mention token: ${descriptionAfterMentionInsert}`);
  }
  await window.keyboard.type('for the format.');
  await window.click('#deadline-save-button');
  await window.waitForTimeout(300);

  await window.click(`li[data-deadline-id="${deadlineIds[0]}"] .deadline-title`);
  await window.waitForTimeout(300);
  const mentionLinkText = await window.textContent('#deadline-view-description .deadline-mention');
  console.log('rendered mention link text:', mentionLinkText);
  if (!mentionLinkText || !mentionLinkText.includes('sample-lecture-notes.md')) {
    throw new Error(`FAIL: description mention did not render as expected, got ${JSON.stringify(mentionLinkText)}`);
  }
  await window.click('#deadline-view-description .deadline-mention');
  await window.waitForTimeout(400);
  const previewVisibleAfterMentionClick = !(await window.isHidden('#preview-overlay'));
  console.log('preview opened by clicking a description mention:', previewVisibleAfterMentionClick);
  if (!previewVisibleAfterMentionClick) {
    throw new Error('FAIL: clicking a description mention did not open the referenced resource');
  }
  await window.click('#preview-close');
  await window.waitForTimeout(200);

  // Editing: title/kind changes on an existing deadline should persist, not
  // create a duplicate.
  await window.click(`li[data-deadline-id="${deadlineIds[0]}"] .deadline-title`);
  await window.waitForTimeout(300);
  await window.click('#deadline-edit-button');
  await window.waitForTimeout(300);
  await window.fill('#deadline-edit-title', 'Homework 1 (revised)');
  await window.click('#deadline-save-button');
  await window.waitForTimeout(300);
  const titlesAfterEdit = await window.$$eval('#deadline-list li.deadline-item .deadline-title', (els) =>
    els.map((e) => e.textContent)
  );
  console.log('deadline titles after editing one:', titlesAfterEdit);
  if (!titlesAfterEdit.includes('Homework 1 (revised)') || titlesAfterEdit.includes('Homework 1')) {
    throw new Error(`FAIL: editing a deadline did not update it in place: ${JSON.stringify(titlesAfterEdit)}`);
  }
  if ((await window.$$('#deadline-list li.deadline-item')).length !== 3) {
    throw new Error('FAIL: editing a deadline created a duplicate instead of updating it');
  }

  // Today/Tomorrow relative labels — a deadline due today or tomorrow should
  // show that word instead of the date; a deadline further out should not.
  // Local date components, not toISOString() — that's UTC, which can be a
  // different calendar day than local "today" depending on timezone offset,
  // and the app's own "Today"/"Tomorrow" comparison is deliberately local
  // (see formatDueDate in renderer.ts).
  const now = new Date();
  const todayTyped = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
  await window.click('#new-deadline-button');
  await window.waitForTimeout(300);
  await fillDeadlineForm({ title: 'Due today', kind: 'manual', date: todayTyped });
  await window.click('#deadline-save-button');
  await window.waitForTimeout(300);
  const todayDeadlineDue = await window.textContent(
    `li:has-text("Due today") .deadline-due`
  );
  console.log('due-today deadline shows:', todayDeadlineDue);
  if (!todayDeadlineDue.includes('Today')) {
    throw new Error(`FAIL: a deadline due today should show "Today", got "${todayDeadlineDue}"`);
  }

  // "Due today" sorts to the top (earliest due date, incomplete) rather than
  // the bottom, so find it by content instead of assuming a position.
  const dueTodayId = await window.$eval('li.deadline-item:has-text("Due today")', (el) =>
    Number(el.dataset.deadlineId)
  );
  await window.evaluate((id) => window.atlas.deleteDeadline(id), dueTodayId);
  await window.click('#course-list li'); // reselect to force a refresh
  await window.waitForTimeout(300);
  const deadlineTitlesAfterDelete = await window.$$eval(
    '#deadline-list li.deadline-item .deadline-title',
    (els) => els.map((e) => e.textContent)
  );
  console.log('deadlines after delete:', deadlineTitlesAfterDelete);
  if (deadlineTitlesAfterDelete.some((t) => t === 'Due today')) {
    throw new Error('FAIL: deadline still present after delete');
  }

  // Menu bar auto-hidden by default (per user request, saves screen space) —
  // Alt still reveals it, standard Electron/Chromium behavior on Windows/
  // Linux for an auto-hidden menu bar.
  const menuBarAutoHide = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].isMenuBarAutoHide()
  );
  console.log('menu bar auto-hide enabled:', menuBarAutoHide);
  if (!menuBarAutoHide) {
    throw new Error('FAIL: menu bar is not set to auto-hide');
  }

  // Dashboard (PRD §13): global across every course, not scoped to whatever
  // course happens to be open. At this point the test course still has the
  // markdown resource (added today) and the "Homework 1 (revised)" deadline
  // (incomplete, has a due date) — both should surface here.
  const dashboardResourceTexts = await window.$$eval('#dashboard-resources li', (els) =>
    els.map((e) => e.textContent)
  );
  console.log('dashboard recently-added-resources widget:', dashboardResourceTexts);
  if (!dashboardResourceTexts.some((t) => t && t.includes('sample-lecture-notes.md'))) {
    throw new Error(`FAIL: dashboard did not show the recently added resource: ${JSON.stringify(dashboardResourceTexts)}`);
  }

  const dashboardDeadlineTexts = await window.$$eval('#dashboard-deadlines li', (els) =>
    els.map((e) => e.textContent)
  );
  console.log('dashboard upcoming-deadlines widget:', dashboardDeadlineTexts);
  if (!dashboardDeadlineTexts.some((t) => t && t.includes('Homework 1 (revised)'))) {
    throw new Error(`FAIL: dashboard did not show the upcoming deadline: ${JSON.stringify(dashboardDeadlineTexts)}`);
  }

  const dashboardActivityTexts = await window.$$eval('#dashboard-activity li', (els) =>
    els.map((e) => e.textContent)
  );
  console.log('dashboard what-changed-today widget:', dashboardActivityTexts);
  if (!dashboardActivityTexts.some((t) => t && t.includes('sample-lecture-notes.md'))) {
    throw new Error(`FAIL: dashboard "what changed today" missing today's resource: ${JSON.stringify(dashboardActivityTexts)}`);
  }

  // Clicking a dashboard item should select its course and open it directly
  // — same navigation pattern as a global search result.
  await window.click('#dashboard-deadlines li');
  await window.waitForTimeout(400);
  const deadlineViewerVisibleFromDashboard = !(await window.isHidden('#deadline-editor-overlay'));
  console.log('deadline viewer opened from dashboard:', deadlineViewerVisibleFromDashboard);
  if (!deadlineViewerVisibleFromDashboard) {
    throw new Error('FAIL: clicking a dashboard deadline did not open the deadline viewer');
  }
  await window.click('#deadline-view-close');
  await window.waitForTimeout(200);

  await window.click('#dashboard-resources li');
  await window.waitForTimeout(400);
  const previewVisibleFromDashboard = !(await window.isHidden('#preview-overlay'));
  console.log('resource preview opened from dashboard:', previewVisibleFromDashboard);
  if (!previewVisibleFromDashboard) {
    throw new Error('FAIL: clicking a dashboard resource did not open its preview');
  }
  await window.click('#preview-close');
  await window.waitForTimeout(200);

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

  // Note images: inserted via Crepe's image block (slash menu -> Image ->
  // upload), must survive both an app restart and the read-only browser
  // view. Regression guard for a real bug found during development: the
  // local HTTP server used to pick a random port every launch, and the
  // image URL gets baked directly into the saved note markdown — so a
  // previously-inserted image 404'd on the very next launch once the port
  // changed. Fixed by pinning the server to a fixed port (localServer.ts).
  await window.click('#new-note-button');
  await window.waitForTimeout(500);
  const imageNoteEditableSelector = '.milkdown [contenteditable="true"]';
  await window.click(imageNoteEditableSelector, { force: true });
  await window.keyboard.type('/');
  await window.waitForTimeout(400);
  const imageMenuItem = await window.$('.milkdown-slash-menu >> text=Image');
  await imageMenuItem.click();
  await window.waitForTimeout(400);

  const noteTestImagePath = path.join(testDataDir, 'note-test-image.png');
  fs.writeFileSync(
    noteTestImagePath,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    )
  );
  const noteImageFileInput = await window.$('input[type="file"]');
  await noteImageFileInput.setInputFiles(noteTestImagePath);
  await window.waitForTimeout(1000);

  const imageSrcBeforeClose = await window.$eval('.milkdown img', (el) => el.getAttribute('src'));
  console.log('note image src:', imageSrcBeforeClose);
  if (!imageSrcBeforeClose.includes('/note-image/')) {
    throw new Error(`FAIL: note image src is not a stable local-server URL: ${imageSrcBeforeClose}`);
  }

  await window.click('#note-close');
  await window.waitForTimeout(300);
  const imageNoteId = await window.$eval('#note-list li', (el) => Number(el.dataset.noteId));

  // The exported .md file must link back to this course's own notes/note-images/
  // store via a relative path, not a per-note copy — no duplicated image bytes.
  const exportedNoteFiles = fs.readdirSync(path.join(testDataDir, 'files', 'Watch Test Course', 'notes'));
  console.log('files in notes/ after image insert (should be just the .md, no .assets folder):', exportedNoteFiles);
  if (exportedNoteFiles.some((f) => f.endsWith('.assets'))) {
    throw new Error('FAIL: a per-note .assets folder was created — images should be linked, not duplicated');
  }
  const exportedMdWithImage = exportedNoteFiles.find((f) => f.endsWith('.md'));
  // Regression guard: a note whose first line is only an image (no other
  // text yet) must not derive a title/filename from the image's alt
  // text/URL — this produced a garbage filename during development.
  if (exportedMdWithImage.includes('http') || exportedMdWithImage.includes('note-image')) {
    throw new Error(`FAIL: exported filename derived from image markup, not skipped: ${exportedMdWithImage}`);
  }
  const exportedMdContent = fs.readFileSync(
    path.join(testDataDir, 'files', 'Watch Test Course', 'notes', exportedMdWithImage),
    'utf-8'
  );
  const relativeImageLinkMatch = exportedMdContent.match(/\]\(([^)]+)\)/);
  console.log('relative image link in exported file:', relativeImageLinkMatch && relativeImageLinkMatch[1]);
  if (!relativeImageLinkMatch || !relativeImageLinkMatch[1].startsWith('note-images/')) {
    throw new Error(`FAIL: exported note does not link to the course's own notes/note-images/ store: ${exportedMdContent}`);
  }
  const resolvedImagePath = path.resolve(
    path.join(testDataDir, 'files', 'Watch Test Course', 'notes'),
    relativeImageLinkMatch[1]
  );
  if (!fs.existsSync(resolvedImagePath)) {
    throw new Error(`FAIL: relative image link does not resolve to a real file: ${resolvedImagePath}`);
  }

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

  await relaunchedWindow.click('#course-list li');
  await relaunchedWindow.waitForTimeout(300);
  await relaunchedWindow.click(`li[data-note-id="${imageNoteId}"]`);
  await relaunchedWindow.waitForTimeout(800);
  const imageLoadedAfterRelaunch = await relaunchedWindow.$eval(
    '.milkdown img',
    (el) => el.complete && el.naturalWidth > 0
  );
  console.log('note image still loads after a fresh relaunch:', imageLoadedAfterRelaunch);
  if (!imageLoadedAfterRelaunch) {
    throw new Error('FAIL: note image did not survive a fresh app relaunch');
  }
  await relaunchedWindow.click('#note-close');
  await relaunchedWindow.waitForTimeout(200);

  const noteImageBrowserUrl = await relaunchedWindow.evaluate(
    (id) => window.atlas.getNoteBrowserUrl(id),
    imageNoteId
  );
  const imageNoteResponse = await fetch(noteImageBrowserUrl);
  const imageNoteHtml = await imageNoteResponse.text();
  const imgSrcInBrowserView = imageNoteHtml.match(/<img[^>]*src="([^"]+)"/);
  if (!imgSrcInBrowserView) throw new Error('FAIL: browser view of the note has no <img> tag');
  const imageFetchViaBrowserView = await fetch(imgSrcInBrowserView[1]);
  console.log('note image fetch via browser view ok:', imageFetchViaBrowserView.ok);
  if (!imageFetchViaBrowserView.ok) {
    throw new Error('FAIL: note image is not reachable from the read-only browser view');
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
