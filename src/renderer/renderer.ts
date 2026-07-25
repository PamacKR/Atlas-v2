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

interface WatchedFolder {
  id: number;
  course_id: number;
  folder_path: string;
  created_at: string;
}

interface Note {
  id: number;
  course_id: number;
  title: string;
  content_markdown: string;
  is_handwritten: number;
  image_path: string | null;
  ocr_text: string | null;
  created_at: string;
  updated_at: string;
}

type Preview =
  | { type: 'pdf'; url: string }
  | { type: 'image'; url: string; zoomLevel: number | null }
  | { type: 'html'; html: string; note?: string }
  | { type: 'text'; text: string }
  | { type: 'unsupported'; reason?: string };

interface AtlasApi {
  listCourses: () => Promise<Course[]>;
  createCourse: (name: string, code: string | null, term: string | null) => Promise<Course>;
  getDataDir: () => Promise<string>;
  getResourceBrowserUrl: (resourceId: number) => Promise<string>;
  getSetting: (key: string) => Promise<string | null>;
  setSetting: (key: string, value: string) => Promise<void>;
  listResources: (courseId: number) => Promise<Resource[]>;
  uploadResource: (courseId: number) => Promise<Resource | null>;
  deleteCourse: (courseId: number) => Promise<void>;
  deleteResource: (resourceId: number) => Promise<void>;
  getPreview: (resourceId: number) => Promise<Preview>;
  setResourceZoom: (resourceId: number, zoom: number) => Promise<void>;
  showResourceContextMenu: (resourceId: number) => void;
  showCourseContextMenu: (courseId: number) => void;
  onContextMenuDelete: (handler: (resourceId: number) => void) => void;
  onCourseContextMenuDelete: (handler: (courseId: number) => void) => void;
  listWatchedFolders: (courseId: number) => Promise<WatchedFolder[]>;
  addWatchedFolder: (courseId: number) => Promise<WatchedFolder | null>;
  removeWatchedFolder: (folderId: number) => Promise<void>;
  showFolderContextMenu: (folderId: number) => void;
  onFolderContextMenuRemove: (handler: (folderId: number) => void) => void;
  onResourcesChanged: (handler: (courseId: number) => void) => void;
  listNotes: (courseId: number) => Promise<Note[]>;
  createNote: (courseId: number) => Promise<Note>;
  updateNoteContent: (noteId: number, contentMarkdown: string) => Promise<{ title: string | null } | null>;
  updateNoteTitle: (noteId: number, title: string) => Promise<void>;
  deleteNote: (noteId: number) => Promise<void>;
  showNoteContextMenu: (noteId: number) => void;
  onNoteContextMenuDelete: (handler: (noteId: number) => void) => void;
  getNoteBrowserUrl: (noteId: number) => Promise<string>;
  saveNoteImage: (courseId: number, buffer: ArrayBuffer, extension: string) => Promise<string>;
}

// This file is bundled by esbuild (scripts/build-renderer.js), not compiled
// directly by tsc, specifically so npm packages like @milkdown/crepe can be
// `import`ed here despite the renderer having no module system at runtime
// (contextIsolation: true, nodeIntegration: false — no `require`, and a
// plain <script> tag has no `exports` object either). esbuild resolves and
// inlines everything into one browser-ready IIFE. `window.atlas` still goes
// through a cast rather than a `declare global` purely to keep this diff
// small, not because of any remaining module-system constraint.
//
// Editor choice: Milkdown/Crepe, not Toast UI Editor (tried first) — Toast
// UI's WYSIWYG mode doesn't support typing markdown shortcuts ("- ", "1. ",
// "---") to create real lists/dividers live, and its toolbar buttons don't
// show an active state for the current selection (e.g. Bold doesn't
// highlight when the cursor is in bold text). Both are core to how the user
// actually works (bullet-heavy notes, Notion-like typing feel) and verified
// working correctly in Crepe before switching. Crepe also bundles KaTeX math
// rendering out of the box, which the user needs for academic notes.
import { Crepe } from '@milkdown/crepe';
import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame-dark.css';

const atlasApi: AtlasApi = (window as any).atlas;

const KIND_ICON: Record<string, string> = {
  pdf: '📄',
  pptx: '📊',
  docx: '📝',
  xlsx: '📈',
  image: '🖼️',
  text: '📃',
  markdown: '📃',
  zip: '🗜️',
  other: '📁',
};

