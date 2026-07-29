import * as fs from 'fs';
import AdmZip from 'adm-zip';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { loadPdfjs } from './pdfjsLoader';
import { decodeXmlEntities } from './preview';

// Page-aware extraction for the Phase 4 Context Builder (phase4-spec.md §3).
// Each resource's text is split into "parts" (page/slide/sheet/section) with
// a human-readable label, so search can point the AI agent at "page 214" and
// it can request just that range instead of an entire file at once.

export type ExtractionStatus = 'done' | 'empty' | 'unsupported' | 'failed';

export interface DocumentPart {
  ordinal: number;
  label: string;
  text: string;
}

export interface ExtractionResult {
  status: ExtractionStatus;
  parts: DocumentPart[];
  error?: string;
}

// DOCX/TXT/MD have no real page boundaries, so long runs of plain text are
// split into fixed-size blocks purely so no single part is unreasonably
// large — the label says "Part N", not "Page N", to avoid implying a
// precision the format doesn't have (phase4-spec.md §10).
const CHUNK_CHARS = 3000;

// --- Link preservation (remote-attachments-spec.md §2.2) ---
//
// Every extractor previously discarded hyperlink targets, keeping only the
// visible link text — verified against a real course spreadsheet where a
// professor indexed an entire semester as links inside one sheet. The
// extracted text contained the words "Course Syllabus" and no URL at all.
//
// URLs are kept in the part text itself (rather than a side table) so they
// are searchable, visible to the AI agent, and useful even for links Atlas
// can't fetch — an external dataset or a Zoom room is still information the
// agent can act on, and deciding what to do with it is the agent's job, not
// Atlas's.

function dedupeLinks(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    const trimmed = url.trim();
    // Ignore in-document jumps ('#section') and mail links — neither is a
    // document Atlas or the agent can go and read.
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('mailto:')) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

// Appended on its own line rather than spliced inline, because the formats
// where this is needed (PDF annotations, PPTX relationships) expose links
// separately from the text runs they belong to — pairing them back up
// reliably would need full XML/annotation-geometry parsing for little gain.
function appendLinks(text: string, links: string[]): string {
  if (links.length === 0) return text;
  const block = `Links: ${links.join(' ')}`;
  return text ? `${text}\n${block}` : block;
}

function chunkPlainText(text: string, labelPrefix: string): DocumentPart[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const parts: DocumentPart[] = [];
  let ordinal = 1;
  for (let i = 0; i < trimmed.length; i += CHUNK_CHARS) {
    parts.push({ ordinal, label: `${labelPrefix} ${ordinal}`, text: trimmed.slice(i, i + CHUNK_CHARS) });
    ordinal++;
  }
  return parts;
}

// Real text-layer extraction, distinct from ocr.ts's extractTextFromPdf
// (which renders each page to an image and OCRs it — that path is for
// scanned PDFs with no text layer at all, triggered explicitly via the
// existing "Run OCR" button). This one reads whatever real text the PDF
// already contains, which is what most lecture-slide/textbook PDFs have.
async function extractPdfParts(filePath: string): Promise<DocumentPart[]> {
  const pdfjsLib = await loadPdfjs();
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const parts: DocumentPart[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    // getTextContent() returns glyphs only — a PDF's clickable links live in
    // separate annotation objects and were previously dropped entirely. A
    // syllabus whose readings are all links would extract as bare titles
    // with nothing to follow.
    let links: string[] = [];
    try {
      const annotations = (await page.getAnnotations()) as { subtype?: string; url?: string }[];
      links = dedupeLinks(annotations.filter((a) => a.subtype === 'Link' && a.url).map((a) => a.url!));
    } catch {
      links = []; // annotation parsing is best-effort; never fail a page over it
    }

    const combined = appendLinks(text, links);
    if (combined) parts.push({ ordinal: pageNum, label: `Page ${pageNum}`, text: combined });
  }
  return parts;
}

