// Focused Electron verification for the Resources source filter.
// The three source records are seeded only when ATLAS_TEST_RESOURCES_FILTERS
// is enabled, so this never needs a live Drive or Classroom connection.
const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-resources-filters-'));
  const app = await electron.launch({
    args: [path.join(__dirname, '..')],
    env: { ...process.env, ATLAS_DATA_DIR: dataDir, ATLAS_TEST_RESOURCES_FILTERS: '1' },
  });
  try {
    const window = await app.firstWindow();
    window.on('pageerror', (error) => console.error('[renderer error]', error));
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(500);
    await window.evaluate(() => window.atlas.seedResourcesFilterTestItems());
    await window.click('.sidebar-nav-item[data-page="resources"]');
    await window.waitForTimeout(300);

    const allTitles = async () => window.$$eval('#all-resources-list [data-resource-id] .resource-file-name', (els) => els.map((el) => el.textContent));
    const assertTitles = async (expected, message) => {
      const actual = await allTitles();
      if (actual.length !== expected.length || expected.some((title) => !actual.includes(title))) {
        throw new Error(`${message}: ${JSON.stringify(actual)}`);
      }
    };

    await assertTitles([
      'Local filter verification file',
      'Classroom filter verification file',
      'Drive filter verification file',
    ], 'All sources did not show every seeded resource');

    const sourceOptions = await window.$$eval('#resources-source-filter .dselect-option', (els) => els.map((el) => el.textContent));
    if (sourceOptions.includes('Drive')) throw new Error(`Drive should not be a source-filter option: ${JSON.stringify(sourceOptions)}`);

    for (const source of ['local', 'classroom']) {
      await window.click('#resources-source-filter .dselect-trigger');
      await window.click(`#resources-source-filter .dselect-option[data-value="${source}"]`);
      await window.waitForTimeout(150);
      await assertTitles([`${source[0].toUpperCase()}${source.slice(1)} filter verification file`], `${source} source filter returned the wrong resources`);
      const label = await window.textContent('#resources-source-filter .dselect-trigger');
      if (label.trim() !== `${source[0].toUpperCase()}${source.slice(1)}`) throw new Error(`${source} source filter did not become active: ${label}`);
    }

    await window.click('#resources-source-filter .dselect-trigger');
    await window.click('#resources-source-filter .dselect-option[data-value=""]');
    await window.waitForTimeout(150);
    await assertTitles([
      'Local filter verification file',
      'Classroom filter verification file',
      'Drive filter verification file',
    ], 'All sources did not restore the complete list');
    await window.click('#resources-source-filter .dselect-trigger');
    const dropdownStyle = await window.evaluate(() => {
      const root = document.getElementById('resources-source-filter');
      const option = root.querySelector('.dselect-option');
      const label = root.querySelector('.dselect-trigger span');
      const arrow = root.querySelector('.dselect-trigger svg');
      if (!option || !label || !arrow) return null;
      const labelRect = label.getBoundingClientRect();
      const arrowRect = arrow.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      const optionStyle = getComputedStyle(option);
      return {
        border: optionStyle.borderTopWidth,
        paddingTop: optionStyle.paddingTop,
        gap: arrowRect.left - labelRect.right,
        arrowRightGap: rootRect.right - arrowRect.right,
        optionJustify: optionStyle.justifyContent,
        optionGap: optionStyle.gap,
      };
    });
    if (!dropdownStyle || dropdownStyle.border !== '0px') throw new Error(`Source dropdown options still have an outline: ${JSON.stringify(dropdownStyle)}`);
    if (dropdownStyle.paddingTop !== '6px') throw new Error(`Source dropdown option padding was not tightened: ${JSON.stringify(dropdownStyle)}`);
    if (dropdownStyle.gap > 12) throw new Error(`Source dropdown arrow is too far from its label: ${JSON.stringify(dropdownStyle)}`);
    if (dropdownStyle.arrowRightGap > 18) throw new Error(`Source dropdown has too much space after its arrow: ${JSON.stringify(dropdownStyle)}`);
    if (dropdownStyle.optionJustify !== 'flex-start' || dropdownStyle.optionGap !== '8px') throw new Error(`Source dropdown checkmark alignment is too loose: ${JSON.stringify(dropdownStyle)}`);
    for (const page of ['dashboard', 'courses', 'resources', 'notes', 'calendar']) {
      await window.click(`.sidebar-nav-item[data-page="${page}"]`);
      await window.waitForTimeout(100);
      const heights = await window.evaluate((currentPage) => {
        const search = document.getElementById('search-input');
        const controls = Array.from(document.querySelectorAll('#topbar .topbar-page-actions:not([hidden]) button'))
          .filter((element) => element.getClientRects().length > 0);
        if (currentPage === 'dashboard') {
          const dashboardFilter = document.getElementById('dashboard-course-filter-trigger');
          if (dashboardFilter?.getClientRects().length) controls.push(dashboardFilter);
        }
        return {
          search: search?.getBoundingClientRect().height ?? 0,
          controls: controls.map((control) => ({ id: control.id, height: control.getBoundingClientRect().height })),
        };
      }, page);
      if (heights.controls.some((control) => Math.abs(control.height - heights.search) > 0.5)) {
        throw new Error(`${page} topbar controls do not match the search height: ${JSON.stringify(heights)}`);
      }
    }
    await window.click('.sidebar-nav-item[data-page="resources"]');
    await window.waitForTimeout(150);
    await window.click('#resources-source-filter .dselect-trigger');
    await window.screenshot({ path: path.join(__dirname, '..', 'verify-resources-filters.png') });
    console.log('resources source filter verify: PASS');
  } finally {
    await app.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
