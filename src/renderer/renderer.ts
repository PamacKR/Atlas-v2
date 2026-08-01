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

// Sync configuration (open-questions.md #2) — one entry per source.
interface SyncSourceStatus {
  mode: 'off' | 'launch' | 'interval';
  intervalSeconds: number;
  lastSuccess: string | null;
  lastError: string | null;
}
type SyncStatus = Record<'drive' | 'classroom', SyncSourceStatus>;

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
  extraction_status: 'pending' | 'done' | 'empty' | 'unsupported' | 'failed';
  extraction_error: string | null;
  // Remote-attachment reading (remote-attachments-spec.md §4) — see
  // schema.sql for the full field-by-field reasoning.
  remote_source: 'drive' | 'gmail' | null;
  link_kind: 'driveFile' | 'youTubeVideo' | 'link' | 'form' | null;
}

interface ExtractionBackfillProgress {
  done: number;
  total: number;
}

interface WatchedFolder {
  id: number;
  course_id: number;
  folder_path: string;
  created_at: string;
}

interface Note {
  id: number;
  // NULL means "unsorted" — a quick-capture note (see createUnsortedNote in
  // main.ts) that hasn't been assigned to a course yet.
  course_id: number | null;
  title: string;
  content_markdown: string;
  is_handwritten: number;
  image_path: string | null;
  ocr_text: string | null;
  generated_by_agent: number;
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
  classroom_coursework_id: string | null;
  // Conflict handling (open-questions.md #3). local_overrides is a
  // comma-delimited list of fields ('title'/'due_at') the user has edited
  // since the last sync; classroom_title/classroom_due_at shadow what
  // Classroom currently says regardless of overrides, so "reset" works
  // without a fresh API call; classroom_removed is set when this
  // deadline's Classroom coursework was deleted at the source.
  local_overrides: string | null;
  classroom_title: string | null;
  classroom_due_at: string | null;
  classroom_removed: number;
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
  announcements: { id: number; title: string; body: string | null; posted_at: string; links: ClassroomContentLink[] }[];
  assignments: {
    id: number;
    title: string;
    description: string | null;
    due_at: string | null;
    status: string;
    classroom_coursework_id: string | null;
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
  entityType: 'note' | 'resource' | 'announcement' | 'assignment' | 'document_part' | 'course';
  entityId: number;
  courseId: number;
  title: string;
  courseName: string;
  snippet: string;
  // Only set for entityType 'document_part' — the parent resource a page/
  // slide/sheet hit belongs to, since a search hit resolves to one part but
  // there's nothing to open at the part level itself (see openSearchResult).
  resourceId: number | null;
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

interface DashboardAnnouncement {
  id: number;
  course_id: number;
  title: string;
  posted_at: string;
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
  getAppVersion: () => Promise<string>;
  getSetting: (key: string) => Promise<string | null>;
  setSetting: (key: string, value: string) => Promise<void>;
  isDriveConnected: () => Promise<boolean>;
  connectDrive: () => Promise<{ ok: true } | { ok: false; error: string }>;
  disconnectDrive: () => Promise<void>;
  clearDrivePreviewCache: () => Promise<{ ok: true } | { ok: false; error: string }>;
  getSyncStatus: () => Promise<SyncStatus>;
  setSyncConfig: (source: 'drive' | 'classroom', value: string) => Promise<void>;
  syncNow: (source: 'drive' | 'classroom') => Promise<void>;
  syncAllNow: () => Promise<void>;
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
  setCourseArchived: (courseId: number, archived: boolean) => Promise<Course>;
  exportCourseContext: (courseId: number) => Promise<{ ok: true; filePath: string } | { ok: false; error: string }>;
  deleteResource: (resourceId: number) => Promise<void>;
  getPreview: (resourceId: number) => Promise<Preview>;
  setResourceZoom: (resourceId: number, zoom: number) => Promise<void>;
  runResourceOcr: (resourceId: number) => Promise<string | null>;
  saveResourceOcrText: (resourceId: number, text: string) => Promise<void>;
  onResourceOcrProgress: (handler: (progress: ResourceOcrProgress) => void) => void;
  openResourceInGoogleDrive: (resourceId: number) => Promise<void>;
  onExtractionBackfillProgress: (handler: (progress: ExtractionBackfillProgress) => void) => void;
  onResourceDriveOpenStart: (handler: (resourceId: number) => void) => void;
  onResourceDriveOpenSuccess: (handler: (resourceId: number) => void) => void;
  onResourceDriveOpenError: (handler: (resourceId: number, error: string) => void) => void;
  showResourceContextMenu: (resourceId: number) => void;
  showCourseContextMenu: (courseId: number) => void;
  onContextMenuDelete: (handler: (resourceId: number) => void) => void;
  onCourseContextMenuDelete: (handler: (courseId: number) => void) => void;
  onCourseContextMenuToggleArchive: (handler: (courseId: number, archived: boolean) => void) => void;
  onCourseContextMenuEdit: (handler: (courseId: number) => void) => void;
  updateCourse: (courseId: number, name: string, code: string | null, term: string | null) => Promise<Course>;
  listWatchedFolders: (courseId: number) => Promise<WatchedFolder[]>;
  addWatchedFolder: (courseId: number) => Promise<WatchedFolder | null>;
  removeWatchedFolder: (folderId: number) => Promise<void>;
  showFolderContextMenu: (folderId: number) => void;
  onFolderContextMenuRemove: (handler: (folderId: number) => void) => void;
  onResourcesChanged: (handler: (courseId: number) => void) => void;
  listNotes: (courseId: number) => Promise<Note[]>;
  createNote: (courseId: number) => Promise<Note>;
  createUnsortedNote: () => Promise<Note>;
  assignNoteCourse: (noteId: number, courseId: number) => Promise<Note>;
  onQuickCaptureNote: (handler: (note: Note) => void) => void;
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
  resetDeadlineClassroomOverrides: (deadlineId: number) => Promise<Deadline>;
  deleteDeadline: (deadlineId: number) => Promise<void>;
  showDeadlineContextMenu: (deadlineId: number) => void;
  onDeadlineContextMenuDelete: (handler: (deadlineId: number) => void) => void;
  getDashboardStats: () => Promise<DashboardStats>;
  getUpcomingDeadlines: () => Promise<DashboardDeadline[]>;
  listAllDeadlinesWithCourse: () => Promise<DashboardDeadline[]>;
  getRecentResources: () => Promise<DashboardResource[]>;
  getRecentActivity: () => Promise<DashboardActivityItem[]>;
  getRecentAnnouncements: () => Promise<DashboardAnnouncement[]>;
  getCourseSummaries: (archived?: boolean) => Promise<CourseSummary[]>;
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
import { ShortcutRegistry, ShortcutAction, normalizeBinding, RESERVED_BINDINGS } from './shortcuts';
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

const ICON_EXTENSION_MAP: Record<string, string> = {
  pdf: 'pdf',
  ppt: 'pptx',
  pptx: 'pptx',
  doc: 'docx',
  docx: 'docx',
  xls: 'xlsx',
  xlsx: 'xlsx',
  csv: 'xlsx',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  txt: 'text',
  md: 'markdown',
  zip: 'zip',
};

// A `kind='link'` resource (a Classroom Drive-file/link/YouTube/Form
// attachment, see googleClassroom.ts) always has kind literally 'link' —
// that's what tells Atlas to open it externally rather than preview it in
// app — so KIND_ICON['link'] alone would show every single one as a plain
// 🔗, no matter what it actually links to. This guesses a more specific
// icon from the linked file's own name/extension (still preserved in the
// resource's title) purely for display; it never changes the stored kind.
function resourceDisplayIcon(resource: { kind: string; title: string }): string {
  if (resource.kind !== 'link') return KIND_ICON[resource.kind] ?? KIND_ICON.other;
  const ext = resource.title.split('.').pop()?.toLowerCase() ?? '';
  const mapped = ICON_EXTENSION_MAP[ext];
  return mapped ? KIND_ICON[mapped] : KIND_ICON.link;
}

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
type AppPage = 'dashboard' | 'courses' | 'resources' | 'notes' | 'calendar' | 'settings';
let currentPage: AppPage = 'dashboard';
let dashboardCourseFilterId: number | null = null;

function showPage(page: AppPage): void {
  currentPage = page;
  document.getElementById('main-area')!.dataset.page = page;
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
  else if (page === 'settings') void renderSettingsPage();
}

// Settings' own General/Sources/About sub-tabs — same pattern as the course
// detail page's tabs (see setCourseDetailTab), a separate one since these
// two tab bars are otherwise unrelated.
function setSettingsTab(tab: string): void {
  document.querySelectorAll<HTMLElement>('.settings-nav-item').forEach((button) => {
    button.classList.toggle('active', button.dataset.settingsTab === tab);
  });
  document.querySelectorAll<HTMLElement>('.settings-panel').forEach((panel) => {
    panel.hidden = panel.dataset.settingsPanel !== tab;
  });
}

async function renderSettingsPage(): Promise<void> {
  await Promise.all([
    renderSyncStatus(),
    renderDriveStatus(),
    renderClassroomStatus(),
    renderSettingsAbout(),
    renderSettingsShortcuts(),
  ]);
}

// Sync schedule (open-questions.md #2) — one dropdown + last-synced/error
// line per source. `value` on each <select> is exactly the config string
// main.ts's sync:setConfig expects ('off' / 'launch' / 'interval:<seconds>'),
// so no translation is needed between the two.
function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  const diffSeconds = Math.round((Date.now() - then) / 1000);
  if (diffSeconds < 5) return 'just now';
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

async function renderSyncStatus(): Promise<void> {
  const status = await atlasApi.getSyncStatus();
  for (const source of ['drive', 'classroom'] as const) {
    const info = status[source];
    const value = info.mode === 'interval' ? `interval:${info.intervalSeconds}` : info.mode;
    (document.getElementById(`sync-config-${source}`) as HTMLSelectElement).value = value;

    const statusEl = document.getElementById(`sync-status-${source}`)!;
    const lastSyncedText = `Last synced: ${formatRelativeTime(info.lastSuccess)}`;
    statusEl.textContent = info.lastError ? `${lastSyncedText} — ${info.lastError}` : lastSyncedText;
  }
}

async function syncSourceNowClicked(source: 'drive' | 'classroom'): Promise<void> {
  const button = document.getElementById(`sync-now-${source}`) as HTMLButtonElement;
  button.disabled = true;
  button.textContent = 'Syncing…';
  await atlasApi.syncNow(source);
  button.disabled = false;
  button.textContent = 'Sync now';
  await renderSyncStatus();
  if (source === 'drive') await renderDrivePendingStatus();
  else await renderClassroomPendingStatus();
}

async function syncAllNowClicked(): Promise<void> {
  const button = document.getElementById('sync-now-all') as HTMLButtonElement;
  button.disabled = true;
  button.textContent = 'Syncing…';
  await atlasApi.syncAllNow();
  button.disabled = false;
  button.textContent = 'Sync everything now';
  await renderSyncStatus();
  await Promise.all([renderDrivePendingStatus(), renderClassroomPendingStatus()]);
}

async function renderSettingsAbout(): Promise<void> {
  const version = await atlasApi.getAppVersion();
  document.getElementById('settings-about-version')!.textContent = `Atlas ${version}`;
}

let confirmResolve: ((result: boolean) => void) | null = null;

function showConfirm(message: string): Promise<boolean> {
  const overlay = document.getElementById('confirm-overlay')!;
  const messageEl = document.getElementById('confirm-message')!;
  const titleEl = document.getElementById('confirm-title')!;
  const confirmButton = document.getElementById('confirm-yes')!;
  const firstWord = message.trim().split(/[\s?]/)[0] || 'Confirm';
  const action = ['Delete', 'Disconnect', 'Archive', 'Unarchive', 'Reset'].includes(firstWord) ? firstWord : 'Confirm';
  titleEl.textContent = action === 'Confirm' ? 'Confirm action' : `${action} this item?`;
  confirmButton.textContent = action;
  confirmButton.classList.toggle('danger', ['Delete', 'Disconnect', 'Archive', 'Reset'].includes(action));
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

let courseViewMode: 'grid' | 'list' = 'list';
type CourseSort = 'term' | 'name' | 'resources' | 'deadlines' | 'notes';
let courseSort: CourseSort = 'term';
// Shows either active courses (default) or archived ones, never both mixed
// together — a plain either/or toggle rather than an "include archived"
// checkbox, so there's no ambiguity about which state a course card on
// screen is in (open-questions.md #4).
let showArchivedCourses = false;

function compareCourseSummaries(a: CourseSummary, b: CourseSummary, sort: CourseSort): number {
  if (sort === 'resources') return b.resource_count - a.resource_count;
  if (sort === 'deadlines') return b.deadline_count - a.deadline_count;
  if (sort === 'notes') return b.note_count - a.note_count;
  if (sort === 'term') return (a.term ?? '').localeCompare(b.term ?? '') || a.name.localeCompare(b.name);
  return a.name.localeCompare(b.name);
}

function resourceIconKind(resource: { kind: string; title: string }): string {
  if (resource.kind !== 'link') return resource.kind || 'other';
  const ext = resource.title.split('.').pop()?.toLowerCase() ?? '';
  return ICON_EXTENSION_MAP[ext] ?? 'link';
}

function makeMonoIcon(kind: string, className = 'mono-icon'): HTMLElement {
  const paths: Record<string, string> = {
    pdf: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 15h8M8 18h5"/>',
    pptx: '<rect x="3" y="3" width="18" height="14" rx="2"/><path d="M8 21h8M12 17v4M8 8h8M8 12h5"/>',
    xlsx: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h8M12 6v12"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5L5 20"/>',
    zip: '<path d="M6 2h9l3 3v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M13 2v4h4M11 7v2m0 2v2m0 2v2m0 2v2"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.07.07l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15"/><path d="M14 11a5 5 0 0 0-7.07-.07l-2 2A5 5 0 0 0 12 20l1.15-1.15"/>',
    reading: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
    quiz: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4.12 1.9c-.92.74-1.62 1.22-1.62 2.6M12 17h.01"/>',
    lab: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.74 3h10.52A2 2 0 0 0 19 18l-5-9V3"/><path d="M8.5 15h7"/>',
    project: '<path d="M4 7h16v13H4zM9 7V4h6v3"/>',
    exam: '<path d="M4 10.5 12 4l8 6.5L12 17l-8-6.5Z"/><path d="M7 14v4.5c2.7 1.8 7.3 1.8 10 0V14"/>',
    assignment: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h6"/>',
  };
  const icon = document.createElement('span');
  icon.className = className;
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[kind] ?? paths.assignment}</svg>`;
  return icon;
}

// Card grid by default (matches the mockup the user provided), a flat list
// as the alternative — same view-toggle convention used for resources/
// deadlines elsewhere, just a separate mode since a course card carries
// more information (counts, code) than a resource/deadline row does.
async function renderLegacyCourses(): Promise<void> {
  void renderDashboard();
  const list = document.getElementById('course-list')!;
  const emptyState = document.getElementById('course-list-empty')!;
  const allSummaries = await atlasApi.getCourseSummaries(showArchivedCourses);
  let courses = semesterFilter ? allSummaries.filter((c) => c.term === semesterFilter) : allSummaries;
  courses = [...courses].sort((a, b) => compareCourseSummaries(a, b, courseSort));

  emptyState.hidden = courses.length > 0;
  emptyState.textContent = showArchivedCourses ? 'No archived courses.' : 'No courses yet.';

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

function isCurrentOrFutureDeadline(deadline: Deadline): boolean {
  if (deadline.completed === 1 || !deadline.due_at) return false;
  const { year, month, day, hour, minute } = splitDueAt(deadline.due_at);
  return new Date(year, month - 1, day, hour ?? 23, minute ?? 59).getTime() >= Date.now();
}

function updateCourseToolbar(courses: CourseSummary[]): void {
  document.getElementById('courses-page-count')!.textContent = String(courses.length);
  const termControls = document.getElementById('courses-term-controls')!;
  const terms = [...new Set(courses.map((course) => course.term).filter((term): term is string => Boolean(term)))].sort();
  termControls.innerHTML = '';
  for (const filter of [{ label: 'All terms', value: '' }, ...terms.map((term) => ({ label: term, value: term }))]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'course-term-control';
    button.textContent = filter.label;
    button.dataset.term = filter.value;
    const active = semesterFilter === filter.value;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    button.addEventListener('click', () => void setSemesterFilter(filter.value));
    termControls.appendChild(button);
  }
}

async function renderCourses(): Promise<void> {
  void renderDashboard();
  const list = document.getElementById('course-list')!;
  const emptyState = document.getElementById('course-list-empty')!;
  const allSummaries = await atlasApi.getCourseSummaries(showArchivedCourses);
  updateCourseToolbar(allSummaries);
  let courses = semesterFilter ? allSummaries.filter((course) => course.term === semesterFilter) : allSummaries;
  courses = [...courses].sort((a, b) => compareCourseSummaries(a, b, courseSort));
  emptyState.hidden = courses.length > 0;
  emptyState.textContent = showArchivedCourses ? 'No archived courses.' : 'No courses yet.';
  list.className = courseViewMode === 'grid' ? 'view-grid' : 'view-list';
  list.innerHTML = '';

  const deadlinesByCourse = new Map<number, Deadline[]>();
  await Promise.all(courses.map(async (course) => deadlinesByCourse.set(course.id, await atlasApi.listDeadlines(course.id))));
  const groupedCourses = new Map<string, CourseSummary[]>();
  for (const course of courses) {
    const term = course.term || 'No term';
    const group = groupedCourses.get(term) ?? [];
    group.push(course);
    groupedCourses.set(term, group);
  }

  for (const [term, termCourses] of groupedCourses) {
    const group = document.createElement('section');
    group.className = 'course-termgroup';
    const head = document.createElement('div');
    head.className = 'course-term-head';
    const heading = document.createElement('h2');
    heading.textContent = term;
    const termCount = document.createElement('span');
    termCount.className = 'course-term-count';
    termCount.textContent = `${termCourses.length} course${termCourses.length === 1 ? '' : 's'}`;
    head.append(heading, termCount);
    group.appendChild(head);
    const entries = document.createElement('div');
    entries.className = courseViewMode === 'grid' ? 'course-grid' : 'course-rows';

    for (const course of termCourses) {
      const entry = document.createElement('div');
      entry.className = courseViewMode === 'grid' ? 'course-tile' : 'course-row';
      entry.dataset.courseId = String(course.id);
      entry.tabIndex = 0;
      entry.setAttribute('role', 'button');
      entry.setAttribute('aria-label', `Open ${course.name}`);
      const main = document.createElement('div');
      main.className = 'course-main';
      const name = document.createElement('div');
      name.className = 'course-name';
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = courseAvatarColor(course.id);
      const nameText = document.createElement('span');
      nameText.textContent = course.name;
      name.append(swatch, nameText);
      const code = document.createElement('div');
      code.className = 'course-code';
      code.textContent = course.code || 'No course code';
      main.append(name, code);
      const nextDeadline = (deadlinesByCourse.get(course.id) ?? [])
        .filter(isCurrentOrFutureDeadline)
        .sort((a, b) => (a.due_at ?? '').localeCompare(b.due_at ?? ''))[0];
      const next = document.createElement('div');
      next.className = 'course-next';
      next.textContent = nextDeadline ? `Next: ${nextDeadline.title} - due ${formatDueDate(nextDeadline.due_at)}` : 'No upcoming deadlines';
      main.appendChild(next);
      entry.appendChild(main);
      const stats = document.createElement('div');
      stats.className = courseViewMode === 'grid' ? 'tile-stats' : 'course-stats';
      for (const stat of [
        { value: course.resource_count, label: 'files', urgent: false },
        { value: course.deadline_count, label: 'due', urgent: course.deadline_count > 0 },
      ]) {
        const item = document.createElement('div');
        item.innerHTML = `<span class="stat-n${stat.urgent ? ' is-urgent' : ''}">${stat.value}</span><span class="stat-label">${stat.label}</span>`;
        stats.appendChild(item);
      }
      entry.appendChild(stats);
      entry.addEventListener('click', () => void selectCourse(course));
      entry.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          void selectCourse(course);
        }
      });
      entry.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        atlasApi.showCourseContextMenu(course.id);
      });
      entries.appendChild(entry);
    }
    group.appendChild(entries);
    list.appendChild(group);
  }
}

function setCourseViewMode(mode: 'grid' | 'list'): void {
  courseViewMode = mode;
  document.getElementById('course-view-grid')!.classList.toggle('active', mode === 'grid');
  document.getElementById('course-view-list')!.classList.toggle('active', mode === 'list');
  void renderCourses();
}

function setShowArchivedCourses(value: boolean): void {
  showArchivedCourses = value;
  const button = document.getElementById('toggle-archived-courses')!;
  button.textContent = value ? 'Show active' : 'Show archived';
  button.classList.toggle('active', value);
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
let showOnlyAgentNotes = false; // Phase 4 Part B filter — agent-generated notes only

// A plain-language readability label for a Classroom/Drive link resource —
// null for anything else (a local file's readability is implicit; it's
// either extracted or not, same as before this feature). See
// remote-attachments-spec.md §7 for the status meanings.
function remoteReadabilityLabel(resource: Resource): string | null {
  if (resource.kind !== 'link') return null;
  if (resource.link_kind && resource.link_kind !== 'driveFile') return null; // YouTube/Form/plain link — never fetchable
  if (!resource.remote_source) return null;
  switch (resource.extraction_status) {
    case 'done':
      return 'readable by agent';
    case 'empty':
      return 'no readable text found';
    case 'failed':
      return resource.extraction_error ? `not readable — ${resource.extraction_error}` : 'not readable';
    case 'unsupported':
      return null;
    case 'pending':
    default:
      return 'not fetched yet';
  }
}

function resourceListItem(resource: ResourceWithCourse, iconView: boolean): HTMLLIElement {
  const li = document.createElement('li');
  li.dataset.resourceId = String(resource.id);

  if (iconView) {
    li.className = 'icon-tile';
    const icon = document.createElement('div');
    icon.className = 'icon-glyph';
    icon.appendChild(makeMonoIcon(resourceIconKind(resource)));
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

    // A Classroom/Drive link resource has no local file — whether the AI
    // agent can actually read it (vs. just see a title) isn't obvious from
    // the row otherwise, so "the agent didn't find it" doesn't become a
    // silent mystery (remote-attachments-spec.md §8).
    const remoteLabel = remoteReadabilityLabel(resource);
    if (remoteLabel) {
      const status = document.createElement('span');
      status.className = 'code resource-remote-status';
      status.textContent = remoteLabel;
      li.appendChild(status);
    }
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

type CoursePickerMode = 'upload' | 'note' | 'scan' | 'assign';

let coursePickerMode: CoursePickerMode = 'upload';
let coursePickerCourses: Course[] = [];
let coursePickerSelectedId: number | null = null;
// Set only for 'assign' mode — which note is being moved into a course (see
// openAssignNoteCoursePicker). Quick-capture notes (createUnsortedNote in
// main.ts) start with no course; this is how the user picks one afterward.
let assigningNoteId: number | null = null;
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
    currentNoteIsFreshCreation = true;
    return;
  }

  if (coursePickerMode === 'assign') {
    const noteId = assigningNoteId;
    closeCoursePicker();
    assigningNoteId = null;
    if (noteId === null) return;
    const updated = await atlasApi.assignNoteCourse(noteId, courseId);
    // Re-render whatever's showing this note so its "Unsorted" label and
    // filename move to the newly-assigned course immediately, not just on
    // next reload.
    if (currentNoteId === updated.id) await openNoteEditor(updated);
    if (currentPage === 'notes') await renderNotesPage();
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
  } else if (mode === 'assign') {
    title.textContent = 'Move note to course';
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

// The "select which course to put it in later" half of quick capture
// (createUnsortedNote in main.ts) — reuses the same course-picker modal
// rather than a separate UI, same as note/upload/scan already do.
function openAssignNoteCoursePicker(noteId: number): void {
  assigningNoteId = noteId;
  void openCoursePicker('assign');
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

// Shared "who made this" prefix — handwritten (✍️) and agent-generated (🤖)
// are orthogonal signals (a typed, imported, or scanned note is all
// "user-made" alike), so both can in principle apply; agent-made is checked
// first since it's the rarer, more surprising case worth flagging first.
function noteTitlePrefix(note: Note): string {
  if (note.generated_by_agent) return '🤖 ';
  if (note.is_handwritten) return '✍️ ';
  return '';
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
      title.textContent = `${noteTitlePrefix(note)}${note.title}`;
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
  let notes =
    notesCourseFilterId === null ? allNotes : allNotes.filter((n) => n.course_id === notesCourseFilterId);
  if (showOnlyAgentNotes) notes = notes.filter((n) => n.generated_by_agent);
  renderAllNotesList(notes);
}

function setShowOnlyAgentNotes(value: boolean): void {
  showOnlyAgentNotes = value;
  const button = document.getElementById('toggle-agent-notes')!;
  button.textContent = value ? 'Show all notes' : 'Show only agent notes';
  button.classList.toggle('active', value);
  void renderNotesPage();
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

// Shared across every place a deadline is listed (course-detail list/icon
// views, Calendar chips/upcoming rows, Dashboard's Upcoming widget) — a
// visible marker for a locally-edited Classroom deadline, so the user
// doesn't have to open one just to find out it's edited (previously only
// visible inside the viewer, per the user's explicit ask). Returns null
// when there's nothing to show, so every call site can just check truthiness
// rather than repeating the local_overrides check itself.
function makeDeadlineEditedBadge(deadline: Deadline): HTMLSpanElement | null {
  if (!deadline.local_overrides) return null;
  const badge = document.createElement('span');
  badge.className = 'deadline-edited-badge';
  badge.textContent = '✎ Edited';
  badge.title = "You've edited this — Classroom's own updates to the edited field(s) won't overwrite your changes.";
  return badge;
}

function renderDeadlineListView(deadlines: Deadline[]): void {
  const list = document.getElementById('deadline-list')!;
  list.className = 'view-list';
  list.innerHTML = '';

  for (const deadline of deadlines) {
    const li = document.createElement('li');
    li.className = 'deadline-item';
    if (deadline.completed) li.classList.add('completed');
    if (deadline.classroom_removed) li.classList.add('classroom-removed');
    li.dataset.deadlineId = String(deadline.id);

    li.appendChild(makeDeadlineCheckbox(deadline));

    const icon = document.createElement('span');
    icon.textContent = DEADLINE_KIND_ICON[deadline.kind] ?? '📌';
    icon.innerHTML = '';
    icon.appendChild(makeMonoIcon(deadline.kind, 'deadline-kind-icon'));
    li.appendChild(icon);

    const title = document.createElement('span');
    title.className = 'deadline-title';
    title.textContent = deadline.title;
    li.appendChild(title);

    if (deadline.classroom_removed) {
      const removedBadge = document.createElement('span');
      removedBadge.className = 'deadline-classroom-removed-badge';
      removedBadge.textContent = 'Removed from Classroom';
      li.appendChild(removedBadge);
    }
    const editedBadge = makeDeadlineEditedBadge(deadline);
    if (editedBadge) li.appendChild(editedBadge);

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
    if (deadline.classroom_removed) li.classList.add('classroom-removed');
    li.dataset.deadlineId = String(deadline.id);

    li.appendChild(makeDeadlineCheckbox(deadline));

    const icon = document.createElement('div');
    icon.className = 'icon-glyph';
    icon.innerHTML = '';
    icon.appendChild(makeMonoIcon(deadline.kind));
    icon.textContent = DEADLINE_KIND_ICON[deadline.kind] ?? '📌';
    icon.innerHTML = '';
    icon.appendChild(makeMonoIcon(deadline.kind));
    li.appendChild(icon);

    const name = document.createElement('div');
    name.className = 'icon-name';
    name.textContent = deadline.title;
    li.appendChild(name);

    const editedBadge = makeDeadlineEditedBadge(deadline);
    if (editedBadge) li.appendChild(editedBadge);

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
  // Deadline edits/resets/deletes never navigate away from whatever page is
  // currently showing (modals layer on top), so Calendar needs an explicit
  // nudge here or it keeps showing stale data until the user flips months.
  if (currentPage === 'calendar') void renderCalendarPage();
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
    renderDashboardAnnouncements(),
    renderDashboardResources(),
    renderDashboardActivity(),
  ]);
}

// Google Drive: connect/disconnect, pick the one "inbox" folder to scan, and
// review new files it finds (Phase 3, open-questions.md #19). Files
// aren't imported automatically — the user assigns a course and a
// Resource/Note type per file (or in bulk) before anything gets copied into
// local managed storage; "Atlas owns the data" (AGENTS.md) still holds once
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

async function clearDrivePreviewCache(): Promise<void> {
  const button = document.getElementById('drive-clear-preview-cache-button') as HTMLButtonElement;
  const status = document.getElementById('drive-clear-preview-cache-status')!;
  button.disabled = true;
  status.hidden = false;
  status.textContent = 'Clearing…';
  const result = await atlasApi.clearDrivePreviewCache();
  button.disabled = false;
  status.textContent = result.ok ? 'Cleared.' : `Failed: ${result.error}`;
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
// expected to be the college Workspace account, open-questions.md #8),
// an explicit "Sync now" (no background polling, ARCHITECTURE.md §4b), and
// a course-mapping review panel. Once a Classroom course is mapped to an
// Atlas course, its coursework/announcements import automatically on future
// syncs — only which course a Classroom course maps to is gated here.
async function renderClassroomStatus(): Promise<void> {
  const connected = await atlasApi.isClassroomConnected();
  document.getElementById('classroom-status')!.textContent = connected ? 'Connected.' : 'Not connected.';
  (document.getElementById('classroom-connect-button') as HTMLButtonElement).hidden = connected;
  (document.getElementById('classroom-disconnect-button') as HTMLButtonElement).hidden = !connected;

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

// Ashoka Planner course import (open-questions.md #15) — a one-shot,
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
  const now = new Date();
  const heading = document.getElementById('dashboard-heading')!;
  heading.innerHTML = '';
  const weekday = document.createElement('span');
  weekday.className = 'dashboard-weekday';
  weekday.textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(now);
  const date = document.createElement('span');
  date.className = 'dashboard-date';
  date.textContent = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long' }).format(now);
  heading.append(weekday, document.createTextNode(' '), date);
  document.getElementById('stat-courses')!.textContent = String(stats.courseCount);
  document.getElementById('stat-resources')!.textContent = String(stats.resourceCount);
  document.getElementById('stat-notes')!.textContent = String(stats.noteCount);
  document.getElementById('stat-deadlines')!.textContent = String(stats.upcomingDeadlineCount);
}

async function renderDashboardCourses(): Promise<void> {
  const list = document.getElementById('dashboard-course-list')!;
  const courses = await atlasApi.getCourseSummaries();
  renderDashboardCourseFilter(courses);
  list.innerHTML = '';

  const visibleCourses = dashboardCourseFilterId === null ? courses : courses.filter((course) => course.id === dashboardCourseFilterId);

  if (visibleCourses.length === 0) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'No courses yet.';
    list.appendChild(li);
    return;
  }

  for (const course of visibleCourses) {
    const li = document.createElement('li');
    li.className = 'dashboard-course-cell';
    const name = document.createElement('div');
    name.className = 'dashboard-course-name';
    const swatch = document.createElement('span');
    swatch.className = 'dashboard-course-swatch';
    swatch.style.backgroundColor = courseAvatarColor(course.id);
    name.append(swatch, document.createTextNode(course.name));

    const code = document.createElement('div');
    code.className = 'dashboard-course-code';
    code.textContent = course.code || '—';
    const meta = document.createElement('div');
    meta.className = 'dashboard-course-meta';
    meta.textContent = `${course.resource_count} files · ${course.deadline_count} due`;
    li.append(name, code, meta);

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

// A relative Today/Tomorrow/Overdue/"N days" value — distinct from
// formatDueDate's absolute-date label, since the screenshot design calls for
// the relative framing specifically for this widget's row layout. Paired
// with a separate "Due in" label above it (see renderDashboardDeadlineRows),
// so this returns just the value, not the full sentence.
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
  return `${diffDays} days`;
}

// --- Calendar page (v1 — month grid + Upcoming sidebar only) ---
// Day/Week view toggle, a mini date-picker, and per-kind/course filter
// checkboxes (all present in the shared screenshot's "Filters" panel) are
// deliberate fast-follows, not silently cut — see open-questions.md.
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

// Lowered from 3 to 2 when the chips became two-line (title + course name)
// and visually bigger, per the user's request to make them more legible —
// 3 of the taller chips no longer fit a day cell without overflowing.
const CALENDAR_MAX_CHIPS_PER_DAY = 2;

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
      const color = courseAvatarColor(deadline.course_id);
      const chip = document.createElement('div');
      chip.className = 'calendar-deadline-chip';
      chip.style.borderLeftColor = color;
      chip.style.backgroundColor = `${color}26`; // ~15% opacity tint, so the block itself reads as "this course's color", not just a thin accent line
      // Compact "✎" prefix rather than a full text badge — a month-grid chip
      // is small and already two lines; a full "Edited" badge (used in the
      // roomier list/icon/dashboard views) would overflow it.
      const editedPrefix = deadline.local_overrides ? '✎ ' : '';
      chip.title = `${editedPrefix}${deadline.course_name}: ${deadline.title}${
        deadline.local_overrides ? " (you've edited this)" : ''
      }`;
      chip.innerHTML = `
        <span class="calendar-deadline-chip-title">${editedPrefix}${escapeHtml(deadline.title)}</span>
        <span class="calendar-deadline-chip-course">${escapeHtml(deadline.course_name)}</span>
      `;
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
      const editedBadge = makeDeadlineEditedBadge(deadline);
      if (editedBadge) row.appendChild(editedBadge);
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
  if (dashboardCourseFilterId !== null) {
    dashboardDeadlinesCache = dashboardDeadlinesCache.filter((deadline) => deadline.course_id === dashboardCourseFilterId);
  }
  renderDashboardCompactDeadlineRows();
}

function renderDashboardCourseFilter(courses: CourseSummary[]): void {
  const label = document.getElementById('dashboard-course-filter-label')!;
  const menu = document.getElementById('dashboard-course-filter-menu')!;
  const selectedCourse = courses.find((course) => course.id === dashboardCourseFilterId);
  label.textContent = selectedCourse?.name ?? 'All courses';
  menu.innerHTML = '';
  for (const course of [{ id: null, name: 'All courses' }, ...courses]) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'dselect-option';
    option.dataset.courseId = course.id === null ? '' : String(course.id);
    option.textContent = course.name;
    option.classList.toggle('selected', course.id === dashboardCourseFilterId);
    menu.appendChild(option);
  }
}

function renderDashboardCompactDeadlineRows(): void {
  const list = document.getElementById('dashboard-deadlines')!;
  list.innerHTML = '';

  if (dashboardDeadlinesCache.length === 0) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'Nothing upcoming.';
    list.appendChild(li);
    return;
  }

  for (const deadline of dashboardDeadlinesCache.slice(0, 5)) {
    const li = document.createElement('li');
    li.className = 'dashboard-compact-row';
    const leading = document.createElement('span');
    leading.className = 'dashboard-row-leading';
    const title = document.createElement('span');
    title.className = 'dashboard-row-title';
    title.textContent = deadline.title;
    const course = document.createElement('span');
    course.className = 'dashboard-row-course';
    const swatch = document.createElement('span');
    swatch.className = 'dashboard-course-swatch';
    swatch.style.backgroundColor = courseAvatarColor(deadline.course_id);
    course.append(swatch, document.createTextNode(deadline.course_name));
    const trailing = document.createElement('span');
    trailing.className = 'dashboard-row-trailing';

    if (deadline.due_at) {
      const { year, month, day } = splitDueAt(deadline.due_at);
      const date = new Date(year, month - 1, day);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const difference = Math.round((date.getTime() - today.getTime()) / 86400000);
      leading.textContent = difference === 0 ? 'Today' : date.toLocaleDateString(undefined, { weekday: 'short' });
      if (difference === 0) li.classList.add('is-today');
      const time = deadline.due_at.match(/(?:T|\s)(\d{2}):(\d{2})/);
      trailing.textContent = time ? `${time[1]}:${time[2]}` : '—';
    } else {
      leading.textContent = '—';
      trailing.textContent = '—';
    }

    li.append(leading, title, course, trailing);
    li.addEventListener('click', () => openDashboardDeadline(deadline));
    li.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      showGoToMenu(event.clientX, event.clientY, () => goToDashboardDeadline(deadline));
    });
    list.appendChild(li);
  }
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

    // Three-line stacked date block (month / day / weekday), matching the
    // shared screenshot's layout, rather than the earlier two-line
    // month-over-day block.
    const dateBlock = document.createElement('div');
    dateBlock.className = 'upcoming-date-block';
    let diffDays: number | null = null;
    if (deadline.due_at) {
      const { year, month, day } = splitDueAt(deadline.due_at);
      const date = new Date(year, month - 1, day);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      diffDays = Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      const monthEl = document.createElement('span');
      monthEl.className = 'upcoming-date-month';
      monthEl.textContent = date.toLocaleDateString(undefined, { month: 'short' }).toUpperCase();
      const dayEl = document.createElement('span');
      dayEl.className = 'upcoming-date-day';
      dayEl.textContent = String(date.getDate());
      const weekdayEl = document.createElement('span');
      weekdayEl.className = 'upcoming-date-weekday';
      weekdayEl.textContent = date.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase();
      dateBlock.append(monthEl, dayEl, weekdayEl);
    }
    li.appendChild(dateBlock);

    const content = document.createElement('div');
    content.className = 'upcoming-content';
    const titleEl = document.createElement('span');
    titleEl.className = 'upcoming-title';
    titleEl.textContent = deadline.title;
    const metaRow = document.createElement('div');
    metaRow.className = 'upcoming-meta-row';
    const courseEl = document.createElement('span');
    courseEl.className = 'upcoming-course';
    courseEl.textContent = deadline.course_name;
    const badge = document.createElement('span');
    badge.className = 'upcoming-kind-badge';
    badge.textContent = DEADLINE_KIND_LABEL[deadline.kind] ?? deadline.kind;
    metaRow.append(courseEl, badge);
    const editedBadge = makeDeadlineEditedBadge(deadline);
    if (editedBadge) metaRow.appendChild(editedBadge);
    content.append(titleEl, metaRow);
    li.appendChild(content);

    // Right-aligned "Due in" block — urgent (2 days or less, including
    // Today/Tomorrow/Overdue) gets a warning color so what needs attention
    // soonest stands out at a glance, same idea as the screenshot's red text.
    const dueBlock = document.createElement('div');
    dueBlock.className = 'upcoming-due-block';
    if (diffDays !== null) {
      const dueLabelEl = document.createElement('span');
      dueLabelEl.className = 'upcoming-due-label';
      // "Due in" reads naturally before a day count ("Due in 2 days"), but
      // not before Today/Tomorrow/Overdue — those already say the whole
      // thing on their own, so the label stays generic for them.
      dueLabelEl.textContent = diffDays > 1 ? 'Due in' : 'Due';
      const dueValueEl = document.createElement('span');
      dueValueEl.className = 'upcoming-due-value';
      if (diffDays <= 2) dueValueEl.classList.add('urgent');
      dueValueEl.textContent = formatDueInLabel(deadline.due_at);
      dueBlock.append(dueLabelEl, dueValueEl);
    }
    li.appendChild(dueBlock);

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
  const visibleResources = dashboardCourseFilterId === null
    ? resources
    : resources.filter((resource) => resource.course_id === dashboardCourseFilterId);
  list.innerHTML = '';

  if (visibleResources.length === 0) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'No resources yet.';
    list.appendChild(li);
    return;
  }

  for (const resource of visibleResources) {
    const li = makeDashboardListingRow(resource.title, resource.course_name, resource.course_id, relativeTime(resource.added_at));
    li.addEventListener('click', () => openDashboardResource(resource));
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showGoToMenu(e.clientX, e.clientY, () => goToDashboardResource(resource));
    });
    list.appendChild(li);
  }
}

function relativeTime(sqliteDatetime: string): string {
  const date = new Date(sqliteDatetime.replace(' ', 'T') + 'Z');
  const hours = Math.max(0, Math.round((Date.now() - date.getTime()) / 3600000));
  if (hours < 1) return 'now';
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return days < 7 ? `${days}d` : `${Math.round(days / 7)}w`;
}

function makeDashboardListingRow(title: string, courseName: string, courseId: number, age: string): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'dashboard-compact-row dashboard-listing-row';
  const ageEl = document.createElement('span');
  ageEl.className = 'dashboard-row-leading';
  ageEl.textContent = age;
  const titleEl = document.createElement('span');
  titleEl.className = 'dashboard-row-title';
  titleEl.textContent = title;
  const courseEl = document.createElement('span');
  courseEl.className = 'dashboard-row-course';
  const swatch = document.createElement('span');
  swatch.className = 'dashboard-course-swatch';
  swatch.style.backgroundColor = courseAvatarColor(courseId);
  courseEl.append(swatch, document.createTextNode(courseName));
  li.append(ageEl, titleEl, courseEl);
  return li;
}

async function renderDashboardAnnouncements(): Promise<void> {
  const list = document.getElementById('dashboard-announcements')!;
  const announcements = await atlasApi.getRecentAnnouncements();
  const visibleAnnouncements = dashboardCourseFilterId === null
    ? announcements
    : announcements.filter((announcement) => announcement.course_id === dashboardCourseFilterId);
  list.innerHTML = '';

  if (visibleAnnouncements.length === 0) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'No announcements.';
    list.appendChild(li);
    return;
  }

  for (const announcement of visibleAnnouncements.slice(0, 5)) {
    const li = makeDashboardListingRow(
      announcement.title,
      announcement.course_name,
      announcement.course_id,
      relativeTime(announcement.posted_at)
    );
    li.addEventListener('click', async () => {
      const courses = await atlasApi.listCourses();
      const course = courses.find((item) => item.id === announcement.course_id);
      if (course) await openDashboardCourse(course);
    });
    list.appendChild(li);
  }
}

async function renderDashboardActivity(): Promise<void> {
  const list = document.getElementById('dashboard-activity')!;
  const notes = await atlasApi.listAllNotes();
  const todayItems = notes.filter((note): note is NoteWithCourse & { course_id: number } => note.course_id !== null)
    .filter((note) => dashboardCourseFilterId === null || note.course_id === dashboardCourseFilterId).slice(0, 5).map((note) => ({
    ...note,
    timestamp: note.updated_at,
    entity_type: 'note' as const,
  }));
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
    const compact = makeDashboardListingRow(item.title, item.course_name, item.course_id, relativeTime(item.timestamp));
    compact.addEventListener('click', () => openDashboardActivityItem(item));
    compact.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showGoToMenu(e.clientX, e.clientY, () => goToDashboardActivityItem(item));
    });
    list.appendChild(compact);
    continue;
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
// Tracks whether the currently-open note has a course yet — drives the
// "Assign to course" button's visibility (see openNoteEditor). NULL means
// unsorted (a quick-capture note, createUnsortedNote in main.ts).
let currentNoteCourseId: number | null = null;
let noteSaveTimer: ReturnType<typeof setTimeout> | null = null;
let noteTitleBeforeEdit = '';
// The note's markdown right after it finished opening (post-Crepe-mount, not
// the raw DB value — Crepe can reformat markdown slightly on load, e.g.
// normalizing whitespace, and comparing against its own output avoids a
// false "changed" reading from that alone). Used so simply opening and
// closing a note — with no real edit — doesn't bump its updated_at and make
// the Dashboard's "What changed today" falsely list it. Crepe fires its
// markdownUpdated listener once during mount even with nothing typed, which
// is what caused this in the first place.
let noteContentAtOpen: string | null = null;
// True only for a note just created this session via "New note" or quick
// capture (Ctrl+Shift+N) — never for reopening an existing note, even an
// already-empty one. Drives closeNoteEditor()'s "discard if never edited"
// check: creating an empty DB row (and an empty exported .md file, and a
// search_index entry) the instant "New note" is clicked, then leaving one
// behind for every note opened-and-immediately-closed, was real clutter the
// user asked to stop seeing.
let currentNoteIsFreshCreation = false;
// Captured once at mount and never touched again (unlike noteContentAtOpen
// above, which scheduleNoteSave() deliberately keeps moving forward after
// every autosave) — this is the real "has anything at all changed since
// this note was created" baseline the discard check below needs. Reusing
// noteContentAtOpen for that check was the first attempt at this and was
// wrong: it gets reset to the just-saved markdown the moment the very
// first autosave lands, so it always reads "unchanged" again a few hundred
// milliseconds after the user's first keystroke, even for a note with real
// typed or embedded content.
let noteContentAtCreation: string | null = null;

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
  if (!noteEditorInstance || noteEditorInstance.getMarkdown() === noteContentAtOpen) return;

  const statusEl = document.getElementById('note-save-status')!;
  statusEl.textContent = 'Saving…';
  if (noteSaveTimer) clearTimeout(noteSaveTimer);
  noteSaveTimer = setTimeout(async () => {
    if (currentNoteId === null || !noteEditorInstance) return;
    const markdown = noteEditorInstance.getMarkdown();
    if (markdown === noteContentAtOpen) {
      statusEl.textContent = '';
      return;
    }
    const result = await atlasApi.updateNoteContent(currentNoteId, markdown);
    noteContentAtOpen = markdown;
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
    const markdown = noteEditorInstance.getMarkdown();
    // Closing a note the user only opened to look at (no real edit) must
    // not touch it — otherwise it wrongly shows up as "changed today" and
    // its updated_at moves for no reason.
    if (markdown === noteContentAtOpen) return;
    await atlasApi.updateNoteContent(currentNoteId, markdown);
    noteContentAtOpen = markdown;
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
    // Embedding an image needs a real course folder to store it under — an
    // unsorted quick-capture note doesn't have one yet. Assigning a course
    // first (the "Assign to course…" button) unlocks this, same as it
    // unlocks the .md export.
    if (note.course_id === null) {
      throw new Error('Assign this note to a course before adding images.');
    }
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
  // Baseline for the open/close no-op check above — captured from Crepe's
  // own output post-mount, after whatever normalization it just did, not
  // the raw value passed in.
  noteContentAtOpen = crepe.getMarkdown();
  // A second, fixed baseline for closeNoteEditor()'s discard-if-untouched
  // check — see its own declaration comment for why this can't just reuse
  // noteContentAtOpen.
  noteContentAtCreation = noteContentAtOpen;
}

async function openNoteEditor(note: Note): Promise<void> {
  const overlay = document.getElementById('note-overlay')!;
  const titleInput = document.getElementById('note-title-input') as HTMLInputElement;
  const statusEl = document.getElementById('note-save-status')!;

  currentNoteId = note.id;
  currentNoteCourseId = note.course_id;
  // Reset here, not just at the two creation call sites — opening any other
  // note (including navigating straight from one fresh note to another)
  // must never inherit a stale "discard if untouched" flag from whatever
  // was open before.
  currentNoteIsFreshCreation = false;
  titleInput.value = note.title;
  const courses = await atlasApi.listCourses();
  const course = courses.find((item) => item.id === note.course_id);
  const courseName = course?.name ?? 'Unsorted';
  document.getElementById('note-overlay-course')!.textContent = courseName;
  document.getElementById('note-overlay-origin')!.textContent = note.generated_by_agent ? 'Agent-written' : 'Not agent-written';
  const swatch = document.getElementById('note-overlay-course-swatch')!;
  swatch.style.background = course ? courseAvatarColor(course.id) : 'var(--text-faint)';
  statusEl.textContent = `Saved ${formatRelativeTime(note.updated_at.replace(' ', 'T') + 'Z')}`;
  overlay.hidden = false;

  // Only an unsorted (quick-capture) note needs this — a note already in a
  // course doesn't need a way back out of one.
  const assignButton = document.getElementById('note-assign-course') as HTMLButtonElement;
  assignButton.hidden = note.course_id !== null;

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
  // Discard, don't save, a "New note"/quick-capture note the user closes
  // without ever typing anything — into the body *or* the title. Checked
  // here rather than at creation time since there's no way to know in
  // advance whether the user was about to type something.
  const titleInput = document.getElementById('note-title-input') as HTMLInputElement;
  const untouched =
    currentNoteIsFreshCreation &&
    noteEditorInstance !== null &&
    noteEditorInstance.getMarkdown() === noteContentAtCreation &&
    titleInput.value.trim() === 'Untitled';

  if (untouched && currentNoteId !== null) {
    if (noteSaveTimer) {
      clearTimeout(noteSaveTimer);
      noteSaveTimer = null;
    }
    await atlasApi.deleteNote(currentNoteId);
  } else {
    await flushPendingNoteSave();
  }
  currentNoteIsFreshCreation = false;

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

// Course detail's tabbed layout (replaces the old single long-scroll page,
// per the user's explicit request — "too much scrolling", same instinct as
// Google Classroom's own tabs). Announcements/Assignments/Classwork tabs are
// hidden entirely (not just their content) for a course that isn't
// Classroom-linked — see renderCourseClassroomSection.
let courseDetailTab = 'overview';

function setCourseDetailTab(tab: string): void {
  courseDetailTab = tab;
  document.querySelectorAll<HTMLElement>('.course-detail-tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.courseTab === tab);
  });
  document.querySelectorAll<HTMLElement>('.course-detail-tab-panel').forEach((panel) => {
    panel.hidden = panel.dataset.courseTabPanel !== tab;
  });
}

function backToCourseList(): void {
  selectedCourse = null;
  showCourseListView();
  void renderCourses(); // clear the stale .selected highlight left on the grid
}

// Label reflects this specific course's current state — Delete stays
// right-click-only (destructive, less common), but Archive/Unarchive gets a
// direct button here too since it's the page where the user is actively
// deciding "am I done with this course," and it's a reversible action.
function updateCourseDetailArchiveButton(course: Course): void {
  const button = document.getElementById('course-detail-archive-toggle')!;
  button.textContent = course.archived === 1 ? 'Unarchive course' : 'Archive course';
}

// Course rename/edit — reachable both from the course card's right-click
// menu (grid/list view, courseId comes from main.ts's native context menu)
// and from the course detail page's own "Edit" button (already-selected
// course). Renaming only ever touches courses.name/code/term — folder_name
// (file storage, memory files) is computed once at creation and
// deliberately never changes, so nothing else needs updating here.
let editingCourseId: number | null = null;

function openCourseEditModal(course: Course): void {
  editingCourseId = course.id;
  const nameInput = document.getElementById('course-edit-name') as HTMLInputElement;
  nameInput.value = course.name;
  (document.getElementById('course-edit-code') as HTMLInputElement).value = course.code ?? '';
  (document.getElementById('course-edit-term') as HTMLInputElement).value = course.term ?? '';
  document.getElementById('course-edit-overlay')!.hidden = false;
  nameInput.focus();
}

async function openCourseEditModalById(courseId: number): Promise<void> {
  const courses = await atlasApi.listCourses();
  const course = courses.find((c) => c.id === courseId);
  if (course) openCourseEditModal(course);
}

function closeCourseEditModal(): void {
  editingCourseId = null;
  document.getElementById('course-edit-overlay')!.hidden = true;
}

// Phase 4 Part E fallback (phase4-spec.md §7) — for pasting into an AI tool
// that can't use the MCP server (Part D) directly. Reveals the written file
// in the OS file manager (main.ts's shell.showItemInFolder) since there's no
// in-app viewer for it — the point is a plain file to open elsewhere.
async function exportSelectedCourseContext(): Promise<void> {
  if (!selectedCourse) return;
  const statusEl = document.getElementById('course-detail-export-status')!;
  statusEl.hidden = false;
  statusEl.textContent = 'Exporting…';
  const result = await atlasApi.exportCourseContext(selectedCourse.id);
  statusEl.textContent = result.ok ? `Saved to ${result.filePath}` : result.error;
}

async function toggleSelectedCourseArchived(): Promise<void> {
  if (!selectedCourse) return;
  const action = selectedCourse.archived === 1 ? 'Unarchive' : 'Archive';
  if (!(await showConfirm(`${action} "${selectedCourse.name}"? You can change this again later.`))) return;
  const updated = await atlasApi.setCourseArchived(selectedCourse.id, selectedCourse.archived !== 1);
  // Archiving the course currently open removes it from the active list (or
  // vice versa for unarchiving) — going back to the grid avoids leaving the
  // user stranded on a detail page for a course that no longer matches
  // whichever filter (Active/Archived) the grid is currently showing.
  backToCourseList();
  setShowArchivedCourses(updated.archived === 1);
}

// Deadlines + Watched folders are shown directly (real, already-built
// features); Resources/Notes stay global pages — these two link buttons
// just jump to them pre-filtered to this course rather than duplicating
// their list/preview UI here.
async function selectCourse(course: Course): Promise<void> {
  selectedCourse = course;
  showCourseDetailView();
  setCourseDetailTab('overview'); // always land on Overview for a freshly-opened course, never a tab left selected from a previous one
  void renderCourses(); // updates the grid's .selected highlight for when the user goes back

  document.getElementById('course-detail-heading')!.textContent = course.name;
  document.getElementById('course-detail-meta')!.textContent = [course.code, course.term]
    .filter((part): part is string => !!part)
    .join(' · ');

  const avatarSlot = document.getElementById('course-detail-avatar-slot')!;
  avatarSlot.innerHTML = '';
  avatarSlot.appendChild(makeCourseAvatar(course));

  updateCourseDetailArchiveButton(course);
  document.getElementById('course-detail-export-status')!.hidden = true;

  // Reaching this detail page from the archived view means this specific
  // course is itself archived — pass that through so the lookup below finds
  // it (getCourseSummaries only ever returns one state or the other, never
  // both at once).
  const summaries = await atlasApi.getCourseSummaries(course.archived === 1);
  const summary = summaries.find((s) => s.id === course.id);
  document.getElementById('course-detail-resource-count')!.textContent = String(summary?.resource_count ?? 0);
  document.getElementById('course-detail-note-count')!.textContent = String(summary?.note_count ?? 0);

  await renderCourseDetailPreviews(course.id);
  await renderCourseDetailUpNext(course.id);
  await renderDeadlines();
  await renderWatchedFolders();
  await renderCourseClassroomSection(course);
}

// Shows either "Connect to Classroom…" or "Connected to <name>" + Disconnect,
// and shows/populates the Announcements/Assignments/Classwork *tabs* only
// once actually linked — an unlinked course has nothing to show there. If
// the currently-active tab is one of those and the course just got
// disconnected, falls back to Overview rather than leaving a hidden tab
// showing as "selected" with no button left to reach it.
async function renderCourseClassroomSection(course: Course): Promise<void> {
  const connectedBox = document.getElementById('course-classroom-connected')!;
  const connectButton = document.getElementById('course-classroom-connect') as HTMLButtonElement;
  const announcementsTab = document.getElementById('course-tab-announcements')!;
  const assignmentsTab = document.getElementById('course-tab-assignments')!;
  const classworkTab = document.getElementById('course-tab-classwork')!;

  if (!course.classroom_course_id) {
    connectedBox.hidden = true;
    connectButton.hidden = false;
    announcementsTab.hidden = true;
    assignmentsTab.hidden = true;
    classworkTab.hidden = true;
    if (['announcements', 'assignments', 'classwork'].includes(courseDetailTab)) {
      setCourseDetailTab('overview');
    }
    return;
  }

  connectedBox.hidden = false;
  connectButton.hidden = true;
  announcementsTab.hidden = false;
  assignmentsTab.hidden = false;
  classworkTab.hidden = false;
  document.getElementById('course-classroom-name')!.textContent = course.name;

  const content = await atlasApi.getClassroomCourseContent(course.id);
  renderClassroomLinkList(
    'course-announcements-list',
    'No announcements yet.',
    content.announcements,
    (a) => ({ title: a.title, meta: formatIsoTimestamp(a.posted_at), body: a.body, links: a.links }),
    (a) => openClassroomItemDetail('Announcement', a.title, formatIsoTimestamp(a.posted_at), a.body, a.links)
  );
  renderClassroomLinkList(
    'course-assignments-list',
    'No assignments yet.',
    content.assignments,
    (a) => ({
      title: a.title,
      meta: a.due_at ? `Due ${formatDueDate(a.due_at)}` : 'No due date',
      body: a.description,
      links: a.links,
    }),
    (a) => void openAssignmentDetail(a, course.id)
  );
  renderClassroomLinkList(
    'course-classwork-list',
    'No classwork yet.',
    content.classwork,
    (c) => ({ title: c.title, meta: c.posted_at ? formatIsoTimestamp(c.posted_at) : '', body: c.description, links: c.links }),
    (c) => openClassroomItemDetail('Classwork', c.title, c.posted_at ? formatIsoTimestamp(c.posted_at) : '', c.description, c.links)
  );
}

// Clicking an assignment jumps to its mirrored deadline (existing viewer,
// with real editing) rather than a separate read-only detail view — since
// every synced assignment already has a corresponding `deadlines` row
// (see googleClassroom.ts), that's the more useful destination. Falls back
// to the generic detail overlay only if no match is found (shouldn't
// normally happen, but a manually-deleted deadline shouldn't dead-end the
// click).
async function openAssignmentDetail(
  assignment: ClassroomCourseContent['assignments'][number],
  courseId: number
): Promise<void> {
  const deadlines = await atlasApi.listDeadlines(courseId);
  const match = deadlines.find((d) => d.classroom_coursework_id === assignment.classroom_coursework_id);
  if (match) {
    await openDeadlineViewer(match);
    return;
  }
  openClassroomItemDetail(
    'Assignment',
    assignment.title,
    assignment.due_at ? `Due ${formatDueDate(assignment.due_at)}` : 'No due date',
    assignment.description,
    assignment.links
  );
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
  listId: string,
  emptyText: string,
  items: T[],
  toRow: (item: T) => { title: string; meta: string; body: string | null; links: ClassroomContentLink[] },
  onRowClick: (item: T) => void
): void {
  const list = document.getElementById(listId)!;
  list.innerHTML = '';

  if (items.length === 0) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = emptyText;
    list.appendChild(li);
    return;
  }

  for (const item of items) {
    const row = toRow(item);
    const li = document.createElement('li');
    li.className = 'classroom-item-row';
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
        button.className = 'classroom-attachment-chip';
        button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg><span>${escapeHtml(link.title)}</span>`;
        // Stops the click from also bubbling up to the row's own click
        // handler (which would open the detail overlay right behind the
        // link the user actually meant to open).
        button.addEventListener('click', (e) => {
          e.stopPropagation();
          void atlasApi.openExternalUrl(link.file_path);
        });
        linksDiv.appendChild(button);
      }
      li.appendChild(linksDiv);
    }
    li.addEventListener('click', () => onRowClick(item));
    list.appendChild(li);
  }
}

