# Atlas — Roadmap

This roadmap sequences the PRD into buildable phases. Nothing here is committed to a calendar date — phases are ordered by dependency, not by deadline, and should be re-scoped as we learn from building each one.

## Phase 0 — Foundation

- [x] Repository created (private, `PamacKR/Atlas`)
- [x] PRD, architecture, roadmap, and behavior documentation
- [x] Project scaffold: Electron + TypeScript app skeleton, SQLite schema v1, build/dev tooling
- [x] Decide and document the on-disk data directory layout (where original files, DB, and config live) — `open-questions.md` #6

## Phase 1 — Core data model & local-only workflow

Goal: Atlas is useful *before* any external sync exists.

- [x] Canonical SQLite schema: courses, resources, notes, deadlines, announcements, assignments
- [x] Manual upload (PDF, PPTX, DOCX, images, text, markdown) — file picker, copies into `Downloads/Atlas-Storage/files/<course name>/` (folder named after the course, original filename kept), kind auto-detected from extension
- [x] Resource Viewer: in-app preview for PDF (native Chromium rendering), image, markdown (rendered), text, DOCX (via `mammoth`), and XLSX (via `xlsx`/SheetJS, rendered as HTML tables); PPTX gets a text-only slide outline (no layout fidelity — no good free library renders real slide layout); right-click → "Open in browser" opens the resource in the real OS browser via a local loopback HTTP server, for full-fidelity viewing and fast tab-switching between files
- [x] List/icon view toggle for the resource list, file-manager style
- [x] Local folder watching: explicit per-course folder mapping (`chokidar`), new files copied into the course's managed storage automatically, same as manual upload
- [x] Notes: Markdown, flat per course (session-titled, e.g. "W1L1"), live-rendering WYSIWYG editor (`@milkdown/crepe` — supports live list/heading/divider shortcuts, math via KaTeX, toolbar active-state), autosaved — see `open-questions.md` #1 and `ARCHITECTURE.md` §8
- [x] Semester filter for the course list, persisted across launches
- [x] Course workspace UI: Overview, Resources, Assignments, Announcements, Notes, Deadlines, Files, Settings — the course detail page (`ARCHITECTURE.md` §12) is a tabbed layout (Overview/Deadlines/Announcements/Assignments/Classwork/Files, session 46 — `open-questions.md` #22) once Classroom sync gave Assignments/Announcements/Classwork real data to show (originally deferred, see `open-questions.md` #13). A real app-wide Settings page also shipped the same session (`open-questions.md` #22) — originally removed for having nothing to configure, now hosts Drive/Classroom connections plus theme/accent-color.
- [x] Unified Resource Library (single view regardless of source) — manual upload and local folder watching already land in the same per-course resource list/table regardless of source; Classroom/Gmail/Drive sources are Phase 3
- [x] Dashboard v1: upcoming deadlines, recently added resources, "what changed today"
- [x] Global search (SQLite FTS5) across courses, resources, notes

## Phase 2 — Handwritten notes

- [x] Import flow: photos, scans, phone scans, tablet exports — "+ Import scan" on the Notes page, multi-select or drag-and-drop, PDF (multi-page, the primary real-world case — Adobe Scan and similar apps) and single images both supported
- [x] OCR pipeline (local, offline via Tesseract.js — see `ARCHITECTURE.md` §3), storing both original image and extracted text — one imported file (however many PDF pages) becomes one note, via `notes.image_path`. OCR itself is **opt-in per note** (a "Run OCR" button, reviewed before accepting), not automatic on import — the user found local OCR's accuracy on real handwriting too poor to trust silently, and prefers reading a scan via Claude Code's vision when they need an accurate read; see `open-questions.md` #18.
- [x] Handwritten notes searchable and surfaced identically to typed notes — once OCR is run and accepted (or the user just types over the scan), `content_markdown` behaves exactly like a typed note (autosave/search/editing, no special-casing); a small ✍️ badge, "View original scan," and "Run OCR" are the only visible differences

## Phase 3 — External sync (current)

Reordered 2026-07-26 (user decision) to build the **Google Drive adapter first**, ahead of Classroom/Gmail — it's what directly replaces the manual phone-scan/tablet-note transfer workflow (`open-questions.md` #19), which was the actual immediate pain point, rather than following the phase's original listed order.

Reordered again 2026-07-28 (user decision, `open-questions.md` #28): the two remaining non-Gmail items below (**conflict handling**, then **sync configuration**) come next, then **Phase 4**, and the **Gmail adapter last** — so the actual working order across the two phases is: conflict handling → sync configuration → Phase 4 → Gmail. Reasoning in the Phase 4 note below.

- [x] Google Drive adapter (first): one Drive folder the user designates as an "inbox" (recursively scanning subfolders too), polled while Atlas is running (~20s) plus a full scan on every launch — not a webhook/push subscription, which would need a public HTTPS endpoint that doesn't fit a local desktop app. New files surface in a review panel (course + Resource/Note per file, individually or in bulk, an explicit Ignore action too, dismissible and reopenable later, not forced immediately). Files are downloaded and copied into local managed storage on import — Drive is the inbox, Atlas still owns the data afterward, same as every other source. See `ARCHITECTURE.md` §4a.
- [x] Google Classroom adapter: a separate OAuth connection from Drive's (college Workspace account), no background polling (launch scan + manual "Sync now" only). New Classroom courses surface in a course-mapping review panel (name-match suggestion, confirm map-to-existing-or-create-new — never auto-assigned); once mapped, coursework/announcements/classwork sync automatically into `assignments`/`announcements`/`classwork_materials`/`resources` (each mapped course guarded by its own try/catch, so one course's sync failure can't silently zero out every other course — fixed 2026-07-27), and assignments also mirror into the existing `deadlines` Dashboard timeline. Attachments land as Drive-link `resources` (`kind='link'`, opened externally, no download) rather than downloaded files. A per-course "Connect to Classroom" button on course detail lets an already-existing Atlas course link directly to a Classroom course. See `ARCHITECTURE.md` §4b and `open-questions.md` #20/#21.
- [x] Ashoka Planner course import (local add-on, not an OAuth-based sync source): a user-invoked "Import from Ashoka Planner" button on the Courses page, reading the user's separate `ashoka-planner` app's own SQLite database (read-only, one-shot) for currently-secured courses and creating matching Atlas courses — the intended companion to the Classroom adapter above, so next semester's courses can be pre-created here and then *linked* (not re-created) when Classroom's course-mapping review finds them, or via the per-course Connect button. See `ARCHITECTURE.md` §4c and `open-questions.md` #15.
- [x] Course-detail Announcements/Assignments/Classwork sections, Dashboard "Upcoming" widget redesign, and a new Calendar page (month grid + Upcoming sidebar, v1 scope — Day/Week toggle, date-picker, and Filters panel are logged fast-follows). See `ARCHITECTURE.md` §4d and `open-questions.md` #21.
- [x] Office file (PPTX/DOCX/XLSX) preview via Google Drive: "Open in Google Drive" uploads a resource to a dedicated Atlas-managed Drive folder (cached — only the first open of a given file re-uploads) and opens Drive's own real-layout viewer, alongside the existing local text-only preview rather than replacing it. See `ARCHITECTURE.md` §7 and `open-questions.md` #12.
- [x] **Conflict handling for data that changed both locally and at the source.** Per-field protection: a field the user edited by hand is never overwritten by a re-sync, while fields they didn't touch still accept source updates (deliberately *not* whole-row locking, so a cosmetic title edit can't blind a deadline to a real due-date change). Locally-overridden items get a visible marker plus a "Reset to Classroom version" action; items deleted at the source are greyed out and dismissible via the existing Delete action rather than hard-deleted, since a delete could destroy notes/`@`-mentions attached to them. Fixed a real bug in the process — editing a Classroom-synced deadline was being silently reverted on every sync. See `open-questions.md` #3 and `ARCHITECTURE.md` §4b.
- [x] **Sync configuration: manual vs. automatic, frequency.** A Sync section in Settings with per-source **Off / On launch only / Every N minutes**, a "last synced" timestamp and last error per source, and per-source + global "Sync now". Defaults preserve today's prior hardcoded behavior exactly (Drive 20s, Classroom launch-only). Replaces the prior situation where every schedule was hardcoded and invisible — which is how the Classroom adapter managed to fail on every sync for weeks without the UI ever showing it. See `open-questions.md` #2.
- [ ] Gmail adapter: tracked-sender list (each optionally tied to a course) + automatic tracking of threads the user has replied to; full email readable in-app; attachments added to a course manually per attachment; a global Email page plus a per-course Email tab; read-only access, its own separate connection. **No importance scoring or content-based filtering in Atlas** — "what did I miss?" is a Phase 4 query-time question for the AI agent, not a stored judgment. **Deliberately sequenced after Phase 4** (see below). See `open-questions.md` #28.

## Phase 4 — Context Builder & AI agent integration

**Moved ahead of the Gmail adapter (2026-07-28 user decision, `open-questions.md` #28).** The user's primary want from Gmail — surfacing what they missed in a flood of college email — is a Phase 4 capability by definition and can't be delivered by an email adapter alone. Phase 4 is also still entirely unbuilt while being the product's stated purpose (PRD §16/§18/§21), and everything already in Atlas (courses, notes, deadlines, resources, Classroom data) is already worth querying — so it delivers value immediately, with or without email. Building Gmail's storage shape first would also risk designing it before knowing how the agent actually queries.

- Context Builder query layer: relevance-based retrieval per task type (assignment help, exam revision, lecture summary, concept explanation)
- Course AI profiles (section 19): explanation style, detail level, reasoning depth, formatting, math derivation use, citation preferences
- Local MCP server exposing the Context Builder to any MCP-compatible AI agent
- Static context-file export as a fallback path for non-MCP AI tools
- "Fresh conversation" flow: any connected AI agent can pick up full course context with no manual explanation from the user

## Phase 5 — Lifecycle & polish

- [x] Course archiving: archive/unarchive a course (right-click or a detail-page button) without deleting anything; a "Show archived courses" toggle on the Courses page shows one list or the other; archived courses stop auto-syncing from Classroom but stay fully searchable. See `open-questions.md` #4/#26, `ARCHITECTURE.md` §2.
- Old-course searchability defaults — resolved as part of the above: archived courses stay searchable by default (see `open-questions.md` #4)
- Relationship editing (lecture→course, assignment→lecture, exam→lectures, email→assignment) as explicit, user/metadata-originated links
- Dashboard v2: unread announcements, new assignments, recently synced items
- Offline-mode audit: confirm which features degrade gracefully without a connection

## Explicitly out of scope for V1

Personal finance, fitness tracking, habit tracking, general life calendar, non-academic task management, mobile app, multi-user collaboration (PRD section 22).

## How to use this roadmap

Each phase should produce something usable on its own — Phase 1 alone is a working local academic workspace with no external dependencies, which de-risks the sync and AI-integration work that follows. Re-order within a phase freely; don't start a later phase before its dependencies are genuinely done.
