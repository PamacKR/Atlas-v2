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
    if (text) parts.push({ ordinal: pageNum, label: `Page ${pageNum}`, text });
  }
  return parts;
}

// Same slide-XML text pulled for the preview outline (preview.ts's
// extractPptxOutline), but returned as raw per-slide text rather than an
// HTML string, since this feeds document_parts/search rather than a viewer.
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
    const xml = entry.getData().toString('utf-8');
    const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXmlEntities(m[1]));
    const text = texts.join('\n').trim();
    if (text) parts.push({ ordinal: i + 1, label: `Slide ${i + 1}`, text });
  });
  return parts;
}

// One part per sheet, as plain CSV-ish text rather than the HTML table
// preview.ts renders for viewing — the agent needs the cell values, not
// markup. Same cellFormula/cellHTML: false reasoning as preview.ts (narrows
// the surface of xlsx's known parser CVEs — ARCHITECTURE.md §7).
function extractXlsxParts(filePath: string): DocumentPart[] {
  const workbook = XLSX.readFile(filePath, { cellFormula: false, cellHTML: false });
  const parts: DocumentPart[] = [];
  workbook.SheetNames.forEach((name, i) => {
    const sheet = workbook.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(sheet).trim();
    if (csv) parts.push({ ordinal: i + 1, label: `Sheet: ${name}`, text: csv });
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
  const stripTags = (fragment: string) => fragment.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

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
