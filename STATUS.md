# Atlas — Status

Living snapshot of where the project actually is. This is the first thing to read (after `CLAUDE.md`) in a new chat or after context compaction — it should be possible to resume correctly from this file alone plus the other docs it points to, without the user having to re-explain anything.

**Last updated:** 2026-07-25 (session 21)

## Where things stand (accurate as of session 21 — read this before the per-session log below)

- Repo: [github.com/PamacKR/Atlas](https://github.com/PamacKR/Atlas), private, owned by the user (`PamacKR`). Commits authored as `Claude <noreply@anthropic.com>` (repo-local git config) — don't change without being asked.
- **Phase 0 (docs) done. Phase 1 (local-only workflow) is substantially built and working**, not just scaffolding:
  - Courses: create (name/code/term-dropdown), list, delete (right-click → native menu → in-app confirm modal). Each course gets a human-readable on-disk folder (`courses.folder_name`, sanitized + collision-safe, computed once at creation).
  - Resources: manual upload (native file picker), list per course, delete (same right-click pattern), original filenames preserved on disk.
  - **In-app preview** for every supported kind: PDF/image render natively, markdown via `marked` (pinned to v12 for CJS compat), DOCX via `mammoth`, XLSX via `xlsx`/SheetJS (HTML tables, formula evaluation off), PPTX as a text-only slide outline (documented scope line — no free library renders real slide layout).
  - **Open in browser** (session 20, replaces the old "Open in default app"): right-click any resource → opens it in the user's real default browser, in a real tab, instead of Electron's own preview or a native desktop app. Backed by a loopback-only local HTTP server (`src/main/localServer.ts`) that streams PDF/image/text as their native type and reuses the exact same markdown/DOCX/PPTX/XLSX conversion the in-app preview uses for everything else. Deliberately does not route through Google Docs/Sheets — that would require uploading files to Google Drive first (a real Phase-3-scale architecture change), whereas this keeps everything local. See `ARCHITECTURE.md` §7.
  - Image previews: center on both axes, zoom via buttons/Ctrl+scroll (25–400%), **remembered per-resource** (`resources.zoom_level`). Zoom is strictly scoped to images only — this took three rounds to fully close out, see sessions 15/17/18 below and the `CLAUDE.md` "recurring CSS bug" note.
  - List/Icon view toggle for the resource list.
  - Fullscreen toggle on the preview panel (icon buttons, tightened chrome).
  - **Local folder watching** (session 19, deletion sync added session 21): per-course "Watched folders" section — user picks a folder via a native directory picker, explicitly mapped to that one course (`watched_folders` table, `chokidar`). New files (including ones already sitting in the folder when watching starts) are copied into the course's managed storage automatically, identical to manual upload, and the open resource list refreshes live. **Deleting a file from a watched folder now deletes the resource it produced** too — both live (`chokidar`'s `unlink` event) and retroactively (a reconciliation pass runs whenever a folder's watcher starts, catching deletions that happened while Atlas wasn't running) — so a removed source file never leaves a broken "resource not found" entry behind. Folder→course mapping is deliberately explicit, never auto-guessed — see `docs/open-questions.md` #11 and `ARCHITECTURE.md` §4. "Stop watching" is right-click-only on the folder entry, same pattern as course/resource delete.
  - **Not yet built** (rest of Phase 1, per `ROADMAP.md`): notes UI, dashboard, global search UI (the FTS5 `search_index` table exists but isn't populated yet).
- **Self-testing:** `npm run verify` (`scripts/verify-app.js`) launches the real app via Playwright's Electron driver and exercises courses, upload, preview (markdown/image/txt), zoom + persistence, delete (via direct API call, since native context menus can't be automated), view toggle, and folder watching (pre-existing files in a newly-watched folder + a file dropped in live, both auto-imported) — all against a throwaway temp dir, never real storage. Extend this file whenever a UI change needs verifying, rather than relying solely on the user.
- **One-click launch:** `Launch Atlas.bat` (repo root) + a `Atlas` Desktop shortcut pointing to it. Both run `npm start` (`npm run build && electron .`), so every launch always rebuilds from current source — no separate deploy step exists or is needed.
- **User's standing test data** (real `Downloads/Atlas-Storage`, not test-suite temp dirs): two seeded courses, **Data Structures & Algorithms** (CS201, now 8 resources — a `CS201-gradebook.xlsx` with realistic assignment/quiz/exam scores across two sheets was added session 21) and **Database Systems** (CS305, 7 resources), covering pdf/docx/pptx/xlsx/image/txt/md/zip. Leave alone unless told otherwise.
- Recurring lesson (hit 3x — `#preview-overlay`, `#confirm-overlay`, `#zoom-controls`): an element toggled via `el.hidden` must never have `display` set unconditionally on its own ID selector, or that CSS outranks the default `[hidden] { display: none }` rule. Written into `CLAUDE.md` as a standing check.