let selectedCourse: Course | null = null;
let viewMode: 'list' | 'icons' = 'list';
let semesterFilter = ''; // '' = all semesters

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
  const allCourses = await atlasApi.listCourses();
  const courses = semesterFilter ? allCourses.filter((c) => c.term === semesterFilter) : allCourses;
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

async function renderWatchedFolders(): Promise<void> {
  const section = document.getElementById('watched-folders-section')!;
  const list = document.getElementById('watched-folder-list')!;
  list.innerHTML = '';

  if (!selectedCourse) {
    section.hidden = true;
    return;
  }
  section.hidden = false;

  const folders = await atlasApi.listWatchedFolders(selectedCourse.id);
  for (const folder of folders) {
    const li = document.createElement('li');
    li.textContent = folder.folder_path;
    li.dataset.folderId = String(folder.id);
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      atlasApi.showFolderContextMenu(folder.id);
    });
    list.appendChild(li);
  }
}

function formatNoteTimestamp(sqliteDatetime: string): string {
  // SQLite's datetime('now') is UTC with no 'Z' suffix — append it so
  // Date parses it as UTC instead of assuming local time.
  const date = new Date(sqliteDatetime.replace(' ', 'T') + 'Z');
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function renderNoteListView(notes: Note[]): void {
  const list = document.getElementById('note-list')!;
  list.className = 'view-list';
  list.innerHTML = '';

  for (const note of notes) {
    const li = document.createElement('li');
    li.dataset.noteId = String(note.id);

    const title = document.createElement('span');
    title.textContent = note.title;
    li.appendChild(title);

    const updated = document.createElement('span');
    updated.className = 'note-updated';
    updated.textContent = formatNoteTimestamp(note.updated_at);
    li.appendChild(updated);

    li.addEventListener('click', () => openNoteEditor(note));
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      atlasApi.showNoteContextMenu(note.id);
    });

    list.appendChild(li);
  }
}

function renderNoteIconView(notes: Note[]): void {
  const list = document.getElementById('note-list')!;
  list.className = 'view-icons';
  list.innerHTML = '';

  for (const note of notes) {
    const li = document.createElement('li');
    li.className = 'icon-tile';
    li.dataset.noteId = String(note.id);

    const icon = document.createElement('div');
    icon.className = 'icon-glyph';
    icon.textContent = '📝';
    li.appendChild(icon);

    const name = document.createElement('div');
    name.className = 'icon-name';
    name.textContent = note.title;
    li.appendChild(name);

    li.addEventListener('click', () => openNoteEditor(note));
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      atlasApi.showNoteContextMenu(note.id);
    });

    list.appendChild(li);
  }
}

async function renderNotes(): Promise<void> {
  const section = document.getElementById('notes-section')!;
  const heading = document.getElementById('notes-heading')!;
  const list = document.getElementById('note-list')!;

  if (!selectedCourse) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  heading.textContent = `Notes — ${selectedCourse.name}`;

  const notes = await atlasApi.listNotes(selectedCourse.id);
  if (notes.length === 0) {
    list.className = 'view-list';
    list.innerHTML = '';
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'No notes yet.';
    list.appendChild(li);
    return;
  }

  if (viewMode === 'list') renderNoteListView(notes);
  else renderNoteIconView(notes);
}

let noteEditorInstance: Crepe | null = null;
let currentNoteId: number | null = null;
let noteSaveTimer: ReturnType<typeof setTimeout> | null = null;
let noteTitleBeforeEdit = '';

// Reflects the derived-from-first-line title (Google-Docs style, see
// notes:updateContent in main.ts) back into the title input — but only when
// the user isn't actively typing in that field, so an in-progress manual
// rename is never clobbered by an autosave landing mid-edit.
function applyDerivedTitle(title: string | null): void {
  if (title === null) return;
  const titleInput = document.getElementById('note-title-input') as HTMLInputElement;
  if (document.activeElement === titleInput) return;
  titleInput.value = title;
}

