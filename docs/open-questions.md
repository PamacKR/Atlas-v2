# Open Product Questions

Carried over from `prd.md`'s "Open Product Questions" section, plus decisions made since. When a question is resolved, keep it here with its answer and status rather than deleting it — this is the changelog of product decisions, not just a todo list.

## 1. Notes format

- Should notes support Markdown, rich text, or both?
- Should handwritten annotations be possible directly within the app (vs. only imported)?

**Status:** Resolved (2026-07-25) — Markdown, typed notes only for now (handwritten/OCR notes are Phase 2, `ROADMAP.md`). Decided against rich text: the user's stated Notion workflow (write notes → export to PDF → paste into an AI chat) goes away entirely once Claude Code can query notes directly via MCP, and markdown is what Claude reads most naturally — rich text would just get flattened to something markdown-like anyway. Markdown also means no rich-text editor to build/maintain and notes stay trivially indexable by the existing FTS5 `search_index` table. Edited live via a WYSIWYG-style markdown editor (Milkdown/`@milkdown/crepe`, bundled — see `ARCHITECTURE.md` §8 "Notes"; Toast UI Editor was tried first and replaced after real gaps surfaced — no live list/heading shortcuts, no toolbar active-state feedback), not a raw markdown/preview split, so the day-to-day feel is still close to Notion. Organization is flat per course (no folders/subfolders) — the user's Notion structure was really "semester > course > session-titled note" (e.g. "W1L1"), and Atlas already provides the semester/course layers, so a note is just titled by the user (W1L1, W1L2, ...) rather than manually filed into a nested tree.

## 2. Synchronization

- How frequently should Classroom and Gmail sync?
- Should synchronization be manual, automatic, or configurable?

**Status:** Open. Deferred to Phase 3 (`ROADMAP.md`) — likely answer is "configurable, defaulting to automatic on an interval," but needs to account for API rate limits on both services before committing to a default.

## 3. Offline behavior

- Which features should remain fully functional without an internet connection?
- How should synchronization conflicts be handled after reconnecting?

**Status:** Partially resolved by the architecture decision to use embedded SQLite (`ARCHITECTURE.md` §2) — everything in the canonical database (viewing, notes, search, manual uploads) works fully offline by construction. What's still open: the conflict-resolution policy for data edited locally and changed at the source between syncs.

## 4. Course lifecycle

- How are semesters archived?
- Should old courses remain searchable by default?

**Status:** Open. Deferred to Phase 5. Resurfaced 2026-07-26: the user noticed the Courses grid has no way to hide finished-semester courses as more get added each term, and explicitly asked to defer building it now but wanted it logged so it isn't lost.

## 5. AI provider independence

- While the initial target is Claude Code, should the data structures and documentation remain generic enough to support future reasoning engines without redesigning the platform?

**Status:** Yes, by design. The Context Builder (`ARCHITECTURE.md` §5) and canonical schema are Claude-agnostic; the MCP server (`ARCHITECTURE.md` §6) is one transport on top of them, and the static file-export fallback exists specifically so other AI tools aren't locked out. Course AI profiles (PRD §19) are the one place Claude-specific tuning lives, and even those are just structured preference data Atlas supplies to whatever reasoning engine is in use — not Claude-specific logic.

## New questions raised while documenting the architecture

### 6. Data directory layout

Where do original files (scans, PDFs, uploads) live on disk relative to the SQLite database and app config?

**Status:** Resolved (updated 2026-07-23) — `Downloads/Atlas-Storage/` is the managed data folder (course subfolders inside it), chosen over a hidden app-data location so the user can easily browse/add/remove files by hand. The SQLite database and app config live alongside it (e.g. `Downloads/Atlas-Storage/atlas.db`, `Downloads/Atlas-Storage/config/`) rather than in a separate system config directory. It's deliberately a different folder from the Atlas source repo (`Downloads/Atlas/`) — an earlier version of this decision used the same name as the repo folder, which caused the dev database to be written directly inside the git working directory; renamed specifically to avoid that overlap.

### 7. Google API credential handling

Classroom/Gmail/Drive all need Google Cloud credentials. Does the user bring their own Google Cloud project (OAuth client), or does Atlas ship with one baked in?

**Status:** Resolved — bring-your-own Google Cloud OAuth client, on the free tier, with no billing account attached (per the zero-API-fees constraint in `ARCHITECTURE.md` §0). OCR no longer needs a Google credential at all, since it moved to local Tesseract.js (`ARCHITECTURE.md` §3).

