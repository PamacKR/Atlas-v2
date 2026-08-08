import { contextBridge, ipcRenderer } from 'electron';

// Sync configuration (open-questions.md #2) — one entry per source
// ('drive'/'classroom'), keyed the same as sync:getStatus's return shape.
export interface SyncSourceStatus {
  mode: 'off' | 'launch' | 'interval';
  intervalSeconds: number;
  lastSuccess: string | null;
  lastError: string | null;
  authRequired: boolean;
}
export type SyncStatus = Record<'drive' | 'classroom', SyncSourceStatus>;

export type AtlasChangeEntity = 'course' | 'resource' | 'note' | 'deadline' | 'sync';
export type AtlasChangeAction = 'created' | 'updated' | 'deleted';

export interface AtlasChange {
  entity: AtlasChangeEntity;
  action: AtlasChangeAction;
  id: number;
  courseId?: number | null;
}

export interface Course {
  id: number;
  name: string;
  code: string | null;
  term: string | null;
  folder_name: string;
  archived: number;
  created_at: string;
}

export interface Resource {
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
}

export interface ExtractionBackfillProgress {
  done: number;
  total: number;
}

export interface WatchedFolder {
  id: number;
  course_id: number;
  folder_path: string;
  created_at: string;
}

export type Preview =
  | { type: 'pdf'; data: Uint8Array }
  | { type: 'image'; url: string; zoomLevel: number | null }
  | { type: 'html'; html: string; note?: string }
  | { type: 'text'; text: string }
  | { type: 'link'; url: string }
  | { type: 'unsupported'; reason?: string };

export interface Note {
  id: number;
  course_id: number;
  title: string;
  content_markdown: string;
  is_handwritten: number;
  image_path: string | null;
  ocr_text: string | null;
  generated_by_agent: number;
  created_at: string;
  updated_at: string;
}

export interface Deadline {
  id: number;
  course_id: number;
  title: string;
  kind: string;
  due_at: string | null;
  completed: number;
  source: string;
  description: string | null;
  classroom_coursework_id: string | null;
  local_overrides: string | null;
  classroom_title: string | null;
  classroom_due_at: string | null;
  classroom_removed: number;
}

export interface NoteOcrProgress {
  noteId: number;
  page: number;
  totalPages: number;
}

export interface ResourceOcrProgress {
  resourceId: number;
  page: number;
  totalPages: number;
}

export interface SearchResult {
  entityType: 'note' | 'resource' | 'announcement' | 'assignment';
  entityId: number;
  courseId: number;
  title: string;
  courseName: string;
  snippet: string;
}

export interface DashboardDeadline extends Deadline {
  course_name: string;
}

export interface DashboardResource extends Resource {
  course_name: string;
}

export interface DashboardActivityItem {
  id: number;
  course_id: number;
  title: string;
  timestamp: string;
  entity_type: 'resource' | 'note';
  course_name: string;
}

export interface DashboardAnnouncement {
  id: number;
  course_id: number;
  title: string;
  posted_at: string;
  course_name: string;
}

export interface DashboardStats {
  courseCount: number;
  resourceCount: number;
  noteCount: number;
  upcomingDeadlineCount: number;
}

export interface CourseSummary extends Course {
  resource_count: number;
  deadline_count: number;
  note_count: number;
}

export interface ResourceWithCourse extends Resource {
  course_name: string;
}

export interface NoteWithCourse extends Note {
  course_name: string;
}

export interface DriveFolder {
  id: string;
  name: string;
}

export interface DrivePendingFile {
  id: number;
  drive_file_id: string;
  name: string;
  mime_type: string;
  modified_time: string | null;
  detected_at: string;
}

export interface ClassroomPendingCourse {
  id: number;
  classroom_course_id: string;
  name: string;
  section: string | null;
  suggested_course_id: number | null;
  detected_at: string;
}

export interface ClassroomSyncError {
  courseId: number;
  courseName: string;
  message: string;
}

