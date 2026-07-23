interface Course {
  id: number;
  name: string;
  code: string | null;
  term: string | null;
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

interface AtlasApi {
  listCourses: () => Promise<Course[]>;
  createCourse: (name: string, code: string | null, term: string | null) => Promise<Course>;
  getDataDir: () => Promise<string>;
  listResources: (courseId: number) => Promise<Resource[]>;
  uploadResource: (courseId: number) => Promise<Resource | null>;
}

// Deliberately not using `import`/`export`/`declare global` here: any of
// those make TypeScript treat this file as an ES module and emit a
// CommonJS `exports` boilerplate header, which throws in a plain
// non-module <script> tag (no `exports` object exists) and silently kills
// the whole script. Casting through `any` keeps this file a plain script.
const atlasApi: AtlasApi = (window as any).atlas;

let selectedCourse: Course | null = null;

async function renderCourses(): Promise<void> {
  const list = document.getElementById('course-list')!;
  const courses = await atlasApi.listCourses();
  list.innerHTML = '';
  for (const course of courses) {
    const li = document.createElement('li');
    li.textContent = course.name;
    li.dataset.courseId = String(course.id);
    if (course.code) {
      const code = document.createElement('span');
      code.className = 'code';
      code.textContent = course.code;
      li.appendChild(code);
    }
    if (selectedCourse && selectedCourse.id === course.id) {
      li.classList.add('selected');
    }
    li.addEventListener('click', () => selectCourse(course));
    list.appendChild(li);
  }
}

async function renderResources(): Promise<void> {
  const section = document.getElementById('resources-section')!;
  const heading = document.getElementById('resources-heading')!;
  const list = document.getElementById('resource-list')!;

  if (!selectedCourse) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  heading.textContent = `Resources — ${selectedCourse.name}`;

  const resources = await atlasApi.listResources(selectedCourse.id);
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
    li.textContent = resource.title;
    const kind = document.createElement('span');
    kind.className = 'code';
    kind.textContent = resource.kind;
    li.appendChild(kind);
    list.appendChild(li);
  }
}

async function selectCourse(course: Course): Promise<void> {
  selectedCourse = course;
  await renderCourses();
  await renderResources();
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

  const uploadButton = document.getElementById('upload-button') as HTMLButtonElement;
  uploadButton.addEventListener('click', async () => {
    if (!selectedCourse) return;
    const resource = await atlasApi.uploadResource(selectedCourse.id);
    if (resource) await renderResources();
  });
}

init();