function scheduleNoteSave(): void {
  const statusEl = document.getElementById('note-save-status')!;
  statusEl.textContent = 'Saving…';
  if (noteSaveTimer) clearTimeout(noteSaveTimer);
  noteSaveTimer = setTimeout(async () => {
    if (currentNoteId === null || !noteEditorInstance) return;
    const result = await atlasApi.updateNoteContent(currentNoteId, noteEditorInstance.getMarkdown());
    if (result) applyDerivedTitle(result.title);
    statusEl.textContent = 'Saved';
  }, 600);
}

// Headings should read as bold by default (Crepe's own theme renders them
// at font-weight 400 — distinguishing size only, no weight — which the
// user found visually flat), but Ctrl+B must still be able to un-bold one.
// A CSS-forced weight on <h1>-<h6> can't satisfy both: it would win over
// any mark, so toggling bold off would have no visible effect. Instead this
// applies a real `strong` mark automatically the moment a heading is empty
// (freshly created, or emptied out again) by priming ProseMirror's
// `storedMarks` so the next character typed comes out bold — the same
// mechanism as clicking Bold then typing. Once real text exists, this
// stops touching the node, so it never fights a manual Ctrl+B afterward.
const autoboldHeadingPlugin = $prose(
  () =>
    new Plugin({
      key: new PluginKey('atlas-autobold-heading'),
      appendTransaction: (transactions, _oldState, newState) => {
        if (!transactions.some((tr) => tr.docChanged)) return null;

        const headingType = newState.schema.nodes.heading;
        const strongType = newState.schema.marks.strong;
        if (!headingType || !strongType) return null;

        const parent = newState.selection.$from.parent;
        if (parent.type !== headingType || parent.content.size !== 0) return null;

        const stored = newState.storedMarks ?? newState.selection.$from.marks();
        if (strongType.isInSet(stored)) return null;

        return newState.tr.setStoredMarks([strongType.create()]);
      },
    })
);

async function flushPendingNoteSave(): Promise<void> {
  if (noteSaveTimer) {
    clearTimeout(noteSaveTimer);
    noteSaveTimer = null;
  }
  if (currentNoteId !== null && noteEditorInstance) {
    await atlasApi.updateNoteContent(currentNoteId, noteEditorInstance.getMarkdown());
  }
}

async function openNoteEditor(note: Note): Promise<void> {
  const overlay = document.getElementById('note-editor-overlay')!;
  const titleInput = document.getElementById('note-title-input') as HTMLInputElement;
  const statusEl = document.getElementById('note-save-status')!;
  const root = document.getElementById('note-editor-root')!;

  currentNoteId = note.id;
  titleInput.value = note.title;
  statusEl.textContent = '';
  root.innerHTML = '';
  overlay.hidden = false;

  const saveImage = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const dot = file.name.lastIndexOf('.');
    const extension = dot >= 0 ? file.name.slice(dot) : '';
    return atlasApi.saveNoteImage(note.course_id, buffer, extension);
  };

  const crepe = new Crepe({
    root,
    defaultValue: note.content_markdown,
    featureConfigs: {
      [Crepe.Feature.ImageBlock]: {
        onUpload: saveImage,
        inlineOnUpload: saveImage,
        blockOnUpload: saveImage,
      },
      // Shorter, search/scan-friendly labels in the slash menu — "H1"
      // instead of "Heading 1", per the user's request. Only the heading
      // entries change; everything else keeps Crepe's defaults.
      [Crepe.Feature.BlockEdit]: {
        textGroup: {
          h1: { label: 'H1' },
          h2: { label: 'H2' },
          h3: { label: 'H3' },
          h4: { label: 'H4' },
          h5: { label: 'H5' },
          h6: { label: 'H6' },
        },
      },
    },
  });
  crepe.editor.use(autoboldHeadingPlugin);
  crepe.on((listener) => {
    listener.markdownUpdated(() => scheduleNoteSave());
  });
  await crepe.create();
  noteEditorInstance = crepe;
}

async function closeNoteEditor(): Promise<void> {
  await flushPendingNoteSave();

  const overlay = document.getElementById('note-editor-overlay')!;
  overlay.hidden = true;
  overlay.classList.remove('fullscreen');
  const fullscreenButton = document.getElementById('note-fullscreen') as HTMLButtonElement;
  fullscreenButton.innerHTML = NOTE_MAXIMIZE_ICON;
  fullscreenButton.title = 'Fullscreen';
  fullscreenButton.setAttribute('aria-label', 'Fullscreen');

  if (noteEditorInstance) {
    await noteEditorInstance.destroy();
    noteEditorInstance = null;
  }
  currentNoteId = null;

  await renderNotes();
}

