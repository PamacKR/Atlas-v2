// Focused Dashboard v2 check: the one-time baseline must clear historical
// Classroom content, while items synced afterward remain until individually
// or collectively cleared.
const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

(async () => {
  const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-dashboard-v2-'));
  const app = await electron.launch({ args: [path.join(__dirname, '..')], env: { ...process.env, ATLAS_DATA_DIR: testDataDir, ATLAS_TEST_DASHBOARD_V2: '1' } });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(400);
    await window.evaluate(() => window.atlas.seedDashboardV2TestItems());
    await window.click('.sidebar-nav-item[data-page="dashboard"]');
    await window.waitForTimeout(300);
    const updateRows = '#dashboard-announcements .dashboard-update-row';
    if ((await window.locator(updateRows).count()) !== 2) throw new Error('Expected two new Classroom updates after baseline.');
    await window.locator(`${updateRows}:not(.is-pinned) .dashboard-update-clear`).first().click();
    await window.waitForTimeout(100);
    if ((await window.locator(updateRows).count()) !== 1) throw new Error('Individual clear did not remove exactly one Classroom update.');
    await window.click('#dashboard-add-important');
    if (await window.isHidden('#dashboard-important-overlay')) throw new Error('Important announcement overlay did not open.');
    await window.screenshot({ path: path.join(__dirname, '..', 'verify-dashboard-v2-picker.png') });
    await window.locator('#dashboard-important-list .dashboard-important-item').first().click();
    await window.waitForTimeout(100);
    if ((await window.locator(updateRows).count()) !== 2) throw new Error('Pinning must replace an unread announcement instead of duplicating it.');
    if (await window.isHidden('#dashboard-mark-all-updates')) throw new Error('Mark all read should be visible with updates.');
    await window.screenshot({ path: path.join(__dirname, '..', 'verify-dashboard-v2-populated.png') });

    await window.click('#dashboard-mark-all-updates');
    await window.waitForTimeout(100);
    if ((await window.locator(updateRows).count()) !== 1) throw new Error('Mark all read should leave the pinned announcement visible.');
    if (!await window.isHidden('#dashboard-mark-all-updates')) throw new Error('Mark all read remained visible after clearing updates.');
    await window.locator(`${updateRows}.is-pinned .dashboard-update-clear`).click();
    await window.waitForTimeout(100);
    if ((await window.locator(updateRows).count()) !== 0) throw new Error('Removing an important announcement did not unpin it.');

    await window.click('.sidebar-nav-item[data-page="calendar"]');
    await window.waitForTimeout(200);
    await window.locator('#calendar-type-filters input').first().uncheck();
    await window.waitForTimeout(100);
    const savedCalendarFilters = await window.evaluate(async () => JSON.parse(await window.atlas.getSetting('calendarFilters')));
    if (savedCalendarFilters.kinds.includes('deadline')) throw new Error('Calendar deadline filter was not persisted.');
    await window.click('#calendar-add-deadline');
    if (await window.isHidden('#course-picker-overlay')) throw new Error('Calendar Add deadline did not open the course picker.');
    await window.locator('#course-picker-list li').first().click();
    if (await window.isHidden('#deadline-editor-overlay')) throw new Error('Choosing a Calendar course did not open the deadline editor.');
    await window.click('#deadline-edit-close');

    await window.screenshot({ path: path.join(__dirname, '..', 'verify-dashboard-v2.png') });
    console.log('dashboard v2 verify: PASS');
  } finally {
    await app.close();
    fs.rmSync(testDataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
