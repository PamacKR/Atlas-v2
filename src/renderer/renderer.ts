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

interface Deadline {
  id: number;
  course_id: number;
  title: string;
  kind: string;
  due_at: string | null;
  completed: number;
  source: string;
  description: string | null;
}

// A candidate a deadline description's "@" autocomplete can insert a mention
// token for — the current course's resources and notes, kept generic so the
// same suggestion list/renderer logic doesn't care which one it is.
interface MentionCandidate {
  type: 'resource' | 'note';
  id: number;
  title: string;
}

interface ImportScanProgress {
  fileIndex: number;
  fileCount: number;
  filename: string;
  page: number;
  totalPages: number;
}

interface SearchResult {
  entityType: 'note' | 'resource' | 'announcement' | 'assignment';
  entityId: number;
  courseId: number;
  title: string;
  courseName: string;
  snippet: string;
}

interface DashboardDeadline extends Deadline {
  course_name: string;
}

interface DashboardResource extends Resource {
  course_name: string;
}

interface DashboardActivityItem {
  id: number;
  course_id: number;
  title: string;
  timestamp: string;
  entity_type: 'resource' | 'note';
  course_name: string;
}

interface DashboardStats {
  courseCount: number;
  resourceCount: number;
  noteCount: number;
  upcomingDeadlineCount: number;
}

interface CourseSummary extends Course {
  resource_count: number;
  deadline_count: number;
  note_count: number;
}

interface ResourceWithCourse extends Resource {
  course_name: string;
}

interface NoteWithCourse extends Note {
  course_name: string;
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
  getResourceBrowserUrl: (resourceId: number) => Promise<string>;
  getSetting: (key: string) => Promise<string | null>;
  setSetting: (key: string, value: string) => Promise<void>;
  listResources: (courseId: number) => Promise<Resource[]>;
  uploadResource: (courseId: number) => Promise<Resource | null>;
  uploadResourceBuffer: (courseId: number, filename: string, buffer: ArrayBuffer) => Promise<Resource | null>;
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
  getNoteScanPreview: (noteId: number) => Promise<Preview | null>;
  importScan: (courseId: number) => Promise<Note[]>;
  importScanBuffer: (courseId: number, filename: string, buffer: ArrayBuffer) => Promise<Note | null>;
  onImportScanProgress: (handler: (progress: ImportScanProgress) => void) => void;
  search: (query: string) => Promise<SearchResult[]>;
  listDeadlines: (courseId: number) => Promise<Deadline[]>;
  createDeadline: (
    courseId: number,
    title: string,
    kind: string,
    dueAt: string | null,
    description: string | null
  ) => Promise<Deadline>;
  updateDeadline: (
    deadlineId: number,
    title: string,
    kind: string,
    dueAt: string | null,
    description: string | null
  ) => Promise<Deadline>;
  setDeadlineCompleted: (deadlineId: number, completed: boolean) => Promise<void>;
  deleteDeadline: (deadlineId: number) => Promise<void>;
  showDeadlineContextMenu: (deadlineId: number) => void;
  onDeadlineContextMenuDelete: (handler: (deadlineId: number) => void) => void;
  getDashboardStats: () => Promise<DashboardStats>;
  getUpcomingDeadlines: () => Promise<DashboardDeadline[]>;
  getRecentResources: () => Promise<DashboardResource[]>;
  getRecentActivity: () => Promise<DashboardActivityItem[]>;
  getCourseSummaries: () => Promise<CourseSummary[]>;
  listAllResources: () => Promise<ResourceWithCourse[]>;
  listAllNotes: () => Promise<NoteWithCourse[]>;
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
// Crepe's frame/frame-dark theme files are just `--crepe-*` custom
// properties on `.milkdown` — both variable sets are inlined directly in
// styles.css instead (scoped by :root[data-theme='light']), so the editor
// genuinely follows Atlas's own theme toggle rather than a statically
// imported, permanently-dark stylesheet.

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

const DEADLINE_KIND_LABEL: Record<string, string> = {
  assignment: 'Assignment',
  reading: 'Reading',
  quiz: 'Quiz',
  lab: 'Lab',
  project: 'Project',
  exam: 'Exam',
  manual: 'Other',
};

const DEADLINE_KIND_ICON: Record<string, string> = {
  assignment: '📝',
  reading: '📖',
  quiz: '❓',
  lab: '🧪',
  project: '🛠️',
  exam: '🎓',
  manual: '📌',
};

// A fixed, deterministic palette for course avatars (dashboard "My courses"
// card, course list) — picked by course id rather than anything
// subject-specific, since Atlas has no way to know what a course is "about"
// from its name alone.
const COURSE_AVATAR_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444'];

function courseAvatarColor(courseId: number): string {
  return COURSE_AVATAR_COLORS[courseId % COURSE_AVATAR_COLORS.length];
}

function makeCourseAvatar(course: Course): HTMLElement {
  const avatar = document.createElement('div');
  avatar.className = 'course-avatar';
  avatar.style.background = courseAvatarColor(course.id);
  avatar.textContent = course.name.trim().charAt(0).toUpperCase() || '?';
  return avatar;
}

let selectedCourse: Course | null = null;
let viewMode: 'list' | 'grid' = 'list';
let semesterFilter = ''; // '' = all semesters

// Real page switching, not a scroll shortcut — exactly one of these is
// visible at a time. Dashboard/Courses/Resources/Notes are genuine pages;
// Search stays a floating dropdown over whichever page is active (see
// focusSearch(), triggered from the top-bar search box directly), so it
// isn't one of these and has no sidebar entry of its own.
type AppPage = 'dashboard' | 'courses' | 'resources' | 'notes';
let currentPage: AppPage = 'dashboard';

function showPage(page: AppPage): void {
  currentPage = page;
  document.querySelectorAll<HTMLElement>('.app-page').forEach((el) => {
    el.hidden = el.id !== `page-${page}`;
  });
  document.querySelectorAll<HTMLElement>('.sidebar-nav-item[data-page]').forEach((button) => {
    button.classList.toggle('active', button.dataset.page === page);
  });

  if (page === 'dashboard') void renderDashboard();
  else if (page === 'courses') {
    // Navigating to Courses fresh (sidebar click, "Manage courses") always
    // lands on the grid — the detail view is reached only by clicking a
    // course card, never directly. A caller that wants to land straight on
    // a course's detail (Dashboard, a deadline) calls selectCourse()
    // immediately after this, which overrides it right back.
    selectedCourse = null;
    showCourseListView();
    void renderCourses();
  } else if (page === 'resources') void renderResourcesPage();
  else if (page === 'notes') void renderNotesPage();
}

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

let courseViewMode: 'grid' | 'list' = 'grid';
type CourseSort = 'name' | 'resources' | 'deadlines' | 'notes';
let courseSort: CourseSort = 'name';

function compareCourseSummaries(a: CourseSummary, b: CourseSummary, sort: CourseSort): number {
  if (sort === 'resources') return b.resource_count - a.resource_count;
  if (sort === 'deadlines') return b.deadline_count - a.deadline_count;
  if (sort === 'notes') return b.note_count - a.note_count;
  return a.name.localeCompare(b.name);
}

// Card grid by default (matches the mockup the user provided), a flat list
// as the alternative — same view-toggle convention used for resources/
// deadlines elsewhere, just a separate mode since a course card carries
// more information (counts, code) than a resource/deadline row does.
async function renderCourses(): Promise<void> {
  void renderDashboard();
  const list = document.getElementById('course-list')!;
  const allSummaries = await atlasApi.getCourseSummaries();
  let courses = semesterFilter ? allSummaries.filter((c) => c.term === semesterFilter) : allSummaries;
  courses = [...courses].sort((a, b) => compareCourseSummaries(a, b, courseSort));

  list.className = courseViewMode === 'grid' ? 'view-grid' : 'view-list';
  list.innerHTML = '';

  for (const course of courses) {
    const li = document.createElement('li');
    li.className = 'course-card';
    li.dataset.courseId = String(course.id);
    if (selectedCourse && selectedCourse.id === course.id) li.classList.add('selected');

    const top = document.createElement('div');
    top.className = 'course-card-top';
    top.appendChild(makeCourseAvatar(course));

    const titleBlock = document.createElement('div');
    titleBlock.className = 'course-card-title-block';
    const name = document.createElement('div');
    name.className = 'course-card-name';
    name.textContent = course.name;
    titleBlock.appendChild(name);
    if (course.code) {
      const code = document.createElement('div');
      code.className = 'course-card-code';
      code.textContent = course.code;
      titleBlock.appendChild(code);
    }
    top.appendChild(titleBlock);

    const menuButton = document.createElement('button');
    menuButton.type = 'button';
    menuButton.className = 'course-card-menu';
    menuButton.textContent = '⋯';
    menuButton.title = 'Course options';
    menuButton.setAttribute('aria-label', 'Course options');
    menuButton.addEventListener('click', (e) => {
      e.stopPropagation();
      atlasApi.showCourseContextMenu(course.id);
    });
    top.appendChild(menuButton);
    li.appendChild(top);

    const counts = document.createElement('div');
    counts.className = 'course-card-counts';
    const resourceCount = document.createElement('span');
    resourceCount.textContent = `📄 ${course.resource_count} Resources`;
    counts.appendChild(resourceCount);
    const deadlineCount = document.createElement('span');
    deadlineCount.textContent = `📌 ${course.deadline_count} Deadlines`;
    counts.appendChild(deadlineCount);
    li.appendChild(counts);

    li.addEventListener('click', () => selectCourse(course));
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      atlasApi.showCourseContextMenu(course.id);
    });
    list.appendChild(li);
  }
}

function setCourseViewMode(mode: 'grid' | 'list'): void {
  courseViewMode = mode;
  document.getElementById('course-view-grid')!.classList.toggle('active', mode === 'grid');
  document.getElementById('course-view-list')!.classList.toggle('active', mode === 'list');
  void renderCourses();
}

// --- Global Resources page: every resource across every course, not
// scoped to whichever course is selected — filterable by kind (chip row)
// and by course (left rail). Opening one shows a full overlay modal
// (openPreview() below) — a docked pane was tried first but left too little
// width for the list next to it for what the content actually needed.