const NOTE_MAXIMIZE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
const NOTE_MINIMIZE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>';

function toggleNoteFullscreen(): void {
  const overlay = document.getElementById('note-editor-overlay')!;
  const button = document.getElementById('note-fullscreen') as HTMLButtonElement;
  const isFullscreen = overlay.classList.toggle('fullscreen');
  button.innerHTML = isFullscreen ? NOTE_MINIMIZE_ICON : NOTE_MAXIMIZE_ICON;
  button.title = isFullscreen ? 'Exit Fullscreen' : 'Fullscreen';
  button.setAttribute('aria-label', button.title);
}

async function selectCourse(course: Course): Promise<void> {
  selectedCourse = course;
  await renderCourses();
  await renderResources();
  await renderWatchedFolders();
  await renderNotes();
}

async function setSemesterFilter(term: string, persist = true): Promise<void> {
  semesterFilter = term;
  // If the currently open course falls outside the new filter, close it
  // rather than leaving Resources/Notes showing a course no longer listed.
  if (selectedCourse && term && selectedCourse.term !== term) {
    selectedCourse = null;
  }
  await renderCourses();
  await renderResources();
  await renderWatchedFolders();
  await renderNotes();
  if (persist) atlasApi.setSetting('semesterFilter', term);
}

// App-wide, not per-course — the user wants one view preference that
// applies everywhere and survives a fresh launch, not something that resets
// per folder or on restart.
function setViewMode(mode: 'list' | 'icons', persist = true): void {
  viewMode = mode;
  document.getElementById('view-list')!.classList.toggle('active', mode === 'list');
  document.getElementById('view-icons')!.classList.toggle('active', mode === 'icons');
  renderResources();
  renderNotes();
  if (persist) atlasApi.setSetting('viewMode', mode);
}

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;
let imageZoom = 1;
let currentPreviewResourceId: number | null = null;

function applyImageZoom(): void {
  document.getElementById('zoom-level')!.textContent = `${Math.round(imageZoom * 100)}%`;
  // Scoped to .preview-image specifically (the standalone image-preview
  // <img>), not any embedded <img> that might appear inside rendered docx/
  // pptx/markdown HTML — zoom must never touch those.
  const img = document.querySelector('#preview-body img.preview-image') as HTMLImageElement | null;
  if (img) img.style.transform = `scale(${imageZoom})`;
}

