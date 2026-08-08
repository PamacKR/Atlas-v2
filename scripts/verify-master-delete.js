// Verifies the Settings > Storage master-delete flow with throwaway data.
// This deliberately exercises the real Electron UI and confirms that Google
// connection credentials survive while Atlas-owned content is removed.
const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-master-delete-'));
  const app = await electron.launch({
    args: [path.join(__dirname, '..')],
    env: { ...process.env, ATLAS_DATA_DIR: dataDir },
  });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(400);

    const seeded = await window.evaluate(async () => {
      const course = await window.atlas.createCourse('Master delete verification', 'VERIFY-DELETE', 'Test');
      await window.atlas.createNote(course.id);
      await window.atlas.setSetting('google_drive_refresh_token', 'drive-verification-token');
      await window.atlas.setSetting('google_classroom_refresh_token', 'classroom-verification-token');
      await window.atlas.setSetting('google_drive_folder_id', 'folder-to-clear');
      return course.id;
    });
    if (!seeded) throw new Error('Could not seed master-delete verification data');

    await window.click('.sidebar-nav-item[data-page="settings"]');
    await window.waitForTimeout(250);
    await window.click('[data-settings-tab="storage"]');
    await window.click('#settings-delete-all-data');
    await window.waitForSelector('#confirm-overlay:not([hidden])');
    await window.click('#confirm-yes');
    await window.waitForSelector('#master-delete-overlay:not([hidden])');
    if (await window.getAttribute('#master-delete-confirm', 'disabled') === null) throw new Error('Master delete button was enabled before DELETE was entered');
    await window.fill('#master-delete-input', 'DELETE');
    if (await window.getAttribute('#master-delete-confirm', 'disabled') !== null) throw new Error('Master delete button stayed disabled after DELETE was entered');
    await window.click('#master-delete-confirm');
    await window.waitForTimeout(500);

    const state = await window.evaluate(async () => ({
      courses: (await window.atlas.listCourses()).length,
      notes: (await window.atlas.listAllNotes()).length,
      resources: (await window.atlas.listAllResources()).length,
      driveToken: await window.atlas.getSetting('google_drive_refresh_token'),
      classroomToken: await window.atlas.getSetting('google_classroom_refresh_token'),
      folderId: await window.atlas.getSetting('google_drive_folder_id'),
    }));
    if (state.courses !== 0 || state.notes !== 0 || state.resources !== 0) throw new Error(`Academic data remained after delete: ${JSON.stringify(state)}`);
    if (state.driveToken !== 'drive-verification-token' || state.classroomToken !== 'classroom-verification-token') throw new Error('Google connection credentials were not preserved');
    if (state.folderId !== null) throw new Error('Source folder metadata was not cleared');
    if (fs.existsSync(path.join(dataDir, 'backups'))) throw new Error('Backups directory was not removed');
    if (fs.existsSync(path.join(dataDir, 'files'))) throw new Error('Managed files directory was not removed');
    console.log('master delete verify: PASS');
  } finally {
    await app.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
