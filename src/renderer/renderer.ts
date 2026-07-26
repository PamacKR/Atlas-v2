interface Course {
  id: number;
  name: string;
  code: string | null;
  term: string | null;
  folder_name: string;
  archived: number;
  created_at: string;
  classroom_course_id: string | null;
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
  ocr_text: string | null;
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

interface NoteOcrProgress {
  noteId: number;
  page: number;
  totalPages: number;
}

interface ResourceOcrProgress {
  resourceId: number;
  page: number;
  totalPages: number;
}

interface DriveFolder {
  id: string;
  name: string;
}

interface DrivePendingFile {
  id: number;
  drive_file_id: string;
  name: string;
  mime_type: string;
  modified_time: string | null;
  detected_at: string;
}

interface ClassroomPendingCourse {
  id: number;
  classroom_course_id: string;
  name: string;
  section: string | null;
  suggested_course_id: number | null;
  detected_at: string;
}

interface ClassroomSyncError {
  courseId: number;
  courseName: string;
  message: string;
}

interface ClassroomLinkableCourse {
  classroom_course_id: string;
  name: string;
  section: string | null;
}

interface ClassroomContentLink {
  id: number;
  title: string;
  file_path: string;
}

interface ClassroomCourseContent {
  announcements: { id: number; title: string; body: string | null; posted_at: string }[];
  assignments: {
    id: number;
    title: string;
    description: string | null;
    due_at: string | null;
    status: string;
    links: ClassroomContentLink[];
  }[];
  classwork: {
    id: number;
    title: string;
    description: string | null;
    posted_at: string | null;
    links: ClassroomContentLink[];
  }[];
}

interface AshokaCourseCandidate {
  code: string;
  title: string;
  category: string | null;
  faculty: string | null;
  credits: number | null;
  description: string | null;
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
  | { type: 'link'; url: string }
  | { type: 'unsupported'; reason?: string };

interface AtlasApi {
  listCourses: () => Promise<Course[]>;
  createCourse: (name: string, code: string | null, term: string | null) => Promise<Course>;
  getResourceBrowserUrl: (resourceId: number) => Promise<string>;
  getSetting: (key: string) => Promise<string | null>;
  setSetting: (key: string, value: string) => Promise<void>;
  isDriveConnected: () => Promise<boolean>;
  connectDrive: () => Promise<{ ok: true } | { ok: false; error: string }>;
  disconnectDrive: () => Promise<void>;
  getDriveFolder: () => Promise<DriveFolder | null>;
  setDriveFolder: (link: string) => Promise<{ ok: true; name: string } | { ok: false; error: string }>;
  listPendingDriveFiles: () => Promise<DrivePendingFile[]>;
  importDriveFile: (
    driveFileId: string,
    name: string,
    courseId: number,
    importAs: 'resource' | 'note'
  ) => Promise<unknown>;
  ignoreDriveFile: (driveFileId: string) => Promise<void>;
  onDriveChanged: (handler: () => void) => void;
  isClassroomConnected: () => Promise<boolean>;
  connectClassroom: () => Promise<{ ok: true } | { ok: false; error: string }>;
  disconnectClassroom: () => Promise<void>;
  syncClassroomNow: () => Promise<{ ok: boolean; changed?: boolean; errors?: ClassroomSyncError[]; error?: string }>;
  listPendingClassroomCourses: () => Promise<ClassroomPendingCourse[]>;
  ignorePendingClassroomCourse: (classroomCourseId: string) => Promise<void>;
  mapClassroomCourseToExisting: (
    classroomCourseId: string,
    atlasCourseId: number
  ) => Promise<{ errors: ClassroomSyncError[] }>;
  mapClassroomCourseToNew: (
    classroomCourseId: string,
    name: string,
    code: string | null,
    term: string | null
  ) => Promise<{ course: Course; errors: ClassroomSyncError[] }>;
  onClassroomChanged: (handler: () => void) => void;
  listAvailableClassroomCoursesForLinking: () => Promise<ClassroomLinkableCourse[]>;
  connectCourseToClassroom: (
    atlasCourseId: number,
    classroomCourseId: string
  ) => Promise<{ errors: ClassroomSyncError[] }>;
  disconnectCourseFromClassroom: (atlasCourseId: number) => Promise<void>;
  openExternalUrl: (url: string) => Promise<void>;
  getClassroomCourseContent: (courseId: number) => Promise<ClassroomCourseContent>;
  getAshokaDbPath: () => Promise<string | null>;
  pickAshokaDbPath: () => Promise<{ ok: true } | { ok: false; error: string | null }>;
  listSecuredAshokaCourses: () => Promise<AshokaCourseCandidate[]>;
  getAshokaSemesterHint: () => Promise<string | null>;
  importAshokaCourses: (
    candidates: AshokaCourseCandidate[],
    term: string
  ) => Promise<{ created: Course[]; skipped: number }>;
  listResources: (courseId: number) => Promise<Resource[]>;
  uploadResource: (courseId: number) => Promise<Resource | null>;
  uploadResourceBuffer: (courseId: number, filename: string, buffer: ArrayBuffer) => Promise<Resource | null>;
  deleteCourse: (courseId: number) => Promise<void>;
  deleteResource: (resourceId: number) => Promise<void>;
  getPreview: (resourceId: number) => Promise<Preview>;
  setResourceZoom: (resourceId: number, zoom: number) => Promise<void>;
  runResourceOcr: (resourceId: number) => Promise<string | null>;
  saveResourceOcrText: (resourceId: number, text: string) => Promise<void>;
  onResourceOcrProgress: (handler: (progress: ResourceOcrProgress) => void) => void;
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
  runNoteOcr: (noteId: number) => Promise<string | null>;
  onNoteOcrProgress: (handler: (progress: NoteOcrProgress) => void) => void;
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
  listAllDeadlinesWithCourse: () => Promise<DashboardDeadline[]>;
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
  link: '🔗',
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
let ashokaReviewCandidates: AshokaCourseCandidate[] = [];

// Real page switching, not a scroll shortcut — exactly one of these is
// visible at a time. Dashboard/Courses/Resources/Notes are genuine pages;
// Search stays a floating dropdown over whichever page is active (see
// focusSearch(), triggered from the top-bar search box directly), so it
// isn't one of these and has no sidebar entry of its own.
type AppPage = 'dashboard' | 'courses' | 'resources' | 'notes' | 'calendar';
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
  else if (page === 'calendar') void renderCalendarPage();
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
// True while a scan import is actually running — the modal stays open and
// shows progress instead of closing immediately like upload/note do, and
// closing is blocked so the in-progress batch isn't abandoned mid-way. OCR
// is no longer run at import time (see main.ts), so this is brief, but a
// multi-file drop is still processed one at a time rather than all at once.
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
    renderDriveStatus(),
    renderClassroomStatus(),
  ]);
}

// Google Drive: connect/disconnect, pick the one "inbox" folder to scan, and
// review new files it finds (Phase 3, docs/open-questions.md #19). Files
// aren't imported automatically — the user assigns a course and a
// Resource/Note type per file (or in bulk) before anything gets copied into
// local managed storage; "Atlas owns the data" (CLAUDE.md) still holds once
// something's tagged, Drive is just the inbox.
async function renderDriveStatus(): Promise<void> {
  const connected = await atlasApi.isDriveConnected();
  document.getElementById('drive-status')!.textContent = connected ? 'Connected.' : 'Not connected.';
  (document.getElementById('drive-connect-button') as HTMLButtonElement).hidden = connected;
  (document.getElementById('drive-disconnect-button') as HTMLButtonElement).hidden = !connected;
  (document.getElementById('drive-folder-form') as HTMLElement).hidden = !connected;

  if (connected) {
    const folder = await atlasApi.getDriveFolder();
    const input = document.getElementById('drive-folder-input') as HTMLInputElement;
    if (folder) input.value = folder.name;
  }

  await renderDrivePendingStatus();
}

