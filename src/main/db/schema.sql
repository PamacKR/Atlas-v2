-- Atlas canonical schema (Phase 1: local-only entities)
-- See ARCHITECTURE.md §2 for the reasoning behind SQLite + FTS5.

CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT,
  term TEXT,
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
  synced_at TEXT
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

-- Full-text search across notes, resources, announcements (PRD §14).
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  entity_type UNINDEXED, -- 'note', 'resource', 'announcement', 'assignment'
  entity_id UNINDEXED,
  course_id UNINDEXED,
  title,
  body
);
