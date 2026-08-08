// Focused Electron verification for the accent-color system.
// Runs against throwaway data and exercises the actual renderer in both themes
// so a selected accent cannot silently stop at solid controls again.
const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

const ACCENTS = ['#d9a441', '#3b82f6', '#8b5cf6', '#3ba55d', '#ec4899'];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function cssRgb(hex) {
  const normalized = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16));
  return `rgb(${channels[0]}, ${channels[1]}, ${channels[2]})`;
}

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-accent-colors-'));
  let app;

  try {
    app = await electron.launch({
      args: [path.join(__dirname, '..')],
      env: { ...process.env, ATLAS_DATA_DIR: dataDir, ATLAS_TEST_NO_REVEAL: '1' },
    });
    let window = await app.firstWindow();
    window.on('pageerror', (error) => console.error('[renderer error]', error));
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(500);

    const goToPage = async (page) => {
      await window.click(`.sidebar-nav-item[data-page="${page}"]`);
      await window.waitForTimeout(180);
    };

    const readTheme = async () => window.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const read = (name) => root.getPropertyValue(name).trim();
      const settingsNav = document.querySelector('.settings-nav-item.active');
      const settingsRow = document.querySelector('#settings-panels .settings-row');
      const lightButton = document.getElementById('settings-theme-light');
      const search = document.getElementById('search-input');
      return {
        theme: document.documentElement.dataset.theme,
        accent: read('--accent'),
        foreground: read('--accent-foreground'),
        bg: read('--bg'),
        panel: read('--bg-panel'),
        hover: read('--bg-hover'),
        text: read('--text'),
        muted: read('--text-muted'),
        faint: read('--text-faint'),
        rule: read('--rule'),
        strongRule: read('--rule-strong'),
        soft: read('--accent-soft'),
        softStrong: read('--accent-soft-strong'),
        accentRule: read('--accent-rule'),
        urgent: read('--urgent'),
        good: read('--good'),
        settingsNavBackground: settingsNav ? getComputedStyle(settingsNav).backgroundColor : '',
        settingsNavSmall: settingsNav ? getComputedStyle(settingsNav.querySelector('small')).color : '',
        settingsRowBorder: settingsRow ? getComputedStyle(settingsRow).borderBottomColor : '',
        themeButtonBackground: lightButton ? getComputedStyle(lightButton).backgroundColor : '',
        searchBorder: search ? getComputedStyle(search).borderColor : '',
      };
    });

    const snapshots = { light: {}, dark: {} };
    await goToPage('settings');

    for (const theme of ['light', 'dark']) {
      await window.click(`#settings-theme-${theme}`);
      await window.waitForTimeout(120);
      snapshots[theme] = {};

      for (let index = 0; index < ACCENTS.length; index += 1) {
        const accent = ACCENTS[index];
        await window.locator('#settings-accent-swatches button').nth(index).click();
        await window.waitForTimeout(80);
        const snapshot = await readTheme();
        snapshots[theme][accent] = snapshot;

        assert(snapshot.theme === theme, `${theme} theme was not applied`);
        assert(snapshot.accent.toLowerCase() === accent, `${theme} ${accent} accent token did not apply: ${snapshot.accent}`);
        assert(snapshot.bg && snapshot.panel && snapshot.hover && snapshot.rule, `${theme} ${accent} missing derived surface tokens`);
        assert(snapshot.soft && snapshot.softStrong && snapshot.accentRule, `${theme} ${accent} missing accent soft/rule tokens`);
        assert(snapshot.settingsNavBackground, `${theme} ${accent} Settings active state was not rendered`);
        assert(snapshot.settingsRowBorder, `${theme} ${accent} Settings divider was not rendered`);
        assert(snapshot.settingsNavSmall === cssRgb(accent), `${theme} ${accent} Settings active metadata did not follow the accent: ${snapshot.settingsNavSmall}`);

        if (theme === 'light') {
          await window.click('#search-input');
          const focused = await window.evaluate(() => getComputedStyle(document.getElementById('search-input')).borderColor);
          assert(focused === cssRgb(accent), `${accent} light focus outline did not follow the accent: ${focused}`);
        }

        if (theme === 'light' && accent === '#3b82f6') {
          await window.screenshot({ path: path.join(__dirname, '..', 'verify-accent-colors-light-blue.png') });
        }
        if (theme === 'dark' && accent === '#3b82f6') {
          await window.screenshot({ path: path.join(__dirname, '..', 'verify-accent-colors-dark-blue.png') });
        }
        if (theme === 'light' && accent === '#ec4899') {
          await window.screenshot({ path: path.join(__dirname, '..', 'verify-accent-colors-light-pink.png') });
        }
      }
    }

    const lightAmber = snapshots.light[ACCENTS[0]];
    const lightBlue = snapshots.light['#3b82f6'];
    for (const key of ['bg', 'panel', 'hover', 'text', 'muted', 'faint', 'rule', 'strongRule', 'settingsRowBorder']) {
      assert(lightAmber[key] === lightBlue[key], `Light neutral ${key} changed between amber and blue: ${lightAmber[key]} vs ${lightBlue[key]}`);
    }
    for (const key of ['soft', 'softStrong', 'accentRule', 'settingsNavBackground']) {
      assert(lightAmber[key] !== lightBlue[key], `Light accent state ${key} did not change between amber and blue: ${lightAmber[key]}`);
    }

    const darkAmber = snapshots.dark[ACCENTS[0]];
    const darkBlue = snapshots.dark['#3b82f6'];
    for (const key of ['bg', 'panel', 'hover', 'text', 'muted', 'faint', 'rule', 'strongRule']) {
      assert(darkAmber[key] === darkBlue[key], `Dark neutral ${key} changed between amber and blue: ${darkAmber[key]} vs ${darkBlue[key]}`);
    }
    for (const key of ['soft', 'softStrong', 'accentRule', 'settingsNavBackground']) {
      assert(darkAmber[key] !== darkBlue[key], `Dark accent state ${key} did not change between amber and blue: ${darkAmber[key]}`);
    }

    assert(lightAmber.urgent === lightBlue.urgent && lightAmber.good === lightBlue.good, 'Light semantic status colours changed with the accent');
    assert(darkAmber.urgent === darkBlue.urgent && darkAmber.good === darkBlue.good, 'Dark semantic status colours changed with the accent');

    await goToPage('calendar');
    const calendarState = await window.evaluate(() => {
      const today = document.querySelector('.cal-cell.is-today .cal-daynum, .mc-day.is-today');
      const checkbox = document.querySelector('#calendar-type-filters input[type="checkbox"]:checked, #calendar-course-filters input[type="checkbox"]:checked');
      return {
        todayBackground: today ? getComputedStyle(today).backgroundColor : '',
        todayColor: today ? getComputedStyle(today).color : '',
        checkboxBackground: checkbox ? getComputedStyle(checkbox).backgroundColor : '',
      };
    });
    assert(calendarState.todayBackground, 'Calendar current-day accent surface was not rendered');
    assert(calendarState.checkboxBackground, 'Calendar checked accent control was not rendered');

    await goToPage('resources');
    await window.click('#upload-button');
    await window.waitForSelector('#course-picker-overlay:not([hidden])');
    const dropzoneState = await window.evaluate(() => {
      const dropzone = document.getElementById('course-picker-dropzone');
      dropzone.classList.add('drag-active');
      return {
        background: getComputedStyle(dropzone).backgroundColor,
        border: getComputedStyle(dropzone).borderTopColor,
      };
    });
    assert(dropzoneState.background && dropzoneState.border, 'Drag/drop accent state did not render');
    await window.click('#course-picker-close');

    await goToPage('dashboard');
    await window.keyboard.press('Control+k');
    await window.waitForSelector('#command-palette-overlay:not([hidden])');
    const paletteState = await window.evaluate(() => {
      const input = document.getElementById('command-palette-input');
      input.focus();
      return {
        border: getComputedStyle(input).borderColor,
        shadow: getComputedStyle(input).boxShadow,
      };
    });
    assert(paletteState.border && paletteState.shadow, 'Command-palette accent focus state did not render');
    await window.keyboard.press('Escape');

    const stylesheet = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'styles.css'), 'utf8');
    assert(!stylesheet.includes('rgba(217, 164, 65'), 'A hardcoded default-amber tint remains in active renderer CSS');

    await app.close();
    app = await electron.launch({
      args: [path.join(__dirname, '..')],
      env: { ...process.env, ATLAS_DATA_DIR: dataDir, ATLAS_TEST_NO_REVEAL: '1' },
    });
    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(500);
    const persisted = await window.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
      activeSwatch: document.querySelector('.settings-accent-swatch.active')?.getAttribute('data-accent-color') ?? null,
    }));
    assert(persisted.theme === 'dark', `Theme did not persist after relaunch: ${persisted.theme}`);
    assert(persisted.accent.toLowerCase() === '#ec4899', `Accent did not persist after relaunch: ${persisted.accent}`);
    assert(persisted.activeSwatch === '#ec4899', `Active accent swatch did not persist after relaunch: ${persisted.activeSwatch}`);

    console.log('accent colors verify: PASS');
  } finally {
    if (app) await app.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