async function renderDrivePendingStatus(): Promise<void> {
  const connected = await atlasApi.isDriveConnected();
  const folder = connected ? await atlasApi.getDriveFolder() : null;
  const pendingStatus = document.getElementById('drive-pending-status') as HTMLElement;
  const reviewButton = document.getElementById('drive-review-button') as HTMLButtonElement;

  if (!connected || !folder) {
    pendingStatus.hidden = true;
    reviewButton.hidden = true;
    return;
  }

  const pending = await atlasApi.listPendingDriveFiles();
  pendingStatus.hidden = false;
  pendingStatus.textContent =
    pending.length === 0
      ? `Watching "${folder.name}" — no new files.`
      : `${pending.length} new file${pending.length === 1 ? '' : 's'} found in "${folder.name}".`;
  reviewButton.hidden = pending.length === 0;
}

async function connectDrive(): Promise<void> {
  const button = document.getElementById('drive-connect-button') as HTMLButtonElement;
  const status = document.getElementById('drive-status')!;
  button.disabled = true;
  status.textContent = 'Opening your browser to sign in…';
  const result = await atlasApi.connectDrive();
  button.disabled = false;
  if (!result.ok) {
    status.textContent = `Connection failed: ${result.error}`;
    return;
  }
  await renderDriveStatus();
}

async function disconnectDrive(): Promise<void> {
  await atlasApi.disconnectDrive();
  await renderDriveStatus();
}

async function saveDriveFolder(): Promise<void> {
  const input = document.getElementById('drive-folder-input') as HTMLInputElement;
  const status = document.getElementById('drive-status')!;
  const link = input.value.trim();
  if (!link) return;
  const result = await atlasApi.setDriveFolder(link);
  if (!result.ok) {
    status.textContent = `Couldn't use that folder: ${result.error}`;
    return;
  }
  input.value = result.name;
  status.textContent = 'Connected.';
  await renderDrivePendingStatus();
}

// --- Google Drive review panel ---
// One row per pending file — course + Resource/Note assignable individually
// or, via the bulk controls, to every checked row at once. "Later" (the
// close button) just hides the panel; nothing is dismissed or lost, the
// pending list is exactly what a fresh scan would find again.
async function openDriveReviewPanel(): Promise<void> {
  const overlay = document.getElementById('drive-review-overlay')!;
  const bulkCourseSelect = document.getElementById('drive-review-bulk-course') as HTMLSelectElement;

  const courses = await atlasApi.listCourses();
  const courseOptionsHtml = courses.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  bulkCourseSelect.innerHTML = courseOptionsHtml;

  overlay.hidden = false;
  await renderDriveReviewList(courseOptionsHtml);
}

function closeDriveReviewPanel(): void {
  document.getElementById('drive-review-overlay')!.hidden = true;
}

async function renderDriveReviewList(courseOptionsHtml: string): Promise<void> {
  const list = document.getElementById('drive-review-list')!;
  const pending = await atlasApi.listPendingDriveFiles();
  list.innerHTML = '';

  for (const file of pending) {
    const li = document.createElement('li');
    li.className = 'drive-review-row';
    li.dataset.driveFileId = file.drive_file_id;
    li.dataset.fileName = file.name;
    li.innerHTML = `
      <input type="checkbox" class="drive-review-row-check" />
      <span class="drive-review-row-name">${escapeHtml(file.name)}</span>
      <select class="drive-review-row-course">${courseOptionsHtml}</select>
      <select class="drive-review-row-type">
        <option value="resource">Resource</option>
        <option value="note">Note</option>
      </select>
      <button type="button" class="drive-review-row-import">Import</button>
      <button type="button" class="drive-review-row-ignore">Ignore</button>
    `;
    li.querySelector('.drive-review-row-import')!.addEventListener('click', () => importOneDriveFile(li));
    li.querySelector('.drive-review-row-ignore')!.addEventListener('click', () => ignoreOneDriveFile(li));
    list.appendChild(li);
  }

  if (pending.length === 0) {
    list.innerHTML = '<li class="muted">No new files.</li>';
  }
}

// Shared cleanup after a row is resolved (imported or ignored) — refresh
// whatever page could now be showing stale counts/lists, and restore the
// "No new files." placeholder once the list is actually empty.
async function afterDriveRowResolved(): Promise<void> {
  await renderDrivePendingStatus();
  if (currentPage === 'resources') await renderResourcesPage();
  else if (currentPage === 'notes') await renderNotesPage();
  else if (currentPage === 'dashboard') await renderDashboard();

  if (!document.getElementById('drive-review-list')!.hasChildNodes()) {
    document.getElementById('drive-review-list')!.innerHTML = '<li class="muted">No new files.</li>';
  }
}

async function importOneDriveFile(row: HTMLElement): Promise<void> {
  const driveFileId = row.dataset.driveFileId!;
  const name = row.dataset.fileName!;
  const courseId = Number((row.querySelector('.drive-review-row-course') as HTMLSelectElement).value);
  const importAs = (row.querySelector('.drive-review-row-type') as HTMLSelectElement).value as 'resource' | 'note';
  const button = row.querySelector('.drive-review-row-import') as HTMLButtonElement;

  button.disabled = true;
  button.textContent = 'Importing…';
  await atlasApi.importDriveFile(driveFileId, name, courseId, importAs);
  row.remove();
  await afterDriveRowResolved();
}

// The opposite of import — nothing is downloaded, the file just stops
// counting as "new" (see ignoreDrivePendingFile in main.ts for why the
// record stays instead of being deleted outright).
async function ignoreOneDriveFile(row: HTMLElement): Promise<void> {
  const driveFileId = row.dataset.driveFileId!;
  const button = row.querySelector('.drive-review-row-ignore') as HTMLButtonElement;
  button.disabled = true;
  await atlasApi.ignoreDriveFile(driveFileId);
  row.remove();
  await afterDriveRowResolved();
}

async function importSelectedDriveFiles(): Promise<void> {
  const bulkCourseSelect = document.getElementById('drive-review-bulk-course') as HTMLSelectElement;
  const bulkTypeSelect = document.getElementById('drive-review-bulk-type') as HTMLSelectElement;
  const rows = Array.from(document.querySelectorAll('.drive-review-row')) as HTMLElement[];

  for (const row of rows) {
    const checkbox = row.querySelector('.drive-review-row-check') as HTMLInputElement;
    if (!checkbox.checked) continue;
    (row.querySelector('.drive-review-row-course') as HTMLSelectElement).value = bulkCourseSelect.value;
    (row.querySelector('.drive-review-row-type') as HTMLSelectElement).value = bulkTypeSelect.value;
    await importOneDriveFile(row);
  }
}

async function ignoreSelectedDriveFiles(): Promise<void> {
  const rows = Array.from(document.querySelectorAll('.drive-review-row')) as HTMLElement[];
  for (const row of rows) {
    const checkbox = row.querySelector('.drive-review-row-check') as HTMLInputElement;
    if (!checkbox.checked) continue;
    await ignoreOneDriveFile(row);
  }
}

