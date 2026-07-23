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

export type Preview =
  | { type: 'pdf'; url: string }
  | { type: 'image'; url: string; zoomLevel: number | null }
  | { type: 'html'; html: string; note?: string }
  | { type: 'text'; text: string }
  | { type: 'unsupported'; reason?: string };

contextBridge.exposeInMainWorld('atlas', {
  listCourses: (): Promise<Course[]> => ipcRenderer.invoke('courses:list'),
  createCourse: (name: string, code: string | null, term: string | null): Promise<Course> =>
    ipcRenderer.invoke('courses:create', name, code, term),
  getDataDir: (): Promise<string> => ipcRenderer.invoke('app:dataDir'),
  listResources: (courseId: number): Promise<Resource[]> =>
    ipcRenderer.invoke('resources:listByCourse', courseId),
  uploadResource: (courseId: number): Promise<Resource | null> =>
    ipcRenderer.invoke('resources:upload', courseId),
  deleteCourse: (courseId: number): Promise<void> => ipcRenderer.invoke('courses:delete', courseId),
  deleteResource: (resourceId: number): Promise<void> =>
    ipcRenderer.invoke('resources:delete', resourceId),
  openResource: (resourceId: number): Promise<void> => ipcRenderer.invoke('resources:open', resourceId),
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
});
