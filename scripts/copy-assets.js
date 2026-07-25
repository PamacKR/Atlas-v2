// Copies non-TypeScript assets (SQL schema, renderer HTML/CSS) into dist/
// after tsc build, since tsc only compiles .ts files. The notes editor's own
// CSS (@milkdown/crepe) is bundled by esbuild instead (build-renderer.js),
// since it's imported directly from renderer.ts.
const fs = require('fs');
const path = require('path');

const copies = [
  ['src/main/db/schema.sql', 'dist/main/db/schema.sql'],
  ['src/renderer/index.html', 'dist/renderer/index.html'],
  ['src/renderer/styles.css', 'dist/renderer/styles.css'],
];

for (const [from, to] of copies) {
  const src = path.join(__dirname, '..', from);
  const dest = path.join(__dirname, '..', to);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}
