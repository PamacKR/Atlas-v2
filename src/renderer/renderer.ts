import type { Course } from '../preload/preload';

declare global {
  interface Window {
    atlas: {
      listCourses: () => Promise<Course[]>;
      createCourse: (name: string, code: string | null, term: string | null) => Promise<Course>;
      getDataDir: () => Promise<string>;
    };
  }
}

async function renderCourses(): Promise<void> {
  const list = document.getElementById('course-list')!;
  const courses = await window.atlas.listCourses();
  list.innerHTML = '';
  for (const course of courses) {
    const li = document.createElement('li');
    li.textContent = course.name;
    if (course.code) {
      const code = document.createElement('span');
      code.className = 'code';
      code.textContent = course.code;
      li.appendChild(code);
    }
    list.appendChild(li);
  }
}

async function init(): Promise<void> {
  const dataDirEl = document.getElementById('data-dir')!;
  dataDirEl.textContent = `Data folder: ${await window.atlas.getDataDir()}`;

  await renderCourses();

  const form = document.getElementById('course-form') as HTMLFormElement;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = (document.getElementById('course-name') as HTMLInputElement).value.trim();
    const code = (document.getElementById('course-code') as HTMLInputElement).value.trim() || null;
    const term = (document.getElementById('course-term') as HTMLInputElement).value.trim() || null;
    if (!name) return;

    await window.atlas.createCourse(name, code, term);
    form.reset();
    await renderCourses();
  });
}

init();