let resourcesKindFilter = ''; // '' = all; otherwise a comma-separated list of kinds
let resourcesCourseFilterId: number | null = null; // null = all courses
let notesCourseFilterId: number | null = null; // null = all courses

function resourceListItem(resource: ResourceWithCourse, iconView: boolean): HTMLLIElement {
  const li = document.createElement('li');
  li.dataset.resourceId = String(resource.id);

  if (iconView) {
    li.className = 'icon-tile';
    const icon = document.createElement('div');
    icon.className = 'icon-glyph';
    icon.textContent = KIND_ICON[resource.kind] ?? KIND_ICON.other;
    li.appendChild(icon);
    const name = document.createElement('div');
    name.className = 'icon-name';
    name.textContent = resource.title;
    li.appendChild(name);
    const course = document.createElement('div');
    course.className = 'icon-course';
    course.textContent = resource.course_name;
    li.appendChild(course);
  } else {
    const name = document.createElement('span');
    name.className = 'resource-name';
    name.textContent = resource.title;
    li.appendChild(name);
    const course = document.createElement('span');
    course.className = 'code';
    course.textContent = resource.course_name;
    li.appendChild(course);
    const kind = document.createElement('span');
    kind.className = 'code resource-kind';
    kind.textContent = resource.kind;
    li.appendChild(kind);
  }

  li.addEventListener('click', () => openPreview(resource));
  li.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    atlasApi.showResourceContextMenu(resource.id);
  });
  return li;
}

function renderAllResourcesList(resources: ResourceWithCourse[]): void {
  const list = document.getElementById('all-resources-list')!;
  list.className = viewMode === 'list' ? 'view-list' : 'view-grid';
  list.innerHTML = '';

  if (resources.length === 0) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'No resources match this filter.';
    list.appendChild(li);
    return;
  }

  for (const resource of resources) {
    list.appendChild(resourceListItem(resource, viewMode === 'grid'));
  }
}

// Shared by the Resources and Notes pages' course rails — both filter a
// global list down to one course (or show everything) the same way.
function renderCourseRail(
  railId: string,
  courses: Course[],
  allLabel: string,
  selectedCourseId: number | null,
  onSelect: (courseId: number | null) => void
): void {
  const rail = document.getElementById(railId)!;
  rail.innerHTML = '';
  const allLi = document.createElement('li');
  allLi.textContent = allLabel;
  allLi.classList.toggle('selected', selectedCourseId === null);
  allLi.addEventListener('click', () => onSelect(null));
  rail.appendChild(allLi);
  for (const course of courses) {
    const li = document.createElement('li');
    li.textContent = course.name;
    li.classList.toggle('selected', selectedCourseId === course.id);
    li.addEventListener('click', () => onSelect(course.id));
    rail.appendChild(li);
  }
}

// --- Course picker modal: choose a target course for an action that isn't
// scoped to any one course already visible on screen (uploading a resource,
// creating a note). A real modal with a search box, not a small anchored
// popup — the popup this replaced cut off past the screen edge once there
// were more than a couple of courses. Shared between the Upload and New Note
// flows via `mode`; Upload additionally carries a drag-and-drop zone.

type CoursePickerMode = 'upload' | 'note' | 'scan';

let coursePickerMode: CoursePickerMode = 'upload';
let coursePickerCourses: Course[] = [];
let coursePickerSelectedId: number | null = null;
// Set when the picker was opened from a file already dropped onto the
// Resources page directly (not the Upload button) — in that case the course
// is the only thing left to choose, so clicking one uploads immediately
// instead of also requiring a second drop into the modal's own dropzone.
let coursePickerPendingFile: File | null = null;
// True while a scan import is actually running (OCR can take real time) —
// the modal stays open and shows progress instead of closing immediately
// like upload/note do, and closing is blocked so the in-progress batch isn't
// abandoned mid-way.
let coursePickerBusy = false;

async function uploadDroppedFile(courseId: number, file: File): Promise<void> {
  const buffer = await file.arrayBuffer();
  const resource = await atlasApi.uploadResourceBuffer(courseId, file.name, buffer);
  if (resource) await renderResourcesPage();
}

function setImportScanProgress(text: string | null): void {
  const el = document.getElementById('course-picker-progress')!;
  el.textContent = text ?? '';
  el.hidden = text === null;
}

// Sequential, not parallel — a shared Tesseract worker (src/main/ocr.ts) is
// reused across the whole batch on the main-process side, so importing one
// file at a time here lets that reuse actually happen instead of racing
// several OCR jobs against one worker.
async function importScanFiles(courseId: number, files: File[]): Promise<void> {
  coursePickerBusy = true;
  const dropzone = document.getElementById('course-picker-dropzone')!;
  const searchInput = document.getElementById('course-picker-search') as HTMLInputElement;
  dropzone.classList.add('disabled');
  searchInput.disabled = true;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    setImportScanProgress(`Processing "${file.name}" (${i + 1} of ${files.length})…`);
    const buffer = await file.arrayBuffer();
    await atlasApi.importScanBuffer(courseId, file.name, buffer);
  }

  coursePickerBusy = false;
  searchInput.disabled = false;
  closeCoursePicker();
  await renderNotesPage();
}

function closeCoursePicker(): void {
  if (coursePickerBusy) return;
  document.getElementById('course-picker-overlay')!.hidden = true;
  document.getElementById('course-picker-progress')!.hidden = true;
  coursePickerSelectedId = null;
  coursePickerPendingFile = null;
}

function renderCoursePickerList(filterText: string): void {
  const list = document.getElementById('course-picker-list')!;
  list.innerHTML = '';
  const query = filterText.trim().toLowerCase();
  const filtered = query
    ? coursePickerCourses.filter((c) => c.name.toLowerCase().includes(query))
    : coursePickerCourses;

  if (filtered.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No matching courses.';
    list.appendChild(li);
    return;
  }

  for (const course of filtered) {
    const li = document.createElement('li');
    li.textContent = course.name;
    li.classList.toggle('selected', coursePickerSelectedId === course.id);
    li.addEventListener('click', () => selectCoursePickerCourse(course.id));
    list.appendChild(li);
  }
}

async function selectCoursePickerCourse(courseId: number): Promise<void> {
  coursePickerSelectedId = courseId;

  if (coursePickerMode === 'note') {
    closeCoursePicker();
    const note = await atlasApi.createNote(courseId);
    await openNoteEditor(note);
    return;
  }

  if (coursePickerPendingFile) {
    const file = coursePickerPendingFile;
    closeCoursePicker();
    await uploadDroppedFile(courseId, file);
    return;
  }

  // Upload/scan mode, no file yet — just highlight the selection and enable
  // the dropzone below; the user still needs to drop a file (or several, for
  // scan mode) or click Browse.
  const searchValue = (document.getElementById('course-picker-search') as HTMLInputElement).value;
  renderCoursePickerList(searchValue);
  const dropzone = document.getElementById('course-picker-dropzone')!;
  dropzone.classList.remove('disabled');
  const course = coursePickerCourses.find((c) => c.id === courseId);
  const noun = coursePickerMode === 'scan' ? 'scan(s)' : 'a file';
  document.getElementById('course-picker-dropzone-hint')!.textContent = course
    ? `Drop ${noun} here for ${course.name}`
    : `Drop ${noun} here`;
}

async function openCoursePicker(mode: CoursePickerMode, file?: File): Promise<void> {
  coursePickerMode = mode;
  coursePickerPendingFile = file ?? null;
  coursePickerSelectedId = null;
  coursePickerCourses = await atlasApi.listCourses();

  const title = document.getElementById('course-picker-title')!;
  const searchInput = document.getElementById('course-picker-search') as HTMLInputElement;
  const dropzone = document.getElementById('course-picker-dropzone')!;
  searchInput.value = '';

  document.getElementById('course-picker-progress')!.hidden = true;

  if (mode === 'note') {
    title.textContent = 'New note';
    dropzone.hidden = true;
  } else if (file) {
    title.textContent = `Upload "${file.name}" to…`;
    dropzone.hidden = true;
  } else if (mode === 'scan') {
    title.textContent = 'Import scan';
    dropzone.hidden = false;
    dropzone.classList.add('disabled');
    document.getElementById('course-picker-dropzone-hint')!.textContent =
      'Select a course above, then drop scan(s) here';
  } else {
    title.textContent = 'Upload file';
    dropzone.hidden = false;
    dropzone.classList.add('disabled');
    document.getElementById('course-picker-dropzone-hint')!.textContent =
      'Select a course above, then drop a file here';
  }

  renderCoursePickerList('');
  document.getElementById('course-picker-overlay')!.hidden = false;
  searchInput.focus();
}

type ResourcesSort = 'name' | 'recent' | 'kind' | 'course';
let resourcesSort: ResourcesSort = 'name';

function sortResources(resources: ResourceWithCourse[], sort: ResourcesSort): ResourceWithCourse[] {
  const sorted = [...resources];
  if (sort === 'name') sorted.sort((a, b) => a.title.localeCompare(b.title));
  else if (sort === 'kind') sorted.sort((a, b) => a.kind.localeCompare(b.kind));
  else if (sort === 'course') sorted.sort((a, b) => a.course_name.localeCompare(b.course_name));
  // 'recent': listAllResources() is already ORDER BY added_at DESC — no re-sort needed.
  return sorted;
}

async function renderResourcesPage(): Promise<void> {
  void renderDashboard();
  const courses = await atlasApi.listCourses();

  renderCourseRail('resources-course-rail', courses, 'All Resources', resourcesCourseFilterId, (id) => {
    resourcesCourseFilterId = id;
    void renderResourcesPage();
  });

  const allResources = await atlasApi.listAllResources();
  let filtered = allResources;
  if (resourcesCourseFilterId !== null) {
    filtered = filtered.filter((r) => r.course_id === resourcesCourseFilterId);
  }
  if (resourcesKindFilter) {
    const kinds = resourcesKindFilter.split(',');
    filtered = filtered.filter((r) => kinds.includes(r.kind));
  }
  renderAllResourcesList(sortResources(filtered, resourcesSort));
}