// Shared read-only detail view for an announcement/classwork item (and the
// fallback for an assignment with no matching deadline) — a modal rather
// than expanding the row in place, since the row's body is already fully
// shown inline and a modal gives a consistent, larger reading surface plus
// a real Escape-to-close affordance for something that otherwise had none.
function openClassroomItemDetail(
  kindLabel: string,
  title: string,
  meta: string,
  body: string | null,
  links: ClassroomContentLink[]
): void {
  document.getElementById('classroom-item-detail-title')!.textContent = title;
  document.getElementById('classroom-item-detail-meta')!.textContent = `${kindLabel} · ${meta}`;
  const bodyEl = document.getElementById('classroom-item-detail-body')!;
  bodyEl.textContent = body ?? '';
  bodyEl.hidden = !body;

  const linksDiv = document.getElementById('classroom-item-detail-links')!;
  linksDiv.innerHTML = '';
  for (const link of links) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'classroom-attachment-chip';
    button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg><span>${escapeHtml(link.title)}</span>`;
    button.addEventListener('click', () => void atlasApi.openExternalUrl(link.file_path));
    linksDiv.appendChild(button);
  }

  document.getElementById('classroom-item-detail-overlay')!.hidden = false;
}

function closeClassroomItemDetail(): void {
  document.getElementById('classroom-item-detail-overlay')!.hidden = true;
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

// Destructive — disconnecting also deletes this course's synced
// announcements/assignments/deadlines/classwork/link-resources (see
// classroom:disconnectCourse in main.ts), so it's the real "undo" for
// having connected the wrong Classroom class. Confirmed first since there's
// no separate delete step the user could otherwise catch this at.
async function disconnectCourseClassroomClicked(): Promise<void> {
  if (!selectedCourse) return;
  const confirmed = await showConfirm(
    'Disconnect from Classroom? This also deletes everything synced from that class for this course — announcements, assignments, Classwork posts, and their attached links. This cannot be undone.'
  );
  if (!confirmed) return;

  await atlasApi.disconnectCourseFromClassroom(selectedCourse.id);
  const updatedCourses = await atlasApi.listCourses();
  const updated = updatedCourses.find((c) => c.id === selectedCourse!.id);
  if (updated) {
    selectedCourse = updated;
    await renderCourseClassroomSection(updated);
    await renderCourseDetailPreviews(updated.id);
    await renderDeadlines();
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
      li.textContent = `${noteTitlePrefix(note)}${note.title}`;
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
// while most are fine at 100% — see open-questions.md.
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
// Only these kinds have anything Google Drive's viewer offers that the
// in-app preview can't (real slide/document layout) — PDFs/images already
// render natively, so the button would just be clutter there.
const OFFICE_PREVIEW_KINDS = new Set(['pptx', 'docx', 'xlsx']);

async function openPreview(resource: Resource): Promise<void> {
  const overlay = document.getElementById('preview-overlay')!;
  const title = document.getElementById('preview-title')!;
  const note = document.getElementById('preview-note') as HTMLParagraphElement;
  const body = document.getElementById('preview-body')!;
  const zoomControls = document.getElementById('zoom-controls')!;
  const ocrButton = document.getElementById('preview-run-ocr') as HTMLButtonElement;
  const driveButton = document.getElementById('preview-open-in-drive') as HTMLButtonElement;

  title.textContent = resource.title;
  note.hidden = true;
  zoomControls.hidden = true;
  body.classList.remove('centered');
  body.innerHTML = '<p class="muted">Loading preview…</p>';
  overlay.hidden = false;
  currentPreviewResourceId = resource.id;

  // Run OCR only makes sense for a PDF — same on-demand, reviewed-before-
  // saving shape as handwritten notes (open-questions.md #18), for
  // text-layer-less PDFs like a scanned book. Resets on every open, even if
  // left showing on whatever resource was previewed last.
  ocrButton.hidden = resource.kind !== 'pdf';
  ocrButton.disabled = false;
  // extraction_status 'empty' means the file parsed but Atlas's own text
  // extraction (textExtraction.ts) found nothing — the scan-detection signal
  // (phase4-spec.md §3.7) that this PDF is very likely a photographed/scanned
  // book with no real text layer, so OCR is the way to make it searchable.
  document.getElementById('preview-ocr-status')!.textContent =
    resource.kind === 'pdf' && resource.extraction_status === 'empty'
      ? "This looks like a scanned PDF with no readable text — run OCR to make it searchable."
      : '';
  discardResourceOcr();

  driveButton.hidden = !OFFICE_PREVIEW_KINDS.has(resource.kind);
  driveButton.disabled = false;
  document.getElementById('preview-drive-status')!.textContent = '';

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
// notes (open-questions.md #18) — this is for PDFs Atlas can't already
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

// Uploads (or reuses an already-current upload of) this resource to Atlas's
// Drive preview folder and opens Google Drive's own viewer for it in the
// browser (open-questions.md #12) — real slide/document layout the in-app
// preview can't render. There's no byte-level progress to show (see the
// comment on uploadResourceForPreview in googleDrive.ts), just an
// indeterminate "Uploading…" between the driveOpenStart/driveOpenSuccess-or-
// Error events fired from main.ts — the same events also fire for the
// context-menu entry point, so both stay in sync automatically.
function openCurrentPreviewInGoogleDrive(): void {
  if (currentPreviewResourceId === null) return;
  void atlasApi.openResourceInGoogleDrive(currentPreviewResourceId);
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
      const resultIcon = result.entityType === 'note' ? '📃' : result.entityType === 'course' ? '📚' : '📄';
      titleRow.textContent = `${resultIcon} ${result.title}`;
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
  if (result.entityType === 'course') {
    // Course matches can include archived courses (search doesn't filter
    // them out, see open-questions.md #4) — listCourses() only returns
    // active ones, so an archived match falls back to the archived-only
    // course-summaries list. CourseSummary extends Course, so it's a valid
    // argument for selectCourse() either way.
    let course: Course | undefined = (await atlasApi.listCourses()).find((c) => c.id === result.entityId);
    if (!course) course = (await atlasApi.getCourseSummaries(true)).find((c) => c.id === result.entityId);
    if (course) {
      showPage('courses');
      await selectCourse(course);
    }
  } else if (result.entityType === 'note') {
    const notes = await atlasApi.listAllNotes();
    const note = notes.find((n) => n.id === result.entityId);
    if (note) await openNoteEditor(note);
  } else if (result.entityType === 'resource') {
    const resources = await atlasApi.listAllResources();
    const resource = resources.find((r) => r.id === result.entityId);
    if (resource) await openPreview(resource);
  } else if (result.entityType === 'document_part') {
    // A page/slide/sheet hit has nothing of its own to open — it opens its
    // parent resource's preview instead (resourceId supplied by search:query).
    const resources = await atlasApi.listAllResources();
    const resource = resources.find((r) => r.id === result.resourceId);
    if (resource) await openPreview(resource);
  } else if (result.entityType === 'announcement') {
    const content = await atlasApi.getClassroomCourseContent(result.courseId);
    const announcement = content.announcements.find((a) => a.id === result.entityId);
    if (announcement) {
      openClassroomItemDetail(
        'Announcement',
        announcement.title,
        formatIsoTimestamp(announcement.posted_at),
        announcement.body,
        announcement.links
      );
    }
  } else if (result.entityType === 'assignment') {
    const content = await atlasApi.getClassroomCourseContent(result.courseId);
    const assignment = content.assignments.find((a) => a.id === result.entityId);
    if (assignment) await openAssignmentDetail(assignment, result.courseId);
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
  document.getElementById('deadline-view-course')!.textContent = selectedCourse?.name ?? '';
  document.getElementById('deadline-view-due')!.textContent = formatDueDate(deadline.due_at);
  document.getElementById('deadline-view-status')!.textContent = deadline.local_overrides ? 'Edited by you' : 'Unchanged';
  document.getElementById('deadline-view-source')!.textContent = deadline.source === 'classroom' ? 'Google Classroom' : 'Manual';

  // Conflict handling (open-questions.md #3) — both notices are mutually
  // independent (a deadline can be both locally overridden and removed at
  // the source, e.g. edited once, then the professor deleted the
  // assignment), so they're shown/hidden separately rather than as one
  // combined state.
  const isClassroomDeadline = deadline.source === 'classroom' && Boolean(deadline.classroom_coursework_id);
  const isRemovedFromClassroom = isClassroomDeadline && deadline.classroom_removed === 1;
  document.getElementById('deadline-view-removed-notice')!.hidden = !isRemovedFromClassroom;

  const overrides = (deadline.local_overrides ?? '').split(',').filter(Boolean);
  const overrideNotice = document.getElementById('deadline-view-override-notice')!;
  const canResetToClassroom = isClassroomDeadline && !isRemovedFromClassroom && overrides.length > 0;
  if (canResetToClassroom) {
    const fieldLabels: Record<string, string> = { title: 'Title', due_at: 'Due date' };
    document.getElementById('deadline-view-override-text')!.textContent =
      `You've edited: ${overrides.map((f) => fieldLabels[f] ?? f).join(', ')} — Classroom's own updates to ${
        overrides.length > 1 ? 'these' : 'this'
      } won't overwrite your changes.`;
    overrideNotice.hidden = false;
    document.getElementById('deadline-reset-override-button')!.hidden = false;
  } else {
    overrideNotice.hidden = true;
    document.getElementById('deadline-reset-override-button')!.hidden = true;
  }

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

