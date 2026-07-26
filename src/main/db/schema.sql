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
  watch_source_path TEXT,
  -- Opt-in, user-reviewed OCR text (see resources:runOcr in main.ts) for PDFs
  -- with no text layer (e.g. a scanned book) — mirrors notes.ocr_text. NULL
  -- until the user runs OCR and explicitly saves the result; only then does
  -- it get indexed into search_index, same "never silently trusted" rule as
  -- handwritten notes (docs/open-questions.md #18).
  ocr_text TEXT,
  -- Drive file ID this resource was imported from (see drive_pending_files
  -- below) — used to detect "already imported" across scans. NULL for
  -- anything not sourced from Drive.
  drive_file_id TEXT
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
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- Google-Docs-style title behavior: while 0, the title auto-follows the
  -- note's first line on every save. Set to 1 the moment the user edits the
  -- title field directly, permanently decoupling it from the content.
  title_is_manual INTEGER NOT NULL DEFAULT 0,
  -- Path to this note's exported .md mirror under
  -- files/<course>/notes/<title>.md (see main.ts exportNoteToFile). The
  -- database stays authoritative for editing — this is a one-way,
  -- Atlas-owned mirror purely so the note is usable outside Atlas. Tracked
  -- so a title change can find and rename/remove the previous export.
  exported_path TEXT,
  -- Drive file ID this note was imported from — mirrors
  -- resources.drive_file_id. NULL for anything not sourced from Drive.
  drive_file_id TEXT
);

CREATE TABLE IF NOT EXISTS deadlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'assignment', -- assignment, reading, quiz, lab, project, exam, manual
  -- 'YYYY-MM-DD' (date only) or 'YYYY-MM-DDTHH:MM' (date + optional time) —
  -- time is optional per deadline, so the format varies row to row rather
  -- than always carrying an unused time component.
  due_at TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',
  -- Free-text notes about the deadline. May contain @-mention tokens in the
  -- form @[Title](resource:<id>) or @[Title](note:<id>) — inserted via the
  -- description field's @ autocomplete, rendered as clickable links back to
  -- that resource/note (see renderDeadlineDescription in renderer.ts).
  description TEXT
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

-- Files seen in the user's designated Google Drive "inbox" folder
-- (docs/open-questions.md #19) that haven't been assigned a course/type yet.
-- A file lives here from the moment a scan first detects it until the user
-- tags it (course + Resource/handwritten-Note/typed-Note) via the review
-- panel — at which point it's downloaded into local managed storage as a
-- real resource/note (drive_file_id set there too) and this row is deleted.
-- Deliberately not auto-resolved: which course/type a file belongs to is a
-- user decision, same reasoning as watched_folders (docs/open-questions.md
-- #11) and "Atlas owns the data" (CLAUDE.md).
CREATE TABLE IF NOT EXISTS drive_pending_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drive_file_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  modified_time TEXT,
  detected_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- Set when the user explicitly says "ignore this" in the review panel —
  -- the row stays (so a future scan's UNIQUE constraint keeps it from
  -- reappearing as "new"), it's just excluded from the pending count/review
  -- list. Not the same as importing: nothing is copied into local storage.
  ignored INTEGER NOT NULL DEFAULT 0
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
