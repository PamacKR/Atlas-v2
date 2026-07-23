interface Course {
  id: number;
  name: string;
  code: string | null;
  term: string | null;
  folder_name: string;
  archived: number;
  created_at: string;
}

interface Resource {
  id: number;
  course_id: number;
  title: string;
  kind: string;
  source: string;
  file_path: string;
  original_filename: string | null;
  added_at: string;
  synced_at: string | null;
}

type Preview =
  | { type: 'pdf' | 'image'; url: string }
  | { type: 'html'; html: string; note?: string }
  | { type: 'text'; text: string }
  | { type: 'unsupported'; reason?: string };

interface AtlasApi {
  listCourses: () => Promise<Course[]>;
  createCourse: (name: string, code: string | null, term: string | null) => Promise<Course>;
  getDataDir: () => Promise<string>;
  listResources: (courseId: number) => Promise<Resource[]>;
  uploadResource: (courseId: number) => Promise<Resource | null>;
  deleteCourse: (courseId: number) => Promise<void>;
  deleteResource: (resourceId: number) => Promise<void>;
  openResource: (resourceId: number) => Promise<void>;
  getPreview: (resourceId: number) => Promise<Preview>;
  showResourceContextMenu: (resourceId: number) => void;
  showCourseContextMenu: (courseId: number) => void;
  onContextMenuDelete: (handler: (resourceId: number) => void) => void;
  onCourseContextMenuDelete: (handler: (courseId: number) => void) => void;
}

// Deliberately not using `import`/`export`/`declare global` here: any of
// those make TypeScript treat this file as an ES module and emit a
// CommonJS `exports` boilerplate header, which throws in a plain
// non-module <script> tag (no `exports` object exists) and silently kills
// the whole script. Casting through `any` keeps this file a plain script.
const atlasApi: AtlasApi = (window as any).atlas;

const KIND_ICON: Record<string, string> = {
  pdf: '📄',
  pptx: '📊',
  docx: '📝',
  image: '🖼️',
  text: '📃',
  markdown: '📃',
  zip: '🗜️',
  other: '📁',
};

let selectedCourse: Course | null = null;
let viewMode: 'list' | 'icons' = 'list';

let confirmResolve: ((result: boolean) => void) | null = null;

function showConfirm(message: string): Promise<boolean> {
  const overlay = document.getElementById('confirm-overlay')!;
  const messageEl = document.getElementById('confirm-message')!;
  messageEl.textContent = message;
  overlay.hidden = false;
  return new Promise((resolve) => {
    confirmResolve = resolve;
  });
}

function resolveConfirm(result: boolean): void {
  const overlay = document.getElementById('confirm-overlay')!;
  overlay.hidden = true;
  if (confirmResolve) {
    confirmResolve(result);
    confirmResolve = null;
  }
}

async function renderCourses(): Promise<void> {
  const list = document.getElementById('course-list')!;
  const courses = await atlasApi.listCourses();
  list.innerHTML = '';
  for (const course of courses) {
    const li = document.createElement('li');
    li.textContent = course.name;
    li.dataset.courseId = String(course.id);
    if (course.code) {
      const code = document.createElement('span');
      code.className = 'code';
      code.textContent = course.code;
      li.appendChild(code);
    }
    if (course.term) {
      const term = document.createElement('span');
      term.className = 'code';
      term.textContent = course.term;
      li.appendChild(term);
    }
    if (selectedCourse && selectedCourse.id === course.id) {
      li.classList.add('selected');
    }
    li.addEventListener('click', () => selectCourse(course));
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      atlasApi.showCourseContextMenu(course.id);
    });
    list.appendChild(li);
  }
}

function renderResourceListView(resources: Resource[]): void {
  const list = document.getElementById('resource-list')!;
  list.className = 'view-list';
  list.innerHTML = '';

  for (const resource of resources) {
    const li = document.createElement('li');
    li.dataset.resourceId = String(resource.id);

    const name = document.createElement('span');
    name.className = 'resource-name';
    name.textContent = resource.title;
    name.addEventListener('click', () => openPreview(resource));
    li.appendChild(name);

    const kind = document.createElement('span');
    kind.className = 'code';
    kind.textContent = resource.kind;
    li.appendChild(kind);

    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      atlasApi.showResourceContextMenu(resource.id);
    });

    list.appendChild(li);
  }
}