// "Reset to Classroom version" (open-questions.md #3) — discards local
// title/due_at edits and restores what Classroom currently says, then
// refreshes every view that could be showing this deadline's stale state.
async function resetCurrentDeadlineOverrides(): Promise<void> {
  if (!currentViewingDeadline) return;
  const updated = await atlasApi.resetDeadlineClassroomOverrides(currentViewingDeadline.id);
  if (!updated) return;
  await openDeadlineViewer(updated);
  await renderDeadlines();
  void renderDashboard();
}

// dd-mm-yyyy, the format the user asked to be able to type directly — kept
// separate from the native <input type="date">'s own yyyy-mm-dd value so
// both entry methods (typing, or the picker button) can drive the same
// field without fighting each other's format.
const deadlineKindLabels: Record<string, string> = {
  assignment: 'Assignment', reading: 'Reading', quiz: 'Quiz', lab: 'Lab', project: 'Project', exam: 'Exam', manual: 'Other'
};

function formatDeadlineDueLabel(dateText: string, timeText: string): string {
  return dateText ? `${dateText}${timeText ? ` · ${timeText}` : ''}` : 'Set date and time';
}

async function renderCourseDetailUpNext(courseId: number): Promise<void> {
  const list = document.getElementById('course-detail-up-next')!;
  const deadlines = (await atlasApi.listDeadlines(courseId))
    .filter(isCurrentOrFutureDeadline)
    .sort((a, b) => (a.due_at ?? '').localeCompare(b.due_at ?? ''))
    .slice(0, COURSE_DETAIL_PREVIEW_LIMIT);
  list.innerHTML = '';
  if (deadlines.length === 0) {
    const item = document.createElement('li');
    item.className = 'muted';
    item.textContent = 'No upcoming deadlines.';
    list.appendChild(item);
    return;
  }
  for (const deadline of deadlines) {
    const item = document.createElement('li');
    item.className = 'course-detail-deadline-row';
    const title = document.createElement('span');
    title.textContent = deadline.title;
    const due = document.createElement('span');
    due.textContent = formatDueDate(deadline.due_at);
    item.append(title, due);
    item.addEventListener('click', () => void openDeadlineViewer(deadline));
    list.appendChild(item);
  }
}

