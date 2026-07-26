# Atlas — Roadmap

This roadmap sequences the PRD into buildable phases. Nothing here is committed to a calendar date — phases are ordered by dependency, not by deadline, and should be re-scoped as we learn from building each one.

## Phase 0 — Foundation

- [x] Repository created (private, `PamacKR/Atlas`)
- [x] PRD, architecture, roadmap, and behavior documentation
- [x] Project scaffold: Electron + TypeScript app skeleton, SQLite schema v1, build/dev tooling
- [x] Decide and document the on-disk data directory layout (where original files, DB, and config live) — `docs/open-questions.md` #6

## Phase 1 — Core data model & local-only workflow

Goal: Atlas is useful *before* any external sync exists.

- [x] Canonical SQLite schema: courses, resources, notes, deadlines, announcements, assignments
- [x] Manual upload (PDF, PPTX, DOCX, images, text, markdown) — file picker, copies into `Downloads/Atlas-Storage/files/<course name>/` (folder named after the course, original filename kept), kind auto-detected from extension
- [x] Resource Viewer: in-app preview for PDF (native Chromium rendering), image, markdown (rendered), text, DOCX (via `mammoth`), and XLSX (via `xlsx`/SheetJS, rendered as HTML tables); PPTX gets a text-only slide outline (no layout fidelity — no good free library renders real slide layout); right-click → "Open in browser" opens the resource in the real OS browser via a local loopback HTTP server, for full-fidelity viewing and fast tab-switching between files
- [x] List/icon view toggle for the resource list, file-manager style
- [x] Local folder watching: explicit per-course folder mapping (`chokidar`), new files copied into the course's managed storage automatically, same as manual upload
- [x] Notes: Markdown, flat per course (session-titled, e.g. "W1L1"), live-rendering WYSIWYG editor (`@milkdown/crepe` — supports live list/heading/divider shortcuts, math via KaTeX, toolbar active-state), autosaved — see `docs/open-questions.md` #1 and `ARCHITECTURE.md` §8
- [x] Semester filter for the course list, persisted across launches
- [x] Course workspace UI: Overview, Resources, Assignments, Announcements, Notes, Deadlines, Files, Settings — the course detail page (`ARCHITECTURE.md` §12) already surfaces Overview/Resources/Notes/Deadlines/Files (watched folders); no separate Settings page (nothing to configure yet — removed once added, see `STATUS.md` session 34) and no Assignments/Announcements (deliberately deferred to Phase 3, needs Classroom sync data to be worth a real UI — see `docs/open-questions.md` #13)
- [x] Unified Resource Library (single view regardless of source) — manual upload and local folder watching already land in the same per-course resource list/table regardless of source; Classroom/Gmail/Drive sources are Phase 3
- [x] Dashboard v1: upcoming deadlines, recently added resources, "what changed today"
- [x] Global search (SQLite FTS5) across courses, resources, notes

## Phase 2 — Handwritten notes

- [x] Import flow: photos, scans, phone scans, tablet exports — "+ Import scan" on the Notes page, multi-select or drag-and-drop, PDF (multi-page, the primary real-world case — Adobe Scan and similar apps) and single images both supported
- [x] OCR pipeline (local, offline via Tesseract.js — see `ARCHITECTURE.md` §3), storing both original image and extracted text — one imported file (however many PDF pages) becomes one note, via `notes.image_path`. OCR itself is **opt-in per note** (a "Run OCR" button, reviewed before accepting), not automatic on import — the user found local OCR's accuracy on real handwriting too poor to trust silently, and prefers reading a scan via Claude Code's vision when they need an accurate read; see `docs/open-questions.md` #18.
- [x] Handwritten notes searchable and surfaced identically to typed notes — once OCR is run and accepted (or the user just types over the scan), `content_markdown` behaves exactly like a typed note (autosave/search/editing, no special-casing); a small ✍️ badge, "View original scan," and "Run OCR" are the only visible differences

## Phase 3 — External sync (current)

Reordered 2026-07-26 (user decision) to build the **Google Drive adapter first**, ahead of Classroom/Gmail — it's what directly replaces the manual phone-scan/tablet-note transfer workflow (`docs/open-questions.md` #19), which was the actual immediate pain point, rather than following the phase's original listed order.

- [x] Google Drive adapter (first): one Drive folder the user designates as an "inbox" (recursively scanning subfolders too), polled while Atlas is running (~20s) plus a full scan on every launch — not a webhook/push subscription, which would need a public HTTPS endpoint that doesn't fit a local desktop app. New files surface in a review panel (course + Resource/Note per file, individually or in bulk, an explicit Ignore action too, dismissible and reopenable later, not forced immediately). Files are downloaded and copied into local managed storage on import — Drive is the inbox, Atlas still owns the data afterward, same as every other source. See `ARCHITECTURE.md` §4a.
- [x] Google Classroom adapter: a separate OAuth connection from Drive's (college Workspace account), no background polling (launch scan + manual "Sync now" only). New Classroom courses surface in a course-mapping review panel (name-match suggestion, confirm map-to-existing-or-create-new — never auto-assigned); once mapped, coursework/announcements/Drive-file attachments sync automatically into `assignments`/`announcements`/`resources`, and assignments also mirror into the existing `deadlines` Dashboard timeline. See `ARCHITECTURE.md` §4b and `docs/open-questions.md` #20.
- [ ] Gmail adapter: academic email detection and course association
- [ ] Sync configuration: manual vs. automatic, frequency (see `docs/open-questions.md`)
- [ ] Conflict handling for data that changed both locally and at the source

## Phase 4 — Context Builder & Claude Code integration

- Context Builder query layer: relevance-based retrieval per task type (assignment help, exam revision, lecture summary, concept explanation)
- Course AI profiles (section 19): explanation style, detail level, reasoning depth, formatting, math derivation use, citation preferences
- Local MCP server exposing the Context Builder to Claude Code
- Static context-file export as a fallback path for non-MCP AI tools
- "Fresh conversation" flow: Claude Code can pick up full course context with no manual explanation from the user

## Phase 5 — Lifecycle & polish

- Course/semester archiving and lifecycle rules
- Old-course searchability defaults
- Relationship editing (lecture→course, assignment→lecture, exam→lectures, email→assignment) as explicit, user/metadata-originated links
- Dashboard v2: unread announcements, new assignments, recently synced items
- Offline-mode audit: confirm which features degrade gracefully without a connection

## Explicitly out of scope for V1

Personal finance, fitness tracking, habit tracking, general life calendar, non-academic task management, mobile app, multi-user collaboration (PRD section 22).

## How to use this roadmap

Each phase should produce something usable on its own — Phase 1 alone is a working local academic workspace with no external dependencies, which de-risks the sync and AI-integration work that follows. Re-order within a phase freely; don't start a later phase before its dependencies are genuinely done.
