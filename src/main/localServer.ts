import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { marked } from 'marked';
import katex from 'katex';
import { getDb } from './db/database';
import { getPreview } from './preview';

// Backs "Open in browser": serves a resource's content over a loopback-only
// HTTP endpoint so it can be opened in the user's real browser (real tabs,
// not Electron's preview panel) instead of shelling out to a native desktop
// app. Bound to 127.0.0.1 only — never reachable from the network — since it
// serves local file content with no auth.
let server: http.Server | null = null;
let port = 0;

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

const KATEX_CSS_PATH = require.resolve('katex/dist/katex.min.css');
const KATEX_FONTS_DIR = path.join(path.dirname(KATEX_CSS_PATH), 'fonts');

function wrapHtml(title: string, bodyHtml: string, note?: string, includeKatex = false): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${title}</title>
${includeKatex ? '<link rel="stylesheet" href="/katex.css" />' : ''}
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1.5rem; color: #111; }
  .note { color: #666; font-size: 0.85rem; margin-bottom: 1.5rem; }
  table { border-collapse: collapse; margin-bottom: 1.5rem; font-size: 0.9rem; }
  td, th { border: 1px solid #ddd; padding: 0.3rem 0.6rem; }
  img { max-width: 100%; }
  .slide { border-bottom: 1px solid #ddd; padding: 0.75rem 0; }
</style>
</head>
<body>
${note ? `<p class="note">${note}</p>` : ''}
${bodyHtml}
</body>
</html>`;
}

// Renders a note's markdown (Crepe/remark-math syntax: $...$ inline,
// $$...$$ block) to HTML, with math typeset via KaTeX — `marked` alone has
// no concept of math syntax, so equations are extracted, rendered, and
// spliced back in around the regular markdown pass.
function renderNoteMarkdown(markdownText: string): string {
  const mathHtml: string[] = [];
  const stash = (html: string) => `@@MATH${mathHtml.push(html) - 1}@@`;

  let text = markdownText.replace(/\$\$([\s\S]+?)\$\$/g, (whole, expr) => {
    try {
      return stash(katex.renderToString(expr.trim(), { throwOnError: false, displayMode: true }));
    } catch {
      return whole;
    }
  });
  text = text.replace(/\$([^$\n]+?)\$/g, (whole, expr) => {
    try {
      return stash(katex.renderToString(expr.trim(), { throwOnError: false, displayMode: false }));
    } catch {
      return whole;
    }
  });

  const html = marked.parse(text) as string;
  return html.replace(/@@MATH(\d+)@@/g, (_whole, index) => mathHtml[Number(index)]);
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (req.url === '/katex.css') {
    // KaTeX's CSS references font files via relative "fonts/..." URLs —
    // point those at the /katex-fonts/ route below instead.
    const css = fs.readFileSync(KATEX_CSS_PATH, 'utf-8').replace(/url\(fonts\//g, 'url(/katex-fonts/');
    res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
    res.end(css);
    return;
  }

  const fontMatch = (req.url ?? '').match(/^\/katex-fonts\/([\w.-]+)$/);
  if (fontMatch) {
    const fontPath = path.join(KATEX_FONTS_DIR, fontMatch[1]);
    if (!fontPath.startsWith(KATEX_FONTS_DIR) || !fs.existsSync(fontPath)) {
      res.writeHead(404).end('Not found');
      return;
    }
    const fontContentType: Record<string, string> = {
      '.woff2': 'font/woff2',
      '.woff': 'font/woff',
      '.ttf': 'font/ttf',
    };
    res.writeHead(200, { 'Content-Type': fontContentType[path.extname(fontPath)] ?? 'application/octet-stream' });
    fs.createReadStream(fontPath).pipe(res);
    return;
  }

  const noteMatch = (req.url ?? '').match(/^\/note\/(\d+)$/);
  if (noteMatch) {
    const db = getDb();
    const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(Number(noteMatch[1])) as
      | { title: string; content_markdown: string }
      | undefined;
    if (!note) {
      res.writeHead(404).end('Note not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      wrapHtml(
        note.title,
        renderNoteMarkdown(note.content_markdown),
        'Read-only — edit this note from Atlas itself; this view is for reading/reference alongside other browser tabs.',
        true
      )
    );
    return;
  }

  const match = (req.url ?? '').match(/^\/resource\/(\d+)$/);
  if (!match) {
    res.writeHead(404).end('Not found');
    return;
  }

  const resourceId = Number(match[1]);
  const db = getDb();
  const resource = db.prepare('SELECT * FROM resources WHERE id = ?').get(resourceId) as
    | { kind: string; file_path: string; title: string }
    | undefined;

  if (!resource || !fs.existsSync(resource.file_path)) {
    res.writeHead(404).end('Resource not found');
    return;
  }

  // PDF/image/text: serve the file as-is so the browser uses its own native
  // renderer (Chromium's built-in PDF viewer, native <img> handling, etc.) —
  // matches what "Open in browser" should feel like, not an Atlas-styled page.
  if (resource.kind === 'pdf') {
    res.writeHead(200, { 'Content-Type': 'application/pdf' });
    fs.createReadStream(resource.file_path).pipe(res);
    return;
  }

  if (resource.kind === 'image') {
    const ext = path.extname(resource.file_path).toLowerCase();
    res.writeHead(200, { 'Content-Type': CONTENT_TYPE_BY_EXTENSION[ext] ?? 'application/octet-stream' });
    fs.createReadStream(resource.file_path).pipe(res);
    return;
  }

  if (resource.kind === 'text') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    fs.createReadStream(resource.file_path).pipe(res);
    return;
  }

  // markdown/docx/pptx/xlsx: reuse the same conversion Atlas's in-app preview
  // already uses, wrapped as a standalone page since there's no Atlas
  // stylesheet to lean on outside the app window.
  if (['markdown', 'docx', 'pptx', 'xlsx'].includes(resource.kind)) {
    const preview = await getPreview(resource.kind, resource.file_path);
    if (preview.type === 'html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(wrapHtml(resource.title, preview.html, preview.note));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(preview.type === 'unsupported' ? preview.reason ?? 'Could not preview this file.' : '');
    return;
  }

  // Anything else (zip, other) — browsers can't render it, so let the
  // browser do what it does with an unrecognized file: download it.
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${encodeURIComponent(path.basename(resource.file_path))}"`,
  });
  fs.createReadStream(resource.file_path).pipe(res);
}

export function startLocalServer(): Promise<number> {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      handleRequest(req, res).catch(() => res.writeHead(500).end('Internal error'));
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server!.address();
      port = typeof address === 'object' && address ? address.port : 0;
      resolve(port);
    });
  });
}

export function stopLocalServer(): void {
  if (server) {
    server.close();
    server = null;
  }
}

export function getResourceBrowserUrl(resourceId: number): string {
  return `http://127.0.0.1:${port}/resource/${resourceId}`;
}

export function getNoteBrowserUrl(noteId: number): string {
  return `http://127.0.0.1:${port}/note/${noteId}`;
}