export interface ClassroomLinkableCourse {
  classroom_course_id: string;
  name: string;
  section: string | null;
}

export interface ClassroomContentLink {
  id: number;
  title: string;
  file_path: string;
}

export interface ClassroomCourseContent {
  announcements: { id: number; title: string; body: string | null; posted_at: string }[];
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

export interface AshokaCourseCandidate {
  code: string;
  title: string;
  category: string | null;
  faculty: string | null;
  credits: number | null;
  description: string | null;
}

contextBridge.exposeInMainWorld('atlas', {
  listCourses: (): Promise<Course[]> => ipcRenderer.invoke('courses:list'),
  createCourse: (name: string, code: string | null, term: string | null): Promise<Course> =>
    ipcRenderer.invoke('courses:create', name, code, term),
  setCourseArchived: (courseId: number, archived: boolean): Promise<Course> =>
    ipcRenderer.invoke('courses:setArchived', courseId, archived),
  updateCourse: (courseId: number, name: string, code: string | null, term: string | null): Promise<Course> =>
    ipcRenderer.invoke('courses:update', courseId, name, code, term),
  onCourseContextMenuEdit: (handler: (courseId: number) => void): void => {
    ipcRenderer.on('resources:courseContextMenuEdit', (_event, courseId: number) => handler(courseId));
  },
  exportCourseContext: (courseId: number): Promise<{ ok: true; filePath: string } | { ok: false; error: string }> =>
    ipcRenderer.invoke('courses:exportContext', courseId),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  windowControls: {
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: (): Promise<boolean> => ipcRenderer.invoke('window:toggleMaximize'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close'),
    onMaximizedChanged: (handler: (isMaximized: boolean) => void): void => {
      ipcRenderer.on('window:maximizedChanged', (_event, isMaximized: boolean) => handler(isMaximized));
    },
  },
  getSetting: (key: string): Promise<string | null> => ipcRenderer.invoke('app:getSetting', key),
  setSetting: (key: string, value: string): Promise<void> => ipcRenderer.invoke('app:setSetting', key, value),
  getStorageStatus: (): Promise<unknown> => ipcRenderer.invoke('settings:getStorageStatus'),
  createBackup: (): Promise<unknown> => ipcRenderer.invoke('settings:createBackup'),
  deleteBackup: (name: string): Promise<void> => ipcRenderer.invoke('settings:deleteBackup', name),
  deleteAllBackups: (): Promise<void> => ipcRenderer.invoke('settings:deleteAllBackups'),
  setBackupFrequency: (frequency: 'daily' | 'weekly' | 'off'): Promise<void> => ipcRenderer.invoke('settings:setBackupFrequency', frequency),
  isDriveConnected: (): Promise<boolean> => ipcRenderer.invoke('google:isDriveConnected'),
  connectDrive: (): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('google:connectDrive'),
  disconnectDrive: (): Promise<void> => ipcRenderer.invoke('google:disconnectDrive'),
  clearDrivePreviewCache: (): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('google:clearDrivePreviewCache'),
  getSyncStatus: (): Promise<SyncStatus> => ipcRenderer.invoke('sync:getStatus'),
  onSyncStatusChanged: (handler: (source: 'drive' | 'classroom') => void): void => {
    ipcRenderer.on('sync:statusChanged', (_event, source: 'drive' | 'classroom') => handler(source));
  },
  setSyncConfig: (source: 'drive' | 'classroom', value: string): Promise<void> =>
    ipcRenderer.invoke('sync:setConfig', source, value),
  syncNow: (source: 'drive' | 'classroom'): Promise<void> => ipcRenderer.invoke('sync:now', source),
  syncAllNow: (): Promise<void> => ipcRenderer.invoke('sync:nowAll'),
  getDriveFolder: (): Promise<DriveFolder | null> => ipcRenderer.invoke('google:getDriveFolder'),
  setDriveFolder: (link: string): Promise<{ ok: true; name: string } | { ok: false; error: string }> =>
    ipcRenderer.invoke('google:setDriveFolder', link),
  listPendingDriveFiles: (): Promise<DrivePendingFile[]> =>
    ipcRenderer.invoke('google:listPendingDriveFiles'),
  importDriveFile: (
    driveFileId: string,
    name: string,
    courseId: number,
    importAs: 'resource' | 'note'
  ): Promise<unknown> => ipcRenderer.invoke('google:importDriveFile', driveFileId, name, courseId, importAs),
  ignoreDriveFile: (driveFileId: string): Promise<void> => ipcRenderer.invoke('google:ignoreDriveFile', driveFileId),
  onDriveChanged: (handler: () => void): void => {
    ipcRenderer.on('google:driveChanged', () => handler());
  },
  isClassroomConnected: (): Promise<boolean> => ipcRenderer.invoke('classroom:isConnected'),
  connectClassroom: (): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('classroom:connect'),
  disconnectClassroom: (): Promise<void> => ipcRenderer.invoke('classroom:disconnect'),
  listPendingClassroomCourses: (): Promise<ClassroomPendingCourse[]> =>
    ipcRenderer.invoke('classroom:listPendingCourses'),
  ignorePendingClassroomCourse: (classroomCourseId: string): Promise<void> =>
    ipcRenderer.invoke('classroom:ignorePendingCourse', classroomCourseId),
  mapClassroomCourseToExisting: (
    classroomCourseId: string,
    atlasCourseId: number
  ): Promise<{ errors: ClassroomSyncError[] }> =>
    ipcRenderer.invoke('classroom:mapCourseToExisting', classroomCourseId, atlasCourseId),
  mapClassroomCourseToNew: (
    classroomCourseId: string,
    name: string,
    code: string | null,
    term: string | null
  ): Promise<{ course: Course; errors: ClassroomSyncError[] }> =>
    ipcRenderer.invoke('classroom:mapCourseToNew', classroomCourseId, name, code, term),
  onClassroomChanged: (handler: () => void): void => {
    ipcRenderer.on('classroom:changed', () => handler());
  },
  onAtlasChanged: (handler: (change: AtlasChange) => void): void => {
    ipcRenderer.on('atlas:changed', (_event, change: AtlasChange) => handler(change));
  },
  listAvailableClassroomCoursesForLinking: (): Promise<ClassroomLinkableCourse[]> =>
    ipcRenderer.invoke('classroom:listAvailableCoursesForLinking'),
  connectCourseToClassroom: (
    atlasCourseId: number,
    classroomCourseId: string
  ): Promise<{ errors: ClassroomSyncError[] }> =>
    ipcRenderer.invoke('classroom:connectCourseToClassroom', atlasCourseId, classroomCourseId),
  disconnectCourseFromClassroom: (atlasCourseId: number): Promise<void> =>
    ipcRenderer.invoke('classroom:disconnectCourse', atlasCourseId),
  openExternalUrl: (url: string): Promise<void> => ipcRenderer.invoke('app:openExternalUrl', url),
  getClassroomCourseContent: (courseId: number): Promise<ClassroomCourseContent> =>
    ipcRenderer.invoke('classroom:getCourseContent', courseId),
  getAshokaDbPath: (): Promise<string | null> => ipcRenderer.invoke('ashoka:getDbPath'),
  pickAshokaDbPath: (): Promise<{ ok: true } | { ok: false; error: string | null }> =>
    ipcRenderer.invoke('ashoka:pickDbPath'),
  listSecuredAshokaCourses: (): Promise<AshokaCourseCandidate[]> =>
    ipcRenderer.invoke('ashoka:listSecuredCourses'),
  getAshokaSemesterHint: (): Promise<string | null> => ipcRenderer.invoke('ashoka:getSemesterHint'),
  importAshokaCourses: (
    candidates: AshokaCourseCandidate[],
    term: string
  ): Promise<{ created: Course[]; skipped: number }> => ipcRenderer.invoke('ashoka:importCourses', candidates, term),
  getResourceBrowserUrl: (resourceId: number): Promise<string> =>
    ipcRenderer.invoke('resources:browserUrl', resourceId),
  listResources: (courseId: number): Promise<Resource[]> =>
    ipcRenderer.invoke('resources:listByCourse', courseId),
  getCourseReadiness: (courseId: number): Promise<unknown> => ipcRenderer.invoke('courses:getReadiness', courseId),
  uploadResource: (courseId: number): Promise<Resource | null> =>
    ipcRenderer.invoke('resources:upload', courseId),
  uploadResourceBuffer: (courseId: number, filename: string, buffer: ArrayBuffer): Promise<Resource | null> =>
    ipcRenderer.invoke('resources:uploadBuffer', courseId, filename, buffer),
  deleteCourse: (courseId: number): Promise<void> => ipcRenderer.invoke('courses:delete', courseId),
  deleteResource: (resourceId: number): Promise<void> =>
    ipcRenderer.invoke('resources:delete', resourceId),
  getPreview: (resourceId: number): Promise<Preview> => ipcRenderer.invoke('resources:getPreview', resourceId),
  setResourceZoom: (resourceId: number, zoom: number): Promise<void> =>
    ipcRenderer.invoke('resources:setZoom', resourceId, zoom),
  runResourceOcr: (resourceId: number): Promise<string | null> =>
    ipcRenderer.invoke('resources:runOcr', resourceId),
  saveResourceOcrText: (resourceId: number, text: string): Promise<void> =>
    ipcRenderer.invoke('resources:saveOcrText', resourceId, text),
  retryResourceExtraction: (resourceId: number): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('resources:retryExtraction', resourceId),
  onExtractionUpdated: (handler: (resourceId: number) => void): void => {
    ipcRenderer.on('resources:extractionUpdated', (_event, resourceId: number) => handler(resourceId));
  },
  onResourceOcrProgress: (handler: (progress: ResourceOcrProgress) => void): void => {
    ipcRenderer.on('resources:ocrProgress', (_event, progress: ResourceOcrProgress) => handler(progress));
  },
  openResourceInGoogleDrive: (resourceId: number): Promise<void> =>
    ipcRenderer.invoke('resources:openInGoogleDrive', resourceId),
  onExtractionBackfillProgress: (handler: (progress: ExtractionBackfillProgress) => void): void => {
    ipcRenderer.on('extraction:backfillProgress', (_event, progress: ExtractionBackfillProgress) => handler(progress));
  },
  onResourceDriveOpenStart: (handler: (resourceId: number) => void): void => {
    ipcRenderer.on('resources:driveOpenStart', (_event, resourceId: number) => handler(resourceId));
  },
  onResourceDriveOpenSuccess: (handler: (resourceId: number) => void): void => {
    ipcRenderer.on('resources:driveOpenSuccess', (_event, resourceId: number) => handler(resourceId));
  },
  onResourceDriveOpenError: (handler: (resourceId: number, error: string) => void): void => {
    ipcRenderer.on('resources:driveOpenError', (_event, resourceId: number, error: string) =>
      handler(resourceId, error)
    );
  },
  showResourceContextMenu: (resourceId: number): void =>
    ipcRenderer.send('resources:contextMenu', resourceId),
  onContextMenuDelete: (handler: (resourceId: number) => void): void => {
    ipcRenderer.on('resources:contextMenuDelete', (_event, resourceId: number) => handler(resourceId));
  },
  showCourseContextMenu: (courseId: number): void =>
    ipcRenderer.send('resources:courseContextMenu', courseId),
  onCourseContextMenuDelete: (handler: (courseId: number) => void): void => {
    ipcRenderer.on('resources:courseContextMenuDelete', (_event, courseId: number) => handler(courseId));
  },
  onCourseContextMenuToggleArchive: (handler: (courseId: number, archived: boolean) => void): void => {
    ipcRenderer.on('resources:courseContextMenuToggleArchive', (_event, courseId: number, archived: boolean) =>
      handler(courseId, archived)
    );
  },
  listWatchedFolders: (courseId: number): Promise<WatchedFolder[]> =>
    ipcRenderer.invoke('folders:listWatched', courseId),
  addWatchedFolder: (courseId: number): Promise<WatchedFolder | null> =>
    ipcRenderer.invoke('folders:add', courseId),
  removeWatchedFolder: (folderId: number): Promise<void> => ipcRenderer.invoke('folders:remove', folderId),
  showFolderContextMenu: (folderId: number): void => ipcRenderer.send('folders:contextMenu', folderId),
  onFolderContextMenuRemove: (handler: (folderId: number) => void): void => {
    ipcRenderer.on('folders:contextMenuRemove', (_event, folderId: number) => handler(folderId));
  },
  listNotes: (courseId: number): Promise<Note[]> => ipcRenderer.invoke('notes:listByCourse', courseId),
  createNote: (courseId: number): Promise<Note> => ipcRenderer.invoke('notes:create', courseId),
  createUnsortedNote: (): Promise<Note> => ipcRenderer.invoke('notes:createUnsorted'),
  assignNoteCourse: (noteId: number, courseId: number): Promise<Note> =>
    ipcRenderer.invoke('notes:assignCourse', noteId, courseId),
  onQuickCaptureNote: (handler: (note: Note) => void): void => {
    ipcRenderer.on('notes:quickCapture', (_event, note: Note) => handler(note));
  },
  updateNoteContent: (noteId: number, contentMarkdown: string): Promise<{ title: string | null } | null> =>
    ipcRenderer.invoke('notes:updateContent', noteId, contentMarkdown),
  updateNoteTitle: (noteId: number, title: string): Promise<void> =>
    ipcRenderer.invoke('notes:updateTitle', noteId, title),
  deleteNote: (noteId: number): Promise<void> => ipcRenderer.invoke('notes:delete', noteId),
  showNoteContextMenu: (noteId: number): void => ipcRenderer.send('notes:contextMenu', noteId),
  onNoteContextMenuDelete: (handler: (noteId: number) => void): void => {
    ipcRenderer.on('notes:contextMenuDelete', (_event, noteId: number) => handler(noteId));
  },
  getNoteBrowserUrl: (noteId: number): Promise<string> => ipcRenderer.invoke('notes:browserUrl', noteId),
  saveNoteImage: (courseId: number, buffer: ArrayBuffer, extension: string): Promise<string> =>
    ipcRenderer.invoke('notes:saveImage', courseId, buffer, extension),
  getNoteScanPreview: (noteId: number): Promise<Preview | null> =>
    ipcRenderer.invoke('notes:getScanPreview', noteId),
  importScan: (courseId: number): Promise<Note[]> => ipcRenderer.invoke('notes:importScan', courseId),
  importScanBuffer: (courseId: number, filename: string, buffer: ArrayBuffer): Promise<Note | null> =>
    ipcRenderer.invoke('notes:importScanBuffer', courseId, filename, buffer),
  runNoteOcr: (noteId: number): Promise<string | null> => ipcRenderer.invoke('notes:runOcr', noteId),
  onNoteOcrProgress: (handler: (progress: NoteOcrProgress) => void): void => {
    ipcRenderer.on('notes:ocrProgress', (_event, progress: NoteOcrProgress) => handler(progress));
  },
  search: (query: string): Promise<SearchResult[]> => ipcRenderer.invoke('search:query', query),
  listDeadlines: (courseId: number): Promise<Deadline[]> =>
    ipcRenderer.invoke('deadlines:listByCourse', courseId),
  createDeadline: (
    courseId: number,
    title: string,
    kind: string,
    dueAt: string | null,
    description: string | null
  ): Promise<Deadline> => ipcRenderer.invoke('deadlines:create', courseId, title, kind, dueAt, description),
  updateDeadline: (
    deadlineId: number,
    title: string,
    kind: string,
    dueAt: string | null,
    description: string | null
  ): Promise<Deadline> =>
    ipcRenderer.invoke('deadlines:update', deadlineId, title, kind, dueAt, description),
  setDeadlineCompleted: (deadlineId: number, completed: boolean): Promise<void> =>
    ipcRenderer.invoke('deadlines:setCompleted', deadlineId, completed),
  resetDeadlineClassroomOverrides: (deadlineId: number): Promise<Deadline> =>
    ipcRenderer.invoke('deadlines:resetClassroomOverrides', deadlineId),
  deleteDeadline: (deadlineId: number): Promise<void> => ipcRenderer.invoke('deadlines:delete', deadlineId),
  showDeadlineContextMenu: (deadlineId: number): void => ipcRenderer.send('deadlines:contextMenu', deadlineId),
  onDeadlineContextMenuDelete: (handler: (deadlineId: number) => void): void => {
    ipcRenderer.on('deadlines:contextMenuDelete', (_event, deadlineId: number) => handler(deadlineId));
  },
  getDashboardStats: (): Promise<DashboardStats> => ipcRenderer.invoke('dashboard:stats'),
  getUpcomingDeadlines: (): Promise<DashboardDeadline[]> => ipcRenderer.invoke('dashboard:upcomingDeadlines'),
  listAllDeadlinesWithCourse: (): Promise<DashboardDeadline[]> =>
    ipcRenderer.invoke('deadlines:listAllWithCourse'),
  listAllAnnouncementsWithCourse: (): Promise<DashboardAnnouncement[]> =>
    ipcRenderer.invoke('announcements:listAllWithCourse'),
  getRecentResources: (): Promise<DashboardResource[]> => ipcRenderer.invoke('dashboard:recentResources'),
  getRecentActivity: (): Promise<DashboardActivityItem[]> => ipcRenderer.invoke('dashboard:recentActivity'),
  getRecentAnnouncements: (): Promise<DashboardAnnouncement[]> => ipcRenderer.invoke('dashboard:recentAnnouncements'),
  getNewClassroomItems: (courseId: number | null = null) =>
    ipcRenderer.invoke('dashboard:newClassroomItems', courseId),
  clearNewClassroomItem: (itemType: 'announcement' | 'assignment', itemId: number) =>
    ipcRenderer.invoke('dashboard:clearNewClassroomItem', itemType, itemId),
  clearAllNewClassroomItems: (courseId: number | null = null) =>
    ipcRenderer.invoke('dashboard:clearAllNewClassroomItems', courseId),
  pinDashboardAnnouncement: (announcementId: number) =>
    ipcRenderer.invoke('dashboard:pinAnnouncement', announcementId),
  unpinDashboardAnnouncement: (announcementId: number) =>
    ipcRenderer.invoke('dashboard:unpinAnnouncement', announcementId),
  seedDashboardV2TestItems: (): Promise<number> => ipcRenderer.invoke('test:seedDashboardV2Items'),
  seedResourcesFilterTestItems: (): Promise<number> => ipcRenderer.invoke('test:seedResourcesFilterItems'),
  seedCourseReadinessTestItems: (): Promise<number> => ipcRenderer.invoke('test:seedCourseReadinessItems'),
  getCourseSummaries: (archived = false): Promise<CourseSummary[]> =>
    ipcRenderer.invoke('dashboard:courseSummaries', archived),
  listAllResources: (): Promise<ResourceWithCourse[]> => ipcRenderer.invoke('resources:listAll'),
  listAllNotes: (): Promise<NoteWithCourse[]> => ipcRenderer.invoke('notes:listAll'),
});
