import { contextBridge, ipcRenderer } from 'electron';

export interface Course {
  id: number;
  name: string;
  code: string | null;
  term: string | null;
  archived: number;
  created_at: string;
}

contextBridge.exposeInMainWorld('atlas', {
  listCourses: (): Promise<Course[]> => ipcRenderer.invoke('courses:list'),
  createCourse: (name: string, code: string | null, term: string | null): Promise<Course> =>
    ipcRenderer.invoke('courses:create', name, code, term),
  getDataDir: (): Promise<string> => ipcRenderer.invoke('app:dataDir'),
});