async function renderWatchedFolders(): Promise<void> {
  const list = document.getElementById('watched-folder-list')!;
  list.innerHTML = '';
  if (!selectedCourse) return;

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

// --- Global Notes page: every note across every course, grouped by
// recency (Today / This week / Older), with an inline docked editor
// instead of the modal overlay this used to be.

function isThisWeekLocal(sqliteDatetimeUtc: string): boolean {
  const date = new Date(sqliteDatetimeUtc.replace(' ', 'T') + 'Z');
  const now = new Date();
  const diffDays = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays < 7;
}

function noteGroupLabel(note: NoteWithCourse): 'Today' | 'This week' | 'Older' {
  if (isTodayLocal(note.updated_at)) return 'Today';
  if (isThisWeekLocal(note.updated_at)) return 'This week';
  return 'Older';
}

function renderAllNotesList(notes: NoteWithCourse[]): void {
  const container = document.getElementById('all-notes-list')!;
  container.innerHTML = '';

  if (notes.length === 0) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = notesCourseFilterId === null ? 'No notes yet.' : 'No notes match this filter.';
    container.appendChild(p);
    return;
  }

  const groups: Record<'Today' | 'This week' | 'Older', NoteWithCourse[]> = {
    Today: [],
    'This week': [],
    Older: [],
  };
  for (const note of notes) groups[noteGroupLabel(note)].push(note);

  for (const groupName of ['Today', 'This week', 'Older'] as const) {
    const items = groups[groupName];
    if (items.length === 0) continue;

    const header = document.createElement('h4');
    header.className = 'notes-group-header';
    header.textContent = `${groupName} (${items.length})`;
    container.appendChild(header);

    const ul = document.createElement('ul');
    ul.className = 'notes-group-list';
    for (const note of items) {
      const li = document.createElement('li');
      li.dataset.noteId = String(note.id);
      if (currentNoteId === note.id) li.classList.add('selected');

      const title = document.createElement('div');
      title.className = 'note-item-title';
      title.textContent = note.is_handwritten ? `✍️ ${note.title}` : note.title;
      li.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'note-item-meta';
      meta.textContent = `${note.course_name} · ${formatNoteTimestamp(note.updated_at)}`;
      li.appendChild(meta);

      li.addEventListener('click', () => openNoteEditor(note));
      li.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        atlasApi.showNoteContextMenu(note.id);
      });
      ul.appendChild(li);
    }
    container.appendChild(ul);
  }
}

async function renderNotesPage(): Promise<void> {
  void renderDashboard();
  const courses = await atlasApi.listCourses();

  renderCourseRail('notes-course-rail', courses, 'All Notes', notesCourseFilterId, (id) => {
    notesCourseFilterId = id;
    void renderNotesPage();
  });

  const allNotes = await atlasApi.listAllNotes();
  const notes =
    notesCourseFilterId === null ? allNotes : allNotes.filter((n) => n.course_id === notesCourseFilterId);
  renderAllNotesList(notes);
}

// `due_at` is 'YYYY-MM-DD' (date only) or 'YYYY-MM-DDTHH:MM' (date + optional
// time) — split apart and parsed with explicit year/month/day/hour/minute
// components rather than `new Date(str)` directly, to avoid the browser
// interpreting a bare date string as UTC midnight and displaying the day
// before in negative-UTC-offset timezones.
function splitDueAt(dueAt: string): { year: number; month: number; day: number; hour: number | null; minute: number | null } {
  const [datePart, timePart] = dueAt.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  if (!timePart) return { year, month, day, hour: null, minute: null };
  const [hour, minute] = timePart.split(':').map(Number);
  return { year, month, day, hour, minute };
}

