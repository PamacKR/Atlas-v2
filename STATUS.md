# Atlas — Status

Living snapshot of where the project actually is. This is the first thing to read (after `CLAUDE.md`) in a new chat or after context compaction — it should be possible to resume correctly from this file alone plus the other docs it points to, without the user having to re-explain anything.

**Last updated:** 2026-07-23 (session 13)

## Where things stand

- Repo created: [github.com/PamacKR/Atlas](https://github.com/PamacKR/Atlas), private, owned by the user (`PamacKR`).
- Commits in this repo are authored locally as `Claude <noreply@anthropic.com>` (repo-local git config, not global) — the user does not want their `thehawkeye` identity on these commits. Don't change this without being asked.
- Phase 0 (docs) is done. Phase 1 scaffolding has started and the app **runs end to end**: Electron main process, preload/contextBridge, SQLite schema (courses/resources/notes/deadlines/announcements/assignments + FTS5 search index), and a minimal renderer (course list + add-course form) all verified working together.
- Verified: `npm install --ignore-scripts` then `npx @electron/rebuild -f -w better-sqlite3` gets a working native binary (no Visual Studio/build tools needed on this machine — a prebuilt Electron-ABI binary was available). Plain `npm install` fails here because there's no prebuilt `better-sqlite3` binary for the host Node version (v24.18.0) and no C++ build toolchain installed. Documented in `README.md` "Running it".
- User confirmed the app launches and the UI renders (screenshot reviewed together, 2026-07-23) — course list + add-course form visible. Two real bugs were caught and fixed from that first real launch (see below); the app is now verified working end-to-end, including add-course actually persisting and re-rendering.
- **Self-testing infrastructure added:** `npm run verify` (`scripts/verify-app.js`) launches the built app via Playwright's Electron driver (`_electron`), exercises the UI (fill form, submit, check DOM, screenshot), and runs against a throwaway temp directory via an `ATLAS_DATA_DIR` env override in `src/main/paths.ts` — never touches the user's real `Downloads/Atlas-Storage`. This exists because Claude has no generic way to screenshot a native desktop window otherwise (only browser tabs) — use and extend this script for future UI changes instead of relying solely on the user to click around. See `CLAUDE.md` "Testing UI changes yourself."
- **Two real bugs fixed** (session 5), both in the initial renderer scaffold: (1) `import type` in `renderer.ts` made TS treat it as an ES module and emit a CommonJS `exports` header, which threw in a plain `<script>` tag with no module system and silently killed the entire script (nothing rendered past the static HTML). (2) `contextBridge.exposeInMainWorld('atlas', ...)` creates a global binding named `atlas`; a local `const atlas = ...` in the same global script scope collided with it (`SyntaxError: Identifier 'atlas' has already been declared`). Fixed by keeping `renderer.ts` a plain script (no import/export/declare-global) and naming the local variable `atlasApi`.
- **Data cleanup (session 6):** the very first `verify` run (before the throwaway-temp-dir fix existed) had already inserted a "Verify Script Test Course" row into the user's *real* `Downloads/Atlas-Storage/atlas.db`, and its cleanup step failed at the time (that failure was visible to the user, who understandably asked what it meant). Removed directly via Python's stdlib `sqlite3` (avoided the same Electron-vs-plain-Node ABI mismatch that blocked a Node-based fix). Real data folder confirmed empty of test rows now; `npm run verify` can't cause a repeat since it only ever touches a throwaway temp dir.
- **Documentation map added to `CLAUDE.md`** ("Documentation map — what gets updated, and when"): a table of every doc, its update trigger, and how the user can audit whether an update was missed. Requested explicitly by the user (2026-07-23) so they have a concrete way to check Claude hasn't let docs drift.
- Data folder is `Downloads/Atlas-Storage/`, deliberately separate from this repo (`Downloads/Atlas/`) — an earlier pass used the same folder name as the repo and caused the dev database to land inside the git working directory; renamed to avoid any git operation ever touching real data.
- Files in place: all Phase 0 docs, plus `package.json`, `tsconfig.json`, `scripts/copy-assets.js`, `.gitignore`, and `src/{main,preload,renderer}/*` (see `ROADMAP.md` Phase 1 for what's still missing: folder watching, resource viewers, notes UI beyond the stub, dashboard, global search UI).

## Decisions locked in (don't re-litigate)

- **Stack:** Electron + TypeScript, SQLite (`better-sqlite3`, FTS5 for search). See `ARCHITECTURE.md` §1–2.
- **OCR:** local/offline via Tesseract.js — explicitly *not* a cloud OCR API, because of the zero-API-fees constraint. Handwriting accuracy will be mediocre; that's an accepted tradeoff, not a bug. See `ARCHITECTURE.md` §3.
- **Claude integration:** local MCP server exposing a Context Builder query layer; static file export kept as a fallback for non-MCP tools. See `ARCHITECTURE.md` §6.
- **Data directory:** `Downloads/Atlas/` — an Atlas-managed folder, deliberately placed somewhere browsable rather than a hidden system path, so the user can manually add/remove files. DB and config live alongside it. See `ARCHITECTURE.md` §2 and `docs/open-questions.md` #6.
- **Hard guardrails (user-mandated, 2026-07-23):**
  1. Atlas makes **zero AI/LLM API calls internally**, ever. Claude Code (external process, user's own subscription) is the only reasoning engine — this is why MCP was chosen over Atlas calling Claude's API itself.
  2. **Zero paid/metered API usage anywhere in the project**, for anything, without explicit user approval first. All Google API access must stay on the free tier with no billing account attached.
  - Full reasoning in `CLAUDE.md` "Hard guardrails" section and `ARCHITECTURE.md` §0 — treat both as settled requirements, not preferences.
- **Continuity practice:** the user compacts/switches chats deliberately and will give a heads-up first in case last-minute doc changes are needed. This `STATUS.md` file exists specifically so a fresh session can pick up correctly without acting against prior decisions — keep it honest and current.

## Genuinely open (needs a decision, don't assume)

See `docs/open-questions.md` for full detail. Nothing blocking right now — all previously-blocking items are resolved:

- **#8 College Google Workspace access** — resolved 2026-07-23. Verified via OAuth Playground: both Classroom and Gmail read scopes authorize cleanly against the college account, no admin block. Phase 3 can be scoped against the college account.

Still open, lower urgency (not blocking Phase 1): notes format (Markdown vs. rich text, #1), sync frequency/manual-vs-automatic (#2), sync-conflict policy (#3), course/semester archiving rules (#4).

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

## What's next (updated session 7)

**Manual file upload is done and verified** (self-tested via `npm run verify`, screenshot confirmed): click a course to select it, "Upload file" opens a native file picker, the file is copied into `Downloads/Atlas-Storage/files/course-<id>/` with a timestamp prefix (collision-safe), a `resources` row is inserted with `kind` auto-detected from file extension, and the resource list re-renders under the selected course. `main.ts` has an `ATLAS_TEST_UPLOAD_PATH` env-var test hook so `scripts/verify-app.js` can drive the upload without needing to interact with the native OS file dialog (which Playwright can't click into).

Remaining Phase 1 work, roughly in order: local folder watching (chokidar) — reuse the same "insert into resources" logic as manual upload; resource viewer (PDF/image/markdown/text, falling back to the OS default app); notes UI (typed notes, format still open per `docs/open-questions.md` #1); dashboard; global search UI wired to the existing FTS5 `search_index` table (not populated yet — decide when building search whether to backfill it retroactively for resources added via upload/folder-watch).

User has said to commit/push continuously without waiting for approval in this repo (see `CLAUDE.md` "Git workflow") — keep doing that.
