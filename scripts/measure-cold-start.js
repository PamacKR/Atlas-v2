// Cold-like startup measurement. Unlike measure-performance.js, this script
// is run by ordinary Node, does not launch an Electron parent process, and
// does not build immediately before measuring. It uses a fresh empty data
// directory for each sample so no application data or sync work can dominate
// the timing. Windows filesystem cache eviction is not deterministic, so the
// output is explicitly labelled cold-like rather than claiming a perfect cold
// cache simulation. Set ATLAS_COLD_SOURCE_DIR to a copied Atlas-Storage
// directory to measure a real-scale database without touching live data.
const { _electron: electron } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { performance } = require('perf_hooks');

const repoRoot = path.join(__dirname, '..');
const samples = Number(process.env.ATLAS_COLD_SAMPLES || 3);
const results = [];

async function measureOne(index) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-cold-start-'));
  const sourceDir = process.env.ATLAS_COLD_SOURCE_DIR;
  if (sourceDir) {
    for (const name of fs.readdirSync(sourceDir)) {
      if (name === 'atlas.db' || name === 'atlas.db-wal' || name === 'atlas.db-shm') {
        fs.copyFileSync(path.join(sourceDir, name), path.join(dataDir, name));
      }
    }
  }
  const started = performance.now();
  let app;
  try {
    app = await electron.launch({
      args: [repoRoot],
      env: { ...process.env, ATLAS_DATA_DIR: dataDir, ATLAS_COLD_SAMPLE: String(index) },
    });
    const launchResolved = performance.now() - started;
    const page = await app.firstWindow();
    const firstWindow = performance.now() - started;
    await page.waitForLoadState('domcontentloaded');
    const domContentLoaded = performance.now() - started;
    await page.waitForFunction(() => {
      const dashboard = document.getElementById('page-dashboard');
      const stats = document.getElementById('stat-courses');
      return Boolean(dashboard && !dashboard.hidden && stats && /^\d+$/.test(stats.textContent || ''));
    }, { timeout: 30000 });
    const dashboardUsable = performance.now() - started;
    return {
      sample: index,
      launchResolved: Number(launchResolved.toFixed(1)),
      firstWindow: Number(firstWindow.toFixed(1)),
      domContentLoaded: Number(domContentLoaded.toFixed(1)),
      dashboardUsable: Number(dashboardUsable.toFixed(1)),
    };
  } finally {
    if (app) await app.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

async function main() {
  for (let index = 1; index <= samples; index++) {
    results.push(await measureOne(index));
  }
  const median = (key) => {
    const values = results.map((result) => result[key]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  };
  console.log(JSON.stringify({
    profile: process.env.ATLAS_COLD_SOURCE_DIR ? 'cold-like-real-scale-copy-no-build' : 'cold-like-empty-data-no-build',
    samples: results,
    medians: {
      launchResolved: median('launchResolved'),
      firstWindow: median('firstWindow'),
      dashboardUsable: median('dashboardUsable'),
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
