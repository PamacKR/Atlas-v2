const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-window-chrome-'));
  const app = await electron.launch({ args: [path.join(__dirname, '..')], env: { ...process.env, ATLAS_DATA_DIR: dataDir } });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForFunction(() => document.querySelector('#window-maximize')?.getAttribute('aria-pressed') === 'true');

    const shell = await window.evaluate(() => ({
      dragRegion: getComputedStyle(document.getElementById('window-drag-region')).getPropertyValue('-webkit-app-region'),
      controlsRegion: getComputedStyle(document.getElementById('window-controls')).getPropertyValue('-webkit-app-region'),
      controlCount: document.querySelectorAll('#window-controls button').length,
      mainAreaPosition: getComputedStyle(document.getElementById('main-area')).position,
    }));
    if (shell.dragRegion !== 'drag') throw new Error(`Window drag region was not enabled: ${JSON.stringify(shell)}`);
    if (shell.controlsRegion !== 'no-drag') throw new Error(`Window controls were not excluded from dragging: ${JSON.stringify(shell)}`);
    if (shell.controlCount !== 3) throw new Error(`Expected three window controls, found ${shell.controlCount}`);
    if (shell.mainAreaPosition !== 'relative') throw new Error('Main area is not positioned for the integrated window chrome');

    const nativeWindow = () => app.evaluate(({ BrowserWindow }) => {
      const current = BrowserWindow.getAllWindows()[0];
      return { maximized: current.isMaximized(), minimized: current.isMinimized() };
    });
    if (!(await nativeWindow()).maximized) throw new Error('Window did not start maximized in the isolated verification app');

    await window.click('#window-maximize');
    await window.waitForFunction(() => document.querySelector('#window-maximize')?.getAttribute('aria-pressed') === 'false');
    if ((await nativeWindow()).maximized) throw new Error('Custom maximize control did not restore the window');

    await window.click('#window-maximize');
    await window.waitForFunction(() => document.querySelector('#window-maximize')?.getAttribute('aria-pressed') === 'true');
    if (!(await nativeWindow()).maximized) throw new Error('Custom restore control did not maximize the window');

    await window.click('#window-minimize');
    await window.waitForFunction(async () => !(await window.atlas.windowControls.isMaximized()), null, { timeout: 300 }).catch(() => {});
    const minimized = await nativeWindow();
    if (!minimized.minimized) throw new Error('Custom minimize control did not minimize the window');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].restore());
    await window.waitForTimeout(100);
    await window.click('#sidebar-collapse-toggle');
    const collapsedChromeLeft = await window.evaluate(() => getComputedStyle(document.getElementById('window-chrome')).left);
    if (collapsedChromeLeft !== '64px') throw new Error(`Window chrome did not follow the collapsed sidebar: ${collapsedChromeLeft}`);
    await window.click('#sidebar-collapse-toggle');
    await window.screenshot({ path: path.join(__dirname, '..', 'verify-window-chrome.png') });
    console.log('window chrome verify: PASS');
  } finally { await app.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
