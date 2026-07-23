interface Course {
  id: number;
  name: string;
  code: string | null;
  term: string | null;
  archived: number;
  created_at: string;
}

interface AtlasApi {
  listCourses: () => Promise<Course[]>;
  createCourse: (name: string, code: string | null, term: string | null) => Promise<Course>;
  getDataDir: () => Promise<string>;
}

// Deliberately not using `import`/`export`/`declare global` here: any of
// those make TypeScript treat this file as an ES module and emit a
// CommonJS `exports` boilerplate header, which throws in a plain
// non-module <script> tag (no `exports` object exists) and silently kills
// the whole script. Casting through `any` keeps this file a plain script.
const atlasApi: AtlasApi = (window as any).atlas;

async function renderCourses(): Promise<void> {
  const list = document.getElementById('course-list')!;
  const courses = await atlasApi.listCourses();
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
  dataDirEl.textContent = `Data folder: ${await atlasApi.getDataDir()}`;

  await renderCourses();

  const form = document.getElementById('course-form') as HTMLFormElement;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = (document.getElementById('course-name') as HTMLInputElement).value.trim();
    const code = (document.getElementById('course-code') as HTMLInputElement).value.trim() || null;
    const term = (document.getElementById('course-term') as HTMLInputElement).value.trim() || null;
    if (!name) return;

    await atlasApi.createCourse(name, code, term);
    form.reset();
    await renderCourses();
  });
}

init();