// Remembered per-resource (courses.zoom_level in the DB), since some
// images (e.g. a densely-packed diagram) are only readable zoomed in,
// while most are fine at 100% — see docs/open-questions.md.
function setImageZoom(zoom: number): void {
  imageZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
  applyImageZoom();
  if (currentPreviewResourceId !== null) {
    atlasApi.setResourceZoom(currentPreviewResourceId, imageZoom);
  }
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
  currentPreviewResourceId = resource.id;

  const preview = await atlasApi.getPreview(resource.id);
  body.innerHTML = '';

  if (preview.type === 'pdf') {
    const iframe = document.createElement('iframe');
    iframe.src = preview.url;
    body.appendChild(iframe);
  } else if (preview.type === 'image') {
    const img = document.createElement('img');
    img.className = 'preview-image';
    img.src = preview.url;
    body.appendChild(img);
    body.classList.add('centered');
    imageZoom = preview.zoomLevel ?? 1;
    zoomControls.hidden = false;
    applyImageZoom();
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
  currentPreviewResourceId = null;
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

  const savedViewMode = await atlasApi.getSetting('viewMode');
  if (savedViewMode === 'icons') setViewMode('icons', false);

  const savedSemesterFilter = await atlasApi.getSetting('semesterFilter');
  if (savedSemesterFilter) {
    semesterFilter = savedSemesterFilter;
    (document.getElementById('semester-filter') as HTMLSelectElement).value = savedSemesterFilter;
  }

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

  const addWatchFolderButton = document.getElementById('add-watch-folder') as HTMLButtonElement;
  addWatchFolderButton.addEventListener('click', async () => {
    if (!selectedCourse) return;
    const folder = await atlasApi.addWatchedFolder(selectedCourse.id);
    if (folder) {
      await renderWatchedFolders();
      await renderResources(); // pick up any files already sitting in the folder
    }
  });

  document.getElementById('view-list')!.addEventListener('click', () => setViewMode('list'));
  document.getElementById('view-icons')!.addEventListener('click', () => setViewMode('icons'));

  document.getElementById('semester-filter')!.addEventListener('change', (e) => {
    setSemesterFilter((e.target as HTMLSelectElement).value);
  });

  const newNoteButton = document.getElementById('new-note-button') as HTMLButtonElement;
  newNoteButton.addEventListener('click', async () => {
    if (!selectedCourse) return;
    const note = await atlasApi.createNote(selectedCourse.id);
    await openNoteEditor(note);
  });

  const noteTitleInput = document.getElementById('note-title-input') as HTMLInputElement;
  noteTitleInput.addEventListener('focus', () => {
    noteTitleBeforeEdit = noteTitleInput.value;
  });
  noteTitleInput.addEventListener('blur', async () => {
    if (currentNoteId === null) return;
    const newTitle = noteTitleInput.value.trim();
    // Only a real edit switches the note into "manual title" mode (see
    // notes:updateTitle) — clicking into the field and clicking away
    // without typing anything shouldn't stop the title from following the
    // note's first line.
    if (newTitle === noteTitleBeforeEdit) return;
    await atlasApi.updateNoteTitle(currentNoteId, newTitle);
    await renderNotes();
  });
  noteTitleInput.addEventListener('keydown', (e) => {
    // Enter confirms the rename; Escape cancels editing the title (reverts
    // to the last saved value) without touching the note itself — neither
    // should close the whole editor.
    if (e.key === 'Enter') {
      noteTitleInput.blur();
    } else if (e.key === 'Escape') {
      noteTitleInput.value = noteTitleBeforeEdit;
      noteTitleInput.blur();
    }
  });

  document.getElementById('note-close')!.addEventListener('click', closeNoteEditor);
  document.getElementById('note-fullscreen')!.addEventListener('click', toggleNoteFullscreen);

  atlasApi.onNoteContextMenuDelete(async (noteId) => {
    if (!(await showConfirm("Delete this note? This can't be undone."))) return;
    if (currentNoteId === noteId) await closeNoteEditor();
    await atlasApi.deleteNote(noteId);
    await renderNotes();
  });

  document.getElementById('preview-close')!.addEventListener('click', closePreview);
  document.getElementById('preview-fullscreen')!.addEventListener('click', toggleFullscreenPreview);
  document.getElementById('preview-overlay')!.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closePreview();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    // Deliberately does NOT close the note editor — an editor with
    // in-progress typing shouldn't disappear because of an incidental
    // Escape (e.g. cancelling a text selection or a title edit above).
    // The X button is the only way to close a note; matches how Notion
    // itself behaves (Escape doesn't close a page).
    if ((document.getElementById('note-editor-overlay') as HTMLElement).hidden) {
      closePreview();
    }
  });

  document.getElementById('zoom-in')!.addEventListener('click', () => setImageZoom(imageZoom + ZOOM_STEP));
  document.getElementById('zoom-out')!.addEventListener('click', () => setImageZoom(imageZoom - ZOOM_STEP));
  document.getElementById('zoom-reset')!.addEventListener('click', () => setImageZoom(1));

  // Ctrl+scroll to zoom, same convention as browsers/image viewers.
  document.getElementById('preview-body')!.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey) return;
      if (!document.querySelector('#preview-body img.preview-image')) return;
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
    await renderNotes();
  });

  document.getElementById('confirm-cancel')!.addEventListener('click', () => resolveConfirm(false));
  document.getElementById('confirm-yes')!.addEventListener('click', () => resolveConfirm(true));

  atlasApi.onFolderContextMenuRemove(async (folderId) => {
    if (!(await showConfirm('Stop watching this folder? Files already imported stay in Atlas.')))
      return;
    await atlasApi.removeWatchedFolder(folderId);
    await renderWatchedFolders();
  });

  // Fired by the main process when a watched folder picks up a new file —
  // refresh the resource list if that's the course currently open.
  atlasApi.onResourcesChanged(async (courseId) => {
    if (selectedCourse && selectedCourse.id === courseId) await renderResources();
  });
}

init();
