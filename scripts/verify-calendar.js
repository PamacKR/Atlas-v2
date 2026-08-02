// Focused Electron check for the Calendar surface. Kept separate from the
// broad verify-app workflow so Calendar iteration can be inspected without
// running every historical feature scenario.
const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

(async () => {
  const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-calendar-'));
  const app = await electron.launch({
    args: [path.join(__dirname, '..')],
    env: { ...process.env, ATLAS_DATA_DIR: testDataDir },
  });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(500);
    await window.evaluate(async () => {
      const course = await window.atlas.createCourse('Calendar verification course', 'CAL101', 'Monsoon 26');
      await window.atlas.createDeadline(course.id, 'Calendar deadline', 'assignment', '2026-08-03T18:30', null);
    });
    await window.click('.sidebar-nav-item[data-page="calendar"]');
    await window.waitForTimeout(350);

    const structure = await window.evaluate(() => ({
      cells: document.querySelectorAll('#calendar-grid .cal-cell').length,
      miniDays: document.querySelectorAll('#calendar-mini-grid .mc-day').length,
      filters: document.querySelectorAll('#calendar-type-filters input, #calendar-course-filters input').length,
      calendarVisible: !document.getElementById('page-calendar').hidden,
    }));
    if (!structure.calendarVisible || structure.cells !== 42 || structure.miniDays !== 42 || structure.filters < 4) {
      throw new Error(`Calendar structure failed: ${JSON.stringify(structure)}`);
    }

    await window.click('#calendar-view-week');
    await window.waitForTimeout(100);
    if (await window.isHidden('#calendar-week-view')) throw new Error('Week view did not open');
    await window.click('#calendar-view-day');
    await window.waitForTimeout(100);
    if (await window.isHidden('#calendar-day-view')) throw new Error('Day view did not open');
    await window.click('#calendar-view-month');
    await window.waitForTimeout(100);
    const before = await window.isChecked('#calendar-type-filters input');
    await window.click('#calendar-type-filters input');
    if (before === await window.isChecked('#calendar-type-filters input')) throw new Error('Calendar filter did not change');
    await window.click('#calendar-type-filters input'); // leave the visual capture in its default populated state
    const courseFilter = '#calendar-course-filters input';
    await window.click(courseFilter);
    await window.waitForTimeout(100);
    if (await window.isChecked(courseFilter)) throw new Error('Calendar course filter did not stay unchecked');
    await window.click(courseFilter); // restore default for the screenshot

    await window.screenshot({ path: path.join(__dirname, '..', 'verify-calendar.png') });
    console.log(`calendar verify: PASS ${JSON.stringify(structure)}`);
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