function toggleDriveReviewSelectAll(): void {
  const selectAll = document.getElementById('drive-review-select-all') as HTMLInputElement;
  document.querySelectorAll('.drive-review-row-check').forEach((el) => {
    (el as HTMLInputElement).checked = selectAll.checked;
  });
}

// Google Classroom: connect/disconnect (a separate connection from Drive's —
// expected to be the college Workspace account, docs/open-questions.md #8),
// an explicit "Sync now" (no background polling, ARCHITECTURE.md §4b), and
// a course-mapping review panel. Once a Classroom course is mapped to an
// Atlas course, its coursework/announcements import automatically on future
// syncs — only which course a Classroom course maps to is gated here.
async function renderClassroomStatus(): Promise<void> {
  const connected = await atlasApi.isClassroomConnected();
  document.getElementById('classroom-status')!.textContent = connected ? 'Connected.' : 'Not connected.';
  (document.getElementById('classroom-connect-button') as HTMLButtonElement).hidden = connected;
  (document.getElementById('classroom-disconnect-button') as HTMLButtonElement).hidden = !connected;
  (document.getElementById('classroom-sync-button') as HTMLButtonElement).hidden = !connected;

  await renderClassroomPendingStatus();
}

async function renderClassroomPendingStatus(): Promise<void> {
  const connected = await atlasApi.isClassroomConnected();
  const pendingStatus = document.getElementById('classroom-pending-status') as HTMLElement;
  const reviewButton = document.getElementById('classroom-review-button') as HTMLButtonElement;

  if (!connected) {
    pendingStatus.hidden = true;
    reviewButton.hidden = true;
    return;
  }

  const pending = await atlasApi.listPendingClassroomCourses();
  pendingStatus.hidden = false;
  pendingStatus.textContent =
    pending.length === 0
      ? 'No new courses.'
      : `${pending.length} new course${pending.length === 1 ? '' : 's'} found.`;
  reviewButton.hidden = pending.length === 0;
}

async function connectClassroom(): Promise<void> {
  const button = document.getElementById('classroom-connect-button') as HTMLButtonElement;
  const status = document.getElementById('classroom-status')!;
  button.disabled = true;
  status.textContent = 'Opening your browser to sign in…';
  const result = await atlasApi.connectClassroom();
  button.disabled = false;
  if (!result.ok) {
    status.textContent = `Connection failed: ${result.error}`;
    return;
  }
  await renderClassroomStatus();
}

async function disconnectClassroom(): Promise<void> {
  await atlasApi.disconnectClassroom();
  await renderClassroomStatus();
}

async function syncClassroomNowClicked(): Promise<void> {
  const button = document.getElementById('classroom-sync-button') as HTMLButtonElement;
  button.disabled = true;
  button.textContent = 'Syncing…';
  const result = await atlasApi.syncClassroomNow();
  button.disabled = false;
  button.textContent = 'Sync now';
  await renderClassroomPendingStatus();
  if (result.errors && result.errors.length > 0) {
    alert(
      `Synced, but ${result.errors.length} course(s) failed:\n` +
        result.errors.map((e) => `${e.courseName || 'Unknown course'}: ${e.message}`).join('\n')
    );
  }
}

// One row per pending Classroom course — a course picker (existing courses,
// pre-selected to a name-match suggestion if one exists, or "Create new
// course") confirmed individually or via the bulk controls. "Later" (the
// close button) just hides the panel; nothing is dismissed, the pending list
// is exactly what a fresh scan would find again.
async function openClassroomReviewPanel(): Promise<void> {
  const overlay = document.getElementById('classroom-review-overlay')!;
  const bulkCourseSelect = document.getElementById('classroom-review-bulk-course') as HTMLSelectElement;

  const courses = await atlasApi.listCourses();
  const courseOptionsHtml =
    '<option value="__new__">Create new course</option>' +
    courses.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  bulkCourseSelect.innerHTML = courseOptionsHtml;

  overlay.hidden = false;
  await renderClassroomReviewList(courseOptionsHtml);
}

function closeClassroomReviewPanel(): void {
  document.getElementById('classroom-review-overlay')!.hidden = true;
}

async function renderClassroomReviewList(courseOptionsHtml: string): Promise<void> {
  const list = document.getElementById('classroom-review-list')!;
  const pending = await atlasApi.listPendingClassroomCourses();
  list.innerHTML = '';

  for (const course of pending) {
    const li = document.createElement('li');
    li.className = 'classroom-review-row';
    li.dataset.classroomCourseId = course.classroom_course_id;
    li.dataset.courseName = course.name;
    li.innerHTML = `
      <input type="checkbox" class="classroom-review-row-check" />
      <span class="classroom-review-row-name">
        <span class="classroom-review-row-title">${escapeHtml(course.name)}</span>
        ${course.section ? `<span class="classroom-review-row-section">${escapeHtml(course.section)}</span>` : ''}
      </span>
      <select class="classroom-review-row-course">${courseOptionsHtml}</select>
      <button type="button" class="classroom-review-row-confirm">Confirm</button>
      <button type="button" class="classroom-review-row-ignore">Ignore</button>
    `;
    const select = li.querySelector('.classroom-review-row-course') as HTMLSelectElement;
    if (course.suggested_course_id !== null) select.value = String(course.suggested_course_id);
    li.querySelector('.classroom-review-row-confirm')!.addEventListener('click', () => confirmOneClassroomCourse(li));
    li.querySelector('.classroom-review-row-ignore')!.addEventListener('click', () => ignoreOneClassroomCourse(li));
    list.appendChild(li);
  }

  if (pending.length === 0) {
    list.innerHTML = '<li class="muted">No new courses.</li>';
  }
}

// Shared cleanup after a row is resolved (mapped or ignored) — refresh
// whatever page could now show a new course, and restore the "No new
// courses." placeholder once the list is actually empty.
async function afterClassroomRowResolved(): Promise<void> {
  await renderClassroomPendingStatus();
  if (currentPage === 'courses') await renderCourses();
  else if (currentPage === 'dashboard') await renderDashboard();

  if (!document.getElementById('classroom-review-list')!.hasChildNodes()) {
    document.getElementById('classroom-review-list')!.innerHTML = '<li class="muted">No new courses.</li>';
  }
}

async function confirmOneClassroomCourse(row: HTMLElement): Promise<void> {
  const classroomCourseId = row.dataset.classroomCourseId!;
  const name = row.dataset.courseName!;
  const select = row.querySelector('.classroom-review-row-course') as HTMLSelectElement;
  const button = row.querySelector('.classroom-review-row-confirm') as HTMLButtonElement;

  button.disabled = true;
  button.textContent = 'Confirming…';
  const result =
    select.value === '__new__'
      ? await atlasApi.mapClassroomCourseToNew(classroomCourseId, name, null, null)
      : await atlasApi.mapClassroomCourseToExisting(classroomCourseId, Number(select.value));
  row.remove();
  await afterClassroomRowResolved();
  if (result.errors.length > 0) {
    alert(
      `Course linked, but the initial sync failed:\n` + result.errors.map((e) => e.message).join('\n')
    );
  }
}

// The opposite of confirm — nothing is created or linked, the course just
// stops counting as "new" (see ignorePendingClassroomCourse in
// googleClassroom.ts for why the record stays instead of being deleted).
async function ignoreOneClassroomCourse(row: HTMLElement): Promise<void> {
  const classroomCourseId = row.dataset.classroomCourseId!;
  const button = row.querySelector('.classroom-review-row-ignore') as HTMLButtonElement;
  button.disabled = true;
  await atlasApi.ignorePendingClassroomCourse(classroomCourseId);
  row.remove();
  await afterClassroomRowResolved();
}