// Same slide-XML text pulled for the preview outline (preview.ts's
// extractPptxOutline), but returned as raw per-slide text rather than an
// HTML string, since this feeds document_parts/search rather than a viewer.
// Pulls the plain <a:t> text runs out of any slide-like OOXML part. Shared
// by the slide itself and its speaker-notes counterpart, which use the same
// DrawingML text markup.
function pptxTextRuns(xml: string): string {
  return [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)]
    .map((m) => decodeXmlEntities(m[1]))
    .join('\n')
    .trim();
}

// A slide's hyperlinks aren't in the slide XML — the XML only carries a
// relationship id, with the actual URL in a sibling .rels file. Only
// TargetMode="External" relationships are real links; the rest are internal
// references to images, layouts and other slides.
function pptxSlideLinks(zip: AdmZip, slideNumber: number): string[] {
  const rels = zip.getEntry(`ppt/slides/_rels/slide${slideNumber}.xml.rels`);
  if (!rels) return [];
  const xml = rels.getData().toString('utf-8');
  const urls: string[] = [];
  for (const match of xml.matchAll(/<Relationship\b([^>]*)>/g)) {
    const attrs = match[1];
    if (!/TargetMode="External"/.test(attrs)) continue;
    const target = attrs.match(/Target="([^"]+)"/)?.[1];
    if (target) urls.push(decodeXmlEntities(target));
  }
  return dedupeLinks(urls);
}

function extractPptxParts(filePath: string): DocumentPart[] {
  const zip = new AdmZip(filePath);
  const slideEntries = zip
    .getEntries()
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
    .sort((a, b) => {
      const na = parseInt(a.entryName.match(/slide(\d+)\.xml/)![1], 10);
      const nb = parseInt(b.entryName.match(/slide(\d+)\.xml/)![1], 10);
      return na - nb;
    });

  const parts: DocumentPart[] = [];
  slideEntries.forEach((entry, i) => {
    const slideNumber = parseInt(entry.entryName.match(/slide(\d+)\.xml/)![1], 10);
    const sections = [pptxTextRuns(entry.getData().toString('utf-8'))];

    // Speaker notes were never read before — they live in a separate part of
    // the package. For a lecture deck these often hold the actual explanation
    // while the slide itself is just bullet headings, so skipping them threw
    // away the more substantive half of the file.
    const notes = zip.getEntry(`ppt/notesSlides/notesSlide${slideNumber}.xml`);
    if (notes) {
      const notesText = pptxTextRuns(notes.getData().toString('utf-8'));
      // Notes XML re-includes the slide number as a text run; drop a notes
      // body that is nothing but that.
      if (notesText && notesText !== String(slideNumber)) sections.push(`Speaker notes: ${notesText}`);
    }

    const text = appendLinks(sections.filter(Boolean).join('\n'), pptxSlideLinks(zip, slideNumber));
    if (text) parts.push({ ordinal: i + 1, label: `Slide ${i + 1}`, text });
  });
  return parts;
}

// One part per sheet, as plain CSV-ish text rather than the HTML table
// preview.ts renders for viewing — the agent needs the cell values, not
// markup. Same cellFormula/cellHTML: false reasoning as preview.ts (narrows
// the surface of xlsx's known parser CVEs — ARCHITECTURE.md §7).
// Walks cells directly rather than using sheet_to_csv(), for two reasons
// found by running a real course spreadsheet through the old version:
//
//  1. A cell's hyperlink lives in `cell.l.Target`, entirely separate from
//     its value. sheet_to_csv() reads values only, so every link in the
//     professor's course index was silently discarded.
//  2. Sheets declare a used-range far larger than their real content (an
//     attendance sheet spanning A1:AD1041 produced 37,000 characters that
//     were 81% commas). Empty rows are skipped and trailing empty cells
//     trimmed, so what reaches the agent is content instead of padding.
function sheetToText(sheet: XLSX.WorkSheet): string {
  const ref = sheet['!ref'];
  if (!ref) return '';
  const range = XLSX.utils.decode_range(ref);
  const rows: string[] = [];

  for (let r = range.s.r; r <= range.e.r; r++) {
    const cells: string[] = [];
    let rowHasContent = false;

    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
      if (!cell) {
        cells.push('');
        continue;
      }
      // Prefer the formatted value (`w`) so dates read as dates rather than
      // as raw serial numbers.
      const raw = cell.w ?? cell.v;
      let value = raw === undefined || raw === null ? '' : String(raw).replace(/\s+/g, ' ').trim();
      const target = cell.l?.Target?.trim();
      if (target && !target.startsWith('#')) value = value ? `${value} (${target})` : target;
      if (value) rowHasContent = true;
      cells.push(value);
    }

    if (!rowHasContent) continue;
    while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
    rows.push(cells.join(' | '));
  }

  return rows.join('\n');
}