function parseDeadlineDue(dateText: string, timeText: string): { dueAt: string | null; error: string | null } {
  const date = dateText.trim();
  const time = timeText.trim();
  if (!date && !time) return { dueAt: null, error: null };
  const match = date.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return { dueAt: null, error: 'Use DD-MM-YYYY for the date.' };
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    return { dueAt: null, error: 'Enter a real calendar date.' };
  }
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { dueAt: null, error: 'Use HH:MM for the time.' };
  const isoDate = `${yearText}-${monthText}-${dayText}`;
  return { dueAt: time ? `${isoDate}T${time}` : isoDate, error: null };
}

function setDeadlineKind(value: string): void {
  (document.getElementById('deadline-edit-kind') as HTMLInputElement).value = value;
  document.getElementById('deadline-kind-label')!.textContent = deadlineKindLabels[value] ?? 'Other';
  document.querySelectorAll<HTMLButtonElement>('#deadline-kind-menu .dselect-option').forEach((option) => {
    option.classList.toggle('selected', option.dataset.value === value);
  });
}

function setDeadlineDueLabel(): void {
  const date = (document.getElementById('deadline-due-date') as HTMLInputElement).value.trim();
  const time = (document.getElementById('deadline-due-time') as HTMLInputElement).value.trim();
  document.getElementById('deadline-due-label')!.textContent = formatDeadlineDueLabel(date, time);
}