## Decisions locked in (don't re-litigate)

- **Stack:** Electron + TypeScript, SQLite (`better-sqlite3`, FTS5 for search). See `ARCHITECTURE.md` §1–2.
- **OCR:** local/offline via Tesseract.js — explicitly *not* a cloud OCR API, because of the zero-API-fees constraint. Handwriting accuracy will be mediocre; that's an accepted tradeoff, not a bug. See `ARCHITECTURE.md` §3.
- **Claude integration:** local MCP server exposing a Context Builder query layer; static file export kept as a fallback for non-MCP tools. See `ARCHITECTURE.md` §6.
- **Data directory:** `Downloads/Atlas-Storage/` — an Atlas-managed folder, deliberately placed somewhere browsable rather than a hidden system path, so the user can manually add/remove files, and deliberately a *different* folder from this repo (`Downloads/Atlas/`) so git operations can never touch real data. Course subfolders under `files/` are named after the course itself, not an ID. DB and config live alongside it. See `ARCHITECTURE.md` §2 and `docs/open-questions.md` #6.
- **Hard guardrails (user-mandated, 2026-07-23):**
  1. Atlas makes **zero AI/LLM API calls internally**, ever. Claude Code (external process, user's own subscription) is the only reasoning engine — this is why MCP was chosen over Atlas calling Claude's API itself.
  2. **Zero paid/metered API usage anywhere in the project**, for anything, without explicit user approval first. All Google API access must stay on the free tier with no billing account attached.
  - Full reasoning in `CLAUDE.md` "Hard guardrails" section and `ARCHITECTURE.md` §0 — treat both as settled requirements, not preferences.
- **Continuity practice:** the user compacts/switches chats deliberately and will give a heads-up first in case last-minute doc changes are needed. This `STATUS.md` file exists specifically so a fresh session can pick up correctly without acting against prior decisions — keep it honest and current.

## Genuinely open (needs a decision, don't assume)

See `docs/open-questions.md` for full detail. Nothing blocking right now — all previously-blocking items are resolved:

- **#8 College Google Workspace access** — resolved 2026-07-23. Verified via OAuth Playground: both Classroom and Gmail read scopes authorize cleanly against the college account, no admin block. Phase 3 can be scoped against the college account.

Still open, lower urgency (not blocking Phase 1): notes format (Markdown vs. rich text, #1), sync frequency/manual-vs-automatic (#2), sync-conflict policy (#3), course/semester archiving rules (#4), whether to build one-way PDF zoom memory (#10, needs a user decision — see "What's next" below), whether to route Office-file preview through Google Drive for real layout fidelity (#12, explicitly deferred to Phase 3 by the user).

## Session 21 additions

- **Watched-folder deletion now syncs**: deleting a file from a watched folder deletes the `resources` row (and its managed-storage copy) too, both live via `chokidar`'s `unlink` event and retroactively via a `reconcileWatchedFolder()` pass that runs whenever a folder's watcher (re)starts — catches files deleted while Atlas wasn't running, which `unlink` alone can't see. Previously such resources stayed listed and threw "resource not found" when opened.
- **Added a real `.xlsx` to the user's standing test data** — `CS201-gradebook.xlsx` in Data Structures & Algorithms, two sheets (Assignments: 11 rows across homework/quizzes/exams/projects with realistic scores; Grade Summary: weighted category breakdown), generated with the same `xlsx` library Atlas depends on and uploaded via the existing `ATLAS_TEST_UPLOAD_PATH` hook against real storage (same pattern as the original session-11 seed data). Verified it renders correctly both in-app and via "Open in browser."
- **User feedback on PPTX fidelity, logged as `docs/open-questions.md` #12**: after trying "Open in browser" on a real slide deck, the user said the text-only outline is fine for now but they'll likely want the Google Drive route (real slide rendering via Google Slides) once Phase 3 sync work starts anyway, since the Drive OAuth/upload plumbing would already exist at that point — explicitly not something to build now.
- `scripts/verify-app.js` extended: deletes a watched folder's source file mid-run and confirms both the resource entry and its managed-storage copy disappear.

## Session 20 additions

- **"Open in default app" replaced with "Open in browser"**, per explicit user request: they wanted every file type reachable from real, switchable browser tabs instead of separate native-app windows. User initially asked about auto-opening DOCX/PPTX/XLSX in Google Docs/Sheets specifically — flagged before building that this would actually require uploading each file to Google Drive first (Google's viewers can only fetch from a public URL, not a local `file://` path), a real architecture change out of scope right now. User agreed to try a local-only alternative first.
- **New local HTTP server** (`src/main/localServer.ts`), loopback-only (`127.0.0.1`, random port, never network-reachable), started at app launch. `GET /resource/:id` streams PDF/image/text as their native content type (browser renders natively) and reuses the *exact same* `getPreview()` conversion the in-app preview already used for markdown/DOCX/PPTX, wrapped as a standalone HTML page. The right-click menu's "Open in browser" calls `shell.openExternal()` on this URL instead of the old `shell.openPath()` (which launched Word/PowerPoint/etc.). The now-fully-dead `resources:open`/`openResource` IPC path (superseded back in session 9-12 once click-to-preview replaced the old Open button, but never removed) was deleted while touching this area.
- **XLSX support added** — new resource kind, previously not previewable in-app at all. Rendered via `xlsx` (SheetJS) to HTML tables, both in-app and through the local server. **Known caveat, documented in `ARCHITECTURE.md` §7:** the npm `xlsx` package has unpatched prototype-pollution/ReDoS advisories with no newer npm release available (SheetJS moved fixes to their own CDN) — accepted as low-risk since Atlas only parses the user's own local files, never untrusted network input, and formula evaluation is disabled on read. Worth revisiting if spreadsheets ever come from an external/untrusted source later.
- **Found and fixed a real pre-existing bug** while checking the PPTX-in-browser output: `extractPptxOutline()`'s text extraction pulls raw text straight from the slide XML, which is already XML-entity-escaped (a literal `&` is stored as `&amp;`); the existing `escapeHtml()` call was re-escaping it into `&amp;amp;`, which browsers display as the literal text `&amp;` instead of `&`. Fixed with a `decodeXmlEntities()` step before `escapeHtml()`. Pre-existed since the PPTX preview was first built (session 10) but wasn't visibly caught before, since in-app preview testing hadn't included a slide with an ampersand.
- `scripts/verify-app.js` extended: fetches the local server directly (native context menu can't be automated, same limitation as delete) for a markdown resource, a freshly-generated real `.xlsx` (built with the same `xlsx` library, not just a byte fixture) confirming it renders as an HTML `<table>`, and an image resource confirming raw `image/png` content-type. While adding this, hardened three spots in the script that previously grabbed "whatever's newest in the DOM" (`.resource-name >> nth=0`) to instead capture the real resource ID directly from `uploadResource()`'s return value — SQLite's `datetime('now')` is only 1-second resolution, so near-simultaneous uploads can tie on `added_at` and make DOM order unreliable (this caused one real flaky failure while writing the new tests, now fixed at the root rather than papered over with a longer wait).

## Session 19 additions

- **Local folder watching built** — the next Phase 1 item per the session-18 note below. Folder→course mapping decided as explicit-only (not auto-guessed) rather than asking the user to confirm mid-session, on the reasoning already flagged as the leaning in session 18 and consistent with the "Atlas owns data, Claude owns reasoning" rule — logged as a resolved decision in `docs/open-questions.md` #11 rather than silently picked with no record.
- New `watched_folders` table (`course_id`, `folder_path` UNIQUE) and a new `resources.watch_source_path` column (migration added for existing DBs). One `chokidar` watcher per watched folder, managed in `main.ts` (`activeWatchers` map); started for all rows at app launch and for any newly-added folder; stopped on "Stop watching" and when its course is deleted (cascade-delete alone would've left an orphaned live watcher).
- Manual upload's copy-into-storage + insert-resource logic was factored out into a shared `importFileIntoCourse()` so watched-folder imports go through the exact same path (same filename handling, same collision-disambiguation) instead of a parallel implementation.
- UI: each course's Resources section now has a "Watched folders" list with a "Watch a folder…" button (native directory picker); right-click a watched folder → "Stop watching" (same right-click-only pattern as course/resource delete, per the CLAUDE.md UI convention already established). The main process pushes a `resources:changed` event to the renderer when a watcher imports a file, so the resource list refreshes live if that course is open — not just on next manual reselect.
- `scripts/verify-app.js` extended: watches a temp folder that already contains a file (confirms pre-existing files are picked up, not just future ones), then drops a second file in while the watcher is live (confirms ongoing detection), both via the same `ATLAS_TEST_WATCH_FOLDER_PATH` env-var test-hook pattern already used for uploads. Full suite passes.

## Session 18 additions

- **The actual bug behind the repeated zoom-scoping reports, finally found**: `#zoom-controls { display: flex; ... }` set `display` unconditionally on an ID selector, which outranks the browser's default `[hidden] { display: none }` rule — so even though the JS logic correctly set `zoomControls.hidden = true` for every non-image type, the CSS kept it visibly rendered anyway (user saw it on a `.txt` file). This is the exact same class of bug already hit and fixed twice before, for `#preview-overlay` (session 10) and `#confirm-overlay` (session 11) — should have caught this one at the same time; noted for future `[hidden]`-toggled elements to always double-check for an unconditional `display` on their own ID selector. Fixed with `#zoom-controls:not([hidden]) { display: flex; }`. Audited the rest of the stylesheet for the same pattern — nothing else affected (the other `display: flex` rules found belong to descendants of already-correctly-hidden ancestors, not elements toggled via `.hidden` themselves).
- `scripts/verify-app.js` now explicitly asserts `#zoom-controls` stays hidden for both a markdown and a `.txt` preview (the exact reported case) — regression-proofed going forward.

## Session 17 additions

- **Found and fixed the actual remaining leak** behind the user's repeated "scaling doesn't work / applies to other file types" report: session 15's scoping only covered the JS `applyImageZoom()` lookup and the zoom-controls *visibility* — two spots still used the generic, unscoped `#preview-body img` selector: (1) the CSS rule setting `max-height`/`transform-origin`/`transition`, which applied to *any* image including ones embedded in rendered docx/pptx/markdown HTML, and (2) the Ctrl+scroll wheel handler's guard check. Both now scoped strictly to `img.preview-image` (the dedicated class on the standalone image-preview `<img>`); embedded images inside `.preview-html` get a separate, transform-free `max-width: 100%` rule. Zoom (buttons, Ctrl+scroll, and its CSS) now provably cannot touch anything but a real image-kind resource.

## Session 16 additions

- **Two persistent test courses seeded** into the user's real `Downloads/Atlas-Storage`, replacing the earlier single "Test Course": **Data Structures & Algorithms** (CS201, Monsoon 26 — the original sorting-algorithms set) and **Database Systems** (CS305, Spring 27 — a new normalization/joins/indexing set), 7 sample resources each (pdf, docx, pptx, image, txt, md, zip), all realistic and multi-page/multi-slide. This is the user's standing test data going forward — leave it alone unless told otherwise, same as before.
- Confirmed for the user: the Desktop shortcut / `Launch Atlas.bat` always rebuilds (`npm start` = `npm run build && electron .`) before launching, so any code change is picked up automatically on next launch — no separate "deploy" step exists or is needed at this stage.

## Session 15 additions

- **Zoom scoping tightened**: the `<img>` created for a standalone image preview now gets a dedicated `.preview-image` class, and all zoom logic (`applyImageZoom`, the wheel handler) targets `#preview-body img.preview-image` specifically — not just any `<img>`, which could otherwise have matched an image embedded inside rendered docx/pptx/markdown HTML. Zoom UI was already scoped to `preview.type === 'image'` only (PDF/other types never showed it); this closes a latent cross-contamination risk rather than fixing an observed bug — the user's report was almost certainly just PDF's built-in Chromium zoom not being ours (expected — iframe content is a separate document, our wheel handler can't reach it).
- **Per-resource zoom is now remembered** — new `resources.zoom_level` column (migration added for existing DBs), set via `resources:setZoom` IPC whenever the user changes zoom (buttons or Ctrl+scroll), and restored automatically the next time that exact resource is previewed. Verified end-to-end in `scripts/verify-app.js` (zoom to 150%, close, reopen, confirm still 150%).
- **Real "Test Course" and its 7 seeded files deleted** from the user's actual `Downloads/Atlas-Storage`, per explicit request — confirmed `files/` is now empty.
- **One-click launcher added**: [`Launch Atlas.bat`](../Launch%20Atlas.bat) in the repo root (`cd`s to itself, runs `npm start`) plus an `Atlas` shortcut on the user's Desktop pointing to it (using Electron's own icon). Both tested working. Documented in `README.md` "Running it."
- **Open question raised, not yet resolved**: the user's ask "remember the scaling for that exact file" used PDFs as the motivating example, but Chromium's built-in PDF viewer (used for PDF preview) runs in an isolated iframe with no scripting API we can read live zoom from — only a one-way `#zoom=N` URL-fragment hint is possible (sets initial zoom, can't observe what the user changes it to afterward, and would need its own separate control since Ctrl+scroll can't reach into the iframe). Implemented per-resource zoom memory for **images only** this round; PDF zoom-memory needs a decision from the user on whether that one-way, reload-based approach is worth building — see `docs/open-questions.md`.

## Session 14 additions

- **Images now center both horizontally and vertically** in the preview panel (`#preview-body.centered`, flex-centered), not just horizontally as before.
- **Zoom controls added for image previews**: −/+/Reset buttons plus Ctrl+scroll-wheel (`#zoom-controls`, 25%–400% range, 25% steps), implemented via CSS `transform: scale()` on the `<img>`. Zoom resets to 100% every time a new preview opens. Not added for PDF — Chromium's built-in PDF viewer already has its own zoom controls (per the user's own observation).
- **`scripts/verify-app.js` now uploads two resources** (markdown + a tiny embedded-base64 test PNG) and covers the zoom/centering behavior end-to-end. Caught and fixed a real bug in the test script itself while adding this: the resource-delete step grabbed "whatever `.resource-name` is first" to get an ID, which broke once a second (newer) upload sorted before the markdown one — fixed by capturing the markdown resource's ID right after its own upload instead of relying on list order later.
- User decided to hold off on giving UI direction until more features are built; current visual state is considered acceptable for continued feature work in the meantime.

## Session 13 additions

- User confirmed delete (via right-click) works correctly in real use.
- **Fullscreen preview chrome tightened** — header bar and padding shrink significantly in fullscreen mode (was still leaving a lot of unused border/padding around the content).
- **Fullscreen/Close buttons are now monochrome icon buttons** (inline SVG, `stroke="currentColor"`) instead of text labels — expand/compress icon toggles with fullscreen state, X for close. No icon library added; these are small inline SVGs directly in `index.html`/`renderer.ts`.
- **UI direction question raised and answered**: recommended giving a rough visual direction now (palette/density/reference feel) rather than waiting until all features are built, to avoid restyling scaffolding twice — but held off on a full design pass until Phase 1 features are more complete. Still waiting on the user's actual direction as of this update.

## Session 12 additions

- **Add-course form now sits above the course list** (was below).
- **Fullscreen toggle added to the preview panel** (`#preview-fullscreen` button) — expands the panel edge-to-edge; resets to non-fullscreen every time the preview is closed and reopened.
- **All visible Delete buttons removed** — deleting a course or resource is now right-click-only (native Electron `Menu`, same as "Open in default app" already was for resources). Added the equivalent native context menu for courses (`resources:courseContextMenu` IPC in `main.ts`, `showCourseContextMenu`/`onCourseContextMenuDelete` in preload). The in-app confirm modal (session 11) still gates both.
- **Test coverage tradeoff, worth knowing:** since delete is now exclusively behind a native OS context menu, `scripts/verify-app.js` can no longer click a "Delete" button to test the flow — Playwright cannot drive native menus. It now calls `window.atlas.deleteResource()`/`deleteCourse()` directly (the same underlying API the menu's "Delete" item calls) to verify the delete + list-refresh logic, but the actual right-click → menu → click interaction is **not covered by the automated suite** and needs a manual check from the user occasionally.
- User asked to leave the seeded "Test Course" (in their real `Downloads/Atlas-Storage`) alone for now while they test — noted, will only delete/modify on explicit instruction. (`Verify Script Test Course` is unrelated — that name only ever exists transiently inside `scripts/verify-app.js`'s throwaway temp directories, never in real storage.)

## Session 11 additions

- **Native `window.confirm()` replaced with an in-app modal** (`#confirm-overlay` in `index.html`, `showConfirm()`/`resolveConfirm()` in `renderer.ts`) — styled consistently with the rest of the UI instead of an OS-native dialog box. Same `[hidden]`-vs-ID-selector CSS specificity trap as the preview overlay (see session 10) applied here too; fixed the same way (`#confirm-overlay:not([hidden])`). `scripts/verify-app.js` updated to click `#confirm-yes`/`#confirm-cancel` instead of relying on Playwright's native-dialog auto-accept, and now also covers the Cancel path (resource must survive if Cancel is clicked).
- **Real "Test Course" seeded into the user's actual `Downloads/Atlas-Storage`** with 7 sample resources — one of every supported kind, multi-page/multi-slide with realistic academic content (a sorting-algorithms lecture theme, consistent across files): a 5-page PDF (via `reportlab`), a multi-page DOCX with headings/lists/a code snippet (via `python-docx`, explicit page breaks), an 8-slide PPTX (via `python-pptx`), a generated PNG complexity chart, a plain-text raw-notes file, a Markdown study guide (table, code block, list), and a ZIP with a few starter files inside. Generated with Python (`python-docx`, `python-pptx`, `Pillow`, `reportlab` — installed via pip for this one-off generation task, not a project dependency) and uploaded into the real app via the existing `ATLAS_TEST_UPLOAD_PATH` test hook (same upload code path a real user upload takes, just skipping the native file-picker dialog). This is real seeded data in the user's actual storage, not a throwaway test — it's meant to stay there for them to click through.

## Session 10 additions

- **In-app resource preview built** (`ARCHITECTURE.md` §7): click a filename to open a preview overlay — PDF/image render natively, markdown renders via `marked` (pinned to v12, since v13+ dropped the CJS build our CommonJS main process needs), DOCX converts to HTML via `mammoth`, PPTX gets a text-only slide outline (no free library renders real slide layout, so this is a deliberate scope line, not a bug — see `ARCHITECTURE.md` §7 for the full reasoning). Right-click any resource for a native context menu with "Open in default app" (the old separate "Open" button is gone — replaced by click-to-preview, matching how a real file manager behaves).
- **List/icon view toggle** added above the resource list.
- **Two real bugs hit and fixed while building this:**
  1. `marked@18` (latest at install time) is ESM-only with no CJS export condition — `require('marked')` in the CommonJS main process threw `ERR_REQUIRE_ESM` at startup. Tried a dynamic `import()` as a workaround, but TypeScript (with `module: commonjs`) downlevels dynamic imports back into a `require()` call anyway, so it didn't help. Fixed by pinning to `marked@^12.0.2`, the last major with a working CJS build.
  2. The preview overlay's CSS set `display: flex` directly on `#preview-overlay` (an ID selector), which outranked the browser's default `[hidden] { display: none }` rule — so the "hidden" overlay was actually still visible and intercepting clicks. Fixed with `#preview-overlay:not([hidden]) { display: flex; }` instead.
- Manually verified (outside the permanent test suite, via throwaway fixture files) that DOCX and PPTX preview actually produce correct output — a minimal fixture `.docx` and `.pptx` were built with Python's `zipfile` and run through the real app; both rendered as expected. `scripts/verify-app.js` itself only exercises the markdown path end-to-end (safe to click in an automated run) plus the view toggle; it does not click "Open in default app" for the same reason as before — that would launch a real external OS application during an automated run.
- **Fixed doc drift**: `ROADMAP.md` Phase 2 still said "OCR pipeline (Google Cloud Vision)" from before the OCR decision changed to local Tesseract.js — missed in an earlier session, caught and fixed now.

## Session 9 additions

- **Course folders are now named after the course** (e.g. "test123"), not `course-<id>`. `courses.folder_name` is a new column, computed once at course creation (sanitized for filesystem-invalid characters, disambiguated with `(2)`, `(3)`... on collision) and stored — deliberately *not* recomputed from the course name later, so a future rename feature won't silently break already-stored file paths. Existing dev databases get this column added automatically via a small migration in `src/main/db/database.ts` (`PRAGMA table_info` check + `ALTER TABLE`).
- **Uploaded files keep their original filename** instead of a timestamp prefix — only disambiguated (`name (2).ext`) if that exact filename already exists in the course's folder.
- **"Open" button added per resource** — uses `shell.openPath()` to open the file with the OS's default application. This is the PRD §10 fallback path ("if native viewing is unavailable, open the default external application"), not the proper in-app PDF/image/markdown viewer, which is still a separate upcoming Phase 1 item. Deliberately *not* exercised by `scripts/verify-app.js` (only checked for presence in the DOM) — actually invoking it would launch a real external OS application during an automated test run, which isn't safe/appropriate to trigger from a script.

## Session 8 additions

- **Course term is now a fixed dropdown**, not free text: Monsoon 26, Spring 27, Monsoon 27, Spring 28 (user-specified list, in `src/renderer/index.html`). If more terms are needed later, add `<option>`s there.
- **Delete added for both courses and resources**, needed for the user to freely test/clean up without leftover data piling up. Deleting a course removes its entire `files/course-<id>/` folder from disk and cascades to delete its `resources` rows (FK `ON DELETE CASCADE`, `foreign_keys` pragma is on). Deleting a single resource removes just its file and row. Both prompt a native `confirm()` before proceeding. `scripts/verify-app.js` now covers both delete paths and auto-accepts the confirm dialog (`window.on('dialog', ...)`, since Playwright auto-dismisses dialogs by default otherwise).

## What's next (updated session 19 — supersedes the session-18 note below, kept for history)

Local folder watching (previously "proposed next") is now built — see session 19 above.

Remaining Phase 1 items, no particular order yet: notes UI (format still open, `docs/open-questions.md` #1), dashboard, global search UI (FTS5 table exists, unpopulated).

<details>
<summary>Superseded — original session 18 note</summary>

Proposed next: **local folder watching** (chokidar) — reuse the same "insert into resources" logic manual upload already has; the new piece is (a) watching user-designated folder(s) for new files and (b) deciding which course a detected file belongs to (leaning toward explicit user-configured folder→course mapping over auto-guessing, but this wasn't confirmed with the user yet — ask before building). Not started as of session 18.

</details>

**Open question needing the user's decision** (not blocking, but don't build silently): whether to implement one-way "set an initial zoom via a separate control" for PDF previews, given Chromium's built-in PDF viewer can't be read from/written to live — see `docs/open-questions.md` #10.

User has said to commit/push continuously without waiting for approval in this repo (see `CLAUDE.md` "Git workflow") — keep doing that.

<details>
<summary>Superseded — original session 7 note</summary>

**Manual file upload is done and verified** (self-tested via `npm run verify`, screenshot confirmed): click a course to select it, "Upload file" opens a native file picker, the file is copied into `Downloads/Atlas-Storage/files/course-<id>/` with a timestamp prefix (collision-safe), a `resources` row is inserted with `kind` auto-detected from file extension, and the resource list re-renders under the selected course. `main.ts` has an `ATLAS_TEST_UPLOAD_PATH` env-var test hook so `scripts/verify-app.js` can drive the upload without needing to interact with the native OS file dialog (which Playwright can't click into).

Remaining Phase 1 work, roughly in order: local folder watching (chokidar) — reuse the same "insert into resources" logic as manual upload; resource viewer (PDF/image/markdown/text, falling back to the OS default app); notes UI (typed notes, format still open per `docs/open-questions.md` #1); dashboard; global search UI wired to the existing FTS5 `search_index` table (not populated yet — decide when building search whether to backfill it retroactively for resources added via upload/folder-watch).

(Note: resource viewer and folder-naming details in this superseded note are now out of date — see "Where things stand" above for current reality.)

</details>
