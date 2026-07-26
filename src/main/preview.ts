import * as fs from 'fs';
import { pathToFileURL } from 'url';
import { marked } from 'marked';
import mammoth from 'mammoth';
import AdmZip from 'adm-zip';
import * as XLSX from 'xlsx';

export type Preview =
  | { type: 'pdf'; url: string }
  | { type: 'image'; url: string; zoomLevel: number | null }
  | { type: 'html'; html: string; note?: string }
  | { type: 'text'; text: string }
  | { type: 'link'; url: string }
  | { type: 'unsupported'; reason?: string };

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// The regex below pulls raw text straight out of the slide's XML, which is
// itself already XML-entity-escaped (e.g. a literal "&" is stored as
// "&amp;") — decode that first, or escapeHtml would double-escape it into
// "&amp;amp;" and the browser would display the literal entity text.
function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// PPTX has no good pure-JS visual renderer (real slide layout/images), so
// this only extracts each slide's text as a readable outline. Deliberately
// not attempting layout fidelity — "Open in browser" is the path to
// see the real thing. See ARCHITECTURE.md / STATUS.md for the reasoning.
export function extractPptxOutline(filePath: string): string {
  const zip = new AdmZip(filePath);
  const slideEntries = zip
    .getEntries()
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
    .sort((a, b) => {
      const na = parseInt(a.entryName.match(/slide(\d+)\.xml/)![1], 10);
      const nb = parseInt(b.entryName.match(/slide(\d+)\.xml/)![1], 10);
      return na - nb;
    });

  return slideEntries
    .map((entry, i) => {
      const xml = entry.getData().toString('utf-8');
      const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) =>
        escapeHtml(decodeXmlEntities(m[1]))
      );
      const body = texts.length > 0 ? texts.join('<br/>') : '<span class="muted">(no text)</span>';
      return `<section class="slide"><h3>Slide ${i + 1}</h3><p>${body}</p></section>`;
    })
    .join('\n');
}

// Reads without evaluating formulas (cellFormula: false) — Atlas only needs
// cell values for a read-only view, not a spreadsheet engine, and skipping
// formula parsing narrows the surface of the xlsx library's known parser
// CVEs (prototype pollution / ReDoS — see ARCHITECTURE.md §7). One <table>
// per sheet, sheet name as a heading.
export function xlsxToHtml(filePath: string): string {
  const workbook = XLSX.readFile(filePath, { cellFormula: false, cellHTML: false });
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const table = XLSX.utils.sheet_to_html(sheet, { header: '', footer: '' });
    return `<h3>${escapeHtml(name)}</h3>${table}`;
  }).join('\n');
}

export async function getPreview(
  kind: string,
  filePath: string,
  zoomLevel: number | null = null
): Promise<Preview> {
  switch (kind) {
    case 'pdf':
      return { type: 'pdf', url: pathToFileURL(filePath).href };

    case 'image':
      return { type: 'image', url: pathToFileURL(filePath).href, zoomLevel };

    // A 'link' resource has no local file at all — file_path holds the
    // external Drive/link/YouTube/Form URL directly (see googleClassroom.ts).
    // The renderer opens this externally rather than rendering it in-app.
    case 'link':
      return { type: 'link', url: filePath };

    case 'text':
      return { type: 'text', text: fs.readFileSync(filePath, 'utf-8') };

    case 'markdown':
      // Pinned to marked@12 deliberately — 13+ dropped the CJS build this
      // CommonJS main process needs (ERR_REQUIRE_ESM otherwise).
      return { type: 'html', html: await marked.parse(fs.readFileSync(filePath, 'utf-8')) };

    case 'docx':
      try {
        const result = await mammoth.convertToHtml({ path: filePath });
        return { type: 'html', html: result.value };
      } catch {
        return { type: 'unsupported', reason: 'Could not read this .docx file.' };
      }

    case 'pptx':
      try {
        return {
          type: 'html',
          html: extractPptxOutline(filePath),
          note: 'Text-only preview — slide layout and images are not shown. Use "Open in browser" for the real thing.',
        };
      } catch {
        return { type: 'unsupported', reason: 'Could not read this .pptx file.' };
      }

    case 'xlsx':
      try {
        return { type: 'html', html: xlsxToHtml(filePath) };
      } catch {
        return { type: 'unsupported', reason: 'Could not read this spreadsheet.' };
      }

    default:
      return { type: 'unsupported' };
  }
}