async function confirmSelectedClassroomCourses(): Promise<void> {
  const bulkCourseSelect = document.getElementById('classroom-review-bulk-course') as HTMLSelectElement;
  const rows = Array.from(document.querySelectorAll('.classroom-review-row')) as HTMLElement[];

  for (const row of rows) {
    const checkbox = row.querySelector('.classroom-review-row-check') as HTMLInputElement;
    if (!checkbox.checked) continue;
    (row.querySelector('.classroom-review-row-course') as HTMLSelectElement).value = bulkCourseSelect.value;
    await confirmOneClassroomCourse(row);
  }
}

async function ignoreSelectedClassroomCourses(): Promise<void> {
  const rows = Array.from(document.querySelectorAll('.classroom-review-row')) as HTMLElement[];
  for (const row of rows) {
    const checkbox = row.querySelector('.classroom-review-row-check') as HTMLInputElement;
    if (!checkbox.checked) continue;
    await ignoreOneClassroomCourse(row);
  }
}

function toggleClassroomReviewSelectAll(): void {
  const selectAll = document.getElementById('classroom-review-select-all') as HTMLInputElement;
  document.querySelectorAll('.classroom-review-row-check').forEach((el) => {
    (el as HTMLInputElement).checked = selectAll.checked;
  });
}

// Ashoka Planner course import (docs/open-questions.md #15) — a one-shot,
// user-invoked action (a button, never automatic/polled): reads the user's
// separate ashoka-planner app's own database for currently-secured courses
// and lets them pick which to create as real Atlas courses. planner.db has
// no reliable calendar-year term string (only a bare season name and an
// ordinal program-year) — so the term is something the user confirms in a
// dropdown here — the same fixed semester options course-creation already
// uses (there's never more than one semester's worth of secured courses in
// a single plan, so one shared selection covers the whole batch) — rather
// than something Atlas silently guesses. Dedup (skip a candidate already
// imported under that exact term) happens at import time in main.ts, since
// it depends on the term the user actually confirms.
async function openAshokaImportPanel(): Promise<void> {
  const button = document.getElementById('ashoka-import-button') as HTMLButtonElement;
  let dbPath = await atlasApi.getAshokaDbPath();
  if (!dbPath) {
    button.disabled = true;
    const picked = await atlasApi.pickAshokaDbPath();
    button.disabled = false;
    if (!picked.ok) {
      if (picked.error) alert(`Couldn't use that file: ${picked.error}`);
      return;
    }
    dbPath = await atlasApi.getAshokaDbPath();
  }
  if (!dbPath) return;

  const [candidates, semesterHint] = await Promise.all([
    atlasApi.listSecuredAshokaCourses(),
    atlasApi.getAshokaSemesterHint(),
  ]);
  const termSelect = document.getElementById('ashoka-review-term') as HTMLSelectElement;
  // Best-effort preselect from planner.db's bare season name (e.g. "Monsoon")
  // against the fixed dropdown options ("Monsoon 26", ...) — just a
  // convenience default, the user still confirms/changes it before import.
  const matchingOption = semesterHint
    ? Array.from(termSelect.options).find((o) => o.value.toLowerCase().startsWith(semesterHint.toLowerCase()))
    : null;
  termSelect.value = matchingOption ? matchingOption.value : '';
  renderAshokaReviewList(candidates);
  document.getElementById('ashoka-review-overlay')!.hidden = false;
}

function closeAshokaImportPanel(): void {
  document.getElementById('ashoka-review-overlay')!.hidden = true;
}

function renderAshokaReviewList(candidates: AshokaCourseCandidate[]): void {
  const list = document.getElementById('ashoka-review-list')!;
  list.innerHTML = '';

  for (const candidate of candidates) {
    const li = document.createElement('li');
    li.className = 'ashoka-review-row';
    li.dataset.code = candidate.code;
    const metaParts = [candidate.category, candidate.credits ? `${candidate.credits} credits` : null, candidate.faculty].filter(
      Boolean
    );
    li.innerHTML = `
      <input type="checkbox" class="ashoka-review-row-check" checked />
      <div class="ashoka-review-row-info">
        <div class="ashoka-review-row-title">${escapeHtml(candidate.code)} — ${escapeHtml(candidate.title)}</div>
        <div class="ashoka-review-row-meta">${escapeHtml(metaParts.join(' · '))}</div>
      </div>
    `;
    list.appendChild(li);
  }

  if (candidates.length === 0) {
    list.innerHTML = '<li class="muted">No secured courses found.</li>';
  }

  ashokaReviewCandidates = candidates;
}

async function importSelectedAshokaCourses(): Promise<void> {
  const term = (document.getElementById('ashoka-review-term') as HTMLSelectElement).value.trim();
  if (!term) {
    alert('Enter the term/semester these courses belong to before importing.');
    return;
  }

  const candidates = ashokaReviewCandidates;
  const rows = Array.from(document.querySelectorAll('.ashoka-review-row')) as HTMLElement[];
  const selected: AshokaCourseCandidate[] = [];
  for (const row of rows) {
    const checkbox = row.querySelector('.ashoka-review-row-check') as HTMLInputElement | null;
    if (!checkbox?.checked) continue;
    const candidate = candidates.find((c) => c.code === row.dataset.code);
    if (candidate) selected.push(candidate);
  }
  if (selected.length === 0) {
    closeAshokaImportPanel();
    return;
  }

  const button = document.getElementById('ashoka-review-import') as HTMLButtonElement;
  button.disabled = true;
  button.textContent = 'Importing…';
  const result = await atlasApi.importAshokaCourses(selected, term);
  button.disabled = false;
  button.textContent = 'Import selected';

  closeAshokaImportPanel();
  if (result.skipped > 0) {
    alert(`Imported ${result.created.length} course${result.created.length === 1 ? '' : 's'}. ${result.skipped} already existed for "${term}" and were skipped.`);
  }
  if (currentPage === 'courses') await renderCourses();
  else if (currentPage === 'dashboard') await renderDashboard();
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

// Groups every deadline kind other than assignment/exam/reading under the
// "Other" tab (quiz/lab/project/manual) — mirrors DEADLINE_KIND_LABEL's own
// "manual" -> "Other" mapping rather than adding a fifth distinct tab for
// each remaining kind.
function matchesUpcomingFilter(kind: string, filter: string): boolean {
  if (filter === '') return true;
  if (filter === 'other') return !['assignment', 'exam', 'reading'].includes(kind);
  return kind === filter;
}

let dashboardUpcomingFilter = '';
let dashboardDeadlinesCache: DashboardDeadline[] = [];

function setDashboardUpcomingFilter(filter: string): void {
  dashboardUpcomingFilter = filter;
  document.querySelectorAll<HTMLElement>('#dashboard-upcoming-tabs .chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.upcomingFilter === filter);
  });
  renderDashboardDeadlineRows();
}

// A relative "Due in N days"/Today/Tomorrow/Overdue label — distinct from
// formatDueDate's absolute-date label, since the screenshot design calls for
// the relative framing specifically for this widget's row layout.
function formatDueInLabel(dueAt: string | null): string {
  if (!dueAt) return '';
  const { year, month, day } = splitDueAt(dueAt);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'Overdue';
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return `Due in ${diffDays} days`;
}