function renderResourceIconView(resources: Resource[]): void {
  const list = document.getElementById('resource-list')!;
  list.className = 'view-icons';
  list.innerHTML = '';

  for (const resource of resources) {
    const li = document.createElement('li');
    li.className = 'icon-tile';
    li.dataset.resourceId = String(resource.id);

    const icon = document.createElement('div');
    icon.className = 'icon-glyph';
    icon.textContent = KIND_ICON[resource.kind] ?? KIND_ICON.other;
    li.appendChild(icon);

    const name = document.createElement('div');
    name.className = 'icon-name';
    name.textContent = resource.title;
    li.appendChild(name);

    li.addEventListener('click', () => openPreview(resource));
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      atlasApi.showResourceContextMenu(resource.id);
    });

    list.appendChild(li);
  }
}

async function renderResources(): Promise<void> {
  const section = document.getElementById('resources-section')!;
  const heading = document.getElementById('resources-heading')!;
  const list = document.getElementById('resource-list')!;

  if (!selectedCourse) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  heading.textContent = `Resources — ${selectedCourse.name}`;

  const resources = await atlasApi.listResources(selectedCourse.id);
  if (resources.length === 0) {
    list.className = 'view-list';
    list.innerHTML = '';
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'No resources yet.';
    list.appendChild(li);
    return;
  }

  if (viewMode === 'list') renderResourceListView(resources);
  else renderResourceIconView(resources);
}

async function selectCourse(course: Course): Promise<void> {
  selectedCourse = course;
  await renderCourses();
  await renderResources();
}

function setViewMode(mode: 'list' | 'icons'): void {
  viewMode = mode;
  document.getElementById('view-list')!.classList.toggle('active', mode === 'list');
  document.getElementById('view-icons')!.classList.toggle('active', mode === 'icons');
  renderResources();
}

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;
let imageZoom = 1;

function applyImageZoom(): void {
  document.getElementById('zoom-level')!.textContent = `${Math.round(imageZoom * 100)}%`;
  const img = document.querySelector('#preview-body img') as HTMLImageElement | null;
  if (img) img.style.transform = `scale(${imageZoom})`;
}

function setImageZoom(zoom: number): void {
  imageZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
  applyImageZoom();
}

async function openPreview(resource: Resource): Promise<void> {
  const overlay = document.getElementById('preview-overlay')!;
  const title = document.getElementById('preview-title')!;
  const note = document.getElementById('preview-note') as HTMLParagraphElement;
  const body = document.getElementById('preview-body')!;
  const zoomControls = document.getElementById('zoom-controls')!;

  title.textContent = resource.title;
  note.hidden = true;
  zoomControls.hidden = true;
  body.classList.remove('centered');
  body.innerHTML = '<p class="muted">Loading preview…</p>';
  overlay.hidden = false;

  const preview = await atlasApi.getPreview(resource.id);
  body.innerHTML = '';

  if (preview.type === 'pdf' || preview.type === 'image') {
    if (preview.type === 'pdf') {
      const iframe = document.createElement('iframe');
      iframe.src = preview.url;
      body.appendChild(iframe);
    } else {
      const img = document.createElement('img');
      img.src = preview.url;
      body.appendChild(img);
      body.classList.add('centered');
      imageZoom = 1;
      zoomControls.hidden = false;
      applyImageZoom();
    }
  } else if (preview.type === 'html') {
    const container = document.createElement('div');
    container.className = 'preview-html';
    container.innerHTML = preview.html;
    body.appendChild(container);
    if (preview.note) {
      note.textContent = preview.note;
      note.hidden = false;
    }
  } else if (preview.type === 'text') {
    const pre = document.createElement('pre');
    pre.textContent = preview.text;
    body.appendChild(pre);
  } else if (preview.type === 'unsupported') {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = preview.reason ?? 'No in-app preview available for this file type.';
    body.appendChild(p);
  }
}

