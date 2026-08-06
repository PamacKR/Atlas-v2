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
    await window.evaluate(async () => {
      await window.atlas.setSetting('google_drive_refresh_token', 'verification-token');
      await window.atlas.setSetting('google_drive_folder_id', 'verification-folder');
      await window.atlas.setSetting('google_drive_folder_name', 'Verification folder');
      await window.atlas.setSetting('sync_drive_last_error', 'Google authorization expired or was revoked. Reconnect this source in Settings to resume syncing.');
      await window.atlas.setSetting('google_classroom_refresh_token', 'verification-token');
      await window.atlas.setSetting('sync_classroom_last_error', 'Google authorization expired or was revoked. Reconnect this source in Settings to resume syncing.');
    });
    await window.click('.sidebar-nav-item[data-page="dashboard"]');
    await window.click('.sidebar-nav-item[data-page="settings"]');
    await window.click('[data-settings-tab="sources"]');
    await window.waitForFunction(() => document.querySelector('#drive-status')?.textContent?.includes('Reconnect required'), null, { timeout: 2000 });
    for (const source of ['drive', 'classroom']) {
      const label = source === 'drive' ? 'Google Drive' : 'Google Classroom';
      if (!(await window.textContent(`#${source}-status`))?.includes('Reconnect required')) throw new Error(`${label} did not show reconnect status`);
      if (!(await window.textContent(`#${source}-connect-button`))?.includes(`Reconnect ${label}`)) throw new Error(`${label} did not show reconnect action`);
      if (await window.isHidden(`#${source}-connect-button`)) throw new Error(`${label} reconnect action remained hidden`);
      if (await window.isHidden(`#${source}-disconnect-button`)) throw new Error(`${label} disconnect action disappeared while a token exists`);
      if (!(await window.textContent(`#${source}-status-hint`))?.includes('expired or was revoked')) throw new Error(`${label} did not explain why reconnect is needed`);
      if (!(await window.getAttribute(`#${source}-status-hint`, 'class'))?.includes('is-auth-error')) throw new Error(`${label} reconnect hint did not receive the error state`);
    }
    if (!(await window.textContent('#drive-pending-status'))?.includes('Reconnect Google Drive')) throw new Error('Drive pending state did not request reconnect');
    if (!(await window.textContent('#classroom-pending-status'))?.includes('Reconnect Google Classroom')) throw new Error('Classroom pending state did not request reconnect');
    await window.evaluate(async () => {
      await window.atlas.setSetting('sync_config_drive', 'off');
      await window.atlas.setSetting('sync_drive_last_error', 'Waiting for a live sync update.');
    });
    await window.click('.sidebar-nav-item[data-page="dashboard"]');
    await window.click('.sidebar-nav-item[data-page="settings"]');
    await window.click('[data-settings-tab="sources"]');
    await window.evaluate(() => window.atlas.syncNow('drive'));
    await window.waitForFunction(() => document.querySelector('#sync-status-drive')?.textContent?.includes('ENOENT'), null, { timeout: 2000 });
    if ((await window.textContent('#sync-status-drive'))?.includes('Waiting for a live sync update.')) throw new Error('Sync status did not update in place after a completed sync');
    await window.screenshot({ path: path.join(__dirname, '..', 'verify-settings-reconnect.png') });
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
    await window.click('#settings-backup-now');
    await window.waitForSelector('#settings-backup-delete-all');
    await window.click('#settings-backup-delete-all');
    await window.waitForSelector('#confirm-overlay:not([hidden])');
    await window.click('#confirm-yes');
    await window.waitForTimeout(100);
    if (await window.locator('#settings-backup-delete-all').count()) throw new Error('Delete all backups did not clear the backup list');
    await window.screenshot({ path: path.join(__dirname, '..', 'verify-settings.png') });
    await window.keyboard.press('Control+/');
    await window.waitForSelector('#shortcuts-cheatsheet-overlay:not([hidden])');
    if (await window.isHidden('#shortcuts-cheatsheet-overlay')) throw new Error('Shortcut cheat sheet did not open');
    await window.screenshot({ path: path.join(__dirname, '..', 'verify-shortcuts-overlay.png') });
    await window.click('#shortcuts-cheatsheet-close');
    if (!await window.isHidden('#shortcuts-cheatsheet-overlay')) throw new Error('Shortcut cheat sheet did not close');
    console.log('settings verify: PASS');
  } finally { await app.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
