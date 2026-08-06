const { chromium } = require('playwright');
const path = require('path');
const url = require('url');

(async () => {
  const target = process.argv[2] || 'dashboard-a.html';
  const out = process.argv[3] || '_mockup-a.png';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url.pathToFileURL(path.join(__dirname, target)).href);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(__dirname, out) });
  await browser.close();
})();
