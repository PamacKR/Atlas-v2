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
});
