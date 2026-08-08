import * as fs from 'fs';
import * as path from 'path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { loadPdfjs } from './pdfjsLoader';
import type { VisualSource } from './contextBuilder';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_RENDER_DIMENSION = 1800;
const STANDARD_FONTS_PATH = path.join(__dirname, 'standard_fonts').replace(/\\/g, '/') + '/';

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.svg': 'image/svg+xml',
};

export interface RenderedVisual {
  data: Buffer;
  mimeType: string;
  page: number;
  pageCount: number;
  resized: boolean;
}

function verifyLocalFile(filePath: string): void {
  if (!filePath || /^[a-z]+:\/\//i.test(filePath)) {
    throw new Error('This visual source is not a local file available to Atlas.');
  }
  let stats: fs.Stats;
  try {
    stats = fs.statSync(filePath);
  } catch {
    throw new Error('The visual source is no longer available on disk.');
  }
  if (!stats.isFile()) throw new Error('The visual source is not a regular file.');
}

async function renderPdf(filePath: string, requestedPage: number): Promise<RenderedVisual> {
  const pdfjsLib = await loadPdfjs();
  const data = new Uint8Array(fs.readFileSync(filePath));
  const document = await pdfjsLib.getDocument({ data, standardFontDataUrl: STANDARD_FONTS_PATH }).promise;
  if (requestedPage < 1 || requestedPage > document.numPages) {
    await document.cleanup();
    throw new Error(`PDF page must be between 1 and ${document.numPages}.`);
  }

  const page = await document.getPage(requestedPage);
  try {
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(1.5, MAX_RENDER_DIMENSION / Math.max(baseViewport.width, baseViewport.height));
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
    return {
      data: canvas.toBuffer('image/png'),
      mimeType: 'image/png',
      page: requestedPage,
      pageCount: document.numPages,
      resized: scale !== 1,
    };
  } finally {
    page.cleanup();
    await document.cleanup();
  }
}

async function readImage(filePath: string, requestedPage: number): Promise<RenderedVisual> {
  if (requestedPage !== 1) throw new Error('Images have one page; use page 1.');
  const data = fs.readFileSync(filePath);
  const mimeType = IMAGE_MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? 'image/png';
  if (data.length <= MAX_IMAGE_BYTES) {
    return { data, mimeType, page: 1, pageCount: 1, resized: false };
  }

  const image = await loadImage(data);
  const scale = Math.min(1, MAX_RENDER_DIMENSION / Math.max(image.width, image.height));
  const canvas = createCanvas(Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return {
    data: canvas.toBuffer('image/png'),
    mimeType: 'image/png',
    page: 1,
    pageCount: 1,
    resized: true,
  };
}

export async function renderVisual(source: VisualSource, requestedPage = 1): Promise<RenderedVisual> {
  verifyLocalFile(source.filePath);
  if (source.kind === 'pdf') return renderPdf(source.filePath, requestedPage);
  return readImage(source.filePath, requestedPage);
}
