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
    const fidelityDiagnostics = await window.evaluate(() => {
      const list = document.getElementById('dashboard-deadlines');
      if (!list) throw new Error('Dashboard deadline list is missing.');
      const row = document.createElement('li');
      row.className = 'dashboard-compact-row';
      row.innerHTML = '<span class="dashboard-row-leading">Today</span><span class="dashboard-row-title">Fidelity verification deadline</span><span class="dashboard-row-course">Development Economics</span><span class="dashboard-row-trailing">18:29</span>';
      list.appendChild(row);

      const scrollbarProbe = document.createElement('div');
      scrollbarProbe.style.cssText = 'position:fixed; left:-10000px; top:0; width:40px; height:40px; overflow:scroll;';
      scrollbarProbe.innerHTML = '<div style="width:200px;height:200px"></div>';
      document.body.appendChild(scrollbarProbe);
      const rowStyle = getComputedStyle(row);
      const probeStyle = getComputedStyle(scrollbarProbe);
      const scrollbarStyle = getComputedStyle(scrollbarProbe, '::-webkit-scrollbar');
      const trackStyle = getComputedStyle(scrollbarProbe, '::-webkit-scrollbar-track');
      const thumbStyle = getComputedStyle(scrollbarProbe, '::-webkit-scrollbar-thumb');
      return {
        row: {
          paddingLeft: rowStyle.paddingLeft,
          paddingRight: rowStyle.paddingRight,
          marginLeft: rowStyle.marginLeft,
          marginRight: rowStyle.marginRight,
          borderRadius: rowStyle.borderRadius,
          background: rowStyle.backgroundColor,
        },
        scrollbar: {
          standardWidth: probeStyle.scrollbarWidth,
          standardColor: probeStyle.scrollbarColor,
          width: scrollbarStyle.width,
          height: scrollbarStyle.height,
          trackRadius: trackStyle.borderRadius,
          thumbRadius: thumbStyle.borderRadius,
          thumbBackground: thumbStyle.backgroundColor,
        },
      };
    });
    await window.locator('#dashboard-deadlines .dashboard-compact-row').last().hover();
    const hoveredRow = await window.evaluate(() => {
      const row = document.querySelector('#dashboard-deadlines .dashboard-compact-row:last-child');
      if (!row) throw new Error('Dashboard fidelity row is missing.');
      const style = getComputedStyle(row);
      const rect = row.getBoundingClientRect();
      const listRect = document.getElementById('dashboard-deadlines').getBoundingClientRect();
      return {
        background: style.backgroundColor,
        borderRadius: style.borderRadius,
        leftInset: rect.left - listRect.left,
        rightInset: listRect.right - rect.right,
      };
    });
    console.log(`dashboard fidelity diagnostics: ${JSON.stringify({ fidelityDiagnostics, hoveredRow })}`);
    if (fidelityDiagnostics.scrollbar.trackRadius === '0px' || fidelityDiagnostics.scrollbar.thumbRadius === '0px') {
      throw new Error(`Scrollbar corners are not rounded: ${JSON.stringify(fidelityDiagnostics.scrollbar)}`);
    }
    if (hoveredRow.background === 'rgba(0, 0, 0, 0)' || hoveredRow.leftInset < 0 || hoveredRow.rightInset < 0) {
      throw new Error(`Dashboard hover surface is clipped or missing: ${JSON.stringify(hoveredRow)}`);
    }
    await window.screenshot({ path: path.join(__dirname, '..', 'verify-dashboard-v2-hover.png') });
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