// "Today"/"Tomorrow" read faster at a glance than a date the user has to
// mentally compare against today — everything from the day after tomorrow
// onward falls back to a plain formatted date, where relative labels stop
// being obviously faster to parse.
function formatDueDate(dueAt: string | null): string {
  if (!dueAt) return 'No due date';
  const { year, month, day, hour, minute } = splitDueAt(dueAt);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  let label: string;
  if (date.getTime() === today.getTime()) label = 'Today';
  else if (date.getTime() === tomorrow.getTime()) label = 'Tomorrow';
  else label = date.toLocaleDateString(undefined, { dateStyle: 'medium' });

  if (hour === null || minute === null) return label;
  const timeLabel = new Date(2000, 0, 1, hour, minute).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${label} at ${timeLabel}`;
}

function renderDeadlineListView(deadlines: Deadline[]): void {
  const list = document.getElementById('deadline-list')!;
  list.className = 'view-list';
  list.innerHTML = '';

  for (const deadline of deadlines) {
    const li = document.createElement('li');
    li.className = 'deadline-item';
    if (deadline.completed) li.classList.add('completed');
    li.dataset.deadlineId = String(deadline.id);

    li.appendChild(makeDeadlineCheckbox(deadline));

    const icon = document.createElement('span');
    icon.textContent = DEADLINE_KIND_ICON[deadline.kind] ?? '📌';
    li.appendChild(icon);

    const title = document.createElement('span');
    title.className = 'deadline-title';
    title.textContent = deadline.title;
    li.appendChild(title);

    const kind = document.createElement('span');
    kind.className = 'code';
    kind.textContent = DEADLINE_KIND_LABEL[deadline.kind] ?? deadline.kind;
    li.appendChild(kind);

    const due = document.createElement('span');
    due.className = 'deadline-due';
    due.textContent = formatDueDate(deadline.due_at);
    li.appendChild(due);

    li.addEventListener('click', () => openDeadlineViewer(deadline));
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      atlasApi.showDeadlineContextMenu(deadline.id);
    });

    list.appendChild(li);
  }
}

function renderDeadlineIconView(deadlines: Deadline[]): void {
  const list = document.getElementById('deadline-list')!;
  list.className = 'view-grid';
  list.innerHTML = '';

  for (const deadline of deadlines) {
    const li = document.createElement('li');
    li.className = 'icon-tile deadline-item';
    if (deadline.completed) li.classList.add('completed');
    li.dataset.deadlineId = String(deadline.id);

    li.appendChild(makeDeadlineCheckbox(deadline));

    const icon = document.createElement('div');
    icon.className = 'icon-glyph';
    icon.textContent = DEADLINE_KIND_ICON[deadline.kind] ?? '📌';
    li.appendChild(icon);

    const name = document.createElement('div');
    name.className = 'icon-name';
    name.textContent = deadline.title;
    li.appendChild(name);

    const due = document.createElement('div');
    due.className = 'icon-due';
    due.textContent = formatDueDate(deadline.due_at);
    li.appendChild(due);

    li.addEventListener('click', () => openDeadlineViewer(deadline));
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      atlasApi.showDeadlineContextMenu(deadline.id);
    });

    list.appendChild(li);
  }
}

// Shared between list and icon view — clicking the checkbox toggles
// completion without opening the viewer (stopPropagation), clicking
// anywhere else on the row/tile opens it.
function makeDeadlineCheckbox(deadline: Deadline): HTMLInputElement {
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'deadline-checkbox';
  checkbox.checked = !!deadline.completed;
  checkbox.addEventListener('click', (e) => e.stopPropagation());
  checkbox.addEventListener('change', async () => {
    await atlasApi.setDeadlineCompleted(deadline.id, checkbox.checked);
    await renderDeadlines();
  });
  return checkbox;
}

async function renderDeadlines(): Promise<void> {
  void renderDashboard();
  const section = document.getElementById('deadlines-section')!;
  const heading = document.getElementById('deadlines-heading')!;
  const list = document.getElementById('deadline-list')!;

  if (!selectedCourse) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  heading.textContent = 'Deadlines';

  const deadlines = await atlasApi.listDeadlines(selectedCourse.id);
  if (deadlines.length === 0) {
    list.className = 'view-list';
    list.innerHTML = '';
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'No deadlines yet.';
    list.appendChild(li);
    return;
  }

  if (viewMode === 'list') renderDeadlineListView(deadlines);
  else renderDeadlineIconView(deadlines);
}

// --- Dashboard (PRD §13): global, not per-course — upcoming deadlines
// across every course, recently added resources across every course, and
// what changed today. Refreshed opportunistically from renderResourcesPage()/
// renderNotesPage()/renderDeadlines() (fire-and-forget, not awaited — it's a
// secondary overview widget, not the thing the user is actively waiting on)
// rather than hooking every individual mutation call site, since those
// three functions already run after every resource/note/deadline change.

function isTodayLocal(sqliteDatetimeUtc: string): boolean {
  // SQLite's datetime('now') is UTC with no 'Z' suffix — append it so Date
  // parses it as UTC, then compare using the *local* calendar day, matching
  // how a human would answer "did this happen today."
  const date = new Date(sqliteDatetimeUtc.replace(' ', 'T') + 'Z');
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

async function renderDashboard(): Promise<void> {
  await Promise.all([
    renderDashboardStats(),
    renderDashboardCourses(),
    renderDashboardDeadlines(),
    renderDashboardResources(),
    renderDashboardActivity(),
  ]);
}

async function renderDashboardStats(): Promise<void> {
  const stats = await atlasApi.getDashboardStats();
  document.getElementById('stat-courses')!.textContent = String(stats.courseCount);
  document.getElementById('stat-resources')!.textContent = String(stats.resourceCount);
  document.getElementById('stat-notes')!.textContent = String(stats.noteCount);
  document.getElementById('stat-deadlines')!.textContent = String(stats.upcomingDeadlineCount);
}

async function renderDashboardCourses(): Promise<void> {
  const list = document.getElementById('dashboard-course-list')!;
  const courses = await atlasApi.getCourseSummaries();
  list.innerHTML = '';

  if (courses.length === 0) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'No courses yet.';
    list.appendChild(li);
    return;
  }

  for (const course of courses) {
    const li = document.createElement('li');
    li.appendChild(makeCourseAvatar(course));

    const info = document.createElement('div');
    info.className = 'dashboard-course-info';
    const name = document.createElement('div');
    name.className = 'dashboard-course-name';
    name.textContent = course.name;
    info.appendChild(name);
    if (course.code) {
      const code = document.createElement('div');
      code.className = 'dashboard-course-code';
      code.textContent = course.code;
      info.appendChild(code);
    }
    li.appendChild(info);

    const count = document.createElement('span');
    count.className = 'dashboard-course-count';
    count.textContent = `${course.resource_count}`;
    li.appendChild(count);

    li.addEventListener('click', () => openDashboardCourse(course));
    list.appendChild(li);
  }
}

async function openDashboardCourse(course: Course): Promise<void> {
  showPage('courses');
  await selectCourse(course);
}

// Two stacked rows per item (icon + title on top, course + optional meta
// below) rather than one long row — with 4 cards now sharing the dashboard
// grid (since "My courses" was added), a single row ran out of width fast
// and truncated the title down to a couple of characters.
function buildDashboardItemRows(icon: string, title: string, courseName: string, metaText?: string): DocumentFragment {
  const iconEl = document.createElement('span');
  iconEl.textContent = icon;
  const titleEl = document.createElement('span');
  titleEl.className = 'dashboard-item-title';
  titleEl.textContent = title;
  const topRow = document.createElement('div');
  topRow.className = 'dashboard-item-row';
  topRow.append(iconEl, titleEl);

  const courseEl = document.createElement('span');
  courseEl.className = 'dashboard-item-course';
  courseEl.textContent = courseName;
  const bottomRow = document.createElement('div');
  bottomRow.className = 'dashboard-item-row dashboard-item-subrow';
  bottomRow.appendChild(courseEl);
  if (metaText) {
    const metaEl = document.createElement('span');
    metaEl.className = 'dashboard-item-meta';
    metaEl.textContent = metaText;
    bottomRow.appendChild(metaEl);
  }

  const fragment = document.createDocumentFragment();
  fragment.append(topRow, bottomRow);
  return fragment;
}

async function renderDashboardDeadlines(): Promise<void> {
  const list = document.getElementById('dashboard-deadlines')!;
  const deadlines = await atlasApi.getUpcomingDeadlines();
  list.innerHTML = '';

  if (deadlines.length === 0) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'No upcoming deadlines.';
    list.appendChild(li);
    return;
  }

  for (const deadline of deadlines) {
    const li = document.createElement('li');
    li.appendChild(
      buildDashboardItemRows(
        DEADLINE_KIND_ICON[deadline.kind] ?? '📌',
        deadline.title,
        deadline.course_name,
        formatDueDate(deadline.due_at)
      )
    );
    li.addEventListener('click', () => openDashboardDeadline(deadline));
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showGoToMenu(e.clientX, e.clientY, () => goToDashboardDeadline(deadline));
    });
    list.appendChild(li);
  }
}

async function renderDashboardResources(): Promise<void> {
  const list = document.getElementById('dashboard-resources')!;
  const resources = await atlasApi.getRecentResources();
  list.innerHTML = '';

  if (resources.length === 0) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'No resources yet.';
    list.appendChild(li);
    return;
  }

  for (const resource of resources) {
    const li = document.createElement('li');
    li.appendChild(buildDashboardItemRows(KIND_ICON[resource.kind] ?? '📁', resource.title, resource.course_name));
    li.addEventListener('click', () => openDashboardResource(resource));
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showGoToMenu(e.clientX, e.clientY, () => goToDashboardResource(resource));
    });
    list.appendChild(li);
  }
}

async function renderDashboardActivity(): Promise<void> {
  const list = document.getElementById('dashboard-activity')!;
  const activity = await atlasApi.getRecentActivity();
  const todayItems = activity.filter((item) => isTodayLocal(item.timestamp));
  list.innerHTML = '';

  if (todayItems.length === 0) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'Nothing changed today yet.';
    list.appendChild(li);
    return;
  }

  for (const item of todayItems) {
    const li = document.createElement('li');
    const timeText = new Date(item.timestamp.replace(' ', 'T') + 'Z').toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    li.appendChild(
      buildDashboardItemRows(item.entity_type === 'note' ? '📃' : '📁', item.title, item.course_name, timeText)
    );
    li.addEventListener('click', () => openDashboardActivityItem(item));
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showGoToMenu(e.clientX, e.clientY, () => goToDashboardActivityItem(item));
    });
    list.appendChild(li);
  }
}

// The deadline viewer (#deadline-editor-overlay) is a global overlay, same
// as the resource preview and note editor — so opening one never needs to
// navigate pages away from Dashboard. selectCourse() is still called (in the
// background, without a page switch) purely so its "Edit" button has the
// right selectedCourse to work from — editing a deadline needs that course's
// id for mention candidates.
async function openDashboardDeadline(deadline: DashboardDeadline): Promise<void> {
  const courses = await atlasApi.listCourses();
  const course = courses.find((c) => c.id === deadline.course_id);
  if (course) await selectCourse(course);
  await openDeadlineViewer(deadline);
}

// Resources/Notes are global pages now — opening one doesn't need to
// "select" its course first (that's only meaningful for the Courses page's
// own drill-down), just find it in the global list and open it.
async function openDashboardResource(resource: DashboardResource): Promise<void> {
  await openPreview(resource);
}

async function openDashboardActivityItem(item: DashboardActivityItem): Promise<void> {
  if (item.entity_type === 'note') {
    const notes = await atlasApi.listAllNotes();
    const note = notes.find((n) => n.id === item.id);
    if (note) await openNoteEditor(note);
  } else {
    const resources = await atlasApi.listAllResources();
    const resource = resources.find((r) => r.id === item.id);
    if (resource) await openPreview(resource);
  }
}

// A small custom context menu, not a native one — unlike the native menus
// used for resources/notes/courses (destructive/file actions that make
// sense to hand off to the OS), "Go to" is pure in-renderer navigation, so
// there's nothing for the main process to do.
function showGoToMenu(x: number, y: number, onGoTo: () => void): void {
  closeGoToMenu();
  const menu = document.createElement('div');
  menu.id = 'dashboard-goto-menu';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Go to';
  button.addEventListener('click', () => {
    closeGoToMenu();
    void onGoTo();
  });
  menu.appendChild(button);
  document.body.appendChild(menu);

  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, window.innerWidth - rect.width - 8)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - rect.height - 8)}px`;

  // Deferred so the contextmenu event that opened this menu doesn't
  // immediately trigger its own dismissal via this same listener.
  setTimeout(() => document.addEventListener('click', closeGoToMenu, { once: true }), 0);
}

function closeGoToMenu(): void {
  document.getElementById('dashboard-goto-menu')?.remove();
}

// These jump to where an item lives (course detail's Deadlines section, or
// the global Resources/Notes page filtered to its course) AND open/preview
// the item itself there — the original dashboard-click behavior, now moved
// to right-click's "Go to" specifically, since left-click became "open in
// place, don't navigate" per the user's earlier request.
async function goToDashboardDeadline(deadline: DashboardDeadline): Promise<void> {
  showPage('courses');
  const courses = await atlasApi.listCourses();
  const course = courses.find((c) => c.id === deadline.course_id);
  if (course) await selectCourse(course);
  await openDeadlineViewer(deadline);
}

async function goToDashboardResource(resource: DashboardResource): Promise<void> {
  resourcesCourseFilterId = resource.course_id;
  showPage('resources');
  await openPreview(resource);
}

