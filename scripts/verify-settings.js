const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-settings-'));
  const app = await electron.launch({ args: [path.join(__dirname, '..')], env: { ...process.env, ATLAS_DATA_DIR: dataDir } });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(400);
    await window.click('.sidebar-nav-item[data-page="settings"]');
    await window.waitForTimeout(200);
    for (const tab of ['appearance', 'sources', 'shortcuts', 'ai', 'storage', 'about']) {
      await window.click(`[data-settings-tab="${tab}"]`);
      await window.waitForTimeout(80);
      if (await window.isHidden(`[data-settings-panel="${tab}"]`)) throw new Error(`${tab} panel did not become visible`);
      for (const other of ['appearance', 'sources', 'shortcuts', 'ai', 'storage', 'about']) {
        if (other !== tab && !await window.isHidden(`[data-settings-panel="${other}"]`)) throw new Error(`${other} panel remained visible after switching to ${tab}`);
      }
    }
    await window.click('[data-settings-tab="appearance"]');
    await window.click('.settings-accent-swatch[data-accent-color="#3b82f6"]');
    const accent = await window.evaluate(() => ({
      modern: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
      legacy: getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim(),
      subtle: getComputedStyle(document.documentElement).getPropertyValue('--accent-soft').trim(),
    }));
    if (accent.modern !== '#3b82f6' || accent.legacy !== '#3b82f6' || !accent.subtle.includes('#3b82f6')) throw new Error(`Accent did not apply across the UI: ${JSON.stringify(accent)}`);
    await window.click('.settings-accent-swatch[data-accent-color="#d9a441"]');
    await window.click('[data-settings-tab="ai"]');
    const before = await window.getAttribute('#settings-agent-access', 'aria-checked');
    await window.click('#settings-agent-access');
    await window.screenshot({ path: path.join(__dirname, '..', 'verify-settings-ai.png') });
    await window.click('[data-settings-tab="sources"]');
    await window.waitForSelector('#sync-config-drive .dselect-trigger');
    await window.click('#sync-config-drive .dselect-trigger');
    if (await window.isHidden('#sync-config-drive .dselect-menu')) throw new Error('Drive sync selector menu did not open');
    await window.click('#sync-config-drive .dselect-option[data-value="launch"]');
    await window.waitForTimeout(100);
    if ((await window.textContent('#sync-config-drive .dselect-trigger'))?.includes('On launch only') !== true) throw new Error('Drive sync selector did not apply selection');
    await window.screenshot({ path: path.join(__dirname, '..', 'verify-settings-sources.png') });
    await window.click('[data-settings-tab="shortcuts"]');
    await window.screenshot({ path: path.join(__dirname, '..', 'verify-settings-shortcuts.png') });
    const railBeforeScroll = await window.locator('#settings-nav').boundingBox();
    await window.evaluate(() => document.getElementById('main-area').scrollTo({ top: 500 }));
    await window.waitForTimeout(100);
    const railAfterScroll = await window.locator('#settings-nav').boundingBox();
    if (!railBeforeScroll || !railAfterScroll || railAfterScroll.y < 0) throw new Error('Settings section rail did not remain visible while scrolling');
    await window.evaluate(() => document.getElementById('main-area').scrollTo({ top: 0 }));
    await window.click('[data-settings-tab="ai"]');
    const after = await window.getAttribute('#settings-agent-access', 'aria-checked');
    if (before === after) throw new Error('Agent access setting did not toggle');
    await window.click('#settings-agent-access');
    await window.click('[data-settings-tab="storage"]');
    if (!(await window.textContent('#storage-total')).includes('total')) throw new Error('Storage total did not render');
    await window.click('#settings-backup-frequency .dselect-trigger');
    if (await window.isHidden('#settings-backup-frequency .dselect-menu')) throw new Error('Backup frequency menu did not open');
    await window.click('#settings-backup-frequency .dselect-option[data-value="weekly"]');
    await window.waitForTimeout(100);
    if ((await window.textContent('#settings-backup-frequency .dselect-trigger'))?.includes('Weekly') !== true) throw new Error('Backup frequency did not apply selection');
    if (!await window.isHidden('#settings-review-extraction')) throw new Error('Extraction review should be hidden when no resources need OCR');
    await window.screenshot({ path: path.join(__dirname, '..', 'verify-settings.png') });
    console.log('settings verify: PASS');
  } finally { await app.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
