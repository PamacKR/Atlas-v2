import { contextBridge, ipcRenderer } from 'electron';

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
}

export interface WatchedFolder {
  id: number;
  course_id: number;
  folder_path: string;
  created_at: string;
}

export type Preview =
  | { type: 'pdf'; url: string }
  | { type: 'image'; url: string; zoomLevel: number | null }
  | { type: 'html'; html: string; note?: string }
  | { type: 'text'; text: string }
  | { type: 'unsupported'; reason?: string };

export interface Note {
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

export interface Deadline {
  id: number;
  course_id: number;
  title: string;
  kind: string;
  due_at: string | null;
  completed: number;
  source: string;
  description: string | null;
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

export interface CourseSummary extends Course {
  resource_count: number;
  deadline_count: number;
}

export interface ResourceWithCourse extends Resource {
  course_name: string;
}

export interface NoteWithCourse extends Note {
  course_name: string;
}

contextBridge.exposeInMainWorld('atlas', {
  listCourses: (): Promise<Course[]> => ipcRenderer.invoke('courses:list'),
  createCourse: (name: string, code: string | null, term: string | null): Promise<Course> =>
    ipcRenderer.invoke('courses:create', name, code, term),
  getDataDir: (): Promise<string> => ipcRenderer.invoke('app:dataDir'),
  getSetting: (key: string): Promise<string | null> => ipcRenderer.invoke('app:getSetting', key),
  setSetting: (key: string, value: string): Promise<void> => ipcRenderer.invoke('app:setSetting', key, value),
  getResourceBrowserUrl: (resourceId: number): Promise<string> =>
    ipcRenderer.invoke('resources:browserUrl', resourceId),
  listResources: (courseId: number): Promise<Resource[]> =>
    ipcRenderer.invoke('resources:listByCourse', courseId),
  uploadResource: (courseId: number): Promise<Resource | null> =>
    ipcRenderer.invoke('resources:upload', courseId),
  deleteCourse: (courseId: number): Promise<void> => ipcRenderer.invoke('courses:delete', courseId),
  deleteResource: (resourceId: number): Promise<void> =>
    ipcRenderer.invoke('resources:delete', resourceId),
  getPreview: (resourceId: number): Promise<Preview> => ipcRenderer.invoke('resources:getPreview', resourceId),
  setResourceZoom: (resourceId: number, zoom: number): Promise<void> =>
    ipcRenderer.invoke('resources:setZoom', resourceId, zoom),
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
  listWatchedFolders: (courseId: number): Promise<WatchedFolder[]> =>
    ipcRenderer.invoke('folders:listWatched', courseId),
  addWatchedFolder: (courseId: number): Promise<WatchedFolder | null> =>
    ipcRenderer.invoke('folders:add', courseId),
  removeWatchedFolder: (folderId: number): Promise<void> => ipcRenderer.invoke('folders:remove', folderId),
  showFolderContextMenu: (folderId: number): void => ipcRenderer.send('folders:contextMenu', folderId),
  onFolderContextMenuRemove: (handler: (folderId: number) => void): void => {
    ipcRenderer.on('folders:contextMenuRemove', (_event, folderId: number) => handler(folderId));
  },
  onResourcesChanged: (handler: (courseId: number) => void): void => {
    ipcRenderer.on('resources:changed', (_event, courseId: number) => handler(courseId));
  },
  listNotes: (courseId: number): Promise<Note[]> => ipcRenderer.invoke('notes:listByCourse', courseId),
  createNote: (courseId: number): Promise<Note> => ipcRenderer.invoke('notes:create', courseId),
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
  deleteDeadline: (deadlineId: number): Promise<void> => ipcRenderer.invoke('deadlines:delete', deadlineId),
  showDeadlineContextMenu: (deadlineId: number): void => ipcRenderer.send('deadlines:contextMenu', deadlineId),
  onDeadlineContextMenuDelete: (handler: (deadlineId: number) => void): void => {
    ipcRenderer.on('deadlines:contextMenuDelete', (_event, deadlineId: number) => handler(deadlineId));
  },
  getUpcomingDeadlines: (): Promise<DashboardDeadline[]> => ipcRenderer.invoke('dashboard:upcomingDeadlines'),
  getRecentResources: (): Promise<DashboardResource[]> => ipcRenderer.invoke('dashboard:recentResources'),
  getRecentActivity: (): Promise<DashboardActivityItem[]> => ipcRenderer.invoke('dashboard:recentActivity'),
  getCourseSummaries: (): Promise<CourseSummary[]> => ipcRenderer.invoke('dashboard:courseSummaries'),
  listAllResources: (): Promise<ResourceWithCourse[]> => ipcRenderer.invoke('resources:listAll'),
  listAllNotes: (): Promise<NoteWithCourse[]> => ipcRenderer.invoke('notes:listAll'),
});
