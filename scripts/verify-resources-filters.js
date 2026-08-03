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
