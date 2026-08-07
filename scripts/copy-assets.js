// Copies non-TypeScript assets (SQL schema, renderer HTML/CSS, vendored OCR
// data) into dist/ after tsc build, since tsc only compiles .ts files. The
// notes editor's own CSS (@milkdown/crepe) is bundled into its lazy feature
// bundle by esbuild (build-renderer.js), rather than loaded by the first-use
// renderer shell.
const fs = require('fs');
const path = require('path');

const fileCopies = [
  ['src/main/db/schema.sql', 'dist/main/db/schema.sql'],
  ['src/renderer/index.html', 'dist/renderer/index.html'],
  ['src/renderer/styles.css', 'dist/renderer/styles.css'],
];

for (const [from, to] of fileCopies) {
  const src = path.join(__dirname, '..', from);
  const dest = path.join(__dirname, '..', to);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

// Vendored so OCR (src/main/ocr.ts) never reaches out to a CDN for Tesseract's
// English language data or pdfjs's standard-14 font metrics — see
// ARCHITECTURE.md §3 on why "local, offline" has to mean the whole pipeline,
// not just "no cloud OCR API call."
function copyDir(fromRel, toRel) {
  const src = path.join(__dirname, '..', fromRel);
  const dest = path.join(__dirname, '..', toRel);
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    fs.copyFileSync(path.join(src, entry), path.join(dest, entry));
  }
}

copyDir('assets/tessdata', 'dist/main/tessdata');
copyDir('assets/standard_fonts', 'dist/main/standard_fonts');
copyDir('assets/icons', 'dist/main/assets/icons');
copyDir('src/renderer/assets', 'dist/renderer/assets');
fs.copyFileSync(
  path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs'),
  path.join(__dirname, '..', 'dist', 'renderer', 'pdf.worker.mjs')
);