function extractXlsxParts(filePath: string): DocumentPart[] {
  const workbook = XLSX.readFile(filePath, { cellFormula: false, cellHTML: false });
  const parts: DocumentPart[] = [];
  workbook.SheetNames.forEach((name, i) => {
    const text = sheetToText(workbook.Sheets[name]).trim();
    if (text) parts.push({ ordinal: i + 1, label: `Sheet: ${name}`, text });
  });
  return parts;
}

// mammoth gives HTML with real heading tags, which is the only structural
// signal a .docx exposes — split on h1-h3 so a long document reads section
// by section rather than one giant part. A document with no headings at all
// falls back to fixed-size chunking, same as plain text.
async function extractDocxParts(filePath: string): Promise<DocumentPart[]> {
  const result = await mammoth.convertToHtml({ path: filePath });
  const html = result.value;

  // mammoth emits real <a href> and <table> markup, but the old blanket
  // tag-strip threw both away — a reading list of links became bare titles,
  // and a table collapsed into an unreadable run-on. Rewrite those two
  // structures into plain text *before* stripping everything else.
  const stripTags = (fragment: string) =>
    fragment
      // "text (https://…)" keeps the destination attached to its label.
      .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, inner: string) => {
        const label = inner.replace(/<[^>]+>/g, '').trim();
        const target = href.trim();
        if (!target || target.startsWith('#') || target.startsWith('mailto:')) return label;
        return label ? `${label} (${target})` : target;
      })
      // Cell/row boundaries become visible separators so a table stays
      // legible as rows rather than one undifferentiated string.
      .replace(/<\/t[dh]>/gi, ' | ')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .trim();

  const sections = html.split(/(?=<h[1-3][ >])/i).filter((s) => stripTags(s).length > 0);
  if (sections.length <= 1) {
    return chunkPlainText(stripTags(html), 'Section');
  }

  const parts: DocumentPart[] = [];
  sections.forEach((section, i) => {
    const text = stripTags(section);
    if (text) parts.push({ ordinal: i + 1, label: `Section ${i + 1}`, text });
  });
  return parts;
}

export async function extractDocumentParts(kind: string, filePath: string): Promise<ExtractionResult> {
  try {
    let parts: DocumentPart[];
    switch (kind) {
      case 'pdf':
        parts = await extractPdfParts(filePath);
        break;
      case 'pptx':
        parts = extractPptxParts(filePath);
        break;
      case 'xlsx':
        parts = extractXlsxParts(filePath);
        break;
      case 'docx':
        parts = await extractDocxParts(filePath);
        break;
      case 'text':
      case 'markdown':
        parts = chunkPlainText(fs.readFileSync(filePath, 'utf-8'), 'Part');
        break;
      default:
        return { status: 'unsupported', parts: [] };
    }
    // A PDF that parsed without error but yielded zero text is almost always
    // a scan (image pages, no text layer) — 'empty' rather than 'done' is
    // what tells the UI to surface the existing "Run OCR" button (§3.7).
    return { status: parts.length > 0 ? 'done' : 'empty', parts };
  } catch (err) {
    return { status: 'failed', parts: [], error: err instanceof Error ? err.message : String(err) };
  }
}
