import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';

GlobalWorkerOptions.workerSrc = new URL('pdf.worker.mjs', document.baseURI).toString();

async function renderPdfInto(container: HTMLElement, data: Uint8Array): Promise<void> {
  container.classList.add('pdf-preview-body');
  container.innerHTML = '<p class="pdf-preview-status muted">Loading PDF…</p>';

  try {
    const pdf = await getDocument({ data: new Uint8Array(data) }).promise;
    const pages = document.createElement('div');
    pages.className = 'pdf-preview-pages';
    const availableWidth = Math.max(320, container.clientWidth - 2 * 26);

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(1.35, availableWidth / baseViewport.width);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not create a PDF canvas.');

      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.ceil(viewport.width * pixelRatio);
      canvas.height = Math.ceil(viewport.height * pixelRatio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      canvas.setAttribute('aria-label', `PDF page ${pageNumber} of ${pdf.numPages}`);

      const pageSurface = document.createElement('div');
      pageSurface.className = 'pdf-preview-page';
      pageSurface.appendChild(canvas);
      pages.appendChild(pageSurface);

      await page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
      }).promise;
    }

    container.replaceChildren(pages);
  } catch (error) {
    console.error('PDF preview render failed:', error);
    container.innerHTML = '<p class="muted pdf-preview-status">Could not render this PDF in Atlas. Use Open in browser for the original file.</p>';
  }
}

(window as any).atlasPdfRenderer = { renderPdfInto };
