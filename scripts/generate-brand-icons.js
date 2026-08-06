// Rasterizes the approved SVG mark for Windows' native icon surfaces. The
// renderer keeps the SVGs so the app can swap the mark with its theme; the
// taskbar and executable need a PNG/ICO because Windows does not render SVG
// icons there consistently.
const { _electron: electron } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

(async () => {
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-brand-icon-'));
  const outputDir = path.join(__dirname, '..', 'assets', 'icons');
  fs.mkdirSync(outputDir, { recursive: true });

  const svg = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'assets', 'atlas-logo-dark.svg'), 'utf8');
  const app = await electron.launch({
    args: [path.join(__dirname, '..')],
    env: { ...process.env, ATLAS_DATA_DIR: tempDataDir },
  });

  try {
    const window = await app.firstWindow();
    await window.setViewportSize({ width: 512, height: 512 });
    await window.setContent(`<style>html,body{width:512px;height:512px;margin:0;overflow:hidden;background:transparent}svg{display:block;width:512px;height:512px}</style>${svg}`);
    await window.screenshot({ path: path.join(outputDir, 'atlas.png'), omitBackground: true });
  } finally {
    await app.close();
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  }
})();
