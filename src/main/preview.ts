import * as fs from 'fs';
import { pathToFileURL } from 'url';
import { marked } from 'marked';
import mammoth from 'mammoth';
import AdmZip from 'adm-zip';

export type Preview =
  | { type: 'pdf' | 'image'; url: string }
  | { type: 'html'; html: string; note?: string }
  | { type: 'text'; text: string }
  | { type: 'unsupported'; reason?: string };

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// PPTX has no good pure-JS visual renderer (real slide layout/images), so
// this only extracts each slide's text as a readable outline. Deliberately
// not attempting layout fidelity — "Open in default app" is the path to
// see the real thing. See ARCHITECTURE.md / STATUS.md for the reasoning.
function extractPptxOutline(filePath: string): string {
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
      const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => escapeHtml(m[1]));
      const body = texts.length > 0 ? texts.join('<br/>') : '<span class="muted">(no text)</span>';
      return `<section class="slide"><h3>Slide ${i + 1}</h3><p>${body}</p></section>`;
    })
    .join('\n');
}

export async function getPreview(kind: string, filePath: string): Promise<Preview> {
  switch (kind) {
    case 'pdf':
    case 'image':
      return { type: kind, url: pathToFileURL(filePath).href };

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
          note: 'Text-only preview — slide layout and images are not shown. Use "Open in default app" for the real thing.',
        };
      } catch {
        return { type: 'unsupported', reason: 'Could not read this .pptx file.' };
      }

    default:
      return { type: 'unsupported' };
  }
}