### 8. College Google Workspace access — real risk, not yet verified

The user's primary account for Classroom/Gmail is a **college Google Workspace for Education account**, not their personal Google account. Workspace admins commonly restrict which third-party/custom OAuth apps can access Classroom, Gmail, or Drive API scopes for accounts on the domain — independent of cost, this can block API access outright regardless of what Atlas builds.

**Status:** Resolved (verified 2026-07-23) — tested directly via Google's OAuth 2.0 Playground, signed into the college account, requesting both Classroom read/write scopes and `gmail.readonly`. Both completed with a normal `HTTP 302` redirect and authorization code — no `admin_policy_enforced` or app-blocked error, which is what a Workspace admin restriction would produce. The college domain allows third-party OAuth apps to access Classroom and Gmail API scopes. Phase 3 (Classroom/Gmail sync) can be scoped against the college account without a fallback plan for this specific risk.

Caveat: this confirms *consent* succeeds, not that every specific scope Atlas will eventually need is unrestricted (e.g. write scopes, or Drive scopes, weren't all exhaustively tested) — worth a quick recheck if Phase 3 scoping turns up a scope not covered by this test.

### 9. Personal Google "Pro" subscription and Claude Pro — do they help with anything here?

The user has a Google One/Google AI Pro-type subscription on their personal account and a Claude Pro subscription. Worth being explicit: neither grants API credits or billing-free API access — Google One's AI features are app/web-based (e.g. Gemini in Gmail/Docs), not API quota, and Claude Pro covers Claude.ai/Claude Code usage, not the separate Anthropic API. Since Atlas makes no AI API calls at all (`ARCHITECTURE.md` §0), this is moot for Atlas itself — noted here only so it isn't assumed to unlock some API budget later.

**Status:** Resolved (informational) — not usable for API costs, and not needed given the zero-AI-integration constraint.

### 10. Remembering zoom for PDF previews

The user asked (2026-07-23) whether Atlas can remember each file's preferred preview zoom, using PDFs as the example ("for one pdf 100% would work, for another maybe 150%"). Per-resource zoom memory is now implemented for **image** previews (`resources.zoom_level`, restored automatically on reopen). PDFs are different: they render inside an `<iframe>` using Chromium's own built-in PDF viewer, which is a separate document — there's no scripting API to read back whatever zoom level the user sets inside it, and Ctrl+scroll can't reach into it either (confirmed why the user's "doesn't work on other file types" observation is expected, not a bug).

The only lever available is one-directional: appending `#zoom=N` to the PDF's `file://` URL sets its *initial* zoom on load (a Chromium PDF-viewer convention), but we'd have to build our own separate control (outside the iframe) for the user to pick/save a preferred value — we can't observe what they actually change it to inside the native viewer afterward.

**Status:** Open — needs a decision from the user on whether that one-way, "set an initial zoom via a separate small control, can't reflect live changes" approach is worth building for PDFs, given the real UX limitation. Not implemented yet.

### 11. Folder→course mapping for local folder watching

When Atlas watches a local folder for new files, how does it know which course a detected file belongs to — explicit user-configured mapping, or auto-guessing from file content/name/location?

**Status:** Resolved (2026-07-25) — explicit only. The user maps a folder to a specific course when adding it (native folder picker, from that course's "Watched folders" section); there is no auto-guessing. Reasoning: guessing which course a file belongs to from its content or name would be Atlas making an inference about academic meaning, which cuts against the "Atlas owns data, Claude owns reasoning" rule (`CLAUDE.md`) — that kind of association-with-uncertainty belongs to a human decision (or later, an explicit Claude Code query), not a silent sync-adapter heuristic. See `ARCHITECTURE.md` §4.

### 12. PPTX fidelity — revisit the Google Drive route once Phase 3 (sync) is underway

The user tried "Open in browser" on a real PPTX and, while accepting the current text-only outline as fine *for now*, was explicit that the fidelity isn't great and they'd like to revisit routing PPTX (and possibly DOCX/XLSX) through Google Drive/Docs/Slides for real layout rendering — the option scoped out of the "Open in browser" work (session 20) specifically because it requires uploading files to Google Drive, a Phase 3-scale change.

**Status:** Open, deliberately deferred — not a Phase 1 item. Revisit when Phase 3 (external sync, `ROADMAP.md`) is underway and Google Drive integration is being built anyway, since at that point the Drive OAuth/upload plumbing already needs to exist and reusing it for "open in Slides for real fidelity" becomes a much smaller incremental step than building a one-off Drive upload path just for this. Until then, PPTX/DOCX/XLSX previews stay local-only (`ARCHITECTURE.md` §7).

### 13. Deadlines vs. Assignments — one overlapping manual-entry UI, or two?

The schema has two separate tables that both cover "things with a due date": `deadlines` (PRD §12's unified academic timeline — assignments/readings/quizzes/labs/projects/exams/manual tasks, one list per course) and `assignments` (a would-be separate course tab per PRD §8, carrying a description and a submission-status field — open/submitted/graded — that only really makes sense once Google Classroom sync exists to populate it). With no sync built yet, a user manually adding "Homework 3, due Friday" could plausibly go in either one.

**Status:** Resolved (2026-07-26) — build Deadlines only for Phase 1. Asked the user directly, given the real overlap; they chose the unified Deadlines list, deferring a separate Assignments tab to Phase 3. Reasoning: `deadlines.kind` already includes `'assignment'` as one of its values, so a manually-tracked assignment due date is already representable there — building a second, parallel UI for it now would just be busywork with no real difference until Classroom sync actually needs the `assignments` table's description/status fields for real synced data. Revisit once Phase 3 (external sync, `ROADMAP.md`) starts populating `assignments` from Classroom.

### 14. Multiple scrollbars visible at once in some views

The user flagged (2026-07-26, with a screenshot) a case where several scrollbars render simultaneously and visually clash — looked like a "Open in browser" PDF view, where Chromium's own built-in PDF viewer toolbar/scrollbar can end up nested alongside the page's own scrollbar. Explicitly said not to fix now — just note it for later.

**Status:** Open, deliberately deferred — this is a UI/layout pass item, not something to fix opportunistically mid-feature-work. Revisit when doing a dedicated UI/layout cleanup pass (per `CLAUDE.md`, Atlas's own UI is currently functional-first, not yet polished). Worth checking both the resource preview overlay (`#preview-overlay`/`#preview-body`) and the local-server-backed "Open in browser" PDF route (`localServer.ts`) for nested scrollable containers when this is picked up.

### 15. Importing finalized courses from `ashoka-planner`'s registration tracker

The user built a separate app, [`ashoka-planner`](https://github.com/PamacKR/ashoka-planner) (private repo, same owner), that helps plan and register for courses each semester. Once registration is final there, they'd like a button in Atlas to pull the finalized course list and auto-create the matching Atlas course folders (name, code, semester, and ideally a description), instead of recreating them by hand — manual "+ Add course" would stay available alongside it, not be replaced.

**Feasibility (researched 2026-07-26, read `ashoka-planner`'s `scripts/db.py`/`registration_server.py` directly, not guessed):** Genuinely feasible, and cleaner than expected.

- `ashoka-planner` stores everything in its own SQLite file, `data/planner.db` — a plain file on disk, not a running service Atlas would need to talk to over a network. Atlas already depends on `better-sqlite3`, so it can open a **second, read-only connection** to that file directly. This would need a one-time "locate your planner.db" step (a file picker, path remembered in `app_settings` the same way other Atlas preferences already are) since it lives in a different app's data directory, not something Atlas can discover on its own.
- The "finalized courses" concept already exists cleanly: `registration_run` → `slot` rows, where `slot.status == 'secured'` means a course the user is actually holding right now (as opposed to `'open'`, still being chased). Each secured slot's `current_course_snapshot_json` carries `code` (section code), `title`, `category`, `faculty`, and `credits` — everything needed for `name`/`code`.
- A genuine **description** is available too, just from a separate table: `course_description`, keyed by the same section code, with `overview`/`learning_outcomes`/`requirements`/`grading_components_html` fields (scraped from Ashoka's own course catalog by that app's pipeline). Joining secured slots to this table by code gives a real per-course description, not something invented.
- The semester label is available from `student_profile.current_semester` (a single-row table) — maps directly to Atlas's existing `courses.term` field.
- What Atlas doesn't have today: a `description` column on its own `courses` table (schema currently has `name`/`code`/`term`/`folder_name`/`archived` only) — adding one is a small, backward-compatible migration (`ALTER TABLE courses ADD COLUMN description TEXT`, same pattern already used for `deadlines.description` in `database.ts`), not a redesign.
- Suggested shape if built: an explicit "Import from Ashoka Planner" action (not automatic/background) that reads secured slots + descriptions + current semester, shows a review list with checkboxes (the user may not want every secured course as an Atlas course — e.g. an audited class), then creates courses through Atlas's existing course-creation path once confirmed. Read-only and one-shot by design — Atlas should never write back to `planner.db`, and re-running the import for a course that already exists in Atlas needs a dedupe/skip rule (match on code + term) rather than creating duplicates.

**Status:** Open — feasible, not yet scoped into a specific phase. Likely fits as a Phase 1 add-on (it's local-file-to-local-file, no network/OAuth involved) rather than needing to wait for Phase 3 sync infrastructure. Needs the user's go-ahead on scope (one-shot import button vs. something more automatic) before implementation.

### 16. Auto-categorizing an uploaded file into the right course

The user asked: if a file is just uploaded somewhere generic, can Atlas figure out which course it belongs to on its own?

**Feasibility:** Depends heavily on what "figure out" means, and this one runs straight into the "Atlas owns data, Claude owns reasoning" rule (`CLAUDE.md`) plus the no-AI-in-Atlas guardrail — worth being precise about what's actually allowed:

- **Not feasible as "silently, always correct, no confirmation"** — that would require Atlas itself to semantically understand file content and match it to a course, which is exactly the kind of AI-inference-written-back-as-fact `CLAUDE.md` prohibits (mirrors the reasoning already settled in question #11 for folder watching — explicit mapping only, no silent guessing).
- **Feasible as a local, rule-based *suggestion*, confirmed by the user before it's saved.** Atlas already extracts text from every resource kind it can preview (markdown/DOCX/XLSX render as text/HTML today; PDF/image would need OCR, which is Phase 2 territory). A plain keyword/regex match — course code appearing in the filename or file text, course name appearing in the file text — against the list of existing Atlas courses is cheap, local, deterministic, and not an AI call at all. The existing course-picker modal (`#course-picker-overlay`) could simply pre-select/highlight its best guess instead of defaulting to nothing, with the user still clicking to confirm (or picking a different course) — same UI, smarter default.
- **A step further (genuinely "smart," not just keyword matching)** — e.g. reading and understanding an ambiguous file's actual subject matter — is Claude Code's job at runtime (via MCP, per the core architectural rule), not something to build into Atlas's own process. That would look like: the user asks Claude Code "where does this file go," Claude reads it and Atlas's course list via the Context Builder, suggests a course, and *the user* confirms the move through Atlas — never an automatic background classification.

**Status:** Open — the rule-based "suggest, don't auto-assign" version is buildable now and doesn't need a phase change; the "ask Claude Code to help sort an ambiguous file" version depends on Phase 4 (Context Builder/MCP) already existing. Needs a decision on whether the rule-based version is worth building before then, or whether manual course selection at upload (already fast — one modal click) is good enough until Phase 4.

### 17. Should handwritten notes (Phase 2) and external sync (Phase 3) swap order?

The user asked whether it makes more sense to do external sync before handwritten notes, given work already done in this session.

**Discussion (not yet decided):** Handwritten notes (OCR via local Tesseract.js) is the more self-contained option — no OAuth, no Google Cloud project/consent screen, no token storage/refresh, no sync-conflict logic; it's an extension of upload/preview, which already exists. External sync is Atlas's first external dependency of any kind, and `ROADMAP.md`'s own stated Phase 1 philosophy ("Atlas is useful *before* any external sync exists") arguably applies just as well to *not* rushing into the first one. On the other hand, Classroom/Gmail sync likely delivers more everyday value sooner (automatic deadlines/resources vs. a feature that only helps courses where the user actually takes handwritten notes) — and question #15/#16 above show that some of what might motivate jumping to sync early (getting course data in without manual re-entry) can already be partly covered locally via the `ashoka-planner` import, which needs no phase reordering at all.

**Status:** Open — leans toward keeping the current order (Phase 2 = handwritten notes, Phase 3 = sync) for the lower-risk/self-contained reasons above, but this is a value-sequencing call for the user to make, not a technical blocker either way; both orders are equally buildable. `ROADMAP.md` stays unchanged until the user decides.
