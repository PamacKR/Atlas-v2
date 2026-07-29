// pdfjs-dist ships ESM-only as of v6 (no CJS build) — same ERR_REQUIRE_ESM
// constraint already documented on `marked` in preview.ts, but here the fix
// is a dynamic import rather than pinning an older major version, since
// there's no CJS-compatible pdfjs-dist release with this API shape.
//
// A plain `await import(...)` doesn't work: tsc compiling to CommonJS
// rewrites it to `Promise.resolve().then(() => require(...))`, and `require`
// can't load an ESM-only module (ERR_REQUIRE_ESM) — confirmed by inspecting
// the actual compiler output. Routing the import through `new Function(...)`
// hides the `import()` call from TypeScript's static transform entirely, so
// it reaches Node as a genuine dynamic import at runtime.
//
// Shared by ocr.ts (renders pages to images for Tesseract) and
// textExtraction.ts (reads the real text layer directly) — both need the
// same ESM-dodge, so it lives here once rather than twice.
const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')>;

export async function loadPdfjs() {
  return dynamicImport('pdfjs-dist/legacy/build/pdf.mjs');
}
