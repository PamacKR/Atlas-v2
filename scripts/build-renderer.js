// Bundles src/renderer/renderer.ts (plus its npm imports, e.g. @toast-ui/editor)
// into a single browser-ready dist/renderer/renderer.js via esbuild.
//
// The renderer window loads this as a plain <script> tag with no module
// system available (contextIsolation: true, nodeIntegration: false) — tsc
// alone can't produce that; it only transpiles one file at a time and would
// either leave `import`/`require` calls unresolved or emit CommonJS
// boilerplate (`exports = {}`) that throws in a non-module <script> tag.
// esbuild resolves and inlines everything into one IIFE instead.
const esbuild = require('esbuild');
const path = require('path');

esbuild.buildSync({
  entryPoints: [path.join(__dirname, '..', 'src/renderer/renderer.ts')],
  bundle: true,
  outfile: path.join(__dirname, '..', 'dist/renderer/renderer.js'),
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  sourcemap: true,
});
