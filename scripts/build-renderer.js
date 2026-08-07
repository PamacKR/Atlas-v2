// Bundles src/renderer/renderer.ts (plus its npm imports, e.g. @milkdown/crepe)
// into a single browser-ready dist/renderer/renderer.js via esbuild.
//
// The renderer window loads this as a plain <script> tag with no module
// system available (contextIsolation: true, nodeIntegration: false) — tsc
// alone can't produce that; it only transpiles one file at a time and would
// either leave `import`/`require` calls unresolved or emit CommonJS
// boilerplate (`exports = {}`) that throws in a non-module <script> tag.
// esbuild resolves and inlines everything into one IIFE instead.
//
// The notes editor (@milkdown/crepe) ships its own CSS (imported directly in
// renderer.ts) which in turn references KaTeX's webfont files — esbuild
// needs a `file` loader for those, and emits both a sibling renderer.css and
// the font files into dist/renderer/ alongside renderer.js.
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

for (const staleFile of ['renderer.css', 'renderer.css.map']) {
  fs.rmSync(path.join(__dirname, '..', 'dist/renderer', staleFile), { force: true });
}

const commonOptions = {
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  sourcemap: true,
  loader: {
    '.css': 'css',
    '.woff': 'file',
    '.woff2': 'file',
    '.ttf': 'file',
  },
  // Crepe's math block editor pulls in Vue, which warns at runtime unless
  // these compile-time flags are set — cosmetic only, no behavior depends
  // on them here, but silencing keeps the renderer console clean.
  define: {
    __VUE_OPTIONS_API__: 'false',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
  },
};

for (const [entry, output] of [
  ['renderer.ts', 'renderer.js'],
  ['note-editor.ts', 'note-editor.js'],
  ['pdf-renderer.ts', 'pdf-renderer.js'],
]) {
  esbuild.buildSync({
    ...commonOptions,
    entryPoints: [path.join(__dirname, '..', 'src/renderer', entry)],
    outfile: path.join(__dirname, '..', 'dist/renderer', output),
  });
}
