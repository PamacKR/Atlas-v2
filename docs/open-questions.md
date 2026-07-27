# Open Product Questions

Carried over from `prd.md`'s "Open Product Questions" section, plus decisions made since. When a question is resolved, keep it here with its answer and status rather than deleting it — this is the changelog of product decisions, not just a todo list.

## 1. Notes format

- Should notes support Markdown, rich text, or both?
- Should handwritten annotations be possible directly within the app (vs. only imported)?

**Status:** Resolved (2026-07-25) — Markdown, typed notes only for now (handwritten/OCR notes are Phase 2, `ROADMAP.md`). Decided against rich text: the user's stated Notion workflow (write notes → export to PDF → paste into an AI chat) goes away entirely once Claude Code can query notes directly via MCP, and markdown is what Claude reads most naturally — rich text would just get flattened to something markdown-like anyway. Markdown also means no rich-text editor to build/maintain and notes stay trivially indexable by the existing FTS5 `search_index` table. Edited live via a WYSIWYG-style markdown editor (Milkdown/`@milkdown/crepe`, bundled — see `ARCHITECTURE.md` §8 "Notes"; Toast UI Editor was tried first and replaced after real gaps surfaced — no live list/heading shortcuts, no toolbar active-state feedback), not a raw markdown/preview split, so the day-to-day feel is still close to Notion. Organization is flat per course (no folders/subfolders) — the user's Notion structure was really "semester > course > session-titled note" (e.g. "W1L1"), and Atlas already provides the semester/course layers, so a note is just titled by the user (W1L1, W1L2, ...) rather than manually filed into a nested tree.

## 2. Synchronization

- How frequently should Classroom and Gmail sync?
- Should synchronization be manual, automatic, or configurable?

**Status:** Partially resolved for Classroom (2026-07-26) — no background polling interval, unlike Drive's ~20s. Classroom syncs once on app launch plus an explicit "Sync now" button. Classroom content (new assignments, announcements, courses) changes far less often than a Drive inbox, so continuous polling against the college Workspace account isn't worth the extra API load — see `ARCHITECTURE.md` §4b. Gmail's half of this question is still open, deferred to when the Gmail adapter is built.

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

