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

  // Checked-in 2-page PDF fixture (plain printed text) for the handwritten-
  // notes/OCR import test — same ATLAS_TEST_*_PATH(S) escape-hatch pattern as
  // ATLAS_TEST_UPLOAD_PATH above, since the native multi-select dialog can't
  // be driven by Playwright either.
  const testScanPath = path.join(__dirname, 'fixtures', 'sample-scan.pdf');

  const app = await electron.launch({
    args: [path.join(__dirname, '..')],
    env: {
      ...process.env,
      ATLAS_DATA_DIR: testDataDir,
      ATLAS_TEST_UPLOAD_PATH: testUploadPath,
      ATLAS_TEST_SCAN_PATHS: testScanPath,
    },
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

  // The sidebar is real page-switching (not a scroll shortcut) — most tests
  // below need the right page active before clicking something on it.
  async function goToPage(name) {
    await window.click(`.sidebar-nav-item[data-page="${name}"]`);
    await window.waitForTimeout(300);
  }

  // Upload/New Note both open the course-picker modal now (real search +
  // list, not the small anchored popup it replaced) — select the course by
  // name, then (Upload only) confirm via Browse, which goes through the
  // same ATLAS_TEST_UPLOAD_PATH test hook as a direct upload.
  async function uploadViaModal(courseName) {
    await window.click('#upload-button');
    await window.waitForTimeout(200);
    await window.click(`#course-picker-list li:has-text("${courseName}")`);
    await window.waitForTimeout(150);
    await window.click('#course-picker-browse');
    await window.waitForTimeout(300);
  }

  async function createNoteViaModal(courseName) {
    await window.click('#new-note-button');
    await window.waitForTimeout(200);
    await window.click(`#course-picker-list li:has-text("${courseName}")`);
    await window.waitForTimeout(400);
  }

  // --- Sidebar nav: genuine page switching, not a decorative scroll shortcut.
  await goToPage('courses');
  let coursesPageHidden = await window.getAttribute('#page-courses', 'hidden');
  let dashboardPageHidden = await window.getAttribute('#page-dashboard', 'hidden');
  console.log('after clicking Courses — courses page hidden:', coursesPageHidden, 'dashboard page hidden:', dashboardPageHidden);
  if (coursesPageHidden !== null) throw new Error('FAIL: Courses page did not become visible');
  if (dashboardPageHidden === null) throw new Error('FAIL: Dashboard page did not hide when switching to Courses');
  const coursesNavActive = await window.evaluate(() =>
    document.querySelector('.sidebar-nav-item[data-page="courses"]').classList.contains('active')
  );
  if (!coursesNavActive) throw new Error('FAIL: Courses sidebar nav item did not become active');

  const beforeCount = (await window.$$('#course-list [data-course-id]')).length;
  console.log('courses before:', beforeCount);

  // "+ Add course" is a rare action (a handful of courses per semester) —
  // the form stays tucked behind this toggle rather than always on screen.
  await window.click('#add-course-toggle');
  await window.waitForTimeout(150);
  await window.fill('#course-name', 'Verify Script Test Course');
  await window.fill('#course-code', 'VERIFY101');
  await window.fill('#course-term', 'Monsoon 26');
  await window.click('#course-form button[type="submit"]');
  await window.waitForTimeout(300);
  const formHiddenAfterSubmit = await window.getAttribute('#course-form', 'hidden');
  if (formHiddenAfterSubmit === null) throw new Error('FAIL: course-form did not hide itself after submit');

  const items = await window.$$eval('#course-list [data-course-id]', (els) => els.map((e) => e.textContent));
  console.log('courses after:', items);
  if (!items.some((t) => t && t.includes('Verify Script Test Course'))) {
    throw new Error('FAIL: added course did not appear in the list');
  }
  if (!items.some((t) => t && t.includes('0files'))) {
    throw new Error('FAIL: new course card did not show a resource count');
  }

  // Create a second term so this throwaway-data run can exercise both sides
  // of the semester filter. A fresh verification database otherwise only
  // contains the one Monsoon course created above, so a hard-coded Spring
  // option does not exist to click.
  await window.click('#add-course-toggle');
  await window.waitForTimeout(100);
  await window.fill('#course-name', 'Verify Other Term Course');
  await window.fill('#course-code', 'VERIFY102');
  await window.fill('#course-term', 'Spring 27');
  await window.click('#course-form button[type="submit"]');
  await window.waitForTimeout(250);

  // Semester filter: the first course was created with term "Monsoon 26" above.
  // Filtering to a different term should hide it; filtering back (or to
  // "All semesters") should show it again. Reset to "All" before continuing
  // so the rest of the script can keep finding it in the course collection.
  await window.click('#courses-term-controls [data-term="Spring 27"]');
  await window.waitForTimeout(200);
  const itemsFilteredOut = await window.$$eval('#course-list [data-course-id]', (els) => els.map((e) => e.textContent));
  console.log('courses with Spring 27 filter (should exclude the Monsoon 26 course):', itemsFilteredOut);
  if (itemsFilteredOut.some((t) => t && t.includes('Verify Script Test Course'))) {
    throw new Error('FAIL: semester filter did not hide a course from a different term');
  }
  const persistedFilter = await window.evaluate(() => window.atlas.getSetting('semesterFilter'));
  if (persistedFilter !== 'Spring 27') {
    throw new Error(`FAIL: semester filter selection was not persisted, got ${persistedFilter}`);
  }

  await window.click('#courses-term-controls [data-term=""]');
  await window.waitForTimeout(200);
  const itemsAllSemesters = await window.$$eval('#course-list [data-course-id]', (els) => els.map((e) => e.textContent));
  if (!itemsAllSemesters.some((t) => t && t.includes('Verify Script Test Course'))) {
    throw new Error('FAIL: course did not reappear after resetting semester filter to "All semesters"');
  }
  console.log('semester filter: PASS');

  // Course view toggle (grid default, list alternative) + sort.
  await window.click('#course-view-list');
  await window.waitForTimeout(200);
  let courseListClass = await window.getAttribute('#course-list', 'class');
  if (!courseListClass || !courseListClass.includes('view-list')) {
    throw new Error('FAIL: course list view toggle to "list" did not apply');
  }
  await window.click('#course-view-grid');
  await window.waitForTimeout(200);
  courseListClass = await window.getAttribute('#course-list', 'class');
  if (!courseListClass || !courseListClass.includes('view-grid')) {
    throw new Error('FAIL: course list view toggle back to "grid" did not apply');
  }

  // Theme toggle: dark by default, switches to light via Settings > General
  // (the top-bar quick-toggle was removed — theme switching now lives only
  // in Settings), and persists across a reload (via the same app_settings
  // mechanism as viewMode/semesterFilter).
  const themeBeforeToggle = await window.evaluate(() => document.documentElement.getAttribute('data-theme'));
  console.log('theme before toggle:', themeBeforeToggle);
  if (themeBeforeToggle !== 'dark') throw new Error(`FAIL: expected dark theme by default, got "${themeBeforeToggle}"`);
  await goToPage('settings');
  await window.click('#settings-theme-light');
  await window.waitForTimeout(200);
  let themeAfterToggle = await window.evaluate(() => document.documentElement.getAttribute('data-theme'));
  console.log('theme after toggle:', themeAfterToggle);
  if (themeAfterToggle !== 'light') throw new Error(`FAIL: expected light theme after toggle, got "${themeAfterToggle}"`);
  await window.reload();
  await window.waitForTimeout(500);
  themeAfterToggle = await window.evaluate(() => document.documentElement.getAttribute('data-theme'));
  console.log('theme after reload (should stay light):', themeAfterToggle);
  if (themeAfterToggle !== 'light') throw new Error('FAIL: theme did not persist across a reload');
  await goToPage('settings');
  await window.click('#settings-theme-dark'); // back to dark for the rest of the run
  await window.waitForTimeout(200);

  // Sidebar collapse: icon-only rail, persists across a reload the same way.
  await window.click('#sidebar-collapse-toggle');
  await window.waitForTimeout(200);
  let sidebarCollapsed = await window.evaluate(() => document.getElementById('sidebar').classList.contains('collapsed'));
  console.log('sidebar collapsed after toggle:', sidebarCollapsed);
  if (!sidebarCollapsed) throw new Error('FAIL: sidebar did not collapse on toggle click');
  await window.reload();
  await window.waitForTimeout(500);
  sidebarCollapsed = await window.evaluate(() => document.getElementById('sidebar').classList.contains('collapsed'));
  console.log('sidebar collapsed after reload (should stay collapsed):', sidebarCollapsed);
  if (!sidebarCollapsed) throw new Error('FAIL: sidebar collapse state did not persist across a reload');
  await window.click('#sidebar-collapse-toggle'); // back to expanded for the rest of the run
  await window.waitForTimeout(200);

  // Reload resets to the Dashboard page — go back to Courses.
  await goToPage('courses');

  // Select the course: shows its drill-down (Deadlines + Watched folders)
  // inline on the Courses page — Resources/Notes are separate global pages
  // now, not shown here.
  const courseId = await window.$eval('#course-list [data-course-id]', (el) => Number(el.dataset.courseId));
  await window.click('#course-list [data-course-id]');
  await window.waitForTimeout(200);

  const courseDetailHidden = await window.getAttribute('#courses-detail-view', 'hidden');
  console.log('course detail view hidden after selecting a course:', courseDetailHidden !== null);
  if (courseDetailHidden !== null) throw new Error('FAIL: course detail view did not show after selecting a course');
  const listViewHiddenAfterSelect = await window.getAttribute('#courses-list-view', 'hidden');
  if (listViewHiddenAfterSelect === null) {
    throw new Error('FAIL: course grid should hide once a course detail view is shown');
  }
  const courseDetailHeading = await window.textContent('#course-detail-heading');
  if (!courseDetailHeading.includes('Verify Script Test Course')) {
    throw new Error('FAIL: course detail heading did not show the selected course name');
  }

  // "Back to Courses" returns to the grid, clears selection.
  await window.click('#course-detail-back');
  await window.waitForTimeout(200);
  if ((await window.getAttribute('#courses-list-view', 'hidden')) !== null) {
    throw new Error('FAIL: "Back to Courses" did not show the course grid again');
  }
  if ((await window.getAttribute('#courses-detail-view', 'hidden')) === null) {
    throw new Error('FAIL: "Back to Courses" did not hide the course detail view');
  }
  await window.click('#course-list [data-course-id]');
  await window.waitForTimeout(200);

  // --- Resources page (global — every resource across every course) ---
  await goToPage('resources');
  await uploadViaModal('Verify Script Test Course');

  const resourceItems = await window.$$eval('#all-resources-list [data-resource-id]', (els) => els.map((e) => e.textContent));
  console.log('resources after upload:', resourceItems);
  if (!resourceItems.some((t) => t && t.includes('sample-lecture-notes.md'))) {
    throw new Error('FAIL: uploaded resource did not appear in the resource list');
  }

  // Captured now (list is markdown-only at this point) rather than later,
  // since a later upload (the test image) sorts before it by added_at and
  // would otherwise make "the first .resource-name" ambiguous.
  const markdownResourceId = await window.$eval('#all-resources-list [data-resource-id]', (el) =>
    Number(el.dataset.resourceId)
  );

  // Click the row to open the full overlay preview modal.
  await window.click('#all-resources-list .resource-name');
  await window.waitForTimeout(300);

  const previewVisible = !(await window.isHidden('#preview-overlay'));
  console.log('resources preview overlay visible:', previewVisible);
  if (!previewVisible) throw new Error('FAIL: preview overlay did not open on filename click');

  const previewHtml = await window.innerHTML('#preview-body');
  console.log('preview body contains "Sample lecture notes":', previewHtml.includes('Sample lecture notes'));
  if (!previewHtml.includes('Sample lecture notes')) {
    throw new Error('FAIL: markdown preview did not render expected content');
  }

  // "F" toggles preview fullscreen (the overlay panel expands to fill the
  // whole window), so the user doesn't have to reach for the button —
  // guarded to not fire while typing, so pressing "f" here (with no text
  // field focused) should toggle it on, then off again.
  await window.keyboard.press('f');
  await window.waitForTimeout(200);
  let previewFullscreen = await window.evaluate(() =>
    document.getElementById('preview-overlay').classList.contains('fullscreen')
  );
  console.log('preview overlay fullscreen after pressing "f":', previewFullscreen);
  if (!previewFullscreen) throw new Error('FAIL: pressing "f" did not enter fullscreen preview');
  await window.keyboard.press('f');
  await window.waitForTimeout(200);
  previewFullscreen = await window.evaluate(() =>
    document.getElementById('preview-overlay').classList.contains('fullscreen')
  );
  console.log('preview overlay fullscreen after pressing "f" again:', previewFullscreen);
  if (previewFullscreen) throw new Error('FAIL: pressing "f" again did not exit fullscreen preview');

  // Regression check: zoom controls must stay hidden for a non-image
  // preview. This previously broke because #zoom-controls had an
  // unconditional `display: flex` on its ID selector, which outranked the
  // browser's default `[hidden] { display: none }` rule — same class of
  // bug hit (and fixed) several times now across different elements.
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
  await goToPage('resources'); // force renderResourcesPage() to pick it up
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
  await goToPage('resources');
  await window.click(`[data-resource-id="${imageResourceId}"] .resource-name`);
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
  await window.click(`[data-resource-id="${imageResourceId}"] .resource-name`);
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
  await goToPage('resources');
  await window.click(`[data-resource-id="${txtResource.id}"] .resource-name`);
  await window.waitForTimeout(300);
  const zoomHiddenForTxt = await window.isHidden('#zoom-controls');
  console.log('zoom controls hidden for .txt preview:', zoomHiddenForTxt);
  if (!zoomHiddenForTxt) {
    throw new Error('FAIL: zoom controls visible for a .txt preview');
  }
  await window.click('#preview-close');
  await window.waitForTimeout(200);

  // Drag-and-drop upload directly onto the Resources page. Playwright can't
  // drag a real OS file, so this dispatches a synthetic 'drop' event with an
  // in-page File/DataTransfer — the same DOM API the drop handler consumes,
  // just constructed in the renderer instead of coming from the OS.
  await window.click('#resources-course-rail li:has-text("All Resources")');
  await window.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['dropped content'], 'dropped-all-resources.txt', { type: 'text/plain' }));
    document
      .getElementById('resources-layout')
      .dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  await window.waitForTimeout(300);
  const dropModalVisible = !(await window.isHidden('#course-picker-overlay'));
  console.log('course-picker modal opens on drop with no course filter active:', dropModalVisible);
  if (!dropModalVisible) throw new Error('FAIL: dropping a file with "All Resources" showing did not open the course picker');
  await window.click(`#course-picker-list li:has-text("Verify Script Test Course")`);
  await window.waitForTimeout(300);
  let resourcesAfterDrop = await window.$$eval('#all-resources-list [data-resource-id]', (els) => els.map((e) => e.textContent));
  console.log('resources after drop-then-pick-course upload:', resourcesAfterDrop);
  if (!resourcesAfterDrop.some((t) => t && t.includes('dropped-all-resources.txt'))) {
    throw new Error('FAIL: file dropped with no course filter did not upload after picking a course');
  }

  // With the rail filtered to one course, a drop should upload immediately —
  // no course-picker modal, since there's nothing left to choose.
  await window.click('#resources-course-rail li:has-text("Verify Script Test Course")');
  await window.waitForTimeout(200);
  await window.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['dropped content 2'], 'dropped-filtered.txt', { type: 'text/plain' }));
    document
      .getElementById('resources-layout')
      .dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  await window.waitForTimeout(300);
  if (!(await window.isHidden('#course-picker-overlay'))) {
    throw new Error('FAIL: dropping a file with a course filter active should not open the course picker');
  }
  resourcesAfterDrop = await window.$$eval('#all-resources-list [data-resource-id]', (els) => els.map((e) => e.textContent));
  console.log('resources after direct (filtered) drop:', resourcesAfterDrop);
  if (!resourcesAfterDrop.some((t) => t && t.includes('dropped-filtered.txt'))) {
    throw new Error('FAIL: file dropped with a course filter active did not upload directly');
  }

  // Resources sort dropdown (name/recent/kind/course) — positioned next to
  // the view toggle, same grouping/placement as Courses' own sort+toggle.
  await window.click('#resources-sort-controls [data-resource-sort="name"]');
  await window.waitForTimeout(200);
  const namesSorted = await window.$$eval('#all-resources-list .resource-name', (els) =>
    els.map((e) => e.textContent)
  );
  const expectedSorted = [...namesSorted].sort((a, b) => a.localeCompare(b));
  console.log('resources sorted by name:', namesSorted);
  if (JSON.stringify(namesSorted) !== JSON.stringify(expectedSorted)) {
    throw new Error(`FAIL: "Sort by: Name" did not alphabetize the resource list: ${JSON.stringify(namesSorted)}`);
  }

  // Kind-filter chips (All/PDF/Document/Image/.../Other).
  await window.click('#resources-kind-filter .resource-kind-control[data-kind-filter="image"]');
  await window.waitForTimeout(200);
  const imageFilteredTexts = await window.$$eval('#all-resources-list [data-resource-id]', (els) => els.map((e) => e.textContent));
  console.log('resources with "Image" chip filter:', imageFilteredTexts);
  if (!imageFilteredTexts.some((t) => t.includes('test-image.png')) || imageFilteredTexts.some((t) => t.includes('grades.xlsx'))) {
    throw new Error(`FAIL: Image chip filter did not correctly scope the list: ${JSON.stringify(imageFilteredTexts)}`);
  }
  await window.click('#resources-kind-filter .resource-kind-control[data-kind-filter=""]');
  await window.waitForTimeout(200);

  // Course rail filter.
  await window.click(`#resources-course-rail li:has-text("Verify Script Test Course")`);
  await window.waitForTimeout(200);
  const courseFilteredTexts = await window.$$eval('#all-resources-list [data-resource-id]', (els) => els.map((e) => e.textContent));
  console.log('resources filtered to one course:', courseFilteredTexts.length, 'items');
  if (courseFilteredTexts.length === 0) {
    throw new Error('FAIL: course rail filter produced no results for a course with resources');
  }
  await window.click('#resources-course-rail li:has-text("All Resources")');
  await window.waitForTimeout(200);

  // Grid view toggle.
  await window.click('#view-grid');
  await window.waitForTimeout(200);
  const listClass = await window.getAttribute('#all-resources-list', 'class');
  console.log('all-resources-list class in grid mode:', listClass);
  if (!listClass || !listClass.includes('view-grid')) {
    throw new Error('FAIL: grid view mode did not apply');
  }
  const iconTiles = await window.$$('li.icon-tile');
  if (iconTiles.length === 0) throw new Error('FAIL: no icon tiles rendered in grid view');

  // View mode is meant to be a single app-wide, persisted preference (not
  // per-course, not reset on relaunch) — confirm the choice actually landed
  // in app_settings via the same getSetting() init() reads on startup.
  const savedViewMode = await window.evaluate(() => window.atlas.getSetting('viewMode'));
  console.log('persisted viewMode setting after switching to grid:', savedViewMode);
  if (savedViewMode !== 'grid') {
    throw new Error(`FAIL: view mode was not persisted, got ${savedViewMode}`);
  }

  await window.click('#view-list');
  await window.waitForTimeout(200);
  const savedViewModeAfterList = await window.evaluate(() => window.atlas.getSetting('viewMode'));
  if (savedViewModeAfterList !== 'list') {
    throw new Error(`FAIL: view mode did not persist back to list, got ${savedViewModeAfterList}`);
  }

  // --- Notes page (global — every note across every course) ---
  // Create, type live-rendered markdown content (including the "- "
  // bullet-list shortcut — the whole reason Milkdown/Crepe was chosen over
  // Toast UI Editor, which didn't support it), confirm autosave, close/
  // reopen to confirm persistence, then delete.
  await goToPage('notes');
  await createNoteViaModal('Verify Script Test Course');
  const noteEditorVisible = !(await window.isHidden('#note-overlay'));
  console.log('notes editor pane visible:', noteEditorVisible);
  if (!noteEditorVisible) throw new Error('FAIL: note editor did not open on "New note"');

  // "View original scan" must stay hidden for a typed note — only notes
  // created via "+ Import scan" (is_handwritten) should ever show it.
  const scanToggleHiddenForTypedNote = await window.isHidden('#note-view-scan');
  console.log('"View original scan" hidden for a typed note:', scanToggleHiddenForTypedNote);
  if (!scanToggleHiddenForTypedNote) {
    throw new Error('FAIL: "View original scan" should be hidden for a typed (non-handwritten) note');
  }

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

  // "F" toggles genuine fullscreen (overlay panel grows to cover the whole
  // window, see .fullscreen in styles.css — distinct from the "expand width"
  // button, which only widens the overlay panel), but only when not actually
  // typing in the note — typing "f" into the editor itself must produce a
  // literal "f", never hijacked into a fullscreen toggle.
  await window.keyboard.type('f');
  await window.waitForTimeout(200);
  let noteFullscreenWhileTyping = await window.evaluate(() =>
    document.getElementById('note-overlay').classList.contains('fullscreen')
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
    document.getElementById('note-overlay').classList.contains('fullscreen')
  );
  console.log('note fullscreen after pressing "f" outside a text field:', noteFullscreen);
  if (!noteFullscreen) throw new Error('FAIL: pressing "f" did not enter note fullscreen');
  await window.keyboard.press('f');
  await window.waitForTimeout(200);
  noteFullscreen = await window.evaluate(() =>
    document.getElementById('note-overlay').classList.contains('fullscreen')
  );
  console.log('note fullscreen after pressing "f" again:', noteFullscreen);
  if (noteFullscreen) throw new Error('FAIL: pressing "f" again did not exit note fullscreen');

  await window.click('#note-close');
  await window.waitForTimeout(300);

  const noteListAfterClose = await window.$$eval('#all-notes-list li[data-note-id]', (els) =>
    els.map((e) => e.textContent)
  );
  console.log('notes after close:', noteListAfterClose);
  if (!noteListAfterClose.some((t) => t && t.includes('W1L1'))) {
    throw new Error('FAIL: created note did not appear in the note list with its title');
  }
  // Grouped by recency (Today/This week/Older) — a freshly-created note
  // must land under "Today".
  const todayGroupText = await window.textContent('.notes-group-header');
  if (!todayGroupText.includes('Today')) {
    throw new Error(`FAIL: expected the "Today" group header first, got "${todayGroupText}"`);
  }

  const noteId = await window.$eval('#all-notes-list li[data-note-id]', (el) => Number(el.dataset.noteId));
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
  await goToPage('notes'); // force a refresh
  await window.waitForTimeout(300);
  const noteListAfterDelete = await window.$$eval('#all-notes-list li[data-note-id]', (els) =>
    els.map((e) => e.textContent)
  );
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
  await createNoteViaModal('Verify Script Test Course');
  await window.click(noteEditableSelector, { force: true });
  await window.keyboard.type('W2L3 Recap');
  await window.waitForTimeout(150);
  await window.keyboard.press('Control+a');
  await window.keyboard.press('Control+b');
  await window.waitForTimeout(1200);
  await window.click('#note-close');
  await window.waitForTimeout(300);
  const boldTitleInList = await window.textContent('#all-notes-list li[data-note-id] .note-item-title');
  console.log('title derived from a bolded first line:', boldTitleInList);
  if (!boldTitleInList.includes('W2L3 Recap') || boldTitleInList.includes('**')) {
    throw new Error(`FAIL: title should be "W2L3 Recap" with no markdown markers, got "${boldTitleInList}"`);
  }
  const boldNoteIdActual = await window.$eval('#all-notes-list li[data-note-id]', (el) => Number(el.dataset.noteId));
  await window.evaluate((id) => window.atlas.deleteNote(id), boldNoteIdActual);
  await goToPage('notes');

  // --- Phase 2: handwritten notes (opt-in OCR import) ---
  // Import no longer runs OCR automatically (the user found local Tesseract's
  // accuracy on real handwriting too poor to trust silently) — it just
  // stores the original scan on a blank note. OCR is a separate, explicit
  // "Run OCR" action reviewed before being accepted into the note.
  //
  // PDF path via the native-dialog test hook (ATLAS_TEST_SCAN_PATHS, set at
  // launch above) — the fixture has 2 pages of plain printed text, so this
  // also exercises the multi-page join (page texts separated by "---").
  await window.click('#import-scan-button');
  await window.waitForTimeout(200);
  await window.click('#course-picker-list li:has-text("Verify Script Test Course")');
  await window.waitForTimeout(200);
  await window.click('#course-picker-browse');
  await window.waitForTimeout(500); // just a file copy now, no OCR
  const modalHiddenAfterImport = await window.isHidden('#course-picker-overlay');
  console.log('course-picker modal closed after scan import finished:', modalHiddenAfterImport);
  if (!modalHiddenAfterImport) throw new Error('FAIL: course-picker modal did not close after scan import finished');

  const pdfNote = await window.evaluate(async () => {
    const notes = await window.atlas.listAllNotes();
    return notes.find((n) => n.is_handwritten && n.image_path && n.image_path.endsWith('sample-scan.pdf'));
  });
  console.log('PDF scan note:', pdfNote && { title: pdfNote.title, content_markdown: pdfNote.content_markdown, image_path: pdfNote.image_path });
  if (!pdfNote) throw new Error('FAIL: importing the PDF fixture did not create a handwritten note');
  if (pdfNote.content_markdown !== '') {
    throw new Error(`FAIL: a freshly imported scan should have no content until OCR is run and accepted, got ${JSON.stringify(pdfNote.content_markdown)}`);
  }
  if (pdfNote.title !== 'sample-scan') {
    throw new Error(`FAIL: an un-OCR'd scan's title should default to the filename, got "${pdfNote.title}"`);
  }
  if (!fs.existsSync(pdfNote.image_path)) {
    throw new Error('FAIL: the copied original scan file does not exist on disk');
  }

  // The handwritten badge (✍️) should distinguish it from a typed note in the list.
  const pdfNoteTitleInList = await window.textContent(
    `#all-notes-list li[data-note-id="${pdfNote.id}"] .note-item-title`
  );
  console.log('handwritten note title in list:', pdfNoteTitleInList);
  if (!pdfNoteTitleInList.includes('✍️')) {
    throw new Error(`FAIL: handwritten note should show a badge in the list, got "${pdfNoteTitleInList}"`);
  }

  // "View original scan" — hidden for a typed note, shown for this one. A
  // handwritten note's editor is blank until OCR is run and accepted, so
  // opening the note should show the original scan by default (not an
  // empty editor) — the toggle switches to the editor/OCR view instead.
  await window.click(`#all-notes-list li[data-note-id="${pdfNote.id}"]`);
  await window.waitForTimeout(500);
  const scanToggleVisible = !(await window.isHidden('#note-view-scan'));
  console.log('"View original scan" button visible for a handwritten note:', scanToggleVisible);
  if (!scanToggleVisible) throw new Error('FAIL: "View original scan" should be visible for a handwritten note');

  const scanPanelVisibleByDefault = !(await window.isHidden('#note-scan-panel'));
  const editorHiddenByDefault = await window.isHidden('#note-editor-root');
  const scanIframeSrcByDefault = await window.getAttribute('#note-scan-panel iframe', 'src').catch(() => null);
  console.log(
    'scan shown by default for a handwritten note:',
    scanPanelVisibleByDefault,
    '— editor hidden:',
    editorHiddenByDefault,
    '— iframe src:',
    scanIframeSrcByDefault
  );
  if (!scanPanelVisibleByDefault || !editorHiddenByDefault || !scanIframeSrcByDefault) {
    throw new Error('FAIL: opening a handwritten note should show the original scan by default, not the editor');
  }

  // Toggling switches to the editor/OCR view, and back again to the scan —
  // a real toggle between two full views, not a split layout.
  await window.click('#note-view-scan');
  await window.waitForTimeout(300);
  const editorShownAfterToggle = !(await window.isHidden('#note-editor-root'));
  const scanHiddenAfterToggle = await window.isHidden('#note-scan-panel');
  console.log('editor shown after toggling to notes view:', editorShownAfterToggle, '— scan hidden:', scanHiddenAfterToggle);
  if (!editorShownAfterToggle || !scanHiddenAfterToggle) {
    throw new Error('FAIL: toggling "View original scan" should switch to the editor view');
  }
  await window.click('#note-view-scan');
  await window.waitForTimeout(300);
  const scanShownAfterToggleBack = !(await window.isHidden('#note-scan-panel'));
  console.log('scan shown after toggling back:', scanShownAfterToggleBack);
  if (!scanShownAfterToggleBack) throw new Error('FAIL: toggling "View original scan" again should restore the scan view');

  // Switch back to the editor view for the "Run OCR" test below.
  await window.click('#note-view-scan');
  await window.waitForTimeout(300);

  // "Run OCR" — shows a review panel with the extracted text; discarding
  // must leave the note's content untouched.
  const ocrButtonVisible = !(await window.isHidden('#note-run-ocr'));
  console.log('"Run OCR" button visible for a handwritten note:', ocrButtonVisible);
  if (!ocrButtonVisible) throw new Error('FAIL: "Run OCR" should be visible for a handwritten note');
  await window.click('#note-run-ocr');
  await window.waitForTimeout(8000); // real OCR round-trip, not mocked
  const ocrPreviewVisible = !(await window.isHidden('#note-ocr-preview'));
  const ocrPreviewText = await window.textContent('#note-ocr-preview-text');
  console.log('OCR preview visible:', ocrPreviewVisible, '— text:', JSON.stringify(ocrPreviewText));
  if (!ocrPreviewVisible || !ocrPreviewText.includes('SCAN PAGE ONE') || !ocrPreviewText.includes('SCAN PAGE TWO')) {
    throw new Error(`FAIL: OCR preview should show both pages' text, got ${JSON.stringify(ocrPreviewText)}`);
  }
  await window.click('#note-ocr-discard');
  await window.waitForTimeout(200);
  if (!(await window.isHidden('#note-ocr-preview'))) throw new Error('FAIL: "Discard" did not hide the OCR preview');
  const contentAfterDiscard = await window.evaluate(async (id) => {
    const notes = await window.atlas.listAllNotes();
    return notes.find((n) => n.id === id).content_markdown;
  }, pdfNote.id);
  if (contentAfterDiscard !== '') {
    throw new Error(`FAIL: discarding an OCR result should leave the note's content untouched, got ${JSON.stringify(contentAfterDiscard)}`);
  }

  // Running it again and accepting this time should insert the text and
  // re-derive the title from it, same as typing would.
  await window.click('#note-run-ocr');
  await window.waitForTimeout(8000);
  await window.click('#note-ocr-insert');
  await window.waitForTimeout(500);
  const acceptedNote = await window.evaluate(async (id) => {
    const notes = await window.atlas.listAllNotes();
    return notes.find((n) => n.id === id);
  }, pdfNote.id);
  console.log('note after accepting OCR:', { title: acceptedNote.title, content_markdown: acceptedNote.content_markdown });
  if (!acceptedNote.content_markdown.includes('SCAN PAGE ONE') || !acceptedNote.content_markdown.includes('SCAN PAGE TWO')) {
    throw new Error(`FAIL: accepting OCR should insert both pages' text, got ${JSON.stringify(acceptedNote.content_markdown)}`);
  }
  if (acceptedNote.title !== 'SCAN PAGE ONE') {
    throw new Error(`FAIL: title should re-derive from the accepted OCR text, got "${acceptedNote.title}"`);
  }

  // Two-stage Escape: while actively typing, the first Escape only blurs
  // out of editing (note stays open) — a second Escape then closes it.
  await window.click('.milkdown [contenteditable="true"]', { force: true });
  await window.keyboard.type('typing before escape');
  await window.waitForTimeout(200);
  await window.keyboard.press('Escape');
  await window.waitForTimeout(200);
  const noteOpenAfterFirstEscape = !(await window.isHidden('#note-overlay'));
  console.log('note still open after first Escape while typing:', noteOpenAfterFirstEscape);
  if (!noteOpenAfterFirstEscape) throw new Error('FAIL: first Escape while typing should not close the note');
  await window.keyboard.press('Escape');
  await window.waitForTimeout(300);
  const noteClosedAfterSecondEscape = await window.isHidden('#note-overlay');
  console.log('note closed after second Escape:', noteClosedAfterSecondEscape);
  if (!noteClosedAfterSecondEscape) throw new Error('FAIL: second Escape (nothing focused) should close the note');

  // A single Escape should close the note if it's only being viewed —
  // nothing focused inside it to begin with — a fresh open, no extra click,
  // since clicking into the scan panel below (a PDF iframe, by default for a
  // handwritten note) would steal keyboard focus into it, and the top-level
  // Escape listener would never see the keypress at all: a real focus-trap
  // risk, not just a test artifact, so this deliberately avoids that click.
  await window.click(`#all-notes-list li[data-note-id="${pdfNote.id}"]`);
  await window.waitForTimeout(300);
  await window.keyboard.press('Escape');
  await window.waitForTimeout(300);
  const noteClosedAfterViewingEscape = await window.isHidden('#note-overlay');
  console.log('note closed after a single Escape while just viewing:', noteClosedAfterViewingEscape);
  if (!noteClosedAfterViewingEscape) throw new Error('FAIL: a single Escape should close a note that is only being viewed');

  // Image path via drag-and-drop (synthetic DragEvent/DataTransfer/File,
  // same technique as the Resources drag-and-drop tests — Playwright can't
  // drag a real OS file) — a PNG with real rendered text, generated at
  // runtime with @napi-rs/canvas rather than checked in as a binary fixture.
  // Only checks the import itself here (blank note, original attached);
  // the Run OCR review/accept/discard flow is already covered above.
  const scanImageBase64 = (() => {
    const { createCanvas } = require('@napi-rs/canvas');
    const c = createCanvas(320, 100);
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 320, 100);
    ctx.fillStyle = 'black';
    ctx.font = '28px sans-serif';
    ctx.fillText('DROPPED SCAN TEXT', 10, 55);
    return c.toBuffer('image/png').toString('base64');
  })();
  await window.click('#import-scan-button');
  await window.waitForTimeout(200);
  await window.click('#course-picker-list li:has-text("Verify Script Test Course")');
  await window.waitForTimeout(200);
  await window.evaluate((base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'dropped-scan.png', { type: 'image/png' }));
    document
      .getElementById('course-picker-dropzone')
      .dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, scanImageBase64);
  await window.waitForTimeout(500);
  const imageScanNote = await window.evaluate(async () => {
    const notes = await window.atlas.listAllNotes();
    return notes.find((n) => n.is_handwritten && n.image_path && n.image_path.endsWith('dropped-scan.png'));
  });
  console.log('dropped-image scan note:', imageScanNote && { title: imageScanNote.title, content_markdown: imageScanNote.content_markdown });
  if (!imageScanNote) throw new Error('FAIL: drag-and-drop image scan import did not create a handwritten note');
  if (imageScanNote.content_markdown !== '') {
    throw new Error('FAIL: a freshly dropped scan should have no content until OCR is run and accepted');
  }

  // --- On-demand OCR for regular (non-handwritten) Resources PDFs ---
  // open-questions.md #18: OCR is also useful for a typed/printed PDF
  // with no text layer (e.g. a scanned book) — a separate, on-demand action
  // on the Resources preview, reusing the same fixture and the same
  // opt-in/reviewed shape as the Notes OCR flow above (never silently
  // trusted; must be explicitly saved to become searchable).
  await app.evaluate((_electron, fp) => {
    process.env.ATLAS_TEST_UPLOAD_PATH = fp;
  }, testScanPath);
  const scanPdfResource = await window.evaluate((cid) => window.atlas.uploadResource(cid), courseId);
  if (!scanPdfResource) throw new Error('FAIL: uploading the PDF fixture as a resource did not return a resource');
  await goToPage('resources');
  await window.click(`[data-resource-id="${scanPdfResource.id}"] .resource-name`);
  await window.waitForTimeout(300);

  const ocrResourceButtonVisible = !(await window.isHidden('#preview-run-ocr'));
  console.log('"Run OCR" visible for a PDF resource:', ocrResourceButtonVisible);
  if (!ocrResourceButtonVisible) throw new Error('FAIL: "Run OCR" should be visible for a PDF resource preview');
  // The original PDF must still be what's showing by default (not any OCR
  // view) — Run OCR is purely an opt-in extra, never the default preview.
  const pdfIframeSrcBeforeOcr = await window.getAttribute('#preview-body iframe', 'src').catch(() => null);
  console.log('PDF iframe src before running OCR:', pdfIframeSrcBeforeOcr);
  if (!pdfIframeSrcBeforeOcr) throw new Error('FAIL: opening a PDF resource should show the original PDF by default');

  await window.click('#preview-run-ocr');
  await window.waitForTimeout(8000); // real OCR round-trip, not mocked
  const resourceOcrReviewVisible = !(await window.isHidden('#preview-ocr-review'));
  const resourceOcrReviewText = await window.textContent('#preview-ocr-review-text');
  console.log('resource OCR review visible:', resourceOcrReviewVisible, '— text:', JSON.stringify(resourceOcrReviewText));
  if (!resourceOcrReviewVisible || !resourceOcrReviewText.includes('SCAN PAGE ONE') || !resourceOcrReviewText.includes('SCAN PAGE TWO')) {
    throw new Error(`FAIL: OCR review should show both pages' text, got ${JSON.stringify(resourceOcrReviewText)}`);
  }

  // Discarding must leave the resource unsearchable (nothing written to ocr_text).
  await window.click('#preview-ocr-discard');
  await window.waitForTimeout(200);
  if (!(await window.isHidden('#preview-ocr-review'))) throw new Error('FAIL: "Discard" did not hide the OCR review panel');
  const searchResultsBeforeSave = await window.evaluate(() => window.atlas.search('SCAN PAGE ONE'));
  console.log('search results before saving OCR text:', searchResultsBeforeSave.length);
  if (searchResultsBeforeSave.some((r) => r.entityId === scanPdfResource.id && r.entityType === 'resource')) {
    throw new Error('FAIL: discarding OCR text should not make the resource searchable');
  }

  // Running it again and saving should write ocr_text and make it searchable.
  await window.click('#preview-run-ocr');
  await window.waitForTimeout(8000);
  await window.click('#preview-ocr-save');
  await window.waitForTimeout(300);
  const searchResultsAfterSave = await window.evaluate(() => window.atlas.search('SCAN PAGE ONE'));
  console.log('search results after saving OCR text:', searchResultsAfterSave.length);
  if (!searchResultsAfterSave.some((r) => r.entityId === scanPdfResource.id && r.entityType === 'resource')) {
    throw new Error('FAIL: saving OCR text should make the resource searchable');
  }
  await window.click('#preview-close');
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

  // Global search (FTS5 over search_index) — searching for the markdown
  // resource uploaded earlier ("sample-lecture-notes.md") should surface
  // that result and clicking it should open the resource preview (on the
  // Resources page).
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

  // Ctrl+L jumps focus to search from anywhere, browser-address-bar style.
  await goToPage('courses');
  await window.keyboard.press('Control+l');
  await window.waitForTimeout(100);
  const focusedElementId = await window.evaluate(() => document.activeElement?.id);
  console.log('focused element after Ctrl+L:', focusedElementId);
  if (focusedElementId !== 'search-input') {
    throw new Error(`FAIL: Ctrl+L did not focus the search input, focused "${focusedElementId}" instead`);
  }
  (await window.$('#search-input'))?.evaluate((el) => el.blur());

  // Navigating to Courses fresh always lands on the grid now (not whichever
  // course's detail view happened to be open before) — reselect the course
  // to reach its detail view (Deadlines/Watched folders) again.
  await window.click('#course-list [data-course-id]');
  await window.waitForTimeout(200);

  // --- Deadlines: nested in the Courses page's drill-down for the selected
  // course. One unified per-course timeline (assignment/reading/quiz/.../
  // manual), sorted incomplete-first then soonest-due-first, with completed
  // items struck through. No separate "Assignments" tab was built — see
  // open-questions.md #13 for why that's deferred.
  // Course detail is a tabbed layout now (session 46 — see
  // open-questions.md) — Deadlines is its own tab, not visible on the
  // default Overview tab.
  await window.click('.course-detail-tab[data-course-tab="deadlines"]');
  await window.waitForTimeout(150);

  async function fillDeadlineForm({ title, kind, date, time, description }) {
    await window.fill('#deadline-edit-title', title);
    if (kind) await window.selectOption('#deadline-edit-kind', kind);
    if (date) await window.fill('#deadline-edit-date-text', date);
    if (time) await window.fill('#deadline-edit-time', time);
    if (description) await window.fill('#deadline-edit-description', description);
  }

  // Saving now reopens the viewer showing the saved deadline (open-questions.md
  // #3 — previously it just closed with no visible confirmation, which is
  // what made a "your edit was silently protected/reset" state impossible to
  // notice without reopening by hand), so each save needs an explicit close
  // before the next action that would otherwise be blocked by the overlay.
  await window.click('#new-deadline-button');
  await window.waitForTimeout(300);
  await fillDeadlineForm({ title: 'Midterm exam', kind: 'exam', date: '15-08-2026' });
  await window.click('#deadline-save-button');
  await window.waitForTimeout(300);
  await window.click('#deadline-view-close');
  await window.waitForTimeout(150);

  await window.click('#new-deadline-button');
  await window.waitForTimeout(300);
  await fillDeadlineForm({ title: 'Homework 1', kind: 'assignment', date: '01-08-2026', time: '23:59' });
  await window.click('#deadline-save-button');
  await window.waitForTimeout(300);
  await window.click('#deadline-view-close');
  await window.waitForTimeout(150);

  await window.click('#new-deadline-button');
  await window.waitForTimeout(300);
  await fillDeadlineForm({ title: 'Read syllabus', kind: 'reading' }); // no due date
  await window.click('#deadline-save-button');
  await window.waitForTimeout(300);
  await window.click('#deadline-view-close');
  await window.waitForTimeout(150);

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

  // Grid view: deadlines share the app-wide list/grid toggle with
  // resources (a shared `viewMode` preference), but has its own toggle
  // buttons on the Courses page — since Deadlines and Resources are
  // separate pages now, the Resources page's toggle isn't reachable while
  // looking at a course's deadlines.
  await window.click('#deadline-view-grid-toggle');
  await window.waitForTimeout(200);
  const deadlineListClassInIcons = await window.getAttribute('#deadline-list', 'class');
  console.log('deadline-list class in grid mode:', deadlineListClassInIcons);
  if (!deadlineListClassInIcons || !deadlineListClassInIcons.includes('view-grid')) {
    throw new Error('FAIL: grid view mode did not apply to the deadline list');
  }
  if ((await window.$$('#deadline-list li.icon-tile')).length === 0) {
    throw new Error('FAIL: no icon tiles rendered for deadlines in icon view');
  }
  await window.click('#deadline-view-list-toggle');
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
  // "@sample-lecture" rather than just "@sample" — the Resources OCR test
  // above added another resource ("sample-scan.pdf") whose name also starts
  // with "sample", which would otherwise ambiguously match first here too.
  await window.keyboard.type('See @sample-lecture');
  await window.waitForTimeout(400);
  const mentionSuggestionVisible = !(await window.isHidden('#deadline-mention-suggestions'));
  console.log('mention autocomplete suggestions visible:', mentionSuggestionVisible);
  if (!mentionSuggestionVisible) {
    throw new Error('FAIL: typing "@sample-lecture" did not show mention autocomplete suggestions');
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
  // Save reopens the viewer showing this exact deadline already (no need to
  // close + re-click it) — go straight to checking the rendered description.
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
  // Clicking the mention above already closed the deadline viewer itself
  // (wireMentionClicks in renderer.ts calls closeDeadlineEditor() before
  // opening the referenced resource) — nothing left to close here.
  await goToPage('courses');
  // Navigating to Courses fresh lands on the grid — reselect the course to
  // reach its detail view (Deadlines) again.
  await window.click('#course-list [data-course-id]');
  await window.waitForTimeout(200);

  // Inline Resources/Notes previews on the course detail page — a short list
  // of this course's own items (not the full global page) plus a "View all"
  // link into the pre-filtered global page.
  const detailResourcePreview = await window.$$eval('#course-detail-resources-preview li', (els) =>
    els.map((e) => e.textContent)
  );
  console.log('course detail resources preview:', detailResourcePreview);
  // Capped at 5 most-recent items — by this point in the run there are more
  // than 5 resources for this course (several drag-and-drop tests added
  // more), so just confirm the preview is non-empty and respects the cap,
  // not which specific items made the cut.
  if (detailResourcePreview.length === 0 || detailResourcePreview.length > 5) {
    throw new Error(`FAIL: course detail resources preview should show 1-5 items, got ${detailResourcePreview.length}`);
  }

  // Clicking a course-detail preview item opens it in place too — the
  // course detail view itself should stay visible, not navigate to Resources.
  await window.click('#course-detail-resources-preview li');
  await window.waitForTimeout(300);
  const previewVisibleFromCourseDetail = !(await window.isHidden('#preview-overlay'));
  const courseDetailStillVisible = await window.isHidden('#courses-detail-view');
  console.log(
    'resource preview opened from course detail without navigating away:',
    previewVisibleFromCourseDetail,
    !courseDetailStillVisible
  );
  if (!previewVisibleFromCourseDetail || courseDetailStillVisible) {
    throw new Error('FAIL: clicking a course detail resource preview item did not open in place');
  }
  await window.click('#preview-close');
  await window.waitForTimeout(200);

  await window.click('#course-detail-view-resources');
  await window.waitForTimeout(300);
  if ((await window.getAttribute('#page-resources', 'hidden')) !== null) {
    throw new Error('FAIL: "View all" (Resources) did not navigate to the Resources page');
  }
  await goToPage('courses');
  await window.click('#course-list [data-course-id]');
  await window.waitForTimeout(200);
  await window.click('.course-detail-tab[data-course-tab="deadlines"]'); // selectCourse() always resets to Overview
  await window.waitForTimeout(150);

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
  await window.click('#deadline-view-close');
  await window.waitForTimeout(150);

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
  await window.click('#deadline-view-close');
  await window.waitForTimeout(150);
  // Reselect to force a deadlines refresh — the grid itself is hidden while
  // the course detail view is showing, so go back to it first (Playwright's
  // click() requires the target to be visible).
  await window.click('#course-detail-back');
  await window.waitForTimeout(150);
  await window.click('#course-list [data-course-id]');
  await window.click('.course-detail-tab[data-course-tab="deadlines"]'); // selectCourse() always resets to Overview
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

  // --- Dashboard: global overview, not scoped to any one course ---
  await goToPage('dashboard');

  // Stat strip above the widgets — real counts, not zeros, now that a
  // course/resources/deadlines exist from earlier in this run.
  const statCourses = await window.textContent('#stat-courses');
  const statResources = await window.textContent('#stat-resources');
  console.log('dashboard stats — courses:', statCourses, 'resources:', statResources);
  if (statCourses !== '1') throw new Error(`FAIL: expected 1 course in the stat strip, got "${statCourses}"`);
  if (Number(statResources) < 1) throw new Error(`FAIL: expected at least 1 resource in the stat strip, got "${statResources}"`);

  const dashboardCourseTexts = await window.$$eval('#dashboard-course-list li', (els) =>
    els.map((e) => e.textContent)
  );
  console.log('dashboard my-courses widget:', dashboardCourseTexts);
  if (!dashboardCourseTexts.some((t) => t && t.includes('Verify Script Test Course'))) {
    throw new Error(`FAIL: dashboard did not list the course: ${JSON.stringify(dashboardCourseTexts)}`);
  }
  const dashboardCourseAvatarText = await window.textContent('#dashboard-course-list .course-avatar');
  if (dashboardCourseAvatarText.trim() !== 'V') {
    throw new Error(`FAIL: expected course avatar initial "V", got "${dashboardCourseAvatarText}"`);
  }
  await window.click('#dashboard-course-list li');
  await window.waitForTimeout(400);
  const onCoursesPageAfterCardClick = await window.getAttribute('#page-courses', 'hidden');
  console.log('on Courses page after clicking a dashboard course card:', onCoursesPageAfterCardClick === null);
  if (onCoursesPageAfterCardClick !== null) {
    throw new Error('FAIL: clicking a dashboard "My courses" entry did not navigate to the Courses page');
  }
  const courseSelectedAfterCardClick = await window.evaluate(
    () => !document.getElementById('courses-detail-view')?.hidden
  );
  if (!courseSelectedAfterCardClick) {
    throw new Error('FAIL: clicking a dashboard "My courses" entry did not select that course');
  }
  await goToPage('dashboard');

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

  // Clicking a dashboard item opens it in place — no page navigation — per
  // the user's explicit request that files not redirect to Resources/Notes
  // when opened from Dashboard. Right-click's "Go to" (tested further below)
  // is the only path that navigates.
  await window.click('#dashboard-deadlines li');
  await window.waitForTimeout(400);
  const deadlineViewerVisibleFromDashboard = !(await window.isHidden('#deadline-editor-overlay'));
  const stillOnDashboardAfterDeadline = (await window.getAttribute('#page-dashboard', 'hidden')) === null;
  console.log(
    'deadline viewer opened from dashboard without navigating away:',
    deadlineViewerVisibleFromDashboard,
    stillOnDashboardAfterDeadline
  );
  if (!deadlineViewerVisibleFromDashboard || !stillOnDashboardAfterDeadline) {
    throw new Error('FAIL: clicking a dashboard deadline did not open in place on Dashboard');
  }
  await window.click('#deadline-view-close');
  await window.waitForTimeout(200);

  await window.click('#dashboard-resources li');
  await window.waitForTimeout(400);
  const stillOnDashboardAfterResource = (await window.getAttribute('#page-dashboard', 'hidden')) === null;
  const previewVisibleFromDashboard = !(await window.isHidden('#preview-overlay'));
  console.log(
    'resource preview opened from dashboard without navigating away:',
    previewVisibleFromDashboard,
    stillOnDashboardAfterResource
  );
  if (!stillOnDashboardAfterResource || !previewVisibleFromDashboard) {
    throw new Error('FAIL: clicking a dashboard resource did not open in place on Dashboard');
  }
  await window.click('#preview-close');
  await window.waitForTimeout(200);

  // Right-click → "Go to" is the one path that does navigate: for a
  // resource, to the Resources page filtered to that course.
  // "Go to" navigates AND opens/previews the item there — the original
  // dashboard-click behavior, now specifically on right-click since
  // left-click became "open in place, don't navigate."
  await window.click('#dashboard-resources li', { button: 'right' });
  await window.waitForTimeout(200);
  await window.click('#dashboard-goto-menu button');
  await window.waitForTimeout(400);
  const onResourcesPageAfterGoTo = (await window.getAttribute('#page-resources', 'hidden')) === null;
  const previewVisibleAfterGoTo = !(await window.isHidden('#preview-overlay'));
  console.log(
    'on Resources page after "Go to" from a dashboard resource:',
    onResourcesPageAfterGoTo,
    '— preview visible:',
    previewVisibleAfterGoTo
  );
  if (!onResourcesPageAfterGoTo || !previewVisibleAfterGoTo) {
    throw new Error('FAIL: "Go to" on a dashboard resource did not navigate to Resources and open its preview');
  }
  await window.click('#preview-close');
  await window.waitForTimeout(200);
  await goToPage('dashboard');

  // Same "Go to" check for a deadline — should land on the course detail
  // view (Deadlines section) with the deadline viewer open, not just
  // navigate to the Courses page without opening anything.
  await window.click('#dashboard-deadlines li', { button: 'right' });
  await window.waitForTimeout(200);
  await window.click('#dashboard-goto-menu button');
  await window.waitForTimeout(400);
  const onCourseDetailAfterGoTo = await window.isHidden('#courses-detail-view');
  const deadlineViewerVisibleAfterGoTo = !(await window.isHidden('#deadline-editor-overlay'));
  console.log(
    'course detail view visible after "Go to" from a dashboard deadline:',
    !onCourseDetailAfterGoTo,
    '— deadline viewer visible:',
    deadlineViewerVisibleAfterGoTo
  );
  if (onCourseDetailAfterGoTo || !deadlineViewerVisibleAfterGoTo) {
    throw new Error('FAIL: "Go to" on a dashboard deadline did not open the course detail view and deadline viewer');
  }
  await window.click('#deadline-view-close');
  await window.waitForTimeout(200);
  await goToPage('dashboard');

  const dashboardStructure = await window.evaluate(() => ({
    courseFilter: !!document.querySelector('#dashboard-course-filter'),
    oldDeadlineTabs: !!document.querySelector('#dashboard-upcoming-tabs'),
    compactDeadlineRows: document.querySelectorAll('#dashboard-deadlines .dashboard-compact-row').length,
    courseCells: document.querySelectorAll('#dashboard-course-list .dashboard-course-cell').length,
    announcementList: !!document.querySelector('#dashboard-announcements'),
    courseGridColumns: getComputedStyle(document.querySelector('#dashboard-course-list')).gridTemplateColumns.split(' ').length,
  }));
  console.log('dashboard continuous layout:', dashboardStructure);
  if (!dashboardStructure.courseFilter || dashboardStructure.oldDeadlineTabs || dashboardStructure.compactDeadlineRows === 0 ||
      !dashboardStructure.announcementList || dashboardStructure.courseGridColumns < 5) {
    throw new Error('FAIL: dashboard did not render the continuous-layout structure');
  }

  // --- Calendar: six-week continuous month grid plus real view/filter controls. ---
  await goToPage('calendar');
  const calendarStructure = await window.evaluate(() => ({
    cells: document.querySelectorAll('#calendar-grid .cal-cell').length,
    miniDays: document.querySelectorAll('#calendar-mini-grid .mc-day').length,
    filters: document.querySelectorAll('#calendar-type-filters input, #calendar-course-filters input').length,
    sidebar: !!document.querySelector('#calendar-sidebar'),
  }));
  console.log('calendar continuous layout:', calendarStructure);
  if (calendarStructure.cells !== 42 || calendarStructure.miniDays !== 42 || !calendarStructure.sidebar || calendarStructure.filters < 2) {
    throw new Error(`FAIL: calendar did not render its six-week layout/controls: ${JSON.stringify(calendarStructure)}`);
  }
  await window.click('#calendar-view-week');
  await window.waitForTimeout(150);
  if (await window.isHidden('#calendar-week-view')) throw new Error('FAIL: week view did not become visible');
  await window.click('#calendar-view-day');
  await window.waitForTimeout(150);
  if (await window.isHidden('#calendar-day-view')) throw new Error('FAIL: day view did not become visible');
  await window.click('#calendar-view-month');
  await window.waitForTimeout(150);
  const checkedBefore = await window.isChecked('#calendar-type-filters input');
  await window.click('#calendar-type-filters input');
  await window.waitForTimeout(150);
  const checkedAfter = await window.isChecked('#calendar-type-filters input');
  if (checkedBefore === checkedAfter) throw new Error('FAIL: calendar type filter did not toggle');

  await window.screenshot({ path: path.join(__dirname, '..', 'verify-screenshot.png') });
  console.log('Screenshot saved to verify-screenshot.png');

  // Delete is now right-click-only (native OS context menu), which
  // Playwright cannot drive — there's no in-page element left to click.
  // So this exercises the underlying delete IPC + list-refresh path
  // directly (via the same window.atlas.* API the context menu's "Delete"
  // item calls), rather than the native menu interaction itself. The
  // right-click -> menu -> click path needs a manual check by the user.
  await window.evaluate((id) => window.atlas.deleteResource(id), markdownResourceId);
  await goToPage('resources'); // force a refresh
  const resourcesAfterDelete = await window.$$eval('#all-resources-list [data-resource-id]', (els) =>
    els.map((e) => e.textContent)
  );
  console.log('resources after delete:', resourcesAfterDelete);
  if (resourcesAfterDelete.some((t) => t && t.includes('sample-lecture-notes.md'))) {
    throw new Error('FAIL: resource still present after delete');
  }

  await window.evaluate((id) => window.atlas.deleteCourse(id), courseId);
  await window.reload();
  await window.waitForTimeout(500);
  const coursesAfterDelete = await window.$$eval('#course-list [data-course-id]', (els) =>
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
  await goToPage('courses');
  await window.click('#add-course-toggle');
  await window.waitForTimeout(150);
  await window.fill('#course-name', 'Watch Test Course');
  await window.fill('#course-term', 'Spring 27');
  await window.click('#course-form button[type="submit"]');
  await window.waitForTimeout(300);
  await window.click('#course-list [data-course-id]');
  await window.click('.course-detail-tab[data-course-tab="files"]'); // Watched folders is its own tab now, not visible on the default Overview tab
  await window.waitForTimeout(200);

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

  await goToPage('resources');
  // Chokidar's initial scan is async; poll briefly rather than a fixed sleep.
  let resourcesAfterWatch = [];
  for (let i = 0; i < 10; i++) {
    resourcesAfterWatch = await window.$$eval('#all-resources-list [data-resource-id]', (els) => els.map((e) => e.textContent));
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
    resourcesAfterNewFile = await window.$$eval('#all-resources-list [data-resource-id]', (els) =>
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
    resourcesAfterSourceDelete = await window.$$eval('#all-resources-list [data-resource-id]', (els) =>
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
    resourcesAfterManualDrop = await window.$$eval('#all-resources-list [data-resource-id]', (els) =>
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
    resourcesAfterManualStorageDelete = await window.$$eval('#all-resources-list [data-resource-id]', (els) =>
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
  await goToPage('notes');
  await createNoteViaModal('Watch Test Course');
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
  const imageNoteId = await window.$eval('#all-notes-list li[data-note-id]', (el) => Number(el.dataset.noteId));

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

  // Leave the view mode on grid, then fully relaunch the app against the
  // same data dir — this is the actual scenario the user asked about
  // ("even after a fresh launch"), not just that the setting persists in
  // the DB.
  await goToPage('resources');
  await window.click('#view-grid');
  await window.waitForTimeout(200);
  await app.close();

  const relaunchedApp = await electron.launch({
    args: [path.join(__dirname, '..')],
    env: { ...process.env, ATLAS_DATA_DIR: testDataDir },
  });
  const relaunchedWindow = await relaunchedApp.firstWindow();
  await relaunchedWindow.waitForLoadState('domcontentloaded');
  await relaunchedWindow.waitForTimeout(500);
  await relaunchedWindow.click('.sidebar-nav-item[data-page="resources"]');
  await relaunchedWindow.waitForTimeout(300);
  const viewGridActiveOnRelaunch = await relaunchedWindow.evaluate(() =>
    document.getElementById('view-grid').classList.contains('active')
  );
  console.log('grid view still active after a fresh relaunch:', viewGridActiveOnRelaunch);
  if (!viewGridActiveOnRelaunch) {
    throw new Error('FAIL: view mode did not survive a fresh app relaunch');
  }

  await relaunchedWindow.click('.sidebar-nav-item[data-page="notes"]');
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

  // Window size/position persists across launches (main.ts save/
  // loadWindowState via app_settings) — resize away from the default, close,
  // relaunch, confirm the custom size comes back rather than resetting.
  await relaunchedApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.unmaximize();
    win.setBounds({ width: 950, height: 700, x: 60, y: 60 });
  });
  await relaunchedWindow.waitForTimeout(700); // let the debounced save fire
  await relaunchedApp.close();

  const thirdLaunchApp = await electron.launch({
    args: [path.join(__dirname, '..')],
    env: { ...process.env, ATLAS_DATA_DIR: testDataDir },
  });
  const thirdLaunchWindow = await thirdLaunchApp.firstWindow();
  await thirdLaunchWindow.waitForLoadState('domcontentloaded');
  await thirdLaunchWindow.waitForTimeout(500);
  const restoredBounds = await thirdLaunchApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].getBounds()
  );
  console.log('window bounds restored after relaunch:', restoredBounds);
  if (restoredBounds.width !== 950 || restoredBounds.height !== 700) {
    throw new Error(`FAIL: window size did not persist across relaunch, got ${JSON.stringify(restoredBounds)}`);
  }
  await thirdLaunchApp.close();

  // Throwaway data dirs, safe to delete entirely.
  fs.rmSync(testDataDir, { recursive: true, force: true });
  fs.rmSync(watchFolderDir, { recursive: true, force: true });

  console.log('PASS');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