async function openDeadlineEditForm(deadline: Deadline | null): Promise<void> {
  if (!selectedCourse) return;
  await loadMentionCandidates(selectedCourse.id);

  currentEditingDeadlineId = deadline ? deadline.id : null;
  (document.getElementById('deadline-edit-title') as HTMLInputElement).value = deadline?.title ?? '';
  setDeadlineKind(deadline?.kind ?? 'assignment');
  const [isoDate = '', dueTime = ''] = deadline?.due_at?.split('T') ?? [];
  (document.getElementById('deadline-due-date') as HTMLInputElement).value = isoDate
    ? `${isoDate.slice(8, 10)}-${isoDate.slice(5, 7)}-${isoDate.slice(0, 4)}`
    : '';
  (document.getElementById('deadline-due-time') as HTMLInputElement).value = dueTime.slice(0, 5);
  setDeadlineDueLabel();
  document.getElementById('deadline-due-error')!.hidden = true;

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

// @-mention autocomplete in the description textarea — matches the common
// @-file-reference convention several AI coding tools use, scoped to the current
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
  document.getElementById('settings-theme-dark')!.classList.toggle('active', theme === 'dark');
  document.getElementById('settings-theme-light')!.classList.toggle('active', theme === 'light');
}

// Only reachable from Settings > General now — the top-bar quick-toggle was
// removed per the user's request to keep theme switching in one place.
function setTheme(theme: 'light' | 'dark'): void {
  applyTheme(theme);
  atlasApi.setSetting('theme', theme);
}

