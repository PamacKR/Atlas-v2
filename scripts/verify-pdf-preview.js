// Focused PDF preview check: both Resource PDFs and handwritten scan PDFs must
// render inside Atlas so their scrollbars use the app's themed CSS instead of
// Chromium's built-in PDF viewer scrollbar.
const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

(async () => {
  const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-pdf-preview-'));
  const testPdfPath = path.join(__dirname, 'fixtures', 'sample-scan.pdf');
  const app = await electron.launch({
    args: [path.join(__dirname, '..')],
    env: {
      ...process.env,
      ATLAS_DATA_DIR: testDataDir,
      ATLAS_TEST_UPLOAD_PATH: testPdfPath,
      ATLAS_TEST_SCAN_PATHS: testPdfPath,
    },
  });

  try {
    const window = await app.firstWindow();
    window.on('console', (message) => console.log(`[renderer console] ${message.type()}: ${message.text()}`));
    window.on('pageerror', (error) => console.log(`[renderer error] ${error.message}`));
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(500);

    const course = await window.evaluate(() => window.atlas.createCourse('PDF preview verification', 'PDF101', 'Test term'));
    const resource = await window.evaluate((courseId) => window.atlas.uploadResource(courseId), course.id);
    if (!resource) throw new Error('PDF resource upload did not return a resource.');

    await window.click('.sidebar-nav-item[data-page="resources"]');
    await window.waitForTimeout(250);
    await window.click(`[data-resource-id="${resource.id}"] .resource-name`);
    await window.waitForTimeout(1200);

    const resourcePdf = await window.evaluate(() => ({
      iframeCount: document.querySelectorAll('#preview-body iframe').length,
      pageCount: document.querySelectorAll('#preview-body.pdf-preview-body .pdf-preview-page canvas').length,
      atlasScrollbar: document.getElementById('preview-body')?.classList.contains('pdf-preview-body') ?? false,
      bodyText: document.getElementById('preview-body')?.textContent?.trim() ?? '',
    }));
    if (resourcePdf.iframeCount !== 0 || resourcePdf.pageCount !== 2 || !resourcePdf.atlasScrollbar) {
      throw new Error(`Resource PDF did not use the Atlas renderer: ${JSON.stringify(resourcePdf)}`);
    }
    await window.screenshot({ path: path.join(__dirname, '..', 'verify-pdf-preview-resource.png') });
    await window.click('#preview-close');
    await window.waitForTimeout(200);

    await window.click('.sidebar-nav-item[data-page="notes"]');
    await window.waitForTimeout(300);
    await window.click('#import-scan-button');
    await window.waitForTimeout(200);
    await window.click(`#course-picker-list li:has-text("PDF preview verification")`);
    await window.waitForTimeout(150);
    await window.click('#course-picker-browse');
    await window.waitForTimeout(900);
    const notes = await window.evaluate(() => window.atlas.listAllNotes());
    const scanNote = notes.find((note) => note.is_handwritten);
    if (!scanNote) throw new Error('PDF scan import did not create a handwritten note.');

    await window.waitForTimeout(300);
    await window.locator(`#all-notes-list [data-note-id="${scanNote.id}"]`).click();
    await window.waitForTimeout(1200);

    const scanPdf = await window.evaluate(() => ({
      iframeCount: document.querySelectorAll('#note-scan-panel iframe').length,
      pageCount: document.querySelectorAll('#note-scan-panel.pdf-preview-body .pdf-preview-page canvas').length,
      atlasScrollbar: document.getElementById('note-scan-panel')?.classList.contains('pdf-preview-body') ?? false,
    }));
    if (scanPdf.iframeCount !== 0 || scanPdf.pageCount !== 2 || !scanPdf.atlasScrollbar) {
      throw new Error(`Handwritten scan PDF did not use the Atlas renderer: ${JSON.stringify(scanPdf)}`);
    }
    await window.screenshot({ path: path.join(__dirname, '..', 'verify-pdf-preview-scan.png') });
    console.log(`pdf preview verify: PASS ${JSON.stringify({ resourcePdf, scanPdf })}`);
  } finally {
    await app.close();
    fs.rmSync(testDataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
