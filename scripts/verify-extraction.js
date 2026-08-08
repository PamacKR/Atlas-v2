// Verifies text extraction preserves what documents actually contain —
// specifically the things it used to silently destroy (remote-attachment architecture
// §2.2). Every check here corresponds to a real defect found by running the
// extractor against a real course spreadsheet a professor had built.
//
// Separate from verify-app.js (which drives the Electron window) and
// verify-mcp.js (which drives the MCP server) because this tests a pure
// module and needs no app at all — but it must still run under Electron's
// Node, since textExtraction.ts pulls in pdfjs alongside better-sqlite3's
// sibling native deps. Run with: npm run verify:extraction
const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');
const XLSX = require('xlsx');
const { extractDocumentParts } = require('../dist/main/textExtraction');

let failures = 0;
function assert(condition, message) {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`ok: ${message}`);
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-verify-extraction-'));

function makePptx() {
  const zip = new AdmZip();
  const add = (n, c) => zip.addFile(n, Buffer.from(c));
  add(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>'
  );
  add(
    '_rels/.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>'
  );
  add('ppt/presentation.xml', '<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>');
  add(
    'ppt/slides/slide1.xml',
    '<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Topic 3 Growth Models</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>'
  );
  add(
    'ppt/slides/_rels/slide1.xml.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://drive.google.com/file/d/READINGXYZ/view" TargetMode="External"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>'
  );
  add(
    'ppt/notesSlides/notesSlide1.xml',
    '<?xml version="1.0"?><p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Solow assumes diminishing returns to capital.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>'
  );
  const p = path.join(tmp, 'deck.pptx');
  zip.writeZip(p);
  return p;
}

// A sheet shaped like the real course index that exposed these bugs: a
// hyperlinked cell, and a used-range far larger than the actual content.
function makeXlsx() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Week', 'Topic'],
    ['Week 1', 'Course Overview'],
  ]);
  ws['B2'].l = { Target: 'https://docs.google.com/presentation/d/DECK123/edit' };
  ws['!ref'] = 'A1:H400'; // declared range far beyond real content
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Daily Plan');
  const p = path.join(tmp, 'index.xlsx');
  XLSX.writeFile(wb, p);
  return p;
}

(async () => {
  // --- PPTX: speaker notes + hyperlinks, neither previously read ---
  const pptx = await extractDocumentParts('pptx', makePptx());
  const slide = pptx.parts[0]?.text ?? '';
  assert(/Growth Models/.test(slide), 'pptx: slide body text extracted');
  assert(/diminishing returns/.test(slide), 'pptx: speaker notes extracted (were never read before)');
  assert(/READINGXYZ/.test(slide), 'pptx: external hyperlink preserved (was discarded before)');
  assert(!/image1\.png/.test(slide), 'pptx: internal image relationship excluded, only real links kept');

  // --- XLSX: hyperlink target + no padding from an oversized used-range ---
  const xlsx = await extractDocumentParts('xlsx', makeXlsx());
  const sheet = xlsx.parts[0]?.text ?? '';
  assert(/DECK123/.test(sheet), "xlsx: cell hyperlink target preserved (cell.l.Target was never read)");
  assert(/Course Overview/.test(sheet), 'xlsx: cell value still extracted alongside its link');
  assert(sheet.split('\n').length <= 3, 'xlsx: empty rows from an oversized used-range are skipped, not padded');
  assert(!/,{5,}/.test(sheet), 'xlsx: no run of empty comma-separated cells');

  // --- Plain text still works (no regression to the simple path) ---
  const txtPath = path.join(tmp, 'a.txt');
  fs.writeFileSync(txtPath, 'Plain content here.');
  const txt = await extractDocumentParts('text', txtPath);
  assert(txt.status === 'done' && /Plain content/.test(txt.parts[0].text), 'text: plain files unaffected');

  // --- Unreadable kinds still report honestly ---
  const unsupported = await extractDocumentParts('zip', txtPath);
  assert(unsupported.status === 'unsupported', 'unsupported kinds still report unsupported');

  fs.rmSync(tmp, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`\n${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log('\nPASS');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
