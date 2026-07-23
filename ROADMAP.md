# Atlas — Roadmap

This roadmap sequences the PRD into buildable phases. Nothing here is committed to a calendar date — phases are ordered by dependency, not by deadline, and should be re-scoped as we learn from building each one.

## Phase 0 — Foundation (current)

- [x] Repository created (private, `PamacKR/Atlas`)
- [x] PRD, architecture, roadmap, and behavior documentation
- [ ] Project scaffold: Electron + TypeScript app skeleton, SQLite schema v1, build/dev tooling
- [ ] Decide and document the on-disk data directory layout (where original files, DB, and config live)

## Phase 1 — Core data model & local-only workflow

Goal: Atlas is useful *before* any external sync exists.

- Canonical SQLite schema: courses, resources, notes, deadlines, announcements, assignments
- Manual upload (PDF, PPTX, DOCX, images, text, markdown)
- Local folder watching (Downloads, lecture/semester folders) with new-file detection
- Course workspace UI: Overview, Resources, Assignments, Announcements, Notes, Deadlines, Files, Settings
- Unified Resource Library (single view regardless of source)
- Resource Viewer: PDF, image, markdown, text — fallback to system default app
- Notes: format decision resolved (see `docs/open-questions.md`), typed notes, embedded files/images
- Dashboard v1: upcoming deadlines, recently added resources, "what changed today"
- Global search (SQLite FTS5) across courses, resources, notes

## Phase 2 — Handwritten notes

- Import flow: photos, scans, phone scans, tablet exports
- OCR pipeline (Google Cloud Vision), storing both original image and extracted text
- Handwritten notes searchable and surfaced identically to typed notes

## Phase 3 — External sync

- Google Classroom adapter: courses, assignments, announcements, attachments, due dates, structure
- Gmail adapter: academic email detection and course association
- Google Drive adapter (optional, user-enabled): selected folder/file sync
- Sync configuration: manual vs. automatic, frequency (see `docs/open-questions.md`)
- Conflict handling for data that changed both locally and at the source

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