// --- Calendar page (v1 — month grid + Upcoming sidebar only) ---
// Day/Week view toggle, a mini date-picker, and per-kind/course filter
// checkboxes (all present in the shared screenshot's "Filters" panel) are
// deliberate fast-follows, not silently cut — see docs/open-questions.md.
let calendarViewDate = new Date();

async function renderCalendarPage(): Promise<void> {
  const deadlines = await atlasApi.listAllDeadlinesWithCourse();
  renderCalendarMonthLabel();
  renderCalendarGrid(deadlines);
  renderCalendarUpcomingList(deadlines);
  renderCalendarLegend(deadlines);
}

function renderCalendarMonthLabel(): void {
  document.getElementById('calendar-month-label')!.textContent = calendarViewDate.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

function changeCalendarMonth(delta: number): void {
  calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + delta, 1);
  void renderCalendarPage();
}

function goToCalendarToday(): void {
  calendarViewDate = new Date();
  void renderCalendarPage();
}

// Deadlines grouped by their calendar date (YYYY-MM-DD, local) — both the
// month grid's day cells and the Upcoming sidebar list key off this.
function groupDeadlinesByDate(deadlines: DashboardDeadline[]): Map<string, DashboardDeadline[]> {
  const byDate = new Map<string, DashboardDeadline[]>();
  for (const deadline of deadlines) {
    if (!deadline.due_at) continue;
    const { year, month, day } = splitDueAt(deadline.due_at);
    const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const list = byDate.get(key) ?? [];
    list.push(deadline);
    byDate.set(key, list);
  }
  return byDate;
}

const CALENDAR_MAX_CHIPS_PER_DAY = 3;

function renderCalendarGrid(deadlines: DashboardDeadline[]): void {
  const grid = document.getElementById('calendar-grid')!;
  grid.innerHTML = '';
  const byDate = groupDeadlinesByDate(deadlines);

  const year = calendarViewDate.getFullYear();
  const month = calendarViewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay(); // 0 = Sunday, matches the weekday row
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startOffset + 1;
    const cell = document.createElement('div');
    cell.className = 'calendar-day-cell';

    if (dayNum < 1 || dayNum > daysInMonth) {
      cell.classList.add('outside-month');
      grid.appendChild(cell);
      continue;
    }

    const cellDate = new Date(year, month, dayNum);
    if (cellDate.getTime() === today.getTime()) cell.classList.add('today');

    const dayLabel = document.createElement('span');
    dayLabel.className = 'calendar-day-number';
    dayLabel.textContent = String(dayNum);
    cell.appendChild(dayLabel);

    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    const dayDeadlines = byDate.get(key) ?? [];
    for (const deadline of dayDeadlines.slice(0, CALENDAR_MAX_CHIPS_PER_DAY)) {
      const chip = document.createElement('div');
      chip.className = 'calendar-deadline-chip';
      chip.style.borderLeftColor = courseAvatarColor(deadline.course_id);
      chip.textContent = deadline.title;
      chip.title = `${deadline.course_name}: ${deadline.title}`;
      chip.addEventListener('click', () => void openDashboardDeadline(deadline));
      cell.appendChild(chip);
    }
    if (dayDeadlines.length > CALENDAR_MAX_CHIPS_PER_DAY) {
      const more = document.createElement('div');
      more.className = 'calendar-more-chip';
      more.textContent = `+${dayDeadlines.length - CALENDAR_MAX_CHIPS_PER_DAY} more`;
      cell.appendChild(more);
    }

    grid.appendChild(cell);
  }
}

function renderCalendarUpcomingList(deadlines: DashboardDeadline[]): void {
  const container = document.getElementById('calendar-upcoming-list')!;
  container.innerHTML = '';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = deadlines
    .filter((d) => {
      if (!d.due_at) return false;
      const { year, month, day } = splitDueAt(d.due_at);
      return new Date(year, month - 1, day).getTime() >= today.getTime();
    })
    .sort((a, b) => (a.due_at! < b.due_at! ? -1 : a.due_at! > b.due_at! ? 1 : 0));

  const byDate = groupDeadlinesByDate(upcoming);
  if (byDate.size === 0) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Nothing upcoming.';
    container.appendChild(p);
    return;
  }

  for (const [dateKey, items] of byDate) {
    const heading = document.createElement('div');
    heading.className = 'calendar-upcoming-date';
    const [y, m, d] = dateKey.split('-').map(Number);
    heading.textContent = new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    container.appendChild(heading);

    for (const deadline of items) {
      const row = document.createElement('div');
      row.className = 'calendar-upcoming-row';
      row.style.borderLeftColor = courseAvatarColor(deadline.course_id);
      row.innerHTML = `
        <span class="calendar-upcoming-title">${escapeHtml(deadline.title)}</span>
        <span class="calendar-upcoming-course">${escapeHtml(deadline.course_name)}</span>
      `;
      row.addEventListener('click', () => void openDashboardDeadline(deadline));
      container.appendChild(row);
    }
  }
}

function renderCalendarLegend(deadlines: DashboardDeadline[]): void {
  const legend = document.getElementById('calendar-legend')!;
  legend.innerHTML = '';
  const seen = new Map<number, string>();
  for (const deadline of deadlines) {
    if (!seen.has(deadline.course_id)) seen.set(deadline.course_id, deadline.course_name);
  }
  for (const [courseId, courseName] of seen) {
    const item = document.createElement('span');
    item.className = 'calendar-legend-item';
    const swatch = document.createElement('span');
    swatch.className = 'calendar-legend-swatch';
    swatch.style.background = courseAvatarColor(courseId);
    item.append(swatch, document.createTextNode(courseName));
    legend.appendChild(item);
  }
}

async function renderDashboardDeadlines(): Promise<void> {
  dashboardDeadlinesCache = await atlasApi.getUpcomingDeadlines();
  renderDashboardDeadlineRows();
}

