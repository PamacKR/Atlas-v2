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

  const app = await electron.launch({
    args: [path.join(__dirname, '..')],
    env: { ...process.env, ATLAS_DATA_DIR: testDataDir },
  });
  const window = await app.firstWindow();
  window.on('console', (msg) => console.log('[renderer console]', msg.type(), msg.text()));
  window.on('pageerror', (err) => console.log('[renderer error]', err));
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
  await window.click('#course-form button[type="submit"]');
  await window.waitForTimeout(300);

  const items = await window.$$eval('#course-list li', (els) => els.map((e) => e.textContent));
  console.log('courses after:', items);
  if (!items.some((t) => t && t.includes('Verify Script Test Course'))) {
    throw new Error('FAIL: added course did not appear in the list');
  }

  await window.screenshot({ path: path.join(__dirname, '..', 'verify-screenshot.png') });
  console.log('Screenshot saved to verify-screenshot.png');

  await app.close();

  // Throwaway data dir, safe to delete entirely.
  fs.rmSync(testDataDir, { recursive: true, force: true });

  console.log('PASS');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