// Accent color — a user-chosen override of --color-accent (styles.css :root),
// which already drives active states/buttons/highlights throughout the app,
// so changing this one CSS custom property recolors all of them at once
// rather than needing per-component theming.
const ACCENT_COLORS = ['#d9a441', '#8b5cf6', '#3ba55d', '#e0574a', '#ec4899'];
const DEFAULT_ACCENT_COLOR = ACCENT_COLORS[0];

function applyAccentColor(color: string): void {
  document.documentElement.style.setProperty('--color-accent', color);
  document.querySelectorAll<HTMLElement>('.settings-accent-swatch').forEach((swatch) => {
    swatch.classList.toggle('active', swatch.dataset.accentColor === color);
  });
}

function setAccentColor(color: string): void {
  applyAccentColor(color);
  atlasApi.setSetting('accentColor', color);
}

function renderAccentSwatches(): void {
  const container = document.getElementById('settings-accent-swatches')!;
  container.innerHTML = '';
  for (const color of ACCENT_COLORS) {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'settings-accent-swatch';
    swatch.dataset.accentColor = color;
    swatch.style.backgroundColor = color;
    swatch.setAttribute('aria-label', `Accent color ${color}`);
    swatch.addEventListener('click', () => setAccentColor(color));
    container.appendChild(swatch);
  }
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

// --- Keyboard shortcuts (src/renderer/shortcuts.ts, ROADMAP.md Phase 5) ---
// The registry is the single source of truth for every app-wide binding —
// see shortcuts.ts's own header comment. Ctrl+Shift+N (quick capture) is
// deliberately NOT registered here: it's a global OS-wide shortcut
// (Electron's globalShortcut, registered in main.ts) that never reaches the
// renderer's own keydown handling at all, by design — it needs to work even
// when Atlas isn't the focused window.

const shortcutRegistry = new ShortcutRegistry();

function courseDetailVisible(): boolean {
  return currentPage === 'courses' && selectedCourse !== null && !(document.getElementById('courses-detail-view') as HTMLElement).hidden;
}

function isElementVisible(id: string): boolean {
  const el = document.getElementById(id);
  return el !== null && (el as HTMLElement).offsetParent !== null;
}

// Kept in sync with shortcutRegistry's own copy — this is the mutable
// working set the Settings > Shortcuts rebinding UI edits directly, then
// persists as one JSON blob (same shape saveShortcutOverrides below writes).
let shortcutOverrides: Record<string, string> = {};

async function loadShortcutOverrides(): Promise<void> {
  const raw = await atlasApi.getSetting('shortcuts_overrides');
  let overrides: Record<string, string> = {};
  if (raw) {
    try {
      overrides = JSON.parse(raw);
    } catch {
      overrides = {};
    }
  }
  shortcutOverrides = overrides;
  shortcutRegistry.setOverrides(overrides);
}

async function saveShortcutOverrides(): Promise<void> {
  shortcutRegistry.setOverrides(shortcutOverrides);
  await atlasApi.setSetting('shortcuts_overrides', JSON.stringify(shortcutOverrides));
}

function registerAppShortcuts(): void {
  const actions: ShortcutAction[] = [
    // Navigation
    { id: 'nav.dashboard', label: 'Go to Dashboard', group: 'Navigation', defaultBinding: 'Ctrl+1', run: () => showPage('dashboard') },
    { id: 'nav.courses', label: 'Go to Courses', group: 'Navigation', defaultBinding: 'Ctrl+2', run: () => showPage('courses') },
    { id: 'nav.resources', label: 'Go to Resources', group: 'Navigation', defaultBinding: 'Ctrl+3', run: () => showPage('resources') },
    { id: 'nav.notes', label: 'Go to Notes', group: 'Navigation', defaultBinding: 'Ctrl+4', run: () => showPage('notes') },
    { id: 'nav.calendar', label: 'Go to Calendar', group: 'Navigation', defaultBinding: 'Ctrl+5', run: () => showPage('calendar') },
    { id: 'nav.settings', label: 'Go to Settings', group: 'Navigation', defaultBinding: ['Ctrl+6', 'Ctrl+,'], run: () => showPage('settings') },
    {
      id: 'nav.toggleSidebar',
      label: 'Toggle sidebar',
      group: 'Navigation',
      defaultBinding: 'Ctrl+B',
      run: () => setSidebarCollapsed(!document.getElementById('sidebar')!.classList.contains('collapsed')),
    },
    {
      id: 'nav.backToCourseList',
      label: 'Back to course list',
      group: 'Navigation',
      defaultBinding: ['Backspace', 'Alt+ArrowLeft'],
      when: courseDetailVisible,
      run: backToCourseList,
    },

    // Create
    { id: 'create.note', label: 'New note', group: 'Create', defaultBinding: 'Ctrl+N', run: () => void openCoursePicker('note') },
    { id: 'create.upload', label: 'Upload file', group: 'Create', defaultBinding: 'Ctrl+U', run: () => void openCoursePicker('upload') },
    { id: 'create.scan', label: 'Import scan', group: 'Create', defaultBinding: 'Ctrl+Shift+U', run: () => void openCoursePicker('scan') },
    {
      id: 'create.deadline',
      label: 'Add deadline',
      group: 'Create',
      defaultBinding: 'Ctrl+D',
      when: () => isElementVisible('new-deadline-button'),
      run: () => openDeadlineEditForm(null),
    },

    // Search & sync
    { id: 'search.focus', label: 'Focus search', group: 'Search & sync', defaultBinding: ['Ctrl+L', 'Ctrl+F'], run: focusSearch },
    { id: 'sync.now', label: 'Sync all now', group: 'Search & sync', defaultBinding: 'Ctrl+R', run: () => void syncAllNowClicked() },
    {
      id: 'app.showShortcuts',
      label: 'Show all shortcuts',
      group: 'Search & sync',
      defaultBinding: 'Ctrl+/',
      run: openShortcutsCheatSheet,
    },

    // Course detail tabs
    { id: 'courseTab.overview', label: 'Course tab: Overview', group: 'Course detail', defaultBinding: 'Alt+1', when: courseDetailVisible, run: () => setCourseDetailTab('overview') },
    { id: 'courseTab.deadlines', label: 'Course tab: Deadlines', group: 'Course detail', defaultBinding: 'Alt+2', when: courseDetailVisible, run: () => setCourseDetailTab('deadlines') },
    {
      id: 'courseTab.announcements',
      label: 'Course tab: Announcements',
      group: 'Course detail',
      defaultBinding: 'Alt+3',
      when: () => courseDetailVisible() && !(document.getElementById('course-tab-announcements') as HTMLElement).hidden,
      run: () => setCourseDetailTab('announcements'),
    },
    {
      id: 'courseTab.assignments',
      label: 'Course tab: Assignments',
      group: 'Course detail',
      defaultBinding: 'Alt+4',
      when: () => courseDetailVisible() && !(document.getElementById('course-tab-assignments') as HTMLElement).hidden,
      run: () => setCourseDetailTab('assignments'),
    },
    {
      id: 'courseTab.classwork',
      label: 'Course tab: Classwork',
      group: 'Course detail',
      defaultBinding: 'Alt+5',
      when: () => courseDetailVisible() && !(document.getElementById('course-tab-classwork') as HTMLElement).hidden,
      run: () => setCourseDetailTab('classwork'),
    },
    { id: 'courseTab.files', label: 'Course tab: Files', group: 'Course detail', defaultBinding: 'Alt+6', when: courseDetailVisible, run: () => setCourseDetailTab('files') },

    // View toggles
    {
      id: 'view.toggleListGrid',
      label: 'Toggle list/grid view',
      group: 'View',
      defaultBinding: 'Ctrl+\\',
      run: () => {
        if (currentPage === 'courses' && !selectedCourse) setCourseViewMode(courseViewMode === 'grid' ? 'list' : 'grid');
        else setViewMode(viewMode === 'grid' ? 'list' : 'grid');
      },
    },
    {
      id: 'view.toggleArchivedCourses',
      label: 'Show archived courses',
      group: 'View',
      defaultBinding: 'Ctrl+Shift+A',
      when: () => currentPage === 'courses' && !selectedCourse,
      run: () => setShowArchivedCourses(!showArchivedCourses),
    },

    // Calendar page
    { id: 'calendar.prevMonth', label: 'Previous month', group: 'Calendar', defaultBinding: '[', when: () => currentPage === 'calendar', run: () => changeCalendarMonth(-1) },
    { id: 'calendar.nextMonth', label: 'Next month', group: 'Calendar', defaultBinding: ']', when: () => currentPage === 'calendar', run: () => changeCalendarMonth(1) },
    { id: 'calendar.today', label: 'Jump to today', group: 'Calendar', defaultBinding: 'T', when: () => currentPage === 'calendar', run: goToCalendarToday },

    // Open preview / note editor
    {
      id: 'view.fullscreen',
      label: 'Fullscreen preview/note',
      group: 'Preview & notes',
      defaultBinding: 'F',
      run: () => {
        if (!(document.getElementById('preview-overlay') as HTMLElement).hidden) toggleFullscreenPreview();
        else if (!(document.getElementById('note-overlay') as HTMLElement).hidden) toggleNoteTrueFullscreen();
      },
    },
    {
      id: 'app.closeOverlay',
      label: 'Close overlay',
      group: 'Preview & notes',
      defaultBinding: 'Escape',
      run: () => {
        const active = document.activeElement;
        // Two-stage Escape for the note editor: while actively typing (title
        // input or the Milkdown surface), the first Escape just blurs out of
        // editing — same instinct as any text editor, and avoids an
        // in-progress selection vanishing along with the whole note. A
        // second Escape, once nothing is focused, closes the note; if the
        // note was only being viewed (nothing focused to begin with), the
        // very first Escape closes it, same as the resource preview below.
        const noteOverlay = document.getElementById('note-overlay') as HTMLElement;
        if (!noteOverlay.hidden) {
          const editingNote =
            active instanceof HTMLElement &&
            (active.id === 'note-title-input' || document.getElementById('note-editor-root')!.contains(active));
          if (editingNote) active.blur();
          else void closeNoteEditor();
          return;
        }

        // Every other overlay/modal closes on Escape too, in preference order
        // (innermost/most-recently-opened first) — deliberately not gated on
        // typing state: unlike the note editor above, none of these need a
        // "first Escape blurs, second closes" distinction.
        const overlayCloseHandlers: [string, () => void][] = [
          ['shortcuts-cheatsheet-overlay', closeShortcutsCheatSheet],
          ['classroom-item-detail-overlay', closeClassroomItemDetail],
          ['classroom-connect-overlay', closeClassroomConnectPicker],
          ['classroom-review-overlay', closeClassroomReviewPanel],
          ['drive-review-overlay', closeDriveReviewPanel],
          ['ashoka-review-overlay', closeAshokaImportPanel],
          ['deadline-editor-overlay', closeDeadlineEditor],
          ['course-picker-overlay', closeCoursePicker],
          ['preview-overlay', closePreview],
          ['confirm-overlay', () => resolveConfirm(false)],
        ];
        for (const [id, close] of overlayCloseHandlers) {
          const el = document.getElementById(id) as HTMLElement | null;
          if (el && !el.hidden) {
            close();
            return;
          }
        }
      },
    },
    {
      id: 'preview.zoomIn',
      label: 'Zoom in (image preview)',
      group: 'Preview & notes',
      defaultBinding: 'Ctrl+=',
      when: () => isElementVisible('zoom-controls'),
      run: () => setImageZoom(imageZoom + ZOOM_STEP),
    },
    {
      id: 'preview.zoomOut',
      label: 'Zoom out (image preview)',
      group: 'Preview & notes',
      defaultBinding: 'Ctrl+-',
      when: () => isElementVisible('zoom-controls'),
      run: () => setImageZoom(imageZoom - ZOOM_STEP),
    },
    {
      id: 'preview.zoomReset',
      label: 'Reset zoom (image preview)',
      group: 'Preview & notes',
      defaultBinding: 'Ctrl+0',
      when: () => isElementVisible('zoom-controls'),
      run: () => setImageZoom(1),
    },
    {
      id: 'preview.runOcr',
      label: 'Run OCR (resource preview)',
      group: 'Preview & notes',
      defaultBinding: 'O',
      when: () => isElementVisible('preview-run-ocr'),
      run: () => void runResourceOcr(),
    },
    {
      id: 'preview.openInBrowser',
      label: 'Open in browser (resource preview)',
      group: 'Preview & notes',
      defaultBinding: 'B',
      when: () => !(document.getElementById('preview-overlay') as HTMLElement).hidden && currentPreviewResourceId !== null,
      run: () => {
        if (currentPreviewResourceId === null) return;
        void atlasApi.getResourceBrowserUrl(currentPreviewResourceId).then((url) => atlasApi.openExternalUrl(url));
      },
    },
    {
      id: 'preview.openInDrive',
      label: 'Open in Google Drive (resource preview)',
      group: 'Preview & notes',
      defaultBinding: 'G',
      when: () => isElementVisible('preview-open-in-drive'),
      run: openCurrentPreviewInGoogleDrive,
    },
  ];

  for (const action of actions) shortcutRegistry.register(action);
}

function renderShortcutsCheatSheet(): void {
  const body = document.getElementById('shortcuts-cheatsheet-body')!;
  body.innerHTML = '';
  const groups = new Map<string, ShortcutAction[]>();
  for (const action of shortcutRegistry.all()) {
    if (!groups.has(action.group)) groups.set(action.group, []);
    groups.get(action.group)!.push(action);
  }
  for (const [groupName, groupActions] of groups) {
    const section = document.createElement('div');
    section.className = 'shortcuts-cheatsheet-group';
    const header = document.createElement('h4');
    header.textContent = groupName;
    section.appendChild(header);
    const ul = document.createElement('ul');
    for (const action of groupActions) {
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = action.label;
      const key = document.createElement('span');
      key.className = 'shortcuts-cheatsheet-key';
      key.textContent = shortcutRegistry.primaryBindingFor(action);
      li.appendChild(label);
      li.appendChild(key);
      ul.appendChild(li);
    }
    section.appendChild(ul);
    body.appendChild(section);
  }
}

function openShortcutsCheatSheet(): void {
  renderShortcutsCheatSheet();
  document.getElementById('shortcuts-cheatsheet-overlay')!.hidden = false;
}

function closeShortcutsCheatSheet(): void {
  document.getElementById('shortcuts-cheatsheet-overlay')!.hidden = true;
}

// --- Settings > Shortcuts: the rebinding UI. Deliberately plain (reuses the
// existing .settings-row layout, no new visual language) — real design is
// Phase 6, this exists so a binding can actually be changed at all.

function updateShortcutKeyButtonLabel(button: HTMLButtonElement, action: ShortcutAction): void {
  const binding = shortcutRegistry.primaryBindingFor(action);
  button.textContent = binding || 'Unbound';
  button.classList.toggle('unbound', !binding);
}

// Captures the next keydown (capture phase, so it's seen before the app's
// own shortcut dispatcher — otherwise pressing an already-bound combo while
// choosing a new one would also fire that other action). Esc cancels
// without changing anything; a reserved binding or a conflict with another
// action's current binding is caught before saving, the latter requiring
// an explicit confirm to "steal" it (which unbinds the previous owner
// rather than leaving two actions pointing at the same key).
function beginShortcutCapture(action: ShortcutAction, button: HTMLButtonElement): void {
  button.textContent = 'Press a key…';
  button.classList.add('capturing');

  function cleanup(): void {
    document.removeEventListener('keydown', onKeydown, true);
    button.classList.remove('capturing');
  }

  const onKeydown = async (e: KeyboardEvent): Promise<void> => {
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') {
      cleanup();
      updateShortcutKeyButtonLabel(button, action);
      return;
    }
    // A bare modifier on its own isn't a real binding yet — keep listening
    // rather than capturing "Shift" alone.
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

    const binding = normalizeBinding(e);

    if (RESERVED_BINDINGS.has(binding)) {
      cleanup();
      await showConfirm(`"${binding}" can't be reassigned — it's reserved so text fields always work correctly.`);
      updateShortcutKeyButtonLabel(button, action);
      return;
    }

    const conflicting = shortcutRegistry
      .all()
      .find((other) => other.id !== action.id && shortcutRegistry.primaryBindingFor(other) === binding);
    if (conflicting) {
      cleanup();
      const steal = await showConfirm(
        `"${binding}" is already used by "${conflicting.label}". Reassign it to "${action.label}" instead?`
      );
      if (!steal) {
        updateShortcutKeyButtonLabel(button, action);
        return;
      }
      shortcutOverrides[conflicting.id] = ''; // explicit "unbound" — see shortcuts.ts
    } else {
      cleanup();
    }

    shortcutOverrides[action.id] = binding;
    await saveShortcutOverrides();
    renderSettingsShortcuts();
  };

  document.addEventListener('keydown', onKeydown, true);
}