function renderDashboardDeadlineRows(): void {
  const list = document.getElementById('dashboard-deadlines')!;
  const deadlines = dashboardDeadlinesCache.filter((d) => matchesUpcomingFilter(d.kind, dashboardUpcomingFilter));
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
    li.className = 'upcoming-row';
    li.style.borderLeftColor = courseAvatarColor(deadline.course_id);

    const dateBlock = document.createElement('div');
    dateBlock.className = 'upcoming-date-block';
    if (deadline.due_at) {
      const { year, month, day } = splitDueAt(deadline.due_at);
      const date = new Date(year, month - 1, day);
      const dayEl = document.createElement('span');
      dayEl.className = 'upcoming-date-day';
      dayEl.textContent = String(date.getDate());
      const monthEl = document.createElement('span');
      monthEl.className = 'upcoming-date-month';
      monthEl.textContent = date.toLocaleDateString(undefined, { month: 'short' });
      dateBlock.append(monthEl, dayEl);
    }
    li.appendChild(dateBlock);

    const content = document.createElement('div');
    content.className = 'upcoming-content';
    const titleRow = document.createElement('div');
    titleRow.className = 'upcoming-title-row';
    const titleEl = document.createElement('span');
    titleEl.className = 'upcoming-title';
    titleEl.textContent = deadline.title;
    const badge = document.createElement('span');
    badge.className = 'upcoming-kind-badge';
    badge.textContent = DEADLINE_KIND_LABEL[deadline.kind] ?? deadline.kind;
    titleRow.append(titleEl, badge);

    const metaRow = document.createElement('div');
    metaRow.className = 'upcoming-meta-row';
    const courseEl = document.createElement('span');
    courseEl.className = 'upcoming-course';
    courseEl.textContent = deadline.course_name;
    const dueEl = document.createElement('span');
    dueEl.className = 'upcoming-due';
    dueEl.textContent = formatDueInLabel(deadline.due_at);
    metaRow.append(courseEl, dueEl);

    content.append(titleRow, metaRow);
    li.appendChild(content);

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
// Builds a fresh Crepe instance for `note` into #note-editor-root, replacing
// any existing one — factored out of openNoteEditor so accepting an OCR
// result (insertNoteOcr, below) can reload the editor with new content the
// same way, rather than duplicating the Crepe setup.
async function mountNoteEditor(note: Note): Promise<void> {
  if (noteEditorInstance) {
    await noteEditorInstance.destroy();
    noteEditorInstance = null;
  }
  const root = document.getElementById('note-editor-root')!;
  root.innerHTML = '';

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

async function openNoteEditor(note: Note): Promise<void> {
  const overlay = document.getElementById('note-overlay')!;
  const titleInput = document.getElementById('note-title-input') as HTMLInputElement;
  const statusEl = document.getElementById('note-save-status')!;

  currentNoteId = note.id;
  titleInput.value = note.title;
  statusEl.textContent = '';
  overlay.hidden = false;

  // "View original scan"/"Run OCR" only make sense for a handwritten note —
  // both start collapsed/reset on open, even if left open on whatever note
  // was viewed last.
  const scanToggle = document.getElementById('note-view-scan') as HTMLButtonElement;
  const scanPanel = document.getElementById('note-scan-panel')!;
  const ocrButton = document.getElementById('note-run-ocr') as HTMLButtonElement;
  scanToggle.hidden = !note.is_handwritten;
  ocrButton.hidden = !note.is_handwritten;
  ocrButton.disabled = false;
  scanPanel.hidden = true;
  scanPanel.innerHTML = '';
  discardNoteOcr();
  updateScanToggleLabel(false);

  await mountNoteEditor(note);

  // A handwritten note's editor is blank until OCR is run and accepted, so
  // opening straight into an empty editor looks broken — show the original
  // scan by default instead. The editor/OCR view is one toggle click away.
  if (note.is_handwritten) {
    await showNoteScanPanel(note.id);
  }
}

async function closeNoteEditor(): Promise<void> {
  await flushPendingNoteSave();

  const overlay = document.getElementById('note-overlay')!;
  overlay.hidden = true;
  overlay.classList.remove('fullscreen');
  resetNoteFullscreenButton();
  document.getElementById('note-scan-panel')!.hidden = true;
  discardNoteOcr();

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

const NOTE_VIEW_SCAN_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
const NOTE_VIEW_NOTES_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';

// The toggle button's icon/label reflects which view it would switch *to*,
// not which one is currently showing — same convention as the fullscreen
// button elsewhere in this file.
function updateScanToggleLabel(showingScan: boolean): void {
  const scanToggle = document.getElementById('note-view-scan') as HTMLButtonElement;
  const label = showingScan ? 'View my notes' : 'View original scan';
  scanToggle.innerHTML = showingScan ? NOTE_VIEW_NOTES_ICON : NOTE_VIEW_SCAN_ICON;
  scanToggle.title = label;
  scanToggle.setAttribute('aria-label', label);
}

// Loads and shows the original scan, hiding the editor outright — not a
// split layout with both stacked at once, same idea as flipping a page over
// rather than shrinking both into half the space. Factored out of
// toggleNoteScanPanel so openNoteEditor can also call it directly: a
// handwritten note's editor starts blank until OCR is run and accepted, so
// the scan (not an empty editor) is what should show by default.
async function showNoteScanPanel(noteId: number): Promise<void> {
  const panel = document.getElementById('note-scan-panel')!;
  const editorRoot = document.getElementById('note-editor-root')!;
  // Running OCR reviews its result stacked above the editor (see
  // runNoteOcr) — closing that out first keeps "viewing the scan" and
  // "reviewing an OCR result" mutually exclusive rather than both showing.
  discardNoteOcr();
  panel.innerHTML = '<p class="muted">Loading scan…</p>';
  panel.hidden = false;
  editorRoot.hidden = true;
  updateScanToggleLabel(true);
  const preview = await atlasApi.getNoteScanPreview(noteId);
  if (preview) renderScanInto(panel, preview);
}

async function toggleNoteScanPanel(): Promise<void> {
  const panel = document.getElementById('note-scan-panel')!;
  const editorRoot = document.getElementById('note-editor-root')!;
  if (!panel.hidden) {
    panel.hidden = true;
    editorRoot.hidden = false;
    updateScanToggleLabel(false);
    return;
  }
  if (currentNoteId === null) return;
  await showNoteScanPanel(currentNoteId);
}

// OCR is opt-in per note, not automatic on import (see main.ts for why —
// the user found local Tesseract's accuracy on their actual handwriting too
// poor to trust silently). Running it never touches the note on its own;
// the extracted text is only a candidate the user reviews and explicitly
// accepts (insertNoteOcr) or discards.
let pendingOcrText: string | null = null;

function discardNoteOcr(): void {
  pendingOcrText = null;
  document.getElementById('note-ocr-preview')!.hidden = true;
}

async function runNoteOcr(): Promise<void> {
  if (currentNoteId === null) return;
  const noteId = currentNoteId;
  const button = document.getElementById('note-run-ocr') as HTMLButtonElement;
  const statusEl = document.getElementById('note-save-status')!;

  // "View original scan" and the OCR review both want the editor's space —
  // make sure the scan view isn't showing before OCR review takes it over.
  document.getElementById('note-scan-panel')!.hidden = true;
  document.getElementById('note-editor-root')!.hidden = false;
  updateScanToggleLabel(false);

  button.disabled = true;
  statusEl.textContent = 'Running OCR…';
  const text = await atlasApi.runNoteOcr(noteId);
  button.disabled = false;
  statusEl.textContent = '';
  if (text === null || currentNoteId !== noteId) return; // note closed/changed while OCR ran

  pendingOcrText = text;
  const preview = document.getElementById('note-ocr-preview')!;
  document.getElementById('note-ocr-preview-text')!.textContent = text.trim() || '(No text detected.)';
  preview.hidden = false;
}

async function insertNoteOcr(): Promise<void> {
  if (currentNoteId === null || pendingOcrText === null) return;
  const noteId = currentNoteId;
  const text = pendingOcrText;
  discardNoteOcr();

  await atlasApi.updateNoteContent(noteId, text);
  const notes = await atlasApi.listAllNotes();
  const updated = notes.find((n) => n.id === noteId);
  if (!updated) return;
  (document.getElementById('note-title-input') as HTMLInputElement).value = updated.title;
  await mountNoteEditor(updated);
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
  await renderCourseClassroomSection(course);
}

// Shows either "Connect to Classroom…" or "Connected to <name>" + Disconnect,
// and shows/populates the three content sections only when actually linked —
// an unlinked course has nothing to show there, so the sections stay hidden
// rather than showing empty placeholders (matches deadlines/resources'
// existing "no items yet" pattern only where there's a real list to browse).
async function renderCourseClassroomSection(course: Course): Promise<void> {
  const connectedBox = document.getElementById('course-classroom-connected')!;
  const connectButton = document.getElementById('course-classroom-connect') as HTMLButtonElement;
  const announcementsSection = document.getElementById('course-announcements-section')!;
  const assignmentsSection = document.getElementById('course-assignments-section')!;
  const classworkSection = document.getElementById('course-classwork-section')!;

  if (!course.classroom_course_id) {
    connectedBox.hidden = true;
    connectButton.hidden = false;
    announcementsSection.hidden = true;
    assignmentsSection.hidden = true;
    classworkSection.hidden = true;
    return;
  }

  connectedBox.hidden = false;
  connectButton.hidden = true;
  document.getElementById('course-classroom-name')!.textContent = course.name;

  const content = await atlasApi.getClassroomCourseContent(course.id);
  renderClassroomLinkList(announcementsSection, 'course-announcements-list', content.announcements, (a) => ({
    title: a.title,
    meta: formatIsoTimestamp(a.posted_at),
    body: a.body,
    links: [],
  }));
  renderClassroomLinkList(assignmentsSection, 'course-assignments-list', content.assignments, (a) => ({
    title: a.title,
    meta: a.due_at ? `Due ${formatDueDate(a.due_at)}` : 'No due date',
    body: a.description,
    links: a.links,
  }));
  renderClassroomLinkList(classworkSection, 'course-classwork-list', content.classwork, (c) => ({
    title: c.title,
    meta: c.posted_at ? formatIsoTimestamp(c.posted_at) : '',
    body: c.description,
    links: c.links,
  }));
}

// Announcements/classwork posted_at is a raw ISO timestamp straight from the
// Classroom API (creationTime) — a different shape from deadlines.due_at's
// 'YYYY-MM-DD'/'YYYY-MM-DDTHH:MM' convention, so this doesn't reuse
// formatDueDate/splitDueAt, which parse that convention specifically.
function formatIsoTimestamp(iso: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function renderClassroomLinkList<T>(
  section: HTMLElement,
  listId: string,
  items: T[],
  toRow: (item: T) => { title: string; meta: string; body: string | null; links: ClassroomContentLink[] }
): void {
  section.hidden = items.length === 0;
  const list = document.getElementById(listId)!;
  list.innerHTML = '';
  for (const item of items) {
    const row = toRow(item);
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="classroom-item-title">${escapeHtml(row.title)}</span>
      <span class="classroom-item-meta">${escapeHtml(row.meta)}</span>
      ${row.body ? `<span class="classroom-item-body">${escapeHtml(row.body)}</span>` : ''}
    `;
    if (row.links.length > 0) {
      const linksDiv = document.createElement('div');
      linksDiv.className = 'classroom-item-links';
      for (const link of row.links) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'link-button';
        button.textContent = `🔗 ${link.title}`;
        button.addEventListener('click', () => void atlasApi.openExternalUrl(link.file_path));
        linksDiv.appendChild(button);
      }
      li.appendChild(linksDiv);
    }
    list.appendChild(li);
  }
}

async function openClassroomConnectPicker(): Promise<void> {
  if (!selectedCourse) return;
  const overlay = document.getElementById('classroom-connect-overlay')!;
  const select = document.getElementById('classroom-connect-select') as HTMLSelectElement;
  const empty = document.getElementById('classroom-connect-empty')!;

  const options = await atlasApi.listAvailableClassroomCoursesForLinking();
  select.innerHTML = options
    .map(
      (o) =>
        `<option value="${escapeHtml(o.classroom_course_id)}">${escapeHtml(o.name)}${o.section ? ` — ${escapeHtml(o.section)}` : ''}</option>`
    )
    .join('');
  select.hidden = options.length === 0;
  empty.hidden = options.length > 0;
  overlay.hidden = false;
}

function closeClassroomConnectPicker(): void {
  document.getElementById('classroom-connect-overlay')!.hidden = true;
}

async function confirmClassroomConnect(): Promise<void> {
  if (!selectedCourse) return;
  const select = document.getElementById('classroom-connect-select') as HTMLSelectElement;
  if (!select.value) return;

  const button = document.getElementById('classroom-connect-confirm') as HTMLButtonElement;
  button.disabled = true;
  button.textContent = 'Connecting…';
  const { errors } = await atlasApi.connectCourseToClassroom(selectedCourse.id, select.value);
  button.disabled = false;
  button.textContent = 'Connect';
  closeClassroomConnectPicker();

  const updatedCourses = await atlasApi.listCourses();
  const updated = updatedCourses.find((c) => c.id === selectedCourse!.id);
  if (updated) {
    selectedCourse = updated;
    await renderCourseClassroomSection(updated);
  }
  if (errors.length > 0) {
    alert(`Connected, but the initial sync failed:\n` + errors.map((e) => e.message).join('\n'));
  }
}

async function disconnectCourseClassroomClicked(): Promise<void> {
  if (!selectedCourse) return;
  await atlasApi.disconnectCourseFromClassroom(selectedCourse.id);
  const updatedCourses = await atlasApi.listCourses();
  const updated = updatedCourses.find((c) => c.id === selectedCourse!.id);
  if (updated) {
    selectedCourse = updated;
    await renderCourseClassroomSection(updated);
  }
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
  const ocrButton = document.getElementById('preview-run-ocr') as HTMLButtonElement;

  title.textContent = resource.title;
  note.hidden = true;
  zoomControls.hidden = true;
  body.classList.remove('centered');
  body.innerHTML = '<p class="muted">Loading preview…</p>';
  overlay.hidden = false;
  currentPreviewResourceId = resource.id;

  // Run OCR only makes sense for a PDF — same on-demand, reviewed-before-
  // saving shape as handwritten notes (docs/open-questions.md #18), for
  // text-layer-less PDFs like a scanned book. Resets on every open, even if
  // left showing on whatever resource was previewed last.
  ocrButton.hidden = resource.kind !== 'pdf';
  ocrButton.disabled = false;
  document.getElementById('preview-ocr-status')!.textContent = '';
  discardResourceOcr();

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
  } else if (preview.type === 'link') {
    // No in-app rendering for an external link/Drive-file attachment —
    // opening it means handing off to the real browser/Drive, not showing
    // it inside Atlas's preview modal.
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'This is a link to an external file.';
    body.appendChild(p);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'link-button';
    button.textContent = 'Open link';
    button.addEventListener('click', () => {
      void atlasApi.openExternalUrl(preview.url);
    });
    body.appendChild(button);
    body.classList.add('centered');
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
  discardResourceOcr();
  currentPreviewResourceId = null;
}

// OCR for a Resources PDF is opt-in and reviewed, same shape as handwritten
// notes (docs/open-questions.md #18) — this is for PDFs Atlas can't already
// read as text (e.g. a scanned book with no text layer). Running it never
// touches the resource on its own; the extracted text is only a candidate
// the user reviews and explicitly saves (saveResourceOcr) or discards.
let pendingResourceOcrText: string | null = null;

function discardResourceOcr(): void {
  pendingResourceOcrText = null;
  document.getElementById('preview-ocr-review')!.hidden = true;
}

async function runResourceOcr(): Promise<void> {
  if (currentPreviewResourceId === null) return;
  const resourceId = currentPreviewResourceId;
  const button = document.getElementById('preview-run-ocr') as HTMLButtonElement;
  const statusEl = document.getElementById('preview-ocr-status')!;

  button.disabled = true;
  statusEl.textContent = 'Running OCR…';
  const text = await atlasApi.runResourceOcr(resourceId);
  button.disabled = false;
  statusEl.textContent = '';
  if (text === null || currentPreviewResourceId !== resourceId) return; // preview closed/changed while OCR ran

  pendingResourceOcrText = text;
  const review = document.getElementById('preview-ocr-review')!;
  document.getElementById('preview-ocr-review-text')!.textContent = text.trim() || '(No text detected.)';
  review.hidden = false;
}

async function saveResourceOcr(): Promise<void> {
  if (currentPreviewResourceId === null || pendingResourceOcrText === null) return;
  const resourceId = currentPreviewResourceId;
  const text = pendingResourceOcrText;
  discardResourceOcr();
  await atlasApi.saveResourceOcrText(resourceId, text);
  document.getElementById('preview-ocr-status')!.textContent = 'Saved — now searchable.';
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

  document.getElementById('course-classroom-connect')!.addEventListener('click', () => void openClassroomConnectPicker());
  document.getElementById('course-classroom-disconnect')!.addEventListener('click', () => void disconnectCourseClassroomClicked());
  document.getElementById('classroom-connect-close')!.addEventListener('click', closeClassroomConnectPicker);
  document.getElementById('classroom-connect-confirm')!.addEventListener('click', () => void confirmClassroomConnect());

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

  document.querySelectorAll<HTMLButtonElement>('#dashboard-upcoming-tabs .chip').forEach((chip) => {
    chip.addEventListener('click', () => setDashboardUpcomingFilter(chip.dataset.upcomingFilter ?? ''));
  });
  document.getElementById('dashboard-view-calendar')!.addEventListener('click', () => showPage('calendar'));

  document.getElementById('calendar-prev-month')!.addEventListener('click', () => changeCalendarMonth(-1));
  document.getElementById('calendar-next-month')!.addEventListener('click', () => changeCalendarMonth(1));
  document.getElementById('calendar-today')!.addEventListener('click', goToCalendarToday);

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
  document.getElementById('drive-connect-button')!.addEventListener('click', connectDrive);
  document.getElementById('drive-disconnect-button')!.addEventListener('click', disconnectDrive);
  document.getElementById('drive-folder-save')!.addEventListener('click', saveDriveFolder);
  document.getElementById('drive-review-button')!.addEventListener('click', openDriveReviewPanel);
  document.getElementById('drive-review-close')!.addEventListener('click', closeDriveReviewPanel);
  document.getElementById('drive-review-select-all')!.addEventListener('click', toggleDriveReviewSelectAll);
  document.getElementById('drive-review-bulk-import')!.addEventListener('click', importSelectedDriveFiles);
  document.getElementById('drive-review-bulk-ignore')!.addEventListener('click', ignoreSelectedDriveFiles);
  atlasApi.onDriveChanged(() => void renderDrivePendingStatus());

  document.getElementById('classroom-connect-button')!.addEventListener('click', connectClassroom);
  document.getElementById('classroom-disconnect-button')!.addEventListener('click', disconnectClassroom);
  document.getElementById('classroom-sync-button')!.addEventListener('click', syncClassroomNowClicked);
  document.getElementById('classroom-review-button')!.addEventListener('click', openClassroomReviewPanel);
  document.getElementById('classroom-review-close')!.addEventListener('click', closeClassroomReviewPanel);
  document
    .getElementById('classroom-review-select-all')!
    .addEventListener('click', toggleClassroomReviewSelectAll);
  document
    .getElementById('classroom-review-bulk-confirm')!
    .addEventListener('click', confirmSelectedClassroomCourses);
  document
    .getElementById('classroom-review-bulk-ignore')!
    .addEventListener('click', ignoreSelectedClassroomCourses);
  document.getElementById('ashoka-import-button')!.addEventListener('click', openAshokaImportPanel);
  document.getElementById('ashoka-review-close')!.addEventListener('click', closeAshokaImportPanel);
  document.getElementById('ashoka-review-import')!.addEventListener('click', importSelectedAshokaCourses);

  atlasApi.onClassroomChanged(() => {
    void renderClassroomPendingStatus();
    // A course's coursework can land moments after the user confirms its
    // mapping (see classroom:mapCourseToExisting/mapCourseToNew's immediate
    // re-sync) — refresh whatever's currently visible so it doesn't look
    // like the sync silently did nothing if they're already looking at it.
    if (currentPage === 'dashboard') void renderDashboard();
    else if (currentPage === 'courses' && selectedCourse) void renderCourseDetailPreviews(selectedCourse.id);
    else if (currentPage === 'courses') void renderCourses();
  });
  document.getElementById('sidebar-collapse-toggle')!.addEventListener('click', () => {
    const isCollapsed = document.getElementById('sidebar')!.classList.contains('collapsed');
    setSidebarCollapsed(!isCollapsed);
  });

  document.getElementById('semester-filter')!.addEventListener('change', (e) => {
    setSemesterFilter((e.target as HTMLSelectElement).value);
  });

  document.getElementById('new-note-button')!.addEventListener('click', () => openCoursePicker('note'));
  document.getElementById('import-scan-button')!.addEventListener('click', () => openCoursePicker('scan'));

  document.getElementById('note-run-ocr')!.addEventListener('click', runNoteOcr);
  document.getElementById('note-ocr-discard')!.addEventListener('click', discardNoteOcr);
  document.getElementById('note-ocr-insert')!.addEventListener('click', insertNoteOcr);
  atlasApi.onNoteOcrProgress((progress) => {
    if (progress.noteId !== currentNoteId) return;
    document.getElementById('note-save-status')!.textContent =
      progress.totalPages > 1 ? `Running OCR… page ${progress.page} of ${progress.totalPages}` : 'Running OCR…';
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
    // to the last saved value) and just blurs — the first Escape should
    // only leave editing, never close the note outright. stopPropagation
    // keeps the global keydown handler (which also acts on Escape, to close
    // the note on a *second* press) from seeing this same keypress and
    // closing immediately, since by the time it bubbles up the field is
    // already blurred and would otherwise look like "nothing was focused."
    if (e.key === 'Enter') {
      noteTitleInput.blur();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
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
  document.getElementById('preview-run-ocr')!.addEventListener('click', runResourceOcr);
  document.getElementById('preview-ocr-discard')!.addEventListener('click', discardResourceOcr);
  document.getElementById('preview-ocr-save')!.addEventListener('click', saveResourceOcr);
  atlasApi.onResourceOcrProgress((progress) => {
    if (progress.resourceId !== currentPreviewResourceId) return;
    document.getElementById('preview-ocr-status')!.textContent =
      progress.totalPages > 1 ? `Running OCR… page ${progress.page} of ${progress.totalPages}` : 'Running OCR…';
  });
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

    if (e.key !== 'Escape') return;

    // Two-stage Escape for the note editor: while actively typing (title
    // input or the Milkdown surface), the first Escape just blurs out of
    // editing — same instinct as any text editor, and avoids an in-progress
    // selection vanishing along with the whole note. A second Escape, once
    // nothing is focused, closes the note; if the note was only being
    // viewed (nothing focused to begin with), the very first Escape closes
    // it, same as the resource preview below.
    const noteOverlay = document.getElementById('note-overlay') as HTMLElement;
    if (!noteOverlay.hidden) {
      const editingNote =
        active instanceof HTMLElement &&
        (active.id === 'note-title-input' || document.getElementById('note-editor-root')!.contains(active));
      if (editingNote) {
        active.blur();
      } else {
        void closeNoteEditor();
      }
      return;
    }

    if (isTyping) return;
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
      // Native multi-select dialog + import happen inside this one IPC call
      // (main.ts) — no OCR runs here (see main.ts), just a file copy per
      // selected scan, but the modal still waits rather than closing early.
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
