const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-readiness-'));
  const app = await electron.launch({
    args: [path.join(__dirname, '..')],
    env: { ...process.env, ATLAS_DATA_DIR: dataDir, ATLAS_TEST_COURSE_READINESS: '1' },
  });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(400);
    const courseId = await window.evaluate(() => window.atlas.seedCourseReadinessTestItems());
    await window.click('.sidebar-nav-item[data-page="courses"]');
    await window.waitForSelector(`#course-list [data-course-id="${courseId}"]`);
    await window.click(`#course-list [data-course-id="${courseId}"]`);
    await window.waitForSelector('#course-readiness-section');
    await window.waitForFunction(() => document.querySelector('#course-readiness-summary')?.textContent?.includes('2 of 8'));

    const state = await window.evaluate(() => ({
      summary: document.querySelector('#course-readiness-summary')?.textContent,
      metrics: Array.from(document.querySelectorAll('.course-readiness-metric')).map((metric) => metric.textContent?.trim()),
      issueCount: document.querySelectorAll('.course-readiness-item').length,
      issueText: document.querySelector('#course-readiness-issues')?.textContent,
      metricGrid: getComputedStyle(document.querySelector('#course-readiness-metrics')).gridTemplateColumns,
      sectionBorder: getComputedStyle(document.querySelector('#course-readiness-section')).borderTopColor,
    }));
    if (state.summary !== '2 of 8 course materials have readable text for the agent.') throw new Error(`Unexpected readiness summary: ${state.summary}`);
    if (state.issueCount !== 6) throw new Error(`Expected 6 readiness issues, got ${state.issueCount}`);
    for (const expected of ['2Readable', '2Needs OCR', '1Pending', '1Failed', '2Other']) {
      if (!state.metrics.some((metric) => metric.replace(/\s+/g, '').includes(expected.replace(/\s+/g, '')))) throw new Error(`Missing readiness metric: ${expected}`);
    }
    for (const expected of ['Scanned reading.pdf', 'Broken handout.docx', 'Slides still processing.pptx', 'Reference diagram.png', 'Professor video', 'Unreviewed handwritten scan']) {
      if (!state.issueText.includes(expected)) throw new Error(`Readiness issues omitted ${expected}`);
    }
    if (!state.metricGrid || state.sectionBorder === 'rgba(0, 0, 0, 0)') throw new Error('Readiness section did not receive themed layout styles');
    if (!(await window.isHidden('#course-readiness-empty'))) throw new Error('Empty readiness state was shown with unresolved issues');

    await window.click('#course-readiness-issues button:text("Retry extraction")');
    await window.waitForFunction(() => document.querySelector('#course-readiness-issues')?.textContent?.includes('Broken handout.docx'), null, { timeout: 3000 });
    await window.evaluate(() => document.querySelector('#course-readiness-section')?.scrollIntoView({ block: 'start' }));
    await window.waitForTimeout(100);
    await window.screenshot({ path: path.join(__dirname, '..', 'verify-readiness.png') });
    console.log('readiness verify: PASS', state);
  } finally {
    await app.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
