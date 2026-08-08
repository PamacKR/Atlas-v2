// Focused performance baseline for Atlas.
//
// This deliberately drives the built Electron app against a temporary data
// directory. It is a measurement tool, not a functional verification suite:
// the output is intended to show where the app feels slow before a
// performance fix is attempted. Run with:
//   npm run measure:performance
//
// The script is launched through run-as-electron-node.js so better-sqlite3
// uses Electron's Node ABI while the child Electron app is launched with the
// normal Electron environment.
const { _electron: electron } = require('playwright');
const Database = require('better-sqlite3');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { performance } = require('perf_hooks');

const repoRoot = path.join(__dirname, '..');
const schemaPath = path.join(repoRoot, 'src', 'main', 'db', 'schema.sql');

function sqliteTimestamp(minutesAgo = 0) {
  return new Date(Date.now() - minutesAgo * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

function sqliteDate(daysFromNow) {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function writeSeedFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function seedDatabase(dataDir) {
  const filesDir = path.join(dataDir, 'files');
  const database = new Database(path.join(dataDir, 'atlas.db'));
  database.exec(fs.readFileSync(schemaPath, 'utf8'));

  const courseNames = [
    'Development Economics',
    'Economics of Gender',
    'The Theory of Corporate Finance and Banking',
    'Technology Law and Policy: A New Frontier for Business and Society',
    'Behavioral Finance',
  ];
  const courseIds = [];
  const localFolders = [];

  const seed = database.transaction(() => {
    const insertCourse = database.prepare(
      'INSERT INTO courses (name, code, term, folder_name, archived, source) VALUES (?, ?, ?, ?, 0, ?)'
    );
    for (let index = 0; index < courseNames.length; index++) {
      const name = courseNames[index];
      const folderName = name.replace(/[\\/:*?"<>|]/g, '-');
      const result = insertCourse.run(name, `PERF${index + 101}`, 'Monsoon 26', folderName, 'manual');
      courseIds.push(Number(result.lastInsertRowid));
      localFolders.push(path.join(filesDir, folderName));
      fs.mkdirSync(path.join(filesDir, folderName, 'notes'), { recursive: true });
    }

    const settings = new Map([
      ['theme', 'dark'],
      ['sidebarCollapsed', '0'],
      ['viewMode', 'list'],
      ['semesterFilter', ''],
      ['agentAccess', '1'],
      ['sync_config_drive', 'off'],
      ['sync_config_classroom', 'off'],
      ['extraction_logic_version', '2'],
      ['dashboard_v2_baseline', '1'],
    ]);
    const insertSetting = database.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)');
    for (const [key, value] of settings) insertSetting.run(key, value);

    const localKinds = ['pdf', 'pptx', 'docx', 'image', 'text', 'markdown', 'zip', 'other'];
    const localExtensions = {
      pdf: 'pdf',
      pptx: 'pptx',
      docx: 'docx',
      image: 'png',
      text: 'txt',
      markdown: 'md',
      zip: 'zip',
      other: 'bin',
    };
    const insertResource = database.prepare(`
      INSERT INTO resources
        (course_id, title, kind, source, file_path, original_filename, added_at,
         extraction_status, extracted_at, link_kind, discovery_depth)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);
    const resources = [];

    for (let index = 0; index < 196; index++) {
      const courseId = courseIds[index % courseIds.length];
      const isClassroomLink = index < 156;
      const kind = isClassroomLink ? 'link' : localKinds[(index - 156) % localKinds.length];
      const source = isClassroomLink ? 'classroom' : 'manual';
      const title = isClassroomLink
        ? `Performance Classroom Link ${String(index + 1).padStart(3, '0')}`
        : `Performance Local Resource ${String(index - 155).padStart(2, '0')}`;
      const extension = localExtensions[kind] || 'bin';
      const filePath = isClassroomLink
        ? `https://classroom.google.com/c/performance/resource/${index + 1}`
        : path.join(localFolders[index % localFolders.length], `${title}.${extension}`);

      if (!isClassroomLink) {
        writeSeedFile(filePath, `Performance benchmark fixture ${index}.\nThis file exists only in the temporary measurement database.\n`);
      }

      // Match the important spread of the real data without leaving any
      // pending work that could distort the launch measurements.
      const extractionStatus = index < 48 ? 'unsupported' : index < 186 ? 'done' : index < 195 ? 'empty' : 'failed';
      const result = insertResource.run(
        courseId,
        title,
        kind,
        source,
        filePath,
        isClassroomLink ? null : path.basename(filePath),
        sqliteTimestamp(index * 11),
        extractionStatus,
        sqliteTimestamp(Math.max(1, index * 11)),
        isClassroomLink ? 'link' : null
      );
      resources.push({ id: Number(result.lastInsertRowid), courseId, title, kind, filePath });
    }

    const insertPart = database.prepare(
      'INSERT INTO document_parts (resource_id, ordinal, label, text, origin) VALUES (?, ?, ?, ?, ?)'
    );
    for (let index = 0; index < 3081; index++) {
      const resource = resources[index % 10];
      const ordinal = Math.floor(index / 10) + 1;
      insertPart.run(
        resource.id,
        ordinal,
        `Page ${ordinal}`,
        `Performance benchmark document part ${index + 1}. Searchable fixture text for measuring Atlas responsiveness.`,
        'extracted'
      );
    }

    const insertNote = database.prepare(`
      INSERT INTO notes (course_id, title, content_markdown, created_at, updated_at, title_is_manual)
      VALUES (?, ?, ?, ?, ?, 0)
    `);
    for (let index = 0; index < 2; index++) {
      insertNote.run(
        courseIds[index],
        `Performance Baseline Note ${index + 1}`,
        `# Performance benchmark note ${index + 1}\n\nThis seeded note is used only for timing the editor save path.`,
        sqliteTimestamp(index * 60),
        sqliteTimestamp(index * 60)
      );
    }

    const insertDeadline = database.prepare(`
      INSERT INTO deadlines (course_id, title, kind, due_at, completed, source, description, stale_import)
      VALUES (?, ?, 'assignment', ?, ?, 'manual', ?, 0)
    `);
    for (let index = 0; index < 42; index++) {
      insertDeadline.run(
        courseIds[index % courseIds.length],
        `Performance Deadline ${index + 1}`,
        sqliteDate((index % 20) - 5),
        index % 7 === 0 ? 1 : 0,
        'Seeded deadline for performance measurement.'
      );
    }

    const insertAnnouncement = database.prepare(`
      INSERT INTO announcements (course_id, source, title, body, posted_at, dashboard_pinned)
      VALUES (?, 'classroom', ?, ?, ?, 0)
    `);
    for (let index = 0; index < 152; index++) {
      insertAnnouncement.run(
        courseIds[index % courseIds.length],
        `Performance Announcement ${index + 1}`,
        'Seeded announcement used to approximate the current Atlas dashboard load.',
        sqliteTimestamp(index * 23)
      );
    }

    const insertAssignment = database.prepare(`
      INSERT INTO assignments (course_id, title, description, due_at, source, status, posted_at)
      VALUES (?, ?, ?, ?, 'classroom', 'open', ?)
    `);
    for (let index = 0; index < 27; index++) {
      insertAssignment.run(
        courseIds[index % courseIds.length],
        `Performance Assignment ${index + 1}`,
        'Seeded assignment used to approximate current Classroom data.',
        sqliteDate((index % 18) + 1),
        sqliteTimestamp(index * 31)
      );
    }

    const insertClasswork = database.prepare(`
      INSERT INTO classwork_materials (course_id, title, description, posted_at, classroom_coursework_material_id)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (let index = 0; index < 22; index++) {
      insertClasswork.run(
        courseIds[index % courseIds.length],
        `Performance Classwork ${index + 1}`,
        'Seeded classwork material.',
        sqliteTimestamp(index * 37),
        `performance-classwork-${index + 1}`
      );
    }

    const insertSearchRow = database.prepare(
      'INSERT INTO search_index (entity_type, entity_id, course_id, title, body) VALUES (?, ?, ?, ?, ?)'
    );
    for (const resource of resources) {
      const body = resource.kind === 'text' || resource.kind === 'markdown'
        ? fs.readFileSync(resource.filePath, 'utf8')
        : 'Performance searchable resource fixture.';
      insertSearchRow.run('resource', resource.id, resource.courseId, resource.title, body);
    }
    const notes = database.prepare('SELECT id, course_id, title, content_markdown FROM notes').all();
    for (const note of notes) insertSearchRow.run('note', note.id, note.course_id, note.title, note.content_markdown);
    const announcements = database.prepare('SELECT id, course_id, title, body FROM announcements').all();
    for (const announcement of announcements) {
      insertSearchRow.run('announcement', announcement.id, announcement.course_id, announcement.title, announcement.body || '');
    }
    const assignments = database.prepare('SELECT id, course_id, title, description FROM assignments').all();
    for (const assignment of assignments) {
      insertSearchRow.run('assignment', assignment.id, assignment.course_id, assignment.title, assignment.description || '');
    }
    const parts = database.prepare(`
      SELECT document_parts.id, document_parts.resource_id, document_parts.label,
             document_parts.text, resources.course_id
      FROM document_parts JOIN resources ON resources.id = document_parts.resource_id
    `).all();
    for (const part of parts) insertSearchRow.run('document_part', part.id, part.course_id, part.label, part.text);
  });

  seed();
  const counts = {
    courses: database.prepare('SELECT COUNT(*) AS count FROM courses').get().count,
    resources: database.prepare('SELECT COUNT(*) AS count FROM resources').get().count,
    documentParts: database.prepare('SELECT COUNT(*) AS count FROM document_parts').get().count,
    notes: database.prepare('SELECT COUNT(*) AS count FROM notes').get().count,
    deadlines: database.prepare('SELECT COUNT(*) AS count FROM deadlines').get().count,
    announcements: database.prepare('SELECT COUNT(*) AS count FROM announcements').get().count,
    assignments: database.prepare('SELECT COUNT(*) AS count FROM assignments').get().count,
    searchRows: database.prepare('SELECT COUNT(*) AS count FROM search_index').get().count,
  };
  database.close();
  return { counts, uploadCourseId: courseIds[0] };
}

async function waitForDashboard(page) {
  await page.waitForFunction(() => {
    const pageEl = document.getElementById('page-dashboard');
    const courses = document.getElementById('dashboard-course-list');
    const stats = document.getElementById('stat-courses');
    return Boolean(pageEl && !pageEl.hidden && courses && courses.children.length >= 5 && stats && /^\d+$/.test(stats.textContent || ''));
  }, { timeout: 30000 });
}

async function waitForPageData(page, pageName, selector) {
  await page.waitForFunction(({ pageName: name, selector: target }) => {
    const pageEl = document.getElementById(`page-${name}`);
    const dataEl = document.querySelector(target);
    return Boolean(pageEl && !pageEl.hidden && dataEl && (dataEl.children.length > 0 || (dataEl.textContent || '').trim()));
  }, { pageName, selector }, { timeout: 30000 });
}

async function measure(results, label, operation) {
  const started = performance.now();
  try {
    const value = await operation();
    const entry = { label, ms: Number((performance.now() - started).toFixed(1)), ok: true };
    if (value !== undefined) entry.detail = value;
    results.push(entry);
    return value;
  } catch (error) {
    const entry = { label, ms: Number((performance.now() - started).toFixed(1)), ok: false, error: String(error?.stack || error) };
    results.push(entry);
    console.error(`[measure failed] ${label}: ${entry.error}`);
    return undefined;
  }
}

async function run() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-perf-'));
  const uploadPath = path.join(dataDir, 'performance-upload.txt');
  writeSeedFile(uploadPath, 'Performance upload fixture.\n');
  const seedSummary = seedDatabase(dataDir);
  const results = [];
  const rendererErrors = [];
  const appErrors = [];
  let app = null;

  try {
    const appEnvironment = { ...process.env, ATLAS_DATA_DIR: dataDir, ATLAS_TEST_UPLOAD_PATH: uploadPath };
    delete appEnvironment.ELECTRON_RUN_AS_NODE;
    const launchStart = performance.now();
    app = await electron.launch({ args: [repoRoot], env: appEnvironment });
    results.push({
      label: 'electron.launch resolved from process start',
      ms: Number((performance.now() - launchStart).toFixed(1)),
      ok: true,
    });

    const page = await app.firstWindow();
    results.push({
      label: 'first window available from process start',
      ms: Number((performance.now() - launchStart).toFixed(1)),
      ok: true,
    });
    page.on('pageerror', (error) => rendererErrors.push(String(error?.stack || error)));
    page.on('console', (message) => {
      if (message.type() === 'error') rendererErrors.push(message.text());
    });
    app.on('window', (window) => window.on('pageerror', (error) => appErrors.push(String(error?.stack || error))));

    await page.waitForLoadState('domcontentloaded');
    results.push({
      label: 'DOMContentLoaded from process start',
      ms: Number((performance.now() - launchStart).toFixed(1)),
      ok: true,
    });
    await waitForDashboard(page);
    results.push({
      label: 'first usable Dashboard from process start',
      ms: Number((performance.now() - launchStart).toFixed(1)),
      ok: true,
    });

    const goToPage = async (name, selector) => {
      await page.click(`.sidebar-nav-item[data-page="${name}"]`);
      await waitForPageData(page, name, selector);
    };
    await measure(results, 'navigate to Courses with data', () => goToPage('courses', '#course-list'));
    await measure(results, 'navigate to Resources with data', () => goToPage('resources', '#all-resources-list'));
    await measure(results, 'navigate to Notes with data', () => goToPage('notes', '#all-notes-list'));
    await measure(results, 'navigate to Calendar with data', () => goToPage('calendar', '#calendar-grid'));
    await measure(results, 'navigate to Settings with data', () => goToPage('settings', '#settings-layout'));

    await goToPage('notes', '#all-notes-list');
    const noteOpenDetail = await measure(results, 'new note: course picker to editor', async () => {
      await page.click('#new-note-button');
      await page.waitForFunction(() => {
        const overlay = document.getElementById('course-picker-overlay');
        return Boolean(overlay && !overlay.hidden && document.querySelectorAll('#course-picker-list li').length >= 5);
      }, { timeout: 30000 });
      await page.click('#course-picker-list li');
      await page.waitForFunction(() => {
        const overlay = document.getElementById('note-overlay');
        const editor = document.querySelector('#note-editor-root [contenteditable="true"]');
        return Boolean(overlay && !overlay.hidden && editor);
      }, { timeout: 30000 });
      return await page.$eval('#note-title-input', (input) => input.value);
    });

    await measure(results, 'note autosave: edit to Saved state', async () => {
      const editor = page.locator('#note-editor-root [contenteditable="true"]');
      await editor.fill('Performance measurement note content.');
      await page.waitForFunction(() => (document.getElementById('note-save-status')?.textContent || '').startsWith('Saving'), { timeout: 5000 });
      await page.waitForFunction(() => (document.getElementById('note-save-status')?.textContent || '').startsWith('Saved'), { timeout: 30000 });
    });
    await page.click('#note-close');
    await page.waitForFunction(() => document.getElementById('note-overlay')?.hidden === true, { timeout: 30000 });

    await goToPage('resources', '#all-resources-list');
    const uploadedResource = await measure(results, 'upload: choose file to visible resource', async () => {
      await page.click('#upload-button');
      await page.waitForFunction(() => document.getElementById('course-picker-overlay')?.hidden === false, { timeout: 30000 });
      await page.setInputFiles('#course-picker-file-input', uploadPath);
      await page.waitForFunction(() => document.querySelector('#course-picker-panel.has-upload-file'), { timeout: 30000 });
      await page.click('#course-picker-list li');
      await page.waitForFunction(() => [...document.querySelectorAll('#all-resources-list .resource-file-name')].some((el) => el.textContent === 'performance-upload.txt'), { timeout: 30000 });
      return await page.evaluate(() => {
        const item = [...document.querySelectorAll('#all-resources-list .resource-file-name')]
          .find((element) => element.textContent === 'performance-upload.txt');
        return item?.closest('[data-resource-id]')?.getAttribute('data-resource-id') ?? null;
      });
    });

    const uploadedResourceId = await page.evaluate(async () => {
      const resources = await window.atlas.listAllResources();
      return resources.find((resource) => resource.title === 'performance-upload.txt')?.id ?? null;
    });
    if (uploadedResourceId) {
      await measure(results, 'resource delete: IPC to database removal', async () => {
        await page.evaluate((id) => window.atlas.deleteResource(id), uploadedResourceId);
        const remaining = await page.evaluate(async (id) => (await window.atlas.listAllResources()).some((resource) => resource.id === id), uploadedResourceId);
        if (remaining) throw new Error('deleted resource still returned by listAllResources');
        await page.waitForTimeout(250);
        const stillVisible = await page.evaluate(() => [...document.querySelectorAll('#all-resources-list .resource-file-name')].some((element) => element.textContent === 'performance-upload.txt'));
        return { databaseRemoved: true, uiStillShows: stillVisible };
      });
    } else {
      results.push({ label: 'resource delete: IPC to database removal', ms: 0, ok: false, error: 'upload result could not be found' });
    }

    const firstCourseId = seedSummary.uploadCourseId;
    const deadlineId = await measure(results, 'deadline create: IPC round trip', () => page.evaluate((courseId) => window.atlas.createDeadline(courseId, 'Performance timing deadline', 'assignment', '2026-09-30', 'Created by the performance measurement harness.'), firstCourseId).then((deadline) => deadline.id));
    if (deadlineId) {
      await measure(results, 'deadline complete toggle: IPC round trip', () => page.evaluate((id) => window.atlas.setDeadlineCompleted(id, true), deadlineId));
    }

    await goToPage('dashboard', '#dashboard-course-list');
    await page.click('#search-input');
    await measure(results, 'global search cold: type to results', async () => {
      await page.fill('#search-input', 'Performance');
      await page.waitForFunction(() => {
        const resultsList = document.getElementById('search-results');
        return Boolean(resultsList && !resultsList.hidden && resultsList.querySelectorAll('[data-search-index]').length > 0);
      }, { timeout: 30000 });
    });
    await page.keyboard.press('Escape');
    await measure(results, 'global search warm: type to results', async () => {
      await page.fill('#search-input', 'Performance');
      await page.waitForFunction(() => document.getElementById('search-results')?.hidden === false && document.querySelectorAll('#search-results [data-search-index]').length > 0, { timeout: 30000 });
    });
    await page.keyboard.press('Escape');

    await measure(results, 'command palette cold: shortcut to populated palette', async () => {
      await page.keyboard.press('Control+K');
      await page.waitForFunction(() => document.getElementById('command-palette-overlay')?.hidden === false && document.querySelectorAll('#command-palette-results .command-palette-item').length > 0, { timeout: 30000 });
    });
    await page.keyboard.press('Escape');
    await measure(results, 'command palette warm: shortcut to populated palette', async () => {
      await page.keyboard.press('Control+K');
      await page.waitForFunction(() => document.getElementById('command-palette-overlay')?.hidden === false && document.querySelectorAll('#command-palette-results .command-palette-item').length > 0, { timeout: 30000 });
    });
    await page.keyboard.press('Escape');

    const noteId = await page.evaluate(async () => (await window.atlas.listAllNotes())[0]?.id ?? null);
    if (noteId) {
      const frameResult = await measure(results, 'note save frame stall: IPC duration and RAF gap', () => page.evaluate(async (id) => {
        const gaps = [];
        let lastFrame = performance.now();
        let sampling = true;
        let frameId = 0;
        const sample = (timestamp) => {
          gaps.push(timestamp - lastFrame);
          lastFrame = timestamp;
          if (sampling) frameId = requestAnimationFrame(sample);
        };
        const longTasks = [];
        let observer = null;
        if (window.PerformanceObserver) {
          try {
            observer = new PerformanceObserver((list) => longTasks.push(...list.getEntries().map((entry) => entry.duration)));
            observer.observe({ type: 'longtask', buffered: false });
          } catch {
            observer = null;
          }
        }
        frameId = requestAnimationFrame(sample);
        const started = performance.now();
        await window.atlas.updateNoteContent(id, 'Performance frame-stall measurement content.');
        const ipcMs = performance.now() - started;
        await new Promise((resolve) => setTimeout(resolve, 300));
        sampling = false;
        cancelAnimationFrame(frameId);
        observer?.disconnect();
        return {
          ipcMs: Number(ipcMs.toFixed(1)),
          maxRafGapMs: Number(Math.max(...gaps, 0).toFixed(1)),
          sampledFrames: gaps.length,
          longTasksMs: longTasks.map((duration) => Number(duration.toFixed(1))),
        };
      }, noteId));
      if (frameResult && frameResult.detail) results[results.length - 1].detail = frameResult.detail;
    }

    const rendererBundlePath = path.join(repoRoot, 'dist', 'renderer', 'renderer.js');
    const pdfWorkerPath = path.join(repoRoot, 'dist', 'renderer', 'pdf.worker.mjs');
    results.push({
      label: 'renderer bundle size',
      bytes: fs.existsSync(rendererBundlePath) ? fs.statSync(rendererBundlePath).size : null,
      ok: fs.existsSync(rendererBundlePath),
    });
    results.push({
      label: 'PDF worker bundle size',
      bytes: fs.existsSync(pdfWorkerPath) ? fs.statSync(pdfWorkerPath).size : null,
      ok: fs.existsSync(pdfWorkerPath),
    });
  } finally {
    if (app) {
      try {
        await app.close();
      } catch (error) {
        appErrors.push(`app.close: ${String(error?.stack || error)}`);
      }
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  }

  console.log('\nAtlas performance baseline');
  console.log('Temporary data was removed after the run. Live Atlas data was not used.');
  console.log('Seed counts:', JSON.stringify(seedSummary.counts));
  for (const result of results) {
    const value = result.bytes !== undefined ? `${result.bytes} bytes` : `${result.ms} ms`;
    console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.label.padEnd(52)} ${value}${result.detail ? `  ${JSON.stringify(result.detail)}` : ''}`);
  }
  if (rendererErrors.length) console.log(`Renderer errors captured: ${rendererErrors.length}`, rendererErrors.slice(0, 5));
  if (appErrors.length) console.log(`Electron errors captured: ${appErrors.length}`, appErrors.slice(0, 5));

  if (results.some((result) => !result.ok)) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