async function renderSettingsShortcuts(): Promise<void> {
  const container = document.getElementById('settings-shortcuts-list')!;
  container.innerHTML = '';

  const groups = new Map<string, ShortcutAction[]>();
  for (const action of shortcutRegistry.all()) {
    if (!groups.has(action.group)) groups.set(action.group, []);
    groups.get(action.group)!.push(action);
  }

  for (const [groupName, groupActions] of groups) {
    const section = document.createElement('div');
    section.className = 'settings-shortcuts-group';
    const header = document.createElement('h4');
    header.textContent = groupName;
    section.appendChild(header);

    for (const action of groupActions) {
      const row = document.createElement('div');
      row.className = 'settings-row';

      const label = document.createElement('div');
      label.className = 'settings-row-label';
      label.textContent = action.label;
      row.appendChild(label);

      const controls = document.createElement('div');
      controls.className = 'settings-shortcuts-controls';

      const keyButton = document.createElement('button');
      keyButton.type = 'button';
      keyButton.className = 'settings-shortcut-key';
      updateShortcutKeyButtonLabel(keyButton, action);
      keyButton.addEventListener('click', () => beginShortcutCapture(action, keyButton));
      controls.appendChild(keyButton);

      const resetButton = document.createElement('button');
      resetButton.type = 'button';
      resetButton.className = 'settings-shortcut-reset';
      resetButton.title = 'Reset to default';
      resetButton.setAttribute('aria-label', 'Reset to default');
      resetButton.textContent = '↺';
      resetButton.addEventListener('click', async () => {
        delete shortcutOverrides[action.id];
        await saveShortcutOverrides();
        void renderSettingsShortcuts();
      });
      controls.appendChild(resetButton);

      row.appendChild(controls);
      section.appendChild(row);
    }
    container.appendChild(section);
  }
}

registerAppShortcuts();