**Status:** Resolved/built (2026-07-26) — surfaced directly from real use: after building the Classroom adapter (question #20), the user tried mapping some of last semester's Classroom courses and pointed out that wasn't actually their intended workflow — they want next semester's courses pre-created in Atlas *from ashoka-planner* first, then linked (not re-created) when Classroom's course-mapping review panel finds them. This import is the missing half of that. Built exactly as scoped above: a "Import from Ashoka Planner" button on the Courses page (first click prompts a native file picker to locate `planner.db`, remembered afterward in `app_settings`), reading `slot` rows where `status = 'secured'` joined against `course_description` (by section code) and `student_profile.current_semester`, presented as a checkbox review list (already-imported courses, matched by code + term, shown disabled so re-running the import never duplicates). Confirmed genuinely one-shot/user-invoked, not automatic — the user was explicit about this. New `courses.description` column added to hold the imported overview text. See `ARCHITECTURE.md` §4c.

### 16. Auto-categorizing an uploaded file into the right course

The user asked: if a file is just uploaded somewhere generic, can Atlas figure out which course it belongs to on its own?

**Feasibility:** Depends heavily on what "figure out" means, and this one runs straight into the "Atlas owns data, Claude owns reasoning" rule (`CLAUDE.md`) plus the no-AI-in-Atlas guardrail — worth being precise about what's actually allowed:

- **Not feasible as "silently, always correct, no confirmation"** — that would require Atlas itself to semantically understand file content and match it to a course, which is exactly the kind of AI-inference-written-back-as-fact `CLAUDE.md` prohibits (mirrors the reasoning already settled in question #11 for folder watching — explicit mapping only, no silent guessing).
- **Feasible as a local, rule-based *suggestion*, confirmed by the user before it's saved.** Atlas already extracts text from every resource kind it can preview (markdown/DOCX/XLSX render as text/HTML today; PDF/image would need OCR, which is Phase 2 territory). A plain keyword/regex match — course code appearing in the filename or file text, course name appearing in the file text — against the list of existing Atlas courses is cheap, local, deterministic, and not an AI call at all. The existing course-picker modal (`#course-picker-overlay`) could simply pre-select/highlight its best guess instead of defaulting to nothing, with the user still clicking to confirm (or picking a different course) — same UI, smarter default.
- **A step further (genuinely "smart," not just keyword matching)** — e.g. reading and understanding an ambiguous file's actual subject matter — is Claude Code's job at runtime (via MCP, per the core architectural rule), not something to build into Atlas's own process. That would look like: the user asks Claude Code "where does this file go," Claude reads it and Atlas's course list via the Context Builder, suggests a course, and *the user* confirms the move through Atlas — never an automatic background classification.

**Status:** Open — the rule-based "suggest, don't auto-assign" version is buildable now and doesn't need a phase change; the "ask Claude Code to help sort an ambiguous file" version depends on Phase 4 (Context Builder/MCP) already existing. Needs a decision on whether the rule-based version is worth building before then, or whether manual course selection at upload (already fast — one modal click) is good enough until Phase 4.

### 17. Should handwritten notes (Phase 2) and external sync (Phase 3) swap order?

The user asked whether it makes more sense to do external sync before handwritten notes, given work already done in this session.

Handwritten notes (OCR via local Tesseract.js) is the more self-contained option — no OAuth, no Google Cloud project/consent screen, no token storage/refresh, no sync-conflict logic; it's an extension of upload/preview, which already exists. External sync is Atlas's first external dependency of any kind, and `ROADMAP.md`'s own stated Phase 1 philosophy ("Atlas is useful *before* any external sync exists") arguably applies just as well to *not* rushing into the first one. On the other hand, Classroom/Gmail sync likely delivers more everyday value sooner (automatic deadlines/resources vs. a feature that only helps courses where the user actually takes handwritten notes) — and question #15/#16 above show that some of what might motivate jumping to sync early (getting course data in without manual re-entry) can already be partly covered locally via the `ashoka-planner` import, which needs no phase reordering at all.

**Status:** Resolved (2026-07-26) — kept the original order. The user said "ok go ahead with phase 2" (handwritten notes), confirming the recommendation above rather than swapping in external sync first. Phase 2 is now built (see `STATUS.md` session 39, `ARCHITECTURE.md` §3); Phase 3 (external sync) is next per `ROADMAP.md`.

### 18. Local OCR vs. reading handwriting via Claude's vision

After using Phase 2's OCR import on their actual handwriting, the user found local Tesseract's accuracy poor (expected — `ARCHITECTURE.md` §3 already documented this as an accepted tradeoff of the no-cloud-API constraint, not a bug). They then asked directly: since Claude can already read handwritten images/PDFs via vision, could that replace OCR?

**Answer given:** Yes — Claude Code (this assistant) can read a handwritten scan directly today, no Atlas feature required, just by being shown the file. That's a fundamentally different and generally more accurate path than local OCR for handwriting specifically, and it fits "Atlas owns data, Claude owns reasoning" (`CLAUDE.md`) exactly: Atlas stores the scan, Claude reads it at query time when asked, nothing is a stored AI-generated transformation written back as fact.

**Decision (2026-07-26):** Don't drop OCR entirely — the user also pointed out OCR is still genuinely useful for **typed/printed PDFs that lack a text layer** (e.g. a scanned book), which is a different case from handwriting. Landed on:

- **Handwritten-note import no longer runs OCR automatically.** A scan is just stored (original file + blank note) until the user explicitly asks for OCR via a new "Run OCR" button, and even then the result is a reviewable draft (Discard/Insert), never silently trusted or auto-saved. See `ARCHITECTURE.md` §3 for the implementation.
- For an accurate read of a specific handwritten note, the expected path is now: ask Claude Code directly to read the note's original scan (already possible, no new Atlas work) — the in-app OCR button is for when a rough, good-enough, fully local pass is fine (e.g. skimming a stack of notes for keywords).
- **Follow-up, built 2026-07-26**: the "OCR helps for typed PDFs without a text layer" case is now built — a "Run OCR" action on the Resources preview modal, for any `kind = 'pdf'` resource. Same reviewed/opt-in shape as the notes flow: extracted text is shown for review, and only an explicit "Save extracted text" writes it to a new `resources.ocr_text` column and makes it searchable (`rebuildSearchIndex`). The original PDF still opens by default in all cases — Run OCR is a strictly additional action, not a replacement view. See `ARCHITECTURE.md` §3.
- **Follow-up, built 2026-07-26**: opening a handwritten note now shows the original scan by default, not the (blank-until-OCR) editor — the user pointed out that clicking a handwritten note should show the actual scan/PDF immediately, not an empty or OCR'd view. The toggle button switches to the editor/OCR view instead. See `ARCHITECTURE.md` §3.

**Status:** Resolved — both the Resources OCR action and the default-to-scan-view behavior for handwritten notes are built.

### 19. Easier upload from tablet (typed notes) and phone (handwritten scans)

The user will primarily take typed notes on a tablet and scan handwritten notes on a phone (via an app like Adobe Scan), and asked if there's an easier way to get those files into Atlas than manual transfer.

**Answer given:** For phone-scanned PDFs specifically, the existing **Watched Folders** feature (Phase 1, per-course, `ARCHITECTURE.md` §4) already solves most of this with no new Atlas development: point a watched folder at wherever a cloud-sync app (Google Drive/OneDrive/Dropbox desktop client, whichever the user already has) lands files synced from a phone or tablet, and Atlas auto-imports anything that appears there. Most scanning apps can "export"/"save" directly into a cloud-drive folder from the phone itself.

**Caveat surfaced originally:** watched folders import as plain `resources`, not as handwritten `notes` via the "Import scan" path (`is_handwritten`/`image_path`) — a scan landing via a watched folder became a Resource, not a Note.

**Follow-up, decided 2026-07-26 — the user rejected the local-sync-folder framing entirely.** A prototype using a local `chokidar`-watched folder (fed by a Google Drive/Dropbox desktop sync client) was started, but the user was explicit: the folder must be an actual **Google Drive folder Atlas scans directly** (e.g. "Atlas File Share"), not one that happens to exist on the laptop's disk via a desktop sync client. That requires the real Drive API, which only makes sense as Phase 3's Drive adapter — not a Phase 1 watched-folder extension — so the local-folder prototype was reverted (see `STATUS.md`).

**Built 2026-07-26 — the Google Drive adapter, reordered to the front of Phase 3.** Full implementation detail in `ARCHITECTURE.md` §4a; summary of what shipped against the user's spec:
- Scans one designated Drive folder (pasted as a link, not picked via a Google Picker widget) — on every launch, plus polling every 20s while Atlas is running (the user explicitly accepted this over true push, which would need a public HTTPS endpoint — not workable for a local desktop app). **Recursively scans subfolders too**, added after the user pointed out they'd want to organize the inbox folder with subfolders (e.g. one per course) without losing detection of files inside them.
- New files trigger a review panel: course + Resource/Note assignment **per file**, selectable individually or in bulk (shared bulk course/type selection applied to every checked row), with an explicit "do this later" close and a persistent pending-count/"Review new files" control on the Dashboard to reopen it (not forced to resolve immediately). An explicit **Ignore** action (per-file and bulk) was added on request — skips a file without importing it, and it stays skipped rather than reappearing on the next scan.
- Whether a file tagged "Note" becomes a typed note (plain text/markdown content) or a handwritten note (PDF/image, via the same `importScanBufferIntoNote` path "Import scan" already uses) is resolved automatically by file type at import time — both are supported, no separate choice needed from the user beyond "Resource" vs. "Note."
- Imported files are downloaded and copied into local managed storage exactly like any other resource/note — Drive is the inbox, not a live remote reference; "Atlas owns the data" (`CLAUDE.md`) still holds once something's tagged. Deleting the Drive original afterward has no effect on the imported copy; deleting an unreviewed pending file removes it from the pending list on the next scan instead of leaving a dead entry.
- Known, accepted limitations: native Google Docs/Sheets/Slides aren't scanned (can't be downloaded via Drive's plain-file API); re-uploading a "new" copy of a previously-imported file isn't deduplicated (Drive gives it a new file ID) — only Drive's own "Replace" keeps the same ID and gets skipped as already-imported; this is a one-time import, not a live two-way sync, so edits made on Drive after import don't flow back into Atlas.

**Status:** Resolved — built and manually verified against the user's real Google account and Drive folder (not covered by the automated `scripts/verify-app.js` suite, which has no way to supply a live OAuth token).

**Status:** Open — leans toward keeping the current order (Phase 2 = handwritten notes, Phase 3 = sync) for the lower-risk/self-contained reasons above, but this is a value-sequencing call for the user to make, not a technical blocker either way; both orders are equally buildable. `ROADMAP.md` stays unchanged until the user decides.

### 20. Google Classroom adapter — course mapping, attachments, and coursework auto-import

Built 2026-07-26, right after the Drive adapter. Unlike Drive (flat files, no course concept), Classroom has real course objects that need to map onto Atlas's own `courses` table. Three decisions were made with the user up front, plus one judgment call made during implementation:

- **Course mapping**: a name-match suggestion pre-fills the course-mapping review panel's picker, but the user always confirms (map to existing course, or create new) before anything is created or linked — same "explicit mapping only" precedent as question #11.
- **Attachments**: reuse the existing `resources` table (`source='classroom'` + `classroom_attachment_id`) rather than a new dedicated table, consistent with the "Unified Resource Library" principle. Only Drive-file coursework materials are imported (and only when Drive is also connected, since fetching content requires it) — link/YouTube/Forms materials have nothing downloadable to store as a `resources` row (`file_path` is required) and are skipped for now.
- **Sync frequency**: resolved as part of question #2 above — launch + manual "Sync now," no polling interval.
- **Judgment call**: once a Classroom course is mapped, new assignments/announcements within it import automatically — no per-item review step like Drive's. The ambiguity Drive's review panel exists to resolve (which course? which type?) doesn't apply here, since Classroom's API already returns typed, course-scoped data; only which Atlas course a Classroom course maps to is gated.
- Assignments mirror into the existing `deadlines` table (already has real Dashboard UI) so they're visible immediately — a dedicated Assignments/Announcements screen (`assignments`/`announcements` tables now have real synced data, unlike when question #13 deferred building that UI) remains a fast-follow, not built in this pass. **Announcements currently have no UI surface at all** (no due date, so nothing to mirror into Deadlines) — they're stored and deduplicated correctly but invisible to the user until that screen exists.

**Status:** Resolved/built — see `ARCHITECTURE.md` §4b. Not covered by the automated `scripts/verify-app.js` suite (same reason as the Drive adapter, question #19 — needs a live OAuth token and real Classroom course data); verified manually against the user's college account instead. The announcements-UI gap above was closed in question #21 (Announcements/Assignments/Classwork course-detail sections).

### 21. Classroom sync reliability bug, per-course Connect button, Classwork tab, Drive-link attachments, and Calendar

Built 2026-07-27, in direct response to a real bug report: the user's last Classroom import ("before we integrated the Ashoka Planner") pulled zero content for any mapped course.

- **Root cause, corrected after a real "Connect to Classroom" test still failed (2026-07-27, later the same day)**: the first pass fixed a real problem (no per-course `try`/`catch` around the sync loop) but that wasn't actually what was breaking things. The true cause: `upsertAssignment`/`upsertDeadline`/`upsertAnnouncement`'s `db.prepare()` calls threw `"ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint"` **unconditionally, every single time** — before the per-course loop even started. Their `ON CONFLICT (col) DO UPDATE SET ... WHERE col IS NOT NULL` syntax put the partial index's `WHERE` predicate after `DO UPDATE SET` (that's a *result-filter* clause, a different thing), but SQLite requires a partial unique index's predicate to be restated immediately after the conflict column list (`ON CONFLICT(col) WHERE col IS NOT NULL DO UPDATE SET ...`) before it will recognize the index as a valid conflict target. Confirmed by preparing both versions of the statement directly against the user's real `atlas.db` via a one-off `ELECTRON_RUN_AS_NODE=1` script. This means the original "nothing carried over" bug was likely never about a missing try/catch at all — these three statements probably never once succeeded since the Classroom adapter was first built. Fixed by moving the `WHERE` clause to directly follow the conflict target column list on all three.
- The per-course `try`/`catch` around `courseWork`/`announcements`/`courseWorkMaterials` calls is still a real, worthwhile fix (kept from the first pass) — failures are collected as `{courseId, courseName, message}` and returned up through `scanClassroomAndNotify`/`classroom:syncNow`/both mapping handlers/the new per-course connect handler, and the renderer `alert()`s the user when a sync partially fails instead of it looking identical to success.
- **A third real bug in the same live-test round, found immediately after the SQL fix**: connecting a course now got past the SQL error but failed with `"Request had insufficient authentication scopes."` — `courseWorkMaterials.list` (added for the Classwork tab, this same session) needs `classroom.courseworkmaterials.readonly`, a distinct scope with no `.me` variant, which was never added to `CLASSROOM_SCOPES` in `googleAuth.ts` when the Classwork sync was built. Fixed by adding it. **The user needs to disconnect and reconnect Google Classroom once** for this to take effect — an already-issued refresh token doesn't retroactively gain a newly-added scope; only a fresh OAuth consent grants it.
- **Gap the user caught while testing, before it caused real harm**: disconnecting a course from Classroom (per-course "Disconnect" button) only cleared `courses.classroom_course_id` — the already-synced announcements/assignments/deadlines/classwork/link-resources stayed untouched. That means connecting the *wrong* Classroom class had no real undo: disconnecting wouldn't remove the wrongly-imported content. **Resolved (user's explicit choice)**: per-course Disconnect now deletes everything that came from that link for that course — `deadlines`/`assignments` (`source='classroom'`), `announcements` (`source='classroom'`), all of that course's `classwork_materials` rows (cascades any resources referencing them via `classwork_material_id`), and any remaining `resources` with `source='classroom'` — all in one `db.transaction()`. The renderer confirms with the user first (`showConfirm`, same pattern as course deletion) since this is destructive and irreversible. The Dashboard's global "Disconnect Google Classroom" (revoking the whole OAuth connection) is unchanged — it still only clears the stored token, since it doesn't target one specific course's mapping the way the per-course button does.
- **Attachments redesigned as Drive links, not downloads** (user's explicit preference — "drive might be better for me as that means less files on my laptop"): a new `resources.kind = 'link'` value holds the external URL directly in `file_path` (no download, no dependency on Drive also being connected). This *also* fixes the old "link/YouTube/Forms materials have nothing downloadable" gap noted in question #20 — a link-kind resource represents any of those uniformly, since none of them need a local file. Opening one calls `shell.openExternal` instead of routing through the local preview server.
- **Classwork (the ungraded courseWorkMaterials tab)**: new `classwork_materials` table, synced the same per-course-guarded way as courseWork/announcements. Its attachments land as `kind='link'` resources with `classwork_material_id` set, so the Classwork course-detail section can group "post + its links" the way Classroom's own tab does.
- **Per-course "Connect to Classroom" button**: course detail now has its own Connect/Disconnect control (`classroom:listAvailableCoursesForLinking` + a small picker overlay) — this is the workflow the user actually wanted (question raised 2026-07-26): pre-create next semester's courses via the Ashoka Planner import, then link each one to Classroom directly, rather than mapping via the discover-new-courses review panel (which only ever offers "map to existing" for courses Atlas already knows about, or "create new").
- **Course-detail Announcements/Assignments/Classwork**: three new inline sections (same visual idiom as the existing Deadlines/Watched-folders sections — course detail had no tab pattern *at the time this was built*; that changed later the same session, see question #22), shown only once a course is actually linked.
- **Dashboard "Upcoming" widget and full Calendar page**: built from two screenshots the user shared. The Dashboard widget got a kind-filter tab row (All/Assignments/Exams/Readings/Other) and a denser row layout (date block, course-colored left border, kind badge, relative due-in label). The Calendar page (new sidebar entry) is a v1 scope only: month grid with up to 3 deadline chips per day + "+N more", and a right-column grouped-by-date Upcoming list + course-color legend. **Deliberately not built yet** (fast-follows, not silent cuts): a Day/Week view toggle, a mini date-picker, and the per-kind/per-course "Filters" checkbox panel the screenshot also showed.

**Status:** Resolved/built. Same manual-verification limitation as question #20 (no live-account coverage in `scripts/verify-app.js`) — verified by rebuilding and a spot pass against the user's 5 real Ashoka-imported courses, not by an automated Classroom-connected test.

### 22. UI polish batch — tabbed course detail, a real Settings page, Escape-to-close everywhere, clickable Classroom rows

Built 2026-07-27, same session as question #21, right after live-testing that work surfaced the two bugs recorded there. Eight distinct requests in one pass:

- **Course detail is now tabbed** (Overview/Deadlines/Announcements/Assignments/Classwork/Files) instead of one long scrolling page — the user's main complaint, and the same instinct Google Classroom's own course pages follow. The Classroom-content tabs (`#course-tab-announcements`/`assignments`/`classwork`) are hidden entirely, not just their content, for a course that isn't linked. `selectCourse()` always resets to the Overview tab for a freshly-opened course. This is course detail's first tab pattern ever — the inline Announcements/Assignments/Classwork sections built in question #21 just got moved into their own panels rather than redesigned.
- **A real Settings page** — new sidebar entry (Settings existed once, was removed in an earlier session for having "nothing to configure yet"; now it does). Google Drive/Classroom's connect widgets moved here wholesale (`Settings > Sources`) from the Dashboard — same element IDs relocated, not duplicated, so `renderDriveStatus`/`renderClassroomStatus` now run when Settings opens rather than every Dashboard render. `Settings > General` adds a real Dark/Light theme picker (calls the same `setTheme()` the top-bar toggle used to call — the top-bar toggle was later removed, see question #23, so Settings is now the only place to switch) and 5 accent-color swatches overriding `--color-accent` (persisted as `accentColor`) — chosen because that one CSS variable already drives active states/buttons/highlights throughout the app, so this recolors all of them at once with no per-component theming needed. `Settings > About` shows the app version via a new `app:getVersion` IPC call.
- **Escape now closes every remaining overlay** — Classroom connect picker, course-mapping/Drive/Ashoka review panels, the deadline editor, the course picker, the confirm dialog (resolves as Cancel), and the new Classroom item detail modal (see below). Previously only the note editor and resource preview handled Escape.
- **Announcements/Assignments/Classwork rows are clickable.** An assignment click looks up its mirrored `deadlines` row by `classroom_coursework_id` and opens the real (editable) deadline viewer — more useful than a read-only view since every synced assignment already has one. An announcement/classwork click opens a new shared read-only `#classroom-item-detail-overlay` instead (nothing to "edit" for those).
- **Link-resource icons now guess the real file type** (PDF/DOCX/PPTX/etc.) from the linked file's own name/extension rather than showing a generic 🔗 for every single one — display-only, `resources.kind` stays `'link'` either way.
- **Dashboard "Upcoming" widget and Calendar chips redone** for legibility, per two more shared screenshots — three-line date block + right-aligned red-when-urgent "Due in" block for the widget; two-line, course-color-tinted, taller chips for the Calendar month grid (max chips per day dropped 3→2 since the taller chips stopped fitting 3).

**Status:** Resolved/built. `scripts/verify-app.js` updated for the tabbed course detail (it drives Deadlines/Files content directly, which now needs the right tab clicked first — `selectCourse()` resetting to Overview on every reselect meant several existing steps needed a tab-click re-added, not just one). Settings' Drive/Classroom connections have the same live-OAuth verification limitation as questions #20/#21 — not covered by the automated suite, verified by inspection/build only in this pass.

### 23. Dashboard polish round 2 + a real "stale import" bug, plus Settings expansion still to come

Built 2026-07-27, same session as #22, after the user looked at the just-shipped Dashboard against the shared reference screenshot again and found six more things:

- **Columns now stretch to a flat bottom** — `align-items: start` (added earlier in this same session to work around the `upcoming-row` flex-direction bug) was removed now that the underlying bug is actually fixed; "My courses"/"Upcoming" are `.dashboard-widget-stretch` (flex column, inner `<ul>` at `flex: 1`) so they genuinely fill their stretched grid cell instead of just not-being-forced-short.
- **"My courses" rows are full-width and equal-width** — was a wrapping chip layout where a short course name produced a visibly narrower card; now a flat divided list, one row per course, same idiom as the rest of the dashboard's widgets.
- **Theme toggle removed from the top bar entirely** — Settings > General is the only place to switch themes now (was previously two reachable places; the user asked for one).
- **"Manage courses" / "View full calendar" now share one style** (`.dashboard-widget-footer-btn`) — both are full-width footer actions pinned to the bottom of their widget, rather than one living in the header as a plain button and the other as a `.link-button`.
- **Real bug, not a design ask: the "Upcoming deadlines" stat and Dashboard widget had no time filter at all** — every incomplete deadline with a due date counted/showed, including ones months overdue from the original Classroom import (see #21). Fixed with a new `deadlines.stale_import` column, set once at insert time (never touched by resync) — true when `due_at` was already in the past *at the moment the row was created*. `dashboard:stats`/`dashboard:upcomingDeadlines` filter it out; the full Calendar page (`deadlines:listAllWithCourse`) deliberately doesn't, so past deadlines still show there. A deadline that was future when created and has since lapsed naturally still shows as "Overdue" in Upcoming — the filter only hides ones that were already dead on arrival.
- **Still open**: the user wants to expand the Settings page further (more of what's in the reference screenshot's Settings mockup) but said they'd give more detail in a future session — don't build ahead of that, no shape decided yet.

**Status:** Resolved/built except the last bullet, which stays open until the user gives more detail. Same manual-verification limitation as #20-#22 for anything Drive/Classroom-related (none touched this round). No automated coverage yet for the `stale_import` filter specifically (would need a `scripts/verify-app.js` case that creates a deadline with a past due date and asserts it's excluded from `dashboard:upcomingDeadlines` — worth adding if this area gets touched again).

### 24. Dashboard column-height mismatch round 3, plus two deferred items (Resources source filter, Settings revamp)

Raised 2026-07-27 against the user's real data (5 real courses, 15 real upcoming deadlines) rather than the reference screenshot — round 2 (#23) fixed the flex-direction/stretch bugs but left a real gap: "My courses" (5 short rows) visibly didn't fill the same height as "Recently added" + "What changed" combined, because Upcoming's list had `max-height: none` and grew to fit all of its (often 8+) rows, making it — and therefore the whole stretched grid row — taller than the right column's two independently-capped widgets.

- Gave `#dashboard-courses-widget > ul` / `#dashboard-upcoming-widget > ul` the same `max-height` + `overflow-y: auto` pattern the right column's widgets already use (was `max-height: none` for these two), so all three columns settle near the same natural height instead of Upcoming dragging the row taller than everyone else.
- Enlarged "My courses" row sizing (padding, avatar, text) scoped to `#dashboard-course-list` only (not the shared `.course-avatar` used on the Courses page/course detail header), so 5 courses fill more of that now-shorter target height instead of leaving dead space below them.
- **Deferred, not built**: a Resources-page filter to show only local vs. Classroom (vs. eventually Drive/Gmail) resources. Recommended waiting until the Gmail adapter lands (`ROADMAP.md` Phase 3) — with only two real sources today it's a thin win; once Gmail adds a third, the filter earns its place as real navigation rather than a two-way toggle. User hasn't confirmed either way yet.
- Settings-page revamp (see #23's last bullet) — still nothing new; still waiting on the user's detail.

**Status:** Column-height/row-size fix resolved/built, verified via `npm run verify` (screenshot only shows the 1-course test fixture, so the multi-course real-height fix couldn't be visually confirmed in that run — worth a look at the user's own launch). The two deferred items are open, not scheduled.

### 25. Courses page card alignment + a structural fix for the dashboard height whack-a-mole

Raised 2026-07-27, same day as #24, against real screenshots of both the Courses grid and the Dashboard.

- **Courses page cards**: `.course-card-counts` (the Resources/Deadlines row) just followed `.course-card-top` in normal flow, so a course with several `/`-separated codes (wrapping `.course-card-code` to two lines) pushed its counts row lower than a sibling card whose code fit on one line — misaligned across a row of otherwise-equal-height cards. Fixed by making `li.course-card` a flex column and giving `.course-card-counts` `margin-top: auto`, so it's pinned to the card's bottom regardless of how tall the text above happens to be. The `.view-list` toggle's override needed `flex-direction: row` and `margin-top: 0` restated explicitly (the per-property cascade gotcha in `CLAUDE.md`) since it doesn't otherwise inherit safely from the new grid-view default. **Kept** — the user confirmed this one works.
- **Dashboard grey space below "View full calendar"**: tried giving `.dashboard-widget-stretch` an explicit fixed `height: 560px` with flex-filling, uncapped lists, instead of the guessed pixel caps from round 3 (#24). **Reverted** the same day — the user reported it broke the Dashboard's overall look against their real data, more than it fixed the one gap it targeted. Back to round 3's approach (`max-height: 360px` + `overflow-y: auto` on the My Courses/Upcoming lists, no explicit widget height). The grey-space-below-button issue may still recur; if revisited, don't reach for another guessed pixel value without checking against the user's real dashboard first, not just the 1-course test fixture.

**Status:** Courses-card fix resolved/built and confirmed by the user. Dashboard height change reverted at the user's request 2026-07-27 — back to round 3's state, not resolved.