async function goToDashboardActivityItem(item: DashboardActivityItem): Promise<void> {
  if (item.entity_type === 'note') {
    notesCourseFilterId = item.course_id;
    showPage('notes');
    const notes = await atlasApi.listAllNotes();
    const note = notes.find((n) => n.id === item.id);
    if (note) await openNoteEditor(note);
  } else {
    resourcesCourseFilterId = item.course_id;
    showPage('resources');
    const resources = await atlasApi.listAllResources();
    const resource = resources.find((r) => r.id === item.id);
    if (resource) await openPreview(resource);
  }
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
    // The Notes page keeps the note list visible right alongside the
    // editor (unlike the old modal, where the list wasn't on screen while
    // editing) — so a derived-title update has to refresh that list too,
    // or it goes stale showing the pre-edit title/timestamp right next to
    // the now-current one in the editor pane.
    void renderNotesPage();
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

// A global overlay (near the end of <body>), not scoped to the Notes page —
// opening a note never navigates away from whatever page is currently
// showing (Dashboard, a course detail view, the Notes page itself), same
// reasoning as openPreview().
async function openNoteEditor(note: Note): Promise<void> {
  const overlay = document.getElementById('note-overlay')!;
  const titleInput = document.getElementById('note-title-input') as HTMLInputElement;
  const statusEl = document.getElementById('note-save-status')!;
  const root = document.getElementById('note-editor-root')!;

  currentNoteId = note.id;
  titleInput.value = note.title;
  statusEl.textContent = '';
  root.innerHTML = '';
  overlay.hidden = false;

  // "View original scan" only makes sense for a handwritten note — the panel
  // always starts collapsed on open, even if it was left open on whatever
  // note was viewed last.
  const scanToggle = document.getElementById('note-view-scan') as HTMLButtonElement;
  const scanPanel = document.getElementById('note-scan-panel')!;
  scanToggle.hidden = !note.is_handwritten;
  scanPanel.hidden = true;
  scanPanel.innerHTML = '';

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

  const overlay = document.getElementById('note-overlay')!;
  overlay.hidden = true;
  overlay.classList.remove('fullscreen');
  resetNoteFullscreenButton();
  document.getElementById('note-scan-panel')!.hidden = true;

  if (noteEditorInstance) {
    await noteEditorInstance.destroy();
    noteEditorInstance = null;
  }
  currentNoteId = null;

  // Refresh whichever view could now be showing a stale title/timestamp for
  // this note — same currentPage-gated refresh pattern already used for
  // resources (see the resources:changed handler in init()).
  if (currentPage === 'notes') await renderNotesPage();
  else if (currentPage === 'dashboard') await renderDashboard();
  else if (currentPage === 'courses' && selectedCourse) await renderCourseDetailPreviews(selectedCourse.id);
}

const NOTE_FULLSCREEN_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
const NOTE_EXIT_FULLSCREEN_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>';

function resetNoteFullscreenButton(): void {
  const button = document.getElementById('note-fullscreen') as HTMLButtonElement;
  button.innerHTML = NOTE_FULLSCREEN_ICON;
  button.title = 'Fullscreen';
  button.setAttribute('aria-label', button.title);
}

// Genuine fullscreen: the overlay panel grows to cover the whole viewport,
// sidebar and topbar included, same as the Resources preview modal
// (#preview-overlay.fullscreen).
function toggleNoteTrueFullscreen(): void {
  const overlay = document.getElementById('note-overlay')!;
  const isFullscreen = overlay.classList.toggle('fullscreen');
  const button = document.getElementById('note-fullscreen') as HTMLButtonElement;
  button.innerHTML = isFullscreen ? NOTE_EXIT_FULLSCREEN_ICON : NOTE_FULLSCREEN_ICON;
  button.title = isFullscreen ? 'Exit fullscreen' : 'Fullscreen';
  button.setAttribute('aria-label', button.title);
}

// Renders a scan preview (image or PDF) into a plain container — same two
// branches openPreview() has for resources, since a handwritten note's scan
// is just a file on disk with no different rendering needs. Only image/pdf
// are possible here (see SCAN_EXTENSIONS in main.ts), so the html/text/
// unsupported branches openPreview() also handles don't apply.
function renderScanInto(container: HTMLElement, preview: Preview): void {
  container.innerHTML = '';
  if (preview.type === 'pdf') {
    const iframe = document.createElement('iframe');
    iframe.src = preview.url;
    container.appendChild(iframe);
  } else if (preview.type === 'image') {
    const img = document.createElement('img');
    img.src = preview.url;
    container.appendChild(img);
  }
}

async function toggleNoteScanPanel(): Promise<void> {
  const panel = document.getElementById('note-scan-panel')!;
  if (!panel.hidden) {
    panel.hidden = true;
    return;
  }
  if (currentNoteId === null) return;
  panel.innerHTML = '<p class="muted">Loading scan…</p>';
  panel.hidden = false;
  const preview = await atlasApi.getNoteScanPreview(currentNoteId);
  if (preview) renderScanInto(panel, preview);
}

// The Courses page shows either the grid (courses-list-view) or one
// course's detail view (courses-detail-view) — never both at once. Clicking
// a course card is a genuine navigation to a separate view (with its own
// "Back to Courses" control), not an inline drill-down appended below the
// still-visible grid.
function showCourseListView(): void {
  document.getElementById('courses-list-view')!.hidden = false;
  document.getElementById('courses-detail-view')!.hidden = true;
}

function showCourseDetailView(): void {
  document.getElementById('courses-list-view')!.hidden = true;
  document.getElementById('courses-detail-view')!.hidden = false;
}

function backToCourseList(): void {
  selectedCourse = null;
  showCourseListView();
  void renderCourses(); // clear the stale .selected highlight left on the grid
}

// Deadlines + Watched folders are shown directly (real, already-built
// features); Resources/Notes stay global pages — these two link buttons
// just jump to them pre-filtered to this course rather than duplicating
// their list/preview UI here.
async function selectCourse(course: Course): Promise<void> {
  selectedCourse = course;
  showCourseDetailView();
  void renderCourses(); // updates the grid's .selected highlight for when the user goes back

  document.getElementById('course-detail-heading')!.textContent = course.name;
  document.getElementById('course-detail-meta')!.textContent = [course.code, course.term]
    .filter((part): part is string => !!part)
    .join(' · ');

  const avatarSlot = document.getElementById('course-detail-avatar-slot')!;
  avatarSlot.innerHTML = '';
  avatarSlot.appendChild(makeCourseAvatar(course));

  const summaries = await atlasApi.getCourseSummaries();
  const summary = summaries.find((s) => s.id === course.id);
  document.getElementById('course-detail-resource-count')!.textContent = String(summary?.resource_count ?? 0);
  document.getElementById('course-detail-note-count')!.textContent = String(summary?.note_count ?? 0);

  await renderCourseDetailPreviews(course.id);
  await renderDeadlines();
  await renderWatchedFolders();
}

// Short inline previews of this course's own Resources/Notes (a handful of
// items each) — "View all" still exists to reach the full global page, but
// this means a quick look doesn't require leaving the course page at all.
const COURSE_DETAIL_PREVIEW_LIMIT = 5;

async function renderCourseDetailPreviews(courseId: number): Promise<void> {
  const [resources, notes] = await Promise.all([
    atlasApi.listResources(courseId),
    atlasApi.listNotes(courseId),
  ]);

  const resourceList = document.getElementById('course-detail-resources-preview')!;
  resourceList.innerHTML = '';
  if (resources.length === 0) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'No resources yet.';
    resourceList.appendChild(li);
  } else {
    for (const resource of resources.slice(0, COURSE_DETAIL_PREVIEW_LIMIT)) {
      const li = document.createElement('li');
      li.textContent = resource.title;
      li.addEventListener('click', () => openPreview(resource));
      li.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        atlasApi.showResourceContextMenu(resource.id);
      });
      resourceList.appendChild(li);
    }
  }

  const noteList = document.getElementById('course-detail-notes-preview')!;
  noteList.innerHTML = '';
  if (notes.length === 0) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'No notes yet.';
    noteList.appendChild(li);
  } else {
    for (const note of notes.slice(0, COURSE_DETAIL_PREVIEW_LIMIT)) {
      const li = document.createElement('li');
      li.textContent = note.is_handwritten ? `✍️ ${note.title}` : note.title;
      li.addEventListener('click', () => openNoteEditor(note));
      noteList.appendChild(li);
    }
  }
}

async function setSemesterFilter(term: string, persist = true): Promise<void> {
  semesterFilter = term;
  // If the currently open course falls outside the new filter, back out of
  // its detail view rather than leaving it showing a course no longer listed.
  if (selectedCourse && term && selectedCourse.term !== term) {
    backToCourseList();
  }
  await renderCourses();
  if (persist) atlasApi.setSetting('semesterFilter', term);
}

// App-wide, not per-course — the user wants one view preference that
// applies everywhere and survives a fresh launch, not something that resets
// per folder or on restart.
function setViewMode(mode: 'list' | 'grid', persist = true): void {
  viewMode = mode;
  document.getElementById('view-list')!.classList.toggle('active', mode === 'list');
  document.getElementById('view-grid')!.classList.toggle('active', mode === 'grid');
  // Deadlines has its own copy of this toggle (see index.html) — Resources
  // and Deadlines are separate pages now, so the one on the Resources page
  // isn't visible/reachable while looking at a course's deadlines. Both
  // toggles drive the same shared `viewMode` preference.
  document.getElementById('deadline-view-list-toggle')!.classList.toggle('active', mode === 'list');
  document.getElementById('deadline-view-grid-toggle')!.classList.toggle('active', mode === 'grid');
  void renderResourcesPage();
  void renderDeadlines();
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

// A full overlay modal (`#preview-overlay`) — a docked pane on the Resources
// page was tried first, but left too little width for the list next to it
// for what the content actually needed. Any caller from elsewhere in the app
// (Dashboard, Search, a deadline mention) switches to the Resources page
// first, so the list underneath is already showing the right context once
// the modal is closed.
// A global overlay (near the end of <body>), not scoped to the Resources
// page — opening one never navigates away from whatever page is currently
// showing (Dashboard, a course detail view, etc.), it just layers on top.
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

// Fullscreen means the overlay panel expands to fill the whole window
// (.fullscreen on #preview-overlay — see styles.css), same as before the
// docked-pane experiment; that version only collapsed the rail/list columns
// without the pane actually growing to fill the freed space, which is what
// made "F"/the fullscreen button visibly not do anything.
function toggleFullscreenPreview(): void {
  const overlay = document.getElementById('preview-overlay')!;
  const button = document.getElementById('preview-fullscreen') as HTMLButtonElement;
  const isFullscreen = overlay.classList.toggle('fullscreen');
  button.innerHTML = isFullscreen ? MINIMIZE_ICON : MAXIMIZE_ICON;
  button.title = isFullscreen ? 'Exit Fullscreen' : 'Fullscreen';
  button.setAttribute('aria-label', button.title);
}

// Global search (FTS5 across notes/resources — see search:query in main.ts).
// The snippet the main process returns already has our own literal
// "<mark>"/"</mark>" markers inserted around matched terms — escape the rest
// of the (untrusted, user-authored) text as HTML first, then turn just those
// two escaped marker strings back into real tags, so nothing else in a
// note/resource body can inject markup into the results dropdown.
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlightSnippet(snippet: string): string {
  return escapeHtml(snippet).replace(/&lt;mark&gt;/g, '<mark>').replace(/&lt;\/mark&gt;/g, '</mark>');
}

let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
// Tracks what Arrow Up/Down + Enter operate on — kept in sync with whatever
// is currently rendered in #search-results, so keyboard nav works without
// having to re-read the DOM to figure out which result is "current."
let currentSearchResults: SearchResult[] = [];
let activeSearchIndex = -1;

function updateActiveSearchResult(): void {
  const items = document.querySelectorAll('#search-results li');
  items.forEach((item, index) => {
    const isActive = index === activeSearchIndex;
    item.classList.toggle('active', isActive);
    if (isActive) item.scrollIntoView({ block: 'nearest' });
  });
}

async function runSearch(query: string): Promise<void> {
  const resultsList = document.getElementById('search-results')!;
  activeSearchIndex = -1;
  if (!query.trim()) {
    currentSearchResults = [];
    resultsList.hidden = true;
    resultsList.innerHTML = '';
    return;
  }

  const results = await atlasApi.search(query);
  currentSearchResults = results;
  resultsList.innerHTML = '';

  if (results.length === 0) {
    const li = document.createElement('li');
    li.className = 'search-empty';
    li.textContent = 'No matches';
    resultsList.appendChild(li);
  } else {
    results.forEach((result, index) => {
      const li = document.createElement('li');
      const titleRow = document.createElement('div');
      titleRow.className = 'search-result-title';
      titleRow.textContent = `${result.entityType === 'note' ? '📃' : '📄'} ${result.title}`;
      const courseSpan = document.createElement('span');
      courseSpan.className = 'search-result-course';
      courseSpan.textContent = result.courseName;
      titleRow.appendChild(courseSpan);
      li.appendChild(titleRow);

      if (result.snippet.trim()) {
        const snippetEl = document.createElement('div');
        snippetEl.className = 'search-result-snippet';
        snippetEl.innerHTML = highlightSnippet(result.snippet);
        li.appendChild(snippetEl);
      }

      li.addEventListener('click', () => openSearchResult(result));
      // Hovering keeps mouse and keyboard selection in sync — moving the
      // mouse over a result makes it "active" the same way Arrow Down would.
      li.addEventListener('mouseenter', () => {
        activeSearchIndex = index;
        updateActiveSearchResult();
      });
      resultsList.appendChild(li);
    });
  }
  resultsList.hidden = false;
}

async function openSearchResult(result: SearchResult): Promise<void> {
  if (result.entityType === 'note') {
    const notes = await atlasApi.listAllNotes();
    const note = notes.find((n) => n.id === result.entityId);
    if (note) await openNoteEditor(note);
  } else if (result.entityType === 'resource') {
    const resources = await atlasApi.listAllResources();
    const resource = resources.find((r) => r.id === result.entityId);
    if (resource) await openPreview(resource);
  }

  document.getElementById('search-results')!.hidden = true;
  (document.getElementById('search-input') as HTMLInputElement).value = '';
}

// --- Deadline viewer/editor: view mode (read-only, clickable @mentions) and
// edit mode (form) share one overlay, switched between rather than being two
// separate overlays — a deadline is a small enough amount of content that a
// single panel with a "Edit" button is simpler than juggling two panels.

let currentViewingDeadline: Deadline | null = null;
let currentEditingDeadlineId: number | null = null;
let mentionCandidates: MentionCandidate[] = [];

async function loadMentionCandidates(courseId: number): Promise<void> {
  const [resources, notes] = await Promise.all([
    atlasApi.listResources(courseId),
    atlasApi.listNotes(courseId),
  ]);
  mentionCandidates = [
    ...resources.map((r): MentionCandidate => ({ type: 'resource', id: r.id, title: r.title })),
    ...notes.map((n): MentionCandidate => ({ type: 'note', id: n.id, title: n.title })),
  ];
}

const MENTION_TOKEN_REGEX = /@\[([^\]]*)\]\((resource|note):(\d+)\)/g;

