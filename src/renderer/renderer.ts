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
  onContextMenuDelete: (handler: (resourceId: number) => void) => void;
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

function makeDeleteButton(onDelete: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'delete-button';
  button.textContent = 'Delete';
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    onDelete();
  });
  return button;
}

async function confirmAndDeleteResource(resource: Resource): Promise<void> {
  if (!window.confirm(`Delete "${resource.title}"? This can't be undone.`)) return;
  await atlasApi.deleteResource(resource.id);
  await renderResources();
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
    li.appendChild(
      makeDeleteButton(async () => {
        if (!window.confirm(`Delete "${course.name}" and all its resources? This can't be undone.`)) {
          return;
        }
        await atlasApi.deleteCourse(course.id);
        if (selectedCourse && selectedCourse.id === course.id) selectedCourse = null;
        await renderCourses();
        await renderResources();
      })
    );
    li.addEventListener('click', () => selectCourse(course));
    list.appendChild(li);
  }
}

function renderResourceListView(resources: Resource[]): void {
  const list = document.getElementById('resource-list')!;
  list.className = 'view-list';
  list.innerHTML = '';

  for (const resource of resources) {
    const li = document.createElement('li');

    const name = document.createElement('span');
    name.className = 'resource-name';
    name.textContent = resource.title;
    name.addEventListener('click', () => openPreview(resource));
    li.appendChild(name);

    const kind = document.createElement('span');
    kind.className = 'code';
    kind.textContent = resource.kind;
    li.appendChild(kind);

    li.appendChild(makeDeleteButton(() => confirmAndDeleteResource(resource)));

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

    li.appendChild(makeDeleteButton(() => confirmAndDeleteResource(resource)));

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

async function openPreview(resource: Resource): Promise<void> {
  const overlay = document.getElementById('preview-overlay')!;
  const title = document.getElementById('preview-title')!;
  const note = document.getElementById('preview-note') as HTMLParagraphElement;
  const body = document.getElementById('preview-body')!;

  title.textContent = resource.title;
  note.hidden = true;
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
  overlay.hidden = true;
  body.innerHTML = ''; // stop any iframe/media activity
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
  document.getElementById('preview-overlay')!.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closePreview();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePreview();
  });

  atlasApi.onContextMenuDelete(async (resourceId) => {
    if (!window.confirm("Delete this resource? This can't be undone.")) return;
    await atlasApi.deleteResource(resourceId);
    await renderResources();
  });
}

init();
