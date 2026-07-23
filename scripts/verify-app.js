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

  // Select the course, then upload a resource into it.
  await window.click('#course-list li');
  await window.waitForTimeout(200);

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

  await window.click('#preview-close');
  await window.waitForTimeout(200);
  if (!(await window.isHidden('#preview-overlay'))) {
    throw new Error('FAIL: preview overlay did not close');
  }

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

  await window.click('#view-list');
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

  await window.screenshot({ path: path.join(__dirname, '..', 'verify-screenshot.png') });
  console.log('Screenshot saved to verify-screenshot.png');

  // Cancel path: opening the confirm modal and clicking Cancel must leave
  // the resource untouched.
  await window.click('#resource-list button.delete-button');
  await window.waitForTimeout(200);
  await window.click('#confirm-cancel');
  await window.waitForTimeout(200);
  const resourcesAfterCancel = await window.$$eval('#resource-list li', (els) =>
    els.map((e) => e.textContent)
  );
  if (!resourcesAfterCancel.some((t) => t && t.includes('sample-lecture-notes.md'))) {
    throw new Error('FAIL: resource disappeared after clicking Cancel, not Delete');
  }

  // Delete the resource, then the course, via the in-app confirm modal
  // (not a native dialog), confirming both disappear.
  await window.click('#resource-list button.delete-button');
  await window.waitForTimeout(200);
  if (await window.isHidden('#confirm-overlay')) {
    throw new Error('FAIL: in-app confirm modal did not open for resource delete');
  }
  await window.click('#confirm-yes');
  await window.waitForTimeout(300);
  const resourcesAfterDelete = await window.$$eval('#resource-list li', (els) =>
    els.map((e) => e.textContent)
  );
  console.log('resources after delete:', resourcesAfterDelete);
  if (resourcesAfterDelete.some((t) => t && t.includes('sample-lecture-notes.md'))) {
    throw new Error('FAIL: resource still present after delete');
  }

  await window.click('#course-list button.delete-button');
  await window.waitForTimeout(200);
  if (await window.isHidden('#confirm-overlay')) {
    throw new Error('FAIL: in-app confirm modal did not open for course delete');
  }
  await window.click('#confirm-yes');
  await window.waitForTimeout(300);
  const coursesAfterDelete = await window.$$eval('#course-list li', (els) =>
    els.map((e) => e.textContent)
  );
  console.log('courses after delete:', coursesAfterDelete);
  if (coursesAfterDelete.some((t) => t && t.includes('Verify Script Test Course'))) {
    throw new Error('FAIL: course still present after delete');
  }

  await app.close();

  // Throwaway data dir, safe to delete entirely.
  fs.rmSync(testDataDir, { recursive: true, force: true });

  console.log('PASS');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