// A description is plain text the user typed, so it's escaped as HTML first
// (same reasoning as search snippets — it could otherwise contain `<`/`>`/
// `&`) and only the mention tokens (which survive escaping untouched, since
// escapeHtml doesn't touch `[`/`]`/`(`/`)`/`:`) are turned into real links.
function renderDeadlineDescription(text: string): string {
  return escapeHtml(text).replace(
    MENTION_TOKEN_REGEX,
    (_whole, title, type, id) =>
      `<a href="#" class="deadline-mention" data-type="${type}" data-id="${id}">${
        type === 'note' ? '📃' : '📄'
      } ${title}</a>`
  );
}

function wireMentionClicks(container: HTMLElement): void {
  container.querySelectorAll<HTMLAnchorElement>('.deadline-mention').forEach((link) => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const type = link.dataset.type as 'resource' | 'note';
      const id = Number(link.dataset.id);
      closeDeadlineEditor();

      if (type === 'note') {
        const notes = await atlasApi.listAllNotes();
        const note = notes.find((n) => n.id === id);
        if (note) await openNoteEditor(note);
      } else {
        const resources = await atlasApi.listAllResources();
        const resource = resources.find((r) => r.id === id);
        if (resource) await openPreview(resource);
      }
    });
  });
}

async function openDeadlineViewer(deadline: Deadline): Promise<void> {
  currentViewingDeadline = deadline;

  document.getElementById('deadline-view-title')!.textContent = deadline.title;
  document.getElementById('deadline-view-kind')!.textContent =
    DEADLINE_KIND_LABEL[deadline.kind] ?? deadline.kind;
  document.getElementById('deadline-view-due')!.textContent = formatDueDate(deadline.due_at);

  const descriptionEl = document.getElementById('deadline-view-description')!;
  if (deadline.description && deadline.description.trim()) {
    descriptionEl.innerHTML = renderDeadlineDescription(deadline.description);
    descriptionEl.hidden = false;
    wireMentionClicks(descriptionEl);
  } else {
    descriptionEl.innerHTML = '';
    descriptionEl.hidden = true;
  }

  document.getElementById('deadline-view-mode')!.hidden = false;
  (document.getElementById('deadline-edit-form') as HTMLFormElement).hidden = true;
  document.getElementById('deadline-editor-overlay')!.hidden = false;
}