async function init(): Promise<void> {
  const savedTheme = await atlasApi.getSetting('theme');
  applyTheme(savedTheme === 'light' ? 'light' : 'dark');

  renderAccentSwatches();
  const savedAccentColor = await atlasApi.getSetting('accentColor');
  applyAccentColor(savedAccentColor && ACCENT_COLORS.includes(savedAccentColor) ? savedAccentColor : DEFAULT_ACCENT_COLOR);

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
    const term = (document.getElementById('course-term') as HTMLInputElement).value.trim() || null;
    if (!name) return;

    await atlasApi.createCourse(name, code, term);
    form.reset();
    form.hidden = true;
    await renderCourses();
  });

  document.getElementById('course-view-grid')!.addEventListener('click', () => setCourseViewMode('grid'));
  document.getElementById('course-view-list')!.addEventListener('click', () => setCourseViewMode('list'));
  document.getElementById('toggle-archived-courses')!.addEventListener('click', () => {
    setShowArchivedCourses(!showArchivedCourses);
  });

  document.getElementById('course-detail-back')!.addEventListener('click', backToCourseList);
  document.getElementById('course-detail-edit')!.addEventListener('click', () => {
    if (selectedCourse) openCourseEditModal(selectedCourse);
  });
  document.getElementById('course-edit-close')!.addEventListener('click', closeCourseEditModal);
  document.getElementById('shortcuts-cheatsheet-close')!.addEventListener('click', closeShortcutsCheatSheet);
  document.getElementById('shortcuts-cheatsheet-overlay')!.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeShortcutsCheatSheet();
  });
  document.getElementById('course-edit-overlay')!.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeCourseEditModal();
  });
  document.getElementById('course-edit-form')!.addEventListener('keydown', (e) => {
    // Escape closes the modal even with focus in a text field — same reason
    // course-picker-search needs its own listener: the global Escape handler
    // skips text fields entirely.
    if (e.key === 'Escape') closeCourseEditModal();
  });
  document.getElementById('course-edit-form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (editingCourseId === null) return;
    const name = (document.getElementById('course-edit-name') as HTMLInputElement).value.trim();
    if (!name) return;
    const code = (document.getElementById('course-edit-code') as HTMLInputElement).value.trim() || null;
    const term = (document.getElementById('course-edit-term') as HTMLInputElement).value.trim() || null;
    const courseId = editingCourseId;
    const updated = await atlasApi.updateCourse(courseId, name, code, term);
    closeCourseEditModal();
    await renderCourses();
    if (selectedCourse && selectedCourse.id === courseId) await selectCourse(updated);
  });
  atlasApi.onCourseContextMenuEdit((courseId) => {
    void openCourseEditModalById(courseId);
  });

  document.getElementById('course-detail-export-context')!.addEventListener('click', () => {
    void exportSelectedCourseContext();
  });
  document.getElementById('course-detail-archive-toggle')!.addEventListener('click', () => {
    void toggleSelectedCourseArchived();
  });
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
  document.getElementById('course-detail-view-deadlines')!.addEventListener('click', () => {
    setCourseDetailTab('deadlines');
  });

  document.getElementById('upload-button')!.addEventListener('click', () => openCoursePicker('upload'));

  document.querySelectorAll<HTMLButtonElement>('.course-detail-tab').forEach((button) => {
    button.addEventListener('click', () => setCourseDetailTab(button.dataset.courseTab!));
  });

  document.getElementById('course-classroom-connect')!.addEventListener('click', () => void openClassroomConnectPicker());
  document.getElementById('course-classroom-disconnect')!.addEventListener('click', () => void disconnectCourseClassroomClicked());
  document.getElementById('classroom-connect-close')!.addEventListener('click', closeClassroomConnectPicker);
  document.getElementById('classroom-connect-confirm')!.addEventListener('click', () => void confirmClassroomConnect());
  document.getElementById('classroom-item-detail-close')!.addEventListener('click', closeClassroomItemDetail);
  document.getElementById('classroom-item-detail-overlay')!.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeClassroomItemDetail();
  });

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
  const dashboardCourseFilter = document.getElementById('dashboard-course-filter')!;
  const dashboardCourseFilterTrigger = document.getElementById('dashboard-course-filter-trigger')!;
  const dashboardCourseFilterMenu = document.getElementById('dashboard-course-filter-menu')!;
  dashboardCourseFilterTrigger.addEventListener('click', () => {
    const isOpen = !dashboardCourseFilterMenu.hidden;
    dashboardCourseFilterMenu.hidden = isOpen;
    dashboardCourseFilter.classList.toggle('open', !isOpen);
    dashboardCourseFilterTrigger.setAttribute('aria-expanded', String(!isOpen));
  });
  dashboardCourseFilterMenu.addEventListener('click', (event) => {
    const option = (event.target as HTMLElement).closest<HTMLButtonElement>('.dselect-option');
    if (!option) return;
    dashboardCourseFilterId = option.dataset.courseId ? Number(option.dataset.courseId) : null;
    dashboardCourseFilterMenu.hidden = true;
    dashboardCourseFilter.classList.remove('open');
    dashboardCourseFilterTrigger.setAttribute('aria-expanded', 'false');
    void renderDashboard();
  });
  document.addEventListener('click', (event) => {
    if (dashboardCourseFilter.contains(event.target as Node)) return;
    dashboardCourseFilterMenu.hidden = true;
    dashboardCourseFilter.classList.remove('open');
    dashboardCourseFilterTrigger.setAttribute('aria-expanded', 'false');
  });
  document.getElementById('dashboard-view-calendar')!.addEventListener('click', () => showPage('calendar'));
  document.getElementById('dashboard-view-notes')!.addEventListener('click', () => showPage('notes'));

  document.getElementById('calendar-prev-month')!.addEventListener('click', () => changeCalendarMonth(-1));
  document.getElementById('calendar-next-month')!.addEventListener('click', () => changeCalendarMonth(1));
  document.getElementById('calendar-today')!.addEventListener('click', goToCalendarToday);

  document.getElementById('settings-theme-dark')!.addEventListener('click', () => setTheme('dark'));
  document.getElementById('settings-theme-light')!.addEventListener('click', () => setTheme('light'));

  document.getElementById('settings-shortcuts-reset-all')!.addEventListener('click', async () => {
    if (!(await showConfirm('Reset every keyboard shortcut back to its default binding?'))) return;
    shortcutOverrides = {};
    await saveShortcutOverrides();
    void renderSettingsShortcuts();
  });

  document.querySelectorAll<HTMLButtonElement>('.settings-nav-item').forEach((button) => {
    button.addEventListener('click', () => setSettingsTab(button.dataset.settingsTab!));
  });

  // Sidebar nav: genuine page switching (see showPage()) — exactly one
  // page visible at a time. "Search" isn't a page; it just focuses the
  // floating search box over whichever page is currently shown.
  document.querySelectorAll<HTMLButtonElement>('.sidebar-nav-item[data-page]').forEach((button) => {
    button.addEventListener('click', () => showPage(button.dataset.page as AppPage));
  });
  document.getElementById('manage-courses-button')!.addEventListener('click', () => showPage('courses'));
  document.getElementById('dashboard-deadline-signal')!.addEventListener('click', () => showPage('calendar'));
  document.getElementById('dashboard-resource-signal')!.addEventListener('click', () => showPage('resources'));
  document.getElementById('dashboard-note-signal')!.addEventListener('click', () => showPage('notes'));

  document.getElementById('sync-config-drive')!.addEventListener('change', (e) => {
    void atlasApi.setSyncConfig('drive', (e.target as HTMLSelectElement).value).then(renderSyncStatus);
  });
  document.getElementById('sync-config-classroom')!.addEventListener('change', (e) => {
    void atlasApi.setSyncConfig('classroom', (e.target as HTMLSelectElement).value).then(renderSyncStatus);
  });
  document.getElementById('sync-now-drive')!.addEventListener('click', () => void syncSourceNowClicked('drive'));
  document
    .getElementById('sync-now-classroom')!
    .addEventListener('click', () => void syncSourceNowClicked('classroom'));
  document.getElementById('sync-now-all')!.addEventListener('click', () => void syncAllNowClicked());

  document.getElementById('drive-connect-button')!.addEventListener('click', connectDrive);
  document.getElementById('drive-disconnect-button')!.addEventListener('click', disconnectDrive);
  document
    .getElementById('drive-clear-preview-cache-button')!
    .addEventListener('click', () => void clearDrivePreviewCache());
  document.getElementById('drive-folder-save')!.addEventListener('click', saveDriveFolder);
  document.getElementById('drive-review-button')!.addEventListener('click', openDriveReviewPanel);
  document.getElementById('drive-review-close')!.addEventListener('click', closeDriveReviewPanel);
  document.getElementById('drive-review-select-all')!.addEventListener('click', toggleDriveReviewSelectAll);
  document.getElementById('drive-review-bulk-import')!.addEventListener('click', importSelectedDriveFiles);
  document.getElementById('drive-review-bulk-ignore')!.addEventListener('click', ignoreSelectedDriveFiles);
  atlasApi.onDriveChanged(() => void renderDrivePendingStatus());

  document.getElementById('classroom-connect-button')!.addEventListener('click', connectClassroom);
  document.getElementById('classroom-disconnect-button')!.addEventListener('click', disconnectClassroom);
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

  document.getElementById('new-note-button')!.addEventListener('click', () => openCoursePicker('note'));
  document.getElementById('import-scan-button')!.addEventListener('click', () => openCoursePicker('scan'));
  document.getElementById('toggle-agent-notes')!.addEventListener('click', () => setShowOnlyAgentNotes(!showOnlyAgentNotes));

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
  document.getElementById('note-assign-course')!.addEventListener('click', () => {
    if (currentNoteId !== null) openAssignNoteCoursePicker(currentNoteId);
  });

  // Quick capture (Ctrl+Shift+N, global — see main.ts's globalShortcut
  // registration): the note already exists by the time this fires (created
  // in the main process so it exists even if the window wasn't open yet),
  // this just opens it for editing immediately.
  atlasApi.onQuickCaptureNote((note) => {
    void openNoteEditor(note).then(() => {
      currentNoteIsFreshCreation = true;
    });
  });

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

  document.getElementById('preview-open-in-drive')!.addEventListener('click', openCurrentPreviewInGoogleDrive);
  atlasApi.onResourceDriveOpenStart((resourceId) => {
    if (resourceId !== currentPreviewResourceId) return;
    (document.getElementById('preview-open-in-drive') as HTMLButtonElement).disabled = true;
    document.getElementById('preview-drive-status')!.textContent = 'Uploading…';
  });
  atlasApi.onResourceDriveOpenSuccess((resourceId) => {
    if (resourceId !== currentPreviewResourceId) return;
    (document.getElementById('preview-open-in-drive') as HTMLButtonElement).disabled = false;
    document.getElementById('preview-drive-status')!.textContent = 'Opened in Google Drive.';
  });
  atlasApi.onResourceDriveOpenError((resourceId, error) => {
    if (resourceId !== currentPreviewResourceId) return;
    (document.getElementById('preview-open-in-drive') as HTMLButtonElement).disabled = false;
    document.getElementById('preview-drive-status')!.textContent = error;
  });

  atlasApi.onExtractionBackfillProgress((progress) => {
    const el = document.getElementById('extraction-status');
    if (!el) return;
    if (progress.total === 0) {
      el.textContent = '';
    } else if (progress.done < progress.total) {
      el.textContent = `Reading your existing files… ${progress.done} of ${progress.total}`;
    } else {
      el.textContent = `Done — ${progress.total} file${progress.total === 1 ? '' : 's'} read.`;
    }
  });
  void loadShortcutOverrides();
  document.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    const isTyping =
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement ||
      (active instanceof HTMLElement && active.isContentEditable);
    const hasModifier = e.ctrlKey || e.metaKey || e.altKey;

    // A bare, unmodified key (no Ctrl/Alt) must stay typeable in any text
    // field — Escape is the one exception, since it always needs to reach
    // its own action below regardless of what's focused (that action's own
    // run() decides what "typing" means for its two-stage note-editor case).
    if (isTyping && !hasModifier && e.key !== 'Escape') return;

    shortcutRegistry.dispatch(e);
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

  atlasApi.onCourseContextMenuToggleArchive(async (courseId, archived) => {
    await atlasApi.setCourseArchived(courseId, archived);
    if (selectedCourse && selectedCourse.id === courseId) backToCourseList();
    await renderCourses();
  });

  const newDeadlineButton = document.getElementById('new-deadline-button') as HTMLButtonElement;
  newDeadlineButton.addEventListener('click', () => openDeadlineEditForm(null));

  document.getElementById('deadline-edit-button')!.addEventListener('click', () => {
    if (currentViewingDeadline) openDeadlineEditForm(currentViewingDeadline);
  });
  document.getElementById('deadline-reset-override-button')!.addEventListener('click', () => {
    void resetCurrentDeadlineOverrides();
  });
  document.getElementById('deadline-view-close')!.addEventListener('click', closeDeadlineEditor);
  document.getElementById('deadline-view-close-footer')!.addEventListener('click', closeDeadlineEditor);
  document.getElementById('deadline-edit-close')!.addEventListener('click', closeDeadlineEditor);
  document.getElementById('deadline-edit-view-button')!.addEventListener('click', () => {
    if (currentViewingDeadline) void openDeadlineViewer(currentViewingDeadline);
  });
  document.getElementById('deadline-cancel-button')!.addEventListener('click', closeDeadlineEditor);

  const kindSelect = document.getElementById('deadline-kind-select')!;
  const kindTrigger = document.getElementById('deadline-kind-trigger')!;
  const kindMenu = document.getElementById('deadline-kind-menu')!;
  const closeKindSelect = () => {
    kindMenu.hidden = true;
    kindSelect.classList.remove('open');
    kindTrigger.setAttribute('aria-expanded', 'false');
  };
  kindTrigger.addEventListener('click', () => {
    const isOpen = !kindMenu.hidden;
    kindMenu.hidden = isOpen;
    kindSelect.classList.toggle('open', !isOpen);
    kindTrigger.setAttribute('aria-expanded', String(!isOpen));
  });
  kindMenu.addEventListener('click', (event) => {
    const option = (event.target as HTMLElement).closest<HTMLButtonElement>('.dselect-option');
    if (!option?.dataset.value) return;
    setDeadlineKind(option.dataset.value);
    closeKindSelect();
  });

  const dueSelect = document.getElementById('deadline-due-select')!;
  const dueTrigger = document.getElementById('deadline-due-trigger')!;
  const dueMenu = document.getElementById('deadline-due-menu')!;
  const dueDateInput = document.getElementById('deadline-due-date') as HTMLInputElement;
  const dueTimeInput = document.getElementById('deadline-due-time') as HTMLInputElement;
  const dueError = document.getElementById('deadline-due-error')!;
  const closeDueSelect = () => {
    dueMenu.hidden = true;
    dueSelect.classList.remove('open');
    dueTrigger.setAttribute('aria-expanded', 'false');
  };
  const applyDueSelection = (): string | null => {
    const parsed = parseDeadlineDue(dueDateInput.value, dueTimeInput.value);
    if (parsed.error) {
      dueError.textContent = parsed.error;
      dueError.hidden = false;
      return null;
    }
    dueError.hidden = true;
    setDeadlineDueLabel();
    return parsed.dueAt;
  };
  dueTrigger.addEventListener('click', () => {
    const isOpen = !dueMenu.hidden;
    dueMenu.hidden = isOpen;
    dueSelect.classList.toggle('open', !isOpen);
    dueTrigger.setAttribute('aria-expanded', String(!isOpen));
  });
  document.getElementById('deadline-due-apply')!.addEventListener('click', () => {
    if (applyDueSelection() !== null || (!dueDateInput.value.trim() && !dueTimeInput.value.trim())) closeDueSelect();
  });
  document.getElementById('deadline-due-clear')!.addEventListener('click', () => {
    dueDateInput.value = '';
    dueTimeInput.value = '';
    dueError.hidden = true;
    setDeadlineDueLabel();
    closeDueSelect();
  });
  document.addEventListener('click', (event) => {
    const target = event.target as Node;
    if (!kindSelect.contains(target)) closeKindSelect();
    if (!dueSelect.contains(target)) closeDueSelect();
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

    const kind = (document.getElementById('deadline-edit-kind') as HTMLInputElement).value;
    const parsedDue = parseDeadlineDue(dueDateInput.value, dueTimeInput.value);
    if (parsedDue.error) {
      dueError.textContent = parsedDue.error;
      dueError.hidden = false;
      return;
    }
    const dueAt = parsedDue.dueAt;
    const description = descriptionTextarea.value.trim() || null;

    const saved =
      currentEditingDeadlineId === null
        ? await atlasApi.createDeadline(selectedCourse.id, title, kind, dueAt, description)
        : await atlasApi.updateDeadline(currentEditingDeadlineId, title, kind, dueAt, description);

    // Reopen showing the saved result instead of just closing (which used
    // to leave the user with no visible confirmation at all — no new date,
    // no "you've edited this" marker, nothing — until they reopened the
    // deadline by hand). This is what actually caused "I clicked reset and
    // nothing happened": the view they were looking at right after saving
    // was already stale/closed, not the reset itself failing.
    await openDeadlineViewer(saved);
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
