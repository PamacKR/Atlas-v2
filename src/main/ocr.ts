import * as fs from 'fs';
import * as path from 'path';
import { createWorker } from 'tesseract.js';
import type { Worker } from 'tesseract.js';
import { createCanvas } from '@napi-rs/canvas';
import { loadPdfjs } from './pdfjsLoader';

// Vendored locally (see scripts/copy-assets.js) so OCR never reaches out to a
// CDN for the English language model or pdfjs's standard-14 font metrics —
// "local, offline" (ARCHITECTURE.md §3) has to cover the whole pipeline, not
// just "no cloud OCR API call."
const TESSDATA_PATH = path.join(__dirname, 'tessdata');
// pdfjs validates this as a URL-style path (forward slashes, trailing slash)
// regardless of platform — Windows's own path.sep would fail its "must
// include trailing slash" check since it also expects '/' separators.
const STANDARD_FONTS_PATH = path.join(__dirname, 'standard_fonts').replace(/\\/g, '/') + '/';

// Worker startup (loading eng.traineddata) costs real time, so one worker is
// reused across every page/file in an import batch rather than paying that
// cost per page — the caller (main.ts) calls endOcrBatch() once the whole
// batch of imported scans is done.
let sharedWorkerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!sharedWorkerPromise) {
    sharedWorkerPromise = createWorker('eng', 1, {
      langPath: TESSDATA_PATH,
      cachePath: TESSDATA_PATH,
      gzip: false,
    });
  }
  return sharedWorkerPromise;
}

export async function endOcrBatch(): Promise<void> {
  if (!sharedWorkerPromise) return;
  const workerPromise = sharedWorkerPromise;
  sharedWorkerPromise = null;
  const worker = await workerPromise;
  await worker.terminate();
}

// Exported so callers that need the individual pages back (main.ts's
// resources:saveOcrText, for document_parts — phase4-spec.md §3.7) can split
// on the exact same separator this module joins with, rather than guessing.
export const OCR_PAGE_SEPARATOR = '\n\n---\n\n';

function isPdf(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === '.pdf';
}

async function recognizeImage(input: Buffer | string): Promise<string> {
  const worker = await getWorker();
  const { data } = await worker.recognize(input);
  return data.text.trim();
}

async function extractTextFromPdf(
  filePath: string,
  onProgress?: (page: number, totalPages: number) => void
): Promise<string> {
  const pdfjsLib = await loadPdfjs();
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({
    data,
    standardFontDataUrl: STANDARD_FONTS_PATH,
  }).promise;

  const pageTexts: string[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    onProgress?.(pageNum, doc.numPages);
    const page = await doc.getPage(pageNum);
    // Scale 2x — Adobe-Scan-style photographed pages are dense enough that
    // rendering at the PDF's native (1x) resolution loses handwriting detail
    // Tesseract needs; 2x is a cheap, noticeable accuracy win.
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    // @napi-rs/canvas's Canvas is duck-type compatible with the DOM
    // HTMLCanvasElement pdfjs expects (same getContext/width/height surface),
    // just not the same TS type.
    await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
    const text = await recognizeImage(canvas.toBuffer('image/png'));
    pageTexts.push(text);
  }
  return pageTexts.join(OCR_PAGE_SEPARATOR);
}

// One imported file = one note (see ARCHITECTURE.md §3 / STATUS.md Phase 2
// notes) — a multi-page PDF's pages are OCR'd separately and joined into one
// block of text, not split into multiple notes.
export async function extractTextFromScan(
  filePath: string,
  onProgress?: (page: number, totalPages: number) => void
): Promise<string> {
  if (isPdf(filePath)) return extractTextFromPdf(filePath, onProgress);
  onProgress?.(1, 1);
  return recognizeImage(filePath);
}