// dd-mm-yyyy, the format the user asked to be able to type directly — kept
// separate from the native <input type="date">'s own yyyy-mm-dd value so
// both entry methods (typing, or the picker button) can drive the same
// field without fighting each other's format.
function typedDateToIso(text: string): string | null {
  const match = text.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const month = Number(mm);
  const day = Number(dd);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

function isoDateToTyped(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}-${month}-${year}`;
}

async function openDeadlineEditForm(deadline: Deadline | null): Promise<void> {
  if (!selectedCourse) return;
  await loadMentionCandidates(selectedCourse.id);

  currentEditingDeadlineId = deadline ? deadline.id : null;
  (document.getElementById('deadline-edit-title') as HTMLInputElement).value = deadline?.title ?? '';
  (document.getElementById('deadline-edit-kind') as HTMLSelectElement).value = deadline?.kind ?? 'assignment';

  const dateText = document.getElementById('deadline-edit-date-text') as HTMLInputElement;
  const dateNative = document.getElementById('deadline-edit-date-native') as HTMLInputElement;
  const timeInput = document.getElementById('deadline-edit-time') as HTMLInputElement;
  if (deadline?.due_at) {
    const [datePart, timePart] = deadline.due_at.split('T');
    dateText.value = isoDateToTyped(datePart);
    dateNative.value = datePart;
    timeInput.value = timePart ?? '';
  } else {
    dateText.value = '';
    dateNative.value = '';
    timeInput.value = '';
  }
  document.getElementById('deadline-date-error')!.hidden = true;

  (document.getElementById('deadline-edit-description') as HTMLTextAreaElement).value =
    deadline?.description ?? '';
  document.getElementById('deadline-mention-suggestions')!.hidden = true;

  document.getElementById('deadline-view-mode')!.hidden = true;
  (document.getElementById('deadline-edit-form') as HTMLFormElement).hidden = false;
  document.getElementById('deadline-editor-overlay')!.hidden = false;
  (document.getElementById('deadline-edit-title') as HTMLInputElement).focus();
}

function closeDeadlineEditor(): void {
  document.getElementById('deadline-editor-overlay')!.hidden = true;
  currentViewingDeadline = null;
  currentEditingDeadlineId = null;
}

// @-mention autocomplete in the description textarea — matches Claude Code's
// own @-file-reference convention the user pointed to, scoped to the current
// course's resources/notes (mentionCandidates, loaded when the editor opens)
// rather than the whole filesystem, since those are the things Atlas already
// knows about and can navigate to.
function currentMentionQuery(textarea: HTMLTextAreaElement): { query: string; atIndex: number } | null {
  const beforeCursor = textarea.value.slice(0, textarea.selectionStart ?? 0);
  const match = beforeCursor.match(/@([^\s@]*)$/);
  if (!match) return null;
  return { query: match[1], atIndex: beforeCursor.length - match[0].length };
}

// Kept in sync with whatever's currently rendered in #deadline-mention-
// suggestions, same pattern as the global search results dropdown, so Arrow
// Up/Down + Enter can operate on it without re-reading the DOM.
let currentMentionMatches: MentionCandidate[] = [];
let currentMentionAtIndex = -1;
let activeMentionIndex = -1;

function updateActiveMentionSuggestion(): void {
  const items = document.querySelectorAll('#deadline-mention-suggestions li');
  items.forEach((item, index) => {
    const isActive = index === activeMentionIndex;
    item.classList.toggle('active', isActive);
    if (isActive) item.scrollIntoView({ block: 'nearest' });
  });
}

function updateMentionSuggestions(): void {
  const textarea = document.getElementById('deadline-edit-description') as HTMLTextAreaElement;
  const suggestionsList = document.getElementById('deadline-mention-suggestions')!;
  const active = currentMentionQuery(textarea);
  activeMentionIndex = -1;

  if (!active) {
    currentMentionMatches = [];
    suggestionsList.hidden = true;
    suggestionsList.innerHTML = '';
    return;
  }

  const queryLower = active.query.toLowerCase();
  const matches = mentionCandidates
    .filter((c) => c.title.toLowerCase().includes(queryLower))
    .slice(0, 8);
  currentMentionMatches = matches;
  currentMentionAtIndex = active.atIndex;

  if (matches.length === 0) {
    suggestionsList.hidden = true;
    suggestionsList.innerHTML = '';
    return;
  }

  suggestionsList.innerHTML = '';
  matches.forEach((candidate, index) => {
    const li = document.createElement('li');
    li.textContent = `${candidate.type === 'note' ? '📃' : '📄'} ${candidate.title}`;
    li.addEventListener('mousedown', (e) => {
      // mousedown (not click) fires before the textarea's blur, so the
      // selection/cursor position read below is still valid.
      e.preventDefault();
      insertMention(textarea, active.atIndex, candidate);
      suggestionsList.hidden = true;
      suggestionsList.innerHTML = '';
    });
    li.addEventListener('mouseenter', () => {
      activeMentionIndex = index;
      updateActiveMentionSuggestion();
    });
    suggestionsList.appendChild(li);
  });
  suggestionsList.hidden = false;
}

function insertMention(textarea: HTMLTextAreaElement, atIndex: number, candidate: MentionCandidate): void {
  const cursor = textarea.selectionStart ?? atIndex;
  const token = `@[${candidate.title}](${candidate.type}:${candidate.id}) `;
  textarea.value = textarea.value.slice(0, atIndex) + token + textarea.value.slice(cursor);
  const newCursor = atIndex + token.length;
  textarea.focus();
  textarea.setSelectionRange(newCursor, newCursor);
}

// Light/dark theme — a `data-theme` attribute on <html> switches the whole
// CSS custom-property palette (see :root / :root[data-theme='light'] in
// styles.css). Dark is the historical default, so only 'light' needs to be
// recorded/applied explicitly; anything else (including never having been
// set) falls back to dark.
function applyTheme(theme: 'light' | 'dark'): void {
  document.documentElement.setAttribute('data-theme', theme);
  const button = document.getElementById('theme-toggle') as HTMLButtonElement;
  button.textContent = theme === 'light' ? '🌙' : '☀️';
  button.title = theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme';
}

function focusSearch(): void {
  const searchInput = document.getElementById('search-input') as HTMLInputElement;
  searchInput.focus();
  searchInput.select();
}

// Collapsing the sidebar to an icon-only rail — persisted app-wide, same
// mechanism as theme/viewMode, so it stays collapsed (or not) across a
// relaunch rather than resetting every time.
function setSidebarCollapsed(collapsed: boolean, persist = true): void {
  document.getElementById('sidebar')!.classList.toggle('collapsed', collapsed);
  const toggle = document.getElementById('sidebar-collapse-toggle') as HTMLButtonElement;
  toggle.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  toggle.setAttribute('aria-label', toggle.title);
  if (persist) atlasApi.setSetting('sidebarCollapsed', collapsed ? '1' : '0');
}

async function init(): Promise<void> {
  const savedTheme = await atlasApi.getSetting('theme');
  applyTheme(savedTheme === 'light' ? 'light' : 'dark');

  const savedSidebarCollapsed = await atlasApi.getSetting('sidebarCollapsed');
  if (savedSidebarCollapsed === '1') setSidebarCollapsed(true, false);

  const savedViewMode = await atlasApi.getSetting('viewMode');
  // 'icons' is the pre-rename persisted value (view mode was called "list |
  // icons" before being relabeled "list | grid" to match the Courses page's
  // own wording) — still honored so an existing saved preference isn't
  // silently reset back to list on the next launch.
  if (savedViewMode === 'grid' || savedViewMode === 'icons') setViewMode('grid', false);

  const savedSemesterFilter = await atlasApi.getSetting('semesterFilter');
  if (savedSemesterFilter) {
    semesterFilter = savedSemesterFilter;
    (document.getElementById('semester-filter') as HTMLSelectElement).value = savedSemesterFilter;
  }

  await renderCourses();
  await renderDashboard();

  const form = document.getElementById('course-form') as HTMLFormElement;
  const addCourseToggle = document.getElementById('add-course-toggle') as HTMLButtonElement;
  // "Add course" is a rare, one-off action (a handful of courses per
  // semester, then done) — the form stays tucked away behind this toggle
  // instead of permanently occupying space at the top of the page.
  addCourseToggle.addEventListener('click', () => {
    form.hidden = !form.hidden;
    if (!form.hidden) (document.getElementById('course-name') as HTMLInputElement).focus();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = (document.getElementById('course-name') as HTMLInputElement).value.trim();
    const code = (document.getElementById('course-code') as HTMLInputElement).value.trim() || null;
    const term = (document.getElementById('course-term') as HTMLSelectElement).value || null;
    if (!name) return;

    await atlasApi.createCourse(name, code, term);
    form.reset();
    form.hidden = true;
    await renderCourses();
  });

  document.getElementById('course-view-grid')!.addEventListener('click', () => setCourseViewMode('grid'));
  document.getElementById('course-view-list')!.addEventListener('click', () => setCourseViewMode('list'));
  document.getElementById('course-sort')!.addEventListener('change', (e) => {
    courseSort = (e.target as HTMLSelectElement).value as CourseSort;
    void renderCourses();
  });

  document.getElementById('course-detail-back')!.addEventListener('click', backToCourseList);
  document.getElementById('course-detail-view-resources')!.addEventListener('click', () => {
    if (!selectedCourse) return;
    resourcesCourseFilterId = selectedCourse.id;
    showPage('resources');
  });
  document.getElementById('course-detail-view-notes')!.addEventListener('click', () => {
    if (!selectedCourse) return;
    notesCourseFilterId = selectedCourse.id;
    showPage('notes');
  });

  document.getElementById('upload-button')!.addEventListener('click', () => openCoursePicker('upload'));

  const addWatchFolderButton = document.getElementById('add-watch-folder') as HTMLButtonElement;
  addWatchFolderButton.addEventListener('click', async () => {
    if (!selectedCourse) return;
    const folder = await atlasApi.addWatchedFolder(selectedCourse.id);
    if (folder) {
      await renderWatchedFolders();
      await renderResourcesPage(); // pick up any files already sitting in the folder
    }
  });

  document.getElementById('view-list')!.addEventListener('click', () => setViewMode('list'));
  document.getElementById('view-grid')!.addEventListener('click', () => setViewMode('grid'));
  document.getElementById('deadline-view-list-toggle')!.addEventListener('click', () => setViewMode('list'));
  document.getElementById('deadline-view-grid-toggle')!.addEventListener('click', () => setViewMode('grid'));

  document.querySelectorAll<HTMLButtonElement>('#resources-kind-filter .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#resources-kind-filter .chip').forEach((el) => el.classList.remove('active'));
      chip.classList.add('active');
      resourcesKindFilter = chip.dataset.kindFilter ?? '';
      void renderResourcesPage();
    });
  });

  document.getElementById('resources-sort')!.addEventListener('change', (e) => {
    resourcesSort = (e.target as HTMLSelectElement).value as ResourcesSort;
    void renderResourcesPage();
  });

  document.getElementById('theme-toggle')!.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    const next = current === 'light' ? 'dark' : 'light';
    applyTheme(next);
    atlasApi.setSetting('theme', next);
  });

  // Sidebar nav: genuine page switching (see showPage()) — exactly one
  // page visible at a time. "Search" isn't a page; it just focuses the
  // floating search box over whichever page is currently shown.
  document.querySelectorAll<HTMLButtonElement>('.sidebar-nav-item[data-page]').forEach((button) => {
    button.addEventListener('click', () => showPage(button.dataset.page as AppPage));
  });
  document.getElementById('manage-courses-button')!.addEventListener('click', () => showPage('courses'));
  document.getElementById('sidebar-collapse-toggle')!.addEventListener('click', () => {
    const isCollapsed = document.getElementById('sidebar')!.classList.contains('collapsed');
    setSidebarCollapsed(!isCollapsed);
  });

  document.getElementById('semester-filter')!.addEventListener('change', (e) => {
    setSemesterFilter((e.target as HTMLSelectElement).value);
  });

  document.getElementById('new-note-button')!.addEventListener('click', () => openCoursePicker('note'));
  document.getElementById('import-scan-button')!.addEventListener('click', () => openCoursePicker('scan'));

  atlasApi.onImportScanProgress((progress) => {
    const fileLabel =
      progress.fileCount > 1 ? `"${progress.filename}" (${progress.fileIndex} of ${progress.fileCount})` : `"${progress.filename}"`;
    const pageLabel = progress.totalPages > 1 ? ` — page ${progress.page} of ${progress.totalPages}` : '';
    setImportScanProgress(`Processing ${fileLabel}${pageLabel}…`);
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
    await renderNotesPage();
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
  document.getElementById('note-fullscreen')!.addEventListener('click', toggleNoteTrueFullscreen);
  document.getElementById('note-view-scan')!.addEventListener('click', toggleNoteScanPanel);

  atlasApi.onNoteContextMenuDelete(async (noteId) => {
    if (!(await showConfirm("Delete this note? This can't be undone."))) return;
    if (currentNoteId === noteId) await closeNoteEditor();
    await atlasApi.deleteNote(noteId);
    await renderNotesPage();
  });

  document.getElementById('preview-close')!.addEventListener('click', closePreview);
  document.getElementById('preview-fullscreen')!.addEventListener('click', toggleFullscreenPreview);
  document.addEventListener('keydown', (e) => {
    // Ctrl+L jumps to search from anywhere, same convention as a browser's
    // address bar — selects any existing text so typing immediately
    // replaces it, matching that same browser behavior.
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      focusSearch();
      return;
    }

    const active = document.activeElement;
    const isTyping =
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement ||
      (active instanceof HTMLElement && active.isContentEditable);

    // "F" toggles fullscreen for whichever resource preview overlay or note
    // editor pane is currently open, so the user doesn't have to reach for
    // the fullscreen button. Guarded to only fire when focus isn't in a text
    // field — the note editor's Milkdown surface is a contenteditable, so
    // typing a literal "f" while actually writing a note is never hijacked,
    // same as it isn't for a deadline title.
    if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.altKey && !e.metaKey && !isTyping) {
      if (!(document.getElementById('preview-overlay') as HTMLElement).hidden) {
        e.preventDefault();
        toggleFullscreenPreview();
        return;
      }
      if (!(document.getElementById('note-overlay') as HTMLElement).hidden) {
        e.preventDefault();
        toggleNoteTrueFullscreen();
        return;
      }
    }

    // Escape closes the resource preview overlay — but deliberately never
    // the note editor pane, even via this same key: an editor with
    // in-progress typing shouldn't disappear because of an incidental
    // Escape (e.g. cancelling a text selection or a title edit). The X
    // button is the only way to close a note, matching how Notion itself
    // behaves (Escape doesn't close a page there either).
    if (e.key !== 'Escape' || isTyping) return;
    if (!(document.getElementById('preview-overlay') as HTMLElement).hidden) {
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
    await renderResourcesPage();
  });

  atlasApi.onCourseContextMenuDelete(async (courseId) => {
    if (!(await showConfirm("Delete this course and all its resources? This can't be undone."))) return;
    await atlasApi.deleteCourse(courseId);
    if (selectedCourse && selectedCourse.id === courseId) {
      backToCourseList();
    }
    await renderCourses();
    await renderResourcesPage();
    await renderNotesPage();
    await renderDeadlines();
  });

  const newDeadlineButton = document.getElementById('new-deadline-button') as HTMLButtonElement;
  newDeadlineButton.addEventListener('click', () => openDeadlineEditForm(null));

  document.getElementById('deadline-edit-button')!.addEventListener('click', () => {
    if (currentViewingDeadline) openDeadlineEditForm(currentViewingDeadline);
  });
  document.getElementById('deadline-view-close')!.addEventListener('click', closeDeadlineEditor);
  document.getElementById('deadline-cancel-button')!.addEventListener('click', closeDeadlineEditor);

  const dateTextInput = document.getElementById('deadline-edit-date-text') as HTMLInputElement;
  const dateNativeInput = document.getElementById('deadline-edit-date-native') as HTMLInputElement;
  const dateErrorEl = document.getElementById('deadline-date-error')!;

  dateTextInput.addEventListener('input', () => {
    const iso = typedDateToIso(dateTextInput.value);
    dateErrorEl.hidden = dateTextInput.value.trim() === '' || iso !== null;
    dateNativeInput.value = iso ?? '';
  });

  document.getElementById('deadline-edit-date-pick')!.addEventListener('click', () => {
    // showPicker() is the modern way to open a date input's native picker
    // programmatically (Chromium 99+, so available in Electron) — needed
    // since the native input itself is visually hidden in favor of the
    // typed text field being the visible/primary way to enter a date.
    if (typeof dateNativeInput.showPicker === 'function') dateNativeInput.showPicker();
    else dateNativeInput.focus();
  });

  dateNativeInput.addEventListener('change', () => {
    if (!dateNativeInput.value) return;
    dateTextInput.value = isoDateToTyped(dateNativeInput.value);
    dateErrorEl.hidden = true;
  });

  const descriptionTextarea = document.getElementById('deadline-edit-description') as HTMLTextAreaElement;
  descriptionTextarea.addEventListener('input', updateMentionSuggestions);
  descriptionTextarea.addEventListener('blur', () => {
    // Slight delay so a suggestion's mousedown (which fires before blur)
    // still gets to run insertMention() before the list is torn down.
    setTimeout(() => {
      document.getElementById('deadline-mention-suggestions')!.hidden = true;
    }, 150);
  });
  descriptionTextarea.addEventListener('keydown', (e) => {
    if (currentMentionMatches.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeMentionIndex = Math.min(activeMentionIndex + 1, currentMentionMatches.length - 1);
      updateActiveMentionSuggestion();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeMentionIndex = Math.max(activeMentionIndex - 1, 0);
      updateActiveMentionSuggestion();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const index = activeMentionIndex === -1 ? 0 : activeMentionIndex;
      insertMention(descriptionTextarea, currentMentionAtIndex, currentMentionMatches[index]);
      currentMentionMatches = [];
      document.getElementById('deadline-mention-suggestions')!.hidden = true;
      document.getElementById('deadline-mention-suggestions')!.innerHTML = '';
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      currentMentionMatches = [];
      document.getElementById('deadline-mention-suggestions')!.hidden = true;
      document.getElementById('deadline-mention-suggestions')!.innerHTML = '';
    }
  });

  const deadlineEditForm = document.getElementById('deadline-edit-form') as HTMLFormElement;
  deadlineEditForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedCourse) return;

    const title = (document.getElementById('deadline-edit-title') as HTMLInputElement).value.trim();
    if (!title) return;

    const typedDate = dateTextInput.value.trim();
    if (typedDate && typedDateToIso(typedDate) === null) {
      dateErrorEl.hidden = false;
      return;
    }

    const kind = (document.getElementById('deadline-edit-kind') as HTMLSelectElement).value;
    const isoDate = typedDate ? typedDateToIso(typedDate) : null;
    const time = (document.getElementById('deadline-edit-time') as HTMLInputElement).value;
    const dueAt = isoDate ? (time ? `${isoDate}T${time}` : isoDate) : null;
    const description = descriptionTextarea.value.trim() || null;

    if (currentEditingDeadlineId === null) {
      await atlasApi.createDeadline(selectedCourse.id, title, kind, dueAt, description);
    } else {
      await atlasApi.updateDeadline(currentEditingDeadlineId, title, kind, dueAt, description);
    }
    closeDeadlineEditor();
    await renderDeadlines();
  });

  atlasApi.onDeadlineContextMenuDelete(async (deadlineId) => {
    if (!(await showConfirm("Delete this deadline? This can't be undone."))) return;
    if (currentViewingDeadline?.id === deadlineId) closeDeadlineEditor();
    await atlasApi.deleteDeadline(deadlineId);
    await renderDeadlines();
  });

  document.getElementById('confirm-cancel')!.addEventListener('click', () => resolveConfirm(false));
  document.getElementById('confirm-yes')!.addEventListener('click', () => resolveConfirm(true));

  document.getElementById('course-picker-close')!.addEventListener('click', closeCoursePicker);
  document.getElementById('course-picker-overlay')!.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeCoursePicker();
  });
  document.getElementById('course-picker-search')!.addEventListener('input', (e) => {
    renderCoursePickerList((e.target as HTMLInputElement).value);
  });
  document.getElementById('course-picker-search')!.addEventListener('keydown', (e) => {
    // Escape closes the modal even though focus starts in this text field
    // (searchInput.focus() on open) — the global keydown handler's Escape
    // case skips text fields entirely, so this needs its own listener.
    if (e.key === 'Escape') closeCoursePicker();
  });
  document.getElementById('course-picker-browse')!.addEventListener('click', async () => {
    if (coursePickerSelectedId === null || coursePickerBusy) return;
    const courseId = coursePickerSelectedId;

    if (coursePickerMode === 'scan') {
      // Native multi-select dialog + OCR all happen inside this one IPC
      // call (main.ts), so the modal just waits and shows progress — it
      // can't close early like upload/note do, since there's nothing to
      // hand off to run in the background.
      coursePickerBusy = true;
      (document.getElementById('course-picker-search') as HTMLInputElement).disabled = true;
      setImportScanProgress('Choose scan(s) to import…');
      const createdNotes = await atlasApi.importScan(courseId);
      coursePickerBusy = false;
      (document.getElementById('course-picker-search') as HTMLInputElement).disabled = false;
      if (createdNotes.length > 0) {
        closeCoursePicker();
        await renderNotesPage();
      } else {
        setImportScanProgress(null); // dialog was cancelled — let the user try again
      }
      return;
    }

    closeCoursePicker();
    const resource = await atlasApi.uploadResource(courseId);
    if (resource) await renderResourcesPage();
  });

  const coursePickerDropzone = document.getElementById('course-picker-dropzone')!;
  coursePickerDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (coursePickerSelectedId === null || coursePickerBusy) return;
    coursePickerDropzone.classList.add('drag-active');
  });
  coursePickerDropzone.addEventListener('dragleave', () => coursePickerDropzone.classList.remove('drag-active'));
  coursePickerDropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    coursePickerDropzone.classList.remove('drag-active');
    if (coursePickerSelectedId === null || coursePickerBusy) return;
    const courseId = coursePickerSelectedId;

    if (coursePickerMode === 'scan') {
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      await importScanFiles(courseId, files);
      return;
    }

    const file = e.dataTransfer?.files[0];
    if (!file) return;
    closeCoursePicker();
    await uploadDroppedFile(courseId, file);
  });

  // Dropping a file directly onto the Resources page list uploads it — to
  // whichever course the rail is currently filtered to, or via the course
  // picker (with the file already attached) if "All Resources" is showing.
  const resourcesSplit = document.getElementById('resources-split')!;
  resourcesSplit.addEventListener('dragover', (e) => {
    e.preventDefault();
    resourcesSplit.classList.add('drag-active');
  });
  resourcesSplit.addEventListener('dragleave', (e) => {
    if (e.target === resourcesSplit) resourcesSplit.classList.remove('drag-active');
  });
  resourcesSplit.addEventListener('drop', async (e) => {
    e.preventDefault();
    resourcesSplit.classList.remove('drag-active');
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    if (resourcesCourseFilterId !== null) {
      await uploadDroppedFile(resourcesCourseFilterId, file);
    } else {
      await openCoursePicker('upload', file);
    }
  });

  atlasApi.onFolderContextMenuRemove(async (folderId) => {
    if (!(await showConfirm('Stop watching this folder? Files already imported stay in Atlas.')))
      return;
    await atlasApi.removeWatchedFolder(folderId);
    await renderWatchedFolders();
  });

  // Fired by the main process when a watched folder picks up a new file —
  // the global Resources page isn't scoped to one course, so just refresh
  // it outright rather than checking which course the event was for.
  atlasApi.onResourcesChanged(async () => {
    if (currentPage === 'resources') await renderResourcesPage();
    else void renderDashboard();
  });

  const searchInput = document.getElementById('search-input') as HTMLInputElement;
  const searchBox = document.getElementById('search-box')!;
  searchInput.addEventListener('input', () => {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    const query = searchInput.value;
    searchDebounceTimer = setTimeout(() => runSearch(query), 250);
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      document.getElementById('search-results')!.hidden = true;
      searchInput.blur();
      return;
    }
    if (currentSearchResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeSearchIndex = Math.min(activeSearchIndex + 1, currentSearchResults.length - 1);
      updateActiveSearchResult();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeSearchIndex = Math.max(activeSearchIndex - 1, 0);
      updateActiveSearchResult();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // Enter with nothing arrowed-to yet picks the top result, so the user
      // doesn't have to press Arrow Down once just to confirm the obvious
      // first match.
      const index = activeSearchIndex === -1 ? 0 : activeSearchIndex;
      openSearchResult(currentSearchResults[index]);
    }
  });
  document.addEventListener('click', (e) => {
    if (!searchBox.contains(e.target as Node)) {
      document.getElementById('search-results')!.hidden = true;
    }
  });
}

init();
