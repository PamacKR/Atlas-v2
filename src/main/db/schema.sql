-- Atlas canonical schema (Phase 1: local-only entities)
-- See ARCHITECTURE.md §2 for the reasoning behind SQLite + FTS5.

CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT,
  term TEXT,
  -- Sanitized, on-disk folder name under files/ — computed once at course
  -- creation (see main.ts) and kept stable even if the course is renamed
  -- later, so file paths already stored in `resources` never break.
  folder_name TEXT NOT NULL DEFAULT '',
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL, -- pdf, pptx, docx, image, text, markdown, zip, other
  source TEXT NOT NULL DEFAULT 'manual', -- manual, local_folder, classroom, gmail, drive
  file_path TEXT NOT NULL,
  original_filename TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  synced_at TEXT,
  -- Remembered image-preview zoom (1.0 = 100%), per resource. NULL means
  -- "never set, use the default." Only meaningful for kind = 'image'.
  zoom_level REAL,
  -- Original absolute path of a file picked up via folder watching (see
  -- watched_folders below). Used to detect "already imported" on watcher
  -- restart, since chokidar re-emits 'add' for every existing file each time
  -- a watch starts. NULL for manually-uploaded resources.
  watch_source_path TEXT
);

-- User-designated folders Atlas watches for new files, mapped explicitly to
-- one course each (deliberately not auto-guessed — see docs/open-questions.md
-- #11 and the "Atlas owns the data" principle in CLAUDE.md: which course a
-- file belongs to is a user decision, not an inference Atlas makes for them).
CREATE TABLE IF NOT EXISTS watched_folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  folder_path TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content_markdown TEXT NOT NULL DEFAULT '',
  is_handwritten INTEGER NOT NULL DEFAULT 0,
  image_path TEXT, -- original scan, if handwritten
  ocr_text TEXT,   -- extracted text, if handwritten (Tesseract.js, see ARCHITECTURE.md §3)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deadlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'assignment', -- assignment, reading, quiz, lab, project, exam, manual
  due_at TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual'
);

CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'manual', -- classroom, gmail, manual
  title TEXT NOT NULL,
  body TEXT,
  posted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_at TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'open' -- open, submitted, graded
);

-- App-wide preferences that aren't tied to any one course/resource, e.g. the
-- list/icon resource view mode — standardized across the whole app rather
-- than remembered per-course, and persisted across launches.
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Full-text search across notes, resources, announcements (PRD §14).
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  entity_type UNINDEXED, -- 'note', 'resource', 'announcement', 'assignment'
  entity_id UNINDEXED,
  course_id UNINDEXED,
  title,
  body
);