function closePreview(): void {
  const overlay = document.getElementById('preview-overlay')!;
  const body = document.getElementById('preview-body')!;
  const fullscreenButton = document.getElementById('preview-fullscreen') as HTMLButtonElement;
  overlay.hidden = true;
  overlay.classList.remove('fullscreen'); // always reopen non-fullscreen
  fullscreenButton.innerHTML = MAXIMIZE_ICON;
  fullscreenButton.title = 'Fullscreen';
  fullscreenButton.setAttribute('aria-label', 'Fullscreen');
  body.innerHTML = ''; // stop any iframe/media activity
}

const MAXIMIZE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
const MINIMIZE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>';

function toggleFullscreenPreview(): void {
  const overlay = document.getElementById('preview-overlay')!;
  const button = document.getElementById('preview-fullscreen') as HTMLButtonElement;
  const isFullscreen = overlay.classList.toggle('fullscreen');
  button.innerHTML = isFullscreen ? MINIMIZE_ICON : MAXIMIZE_ICON;
  button.title = isFullscreen ? 'Exit Fullscreen' : 'Fullscreen';
  button.setAttribute('aria-label', button.title);
}

async function init(): Promise<void> {
  const dataDirEl = document.getElementById('data-dir')!;
  dataDirEl.textContent = `Data folder: ${await atlasApi.getDataDir()}`;

  await renderCourses();

  const form = document.getElementById('course-form') as HTMLFormElement;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = (document.getElementById('course-name') as HTMLInputElement).value.trim();
    const code = (document.getElementById('course-code') as HTMLInputElement).value.trim() || null;
    const term = (document.getElementById('course-term') as HTMLSelectElement).value || null;
    if (!name) return;

    await atlasApi.createCourse(name, code, term);
    form.reset();
    await renderCourses();
  });

  const uploadButton = document.getElementById('upload-button') as HTMLButtonElement;
  uploadButton.addEventListener('click', async () => {
    if (!selectedCourse) return;
    const resource = await atlasApi.uploadResource(selectedCourse.id);
    if (resource) await renderResources();
  });

  document.getElementById('view-list')!.addEventListener('click', () => setViewMode('list'));
  document.getElementById('view-icons')!.addEventListener('click', () => setViewMode('icons'));

  document.getElementById('preview-close')!.addEventListener('click', closePreview);
  document.getElementById('preview-fullscreen')!.addEventListener('click', toggleFullscreenPreview);
  document.getElementById('preview-overlay')!.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closePreview();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePreview();
  });

  document.getElementById('zoom-in')!.addEventListener('click', () => setImageZoom(imageZoom + ZOOM_STEP));
  document.getElementById('zoom-out')!.addEventListener('click', () => setImageZoom(imageZoom - ZOOM_STEP));
  document.getElementById('zoom-reset')!.addEventListener('click', () => setImageZoom(1));

  // Ctrl+scroll to zoom, same convention as browsers/image viewers.
  document.getElementById('preview-body')!.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey) return;
      if (!document.querySelector('#preview-body img')) return;
      e.preventDefault();
      setImageZoom(imageZoom + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
    },
    { passive: false }
  );

  atlasApi.onContextMenuDelete(async (resourceId) => {
    if (!(await showConfirm("Delete this resource? This can't be undone."))) return;
    await atlasApi.deleteResource(resourceId);
    await renderResources();
  });

  atlasApi.onCourseContextMenuDelete(async (courseId) => {
    if (!(await showConfirm("Delete this course and all its resources? This can't be undone."))) return;
    await atlasApi.deleteCourse(courseId);
    if (selectedCourse && selectedCourse.id === courseId) selectedCourse = null;
    await renderCourses();
    await renderResources();
  });

  document.getElementById('confirm-cancel')!.addEventListener('click', () => resolveConfirm(false));
  document.getElementById('confirm-yes')!.addEventListener('click', () => resolveConfirm(true));
}

init();
