# Atlas — Architecture

This document records the technical decisions behind Atlas and the reasoning for each, so future contributors (human or AI) don't have to re-derive them.

## 0. Hard constraint: zero AI integration, zero API fees, anywhere

Atlas itself never calls any LLM or AI API — not Anthropic, not OpenAI, not Google Gemini, nothing. The only reasoning engine is Claude Code, run as a separate process the user drives directly, covered entirely by their existing Claude subscription. This is not a cost-optimization detail to revisit later — it's the same "Atlas owns data, Claude owns reasoning" split from the PRD, made strict: if a feature would require Atlas to make an API call to an AI model, it's out of scope for Atlas, full stop.

This also means every other integration in Atlas must run on a genuinely free tier, with no billing account enabled anywhere:

- **Google Classroom / Gmail / Drive APIs** — free under normal read-scope usage via the user's own Google Cloud OAuth client (no Google Cloud billing account needs to be attached).
- **OCR** — must be a local/offline engine, not a metered cloud API (see §3 below; this ruled out Cloud Vision).

If a future feature seems to need a paid API, the answer is "cut the feature, don't add the cost" unless the user explicitly opts in later.

## 1. Application shell: Electron + TypeScript

Atlas needs to, on one desktop app:

- Render PDFs, images, markdown, and text inline (section 10, Resource Viewer)
- Watch local folders for new files (section 6, Local Storage)
- Talk to Google Classroom, Gmail, and Drive APIs (section 6)
- Support OCR ingestion of handwritten notes (section 7)
- Provide fast full-text search across all of the above (section 14)

Electron was chosen over Tauri and native Python/Qt because:

- It's Chromium-based, so PDF/image/markdown rendering is close to free (`pdf.js`, native `<img>`, any markdown renderer) rather than something to build or bind to.
- Google's official SDKs (`googleapis` npm package) cover Classroom, Gmail, and Drive with no wrapper layer needed.
- File watching (`chokidar`) and packaging (`electron-builder`) are mature and well documented.
- Tauri would produce a lighter binary, but the Rust↔JS bridge adds friction for Google API calls and OCR pipelines with little payoff at V1 scale (single user, single machine).
- Python/PyQt has a better ML/OCR ecosystem, but worse embedded-document-viewer support and a rougher desktop packaging story.

### Renderer build pipeline: esbuild, added for the notes editor

The renderer (`src/renderer/renderer.ts`) originally had no bundler at all — it's loaded as a plain, non-module `<script>` tag (the window has `contextIsolation: true`, `nodeIntegration: false`, so there's no `require` and no module-level `exports` object either), and `tsc` alone was enough as long as the file avoided `import`/`export` syntax (which makes `tsc` emit CommonJS boilerplate that throws in that environment).

Adding the notes editor (see "Notes" below) needed a real npm UI library — first tried `@toast-ui/editor`, whose published build externalizes its ProseMirror dependencies for bundler consumption and isn't usable from a bare `<script>` tag (later replaced with `@milkdown/crepe`, same constraint applies — a modern editor library assumes a bundler). Rather than hand-vendor a third-party prebuilt bundle of uncertain provenance, `esbuild` was added as a dev dependency solely to bundle `renderer.ts` (`scripts/build-renderer.js`) into one browser-ready IIFE, resolving `import`s of npm packages (and their CSS/font assets) along the way. `main.ts`/`preload.ts` are unaffected — they're proper CommonJS already and still compile via `tsc` directly. Type-checking for the renderer runs as a separate `tsc --noEmit -p tsconfig.renderer.json` step (esbuild transpiles but doesn't type-check). This also means `renderer.ts` can use normal `import`/`export` syntax going forward — the constraint that drove the original workaround no longer applies to that file.

## 2. Data store: SQLite (embedded, local-first)

Atlas maintains "the canonical academic database" (PRD section 15) — course info, metadata, file locations, deadlines, announcements, assignments, OCR text, indexes, and relationships.

SQLite (via `better-sqlite3`) is the store because:

- Single-user, single-machine app → no need for a client-server database.
- Ships as an embedded file — zero setup, trivial backup (copy one file).
- Fully functional offline by default, which resolves one of the PRD's own open questions (Offline Behavior) for the core data layer.
- SQLite's FTS5 extension provides full-text search across notes, OCR text, and metadata (PRD section 14) without introducing a separate search service like Elasticsearch.

Binary blobs (original scans, PDFs, images) are **not** stored in SQLite — they stay on disk in a managed Atlas data directory, with SQLite holding the file paths, metadata, and extracted/searchable text. This keeps the database small and keeps original files trivially recoverable/inspectable outside the app.

The managed data directory is `Downloads/Atlas-Storage/` (course subfolders inside it), not a hidden system app-data path — chosen deliberately so files stay somewhere the user can browse and manually add/remove from without digging through OS-hidden directories. The SQLite database and app config live alongside it under the same folder. This is a **separate folder from the Atlas source repo** (which also happens to live under `Downloads`), specifically so dev/git operations (clone, clean, checkout) can never touch real user data.

Course subfolders under `files/` are named after the course itself (e.g. `files/Data Structures/`), not an opaque ID, so the folder structure stays human-browsable. The name is sanitized for filesystem-invalid characters and computed once at course creation (stored in `courses.folder_name`) rather than derived from the course name on every access — this keeps existing file paths valid even if course-renaming is added later. Uploaded files keep their original filename inside that folder, only disambiguated (`name (2).ext`) on an actual collision.

App-wide UI preferences that shouldn't reset per-course or per-launch (currently just the resource list/icon view mode) live in a small `app_settings` key/value table, read once at startup and written whenever the user changes one — deliberately a single global setting rather than remembered per-course, since the user wants one consistent view across the whole app.

## 3. OCR: local, offline (Tesseract.js)

Handwritten notes are first-class (PRD section 7). The originally considered option — Google Cloud Vision — is a metered, paid API and is ruled out by the zero-API-fees constraint (§0). Instead, OCR runs locally via Tesseract.js: free, offline, no request costs, no credentials.

The honest tradeoff: Tesseract handles printed text well but handwriting recognition quality is meaningfully worse than a paid cloud OCR model. That's an accepted cost of the no-fees constraint, not an oversight. A possible future improvement, still zero-cost, is Windows' built-in ink/handwriting recognition (`Windows.UI.Input.Inking`), which runs on-device and ships with the OS — worth prototyping in Phase 2 if Tesseract's handwriting accuracy proves too poor to be useful, but not a Phase 2 blocker.

Both the original scanned image and the extracted OCR text are retained regardless of engine (per PRD section 7) — OCR failure or low confidence never discards the source image.

## 4. Sync layer

Each data source (Classroom, Gmail, Drive, local folders, manual upload) is implemented as an independent sync adapter that writes into the same canonical schema. Adapters are responsible only for pulling source data and normalizing it — course/course-resource association, deduplication, and relationship-building happen in a shared layer downstream of all adapters, so no single source's quirks leak into the core data model.

**Local folder watching**, the first non-manual adapter, uses `chokidar` and an explicit, user-configured `watched_folders` table (`course_id` ↔ `folder_path`, one course per folder) — not auto-detection of which course a file "probably" belongs to. This was a deliberate call, not a default: guessing course association from file content/location would be Atlas inferring meaning from academic content, which is Claude's job per the "Atlas owns data, Claude owns reasoning" rule (`CLAUDE.md`), not something to quietly build into a sync adapter. A watcher is started per row at app launch and whenever a folder is newly added; new files are copied into the course's managed storage (identical path/naming logic to manual upload) and inserted as `resources` with `source = 'local_folder'`. Each imported resource also stores its original watched-folder path (`resources.watch_source_path`) purely so a watcher restart — which re-scans a folder's existing contents by design — can recognize "already imported" and skip re-importing, not to track live source-file state.

Deletion is mirrored too: if a source file disappears from a watched folder, the resource it produced is deleted along with its managed-storage copy — via `chokidar`'s `unlink` event while the app is running, and via a reconciliation pass (compare each `local_folder` resource's `watch_source_path` against the filesystem) whenever a folder's watcher starts, to catch deletions that happened while Atlas wasn't open. This keeps watched-folder resources honest with their source rather than leaving stale entries that error when opened.

**Every course's own managed storage folder is watched too** (`startWatchingCourseStorage()` in `main.ts`), separately from the opt-in watched folders above and with no course-mapping decision involved — a course's own `files/<course>/` folder is unambiguously that course's. This exists because §2 explicitly designs the data directory to be user-browsable and hand-editable ("files stay somewhere the user can browse and manually add/remove from"); without a watcher on it, that promise wasn't actually true — a file deleted by hand from `Downloads/Atlas-Storage/files/<course>/` left a `resources` row behind that errored with "resource not found" when opened, and a file dropped in by hand was invisible to Atlas until the next manual refresh. Same `add`/`unlink` + startup-reconciliation pattern as watched folders; the only difference is `add` events check `file_path` (not `watch_source_path`) to detect "this is our own copy that just landed" and skip re-importing it, since these files are already inside managed storage rather than being copied in from elsewhere.

## 5. Context Builder

The Context Builder (PRD section 16) is a query layer over the canonical database: given a task (assignment help, exam revision, lecture summary, etc.) and a current course, it retrieves the relevant subset of resources, notes, assignments, and the course's AI profile (section 19) — it does not dump everything, and it never writes AI-inferred data back into the canonical store as fact (section 17).

## 6. Claude Code integration: local MCP server

Atlas exposes its Context Builder to Claude Code via a **local MCP (Model Context Protocol) server** bundled with the app, rather than only generating static context files.

Why MCP over static file export:

- The PRD's own goal (section 21) is that a user can start a *fresh* Claude Code conversation without manually re-explaining project structure — that calls for Claude being able to query live ("what's due this week in COMP301", "pull my notes on lecture 4"), not just receive a fixed snapshot made at export time.
- The query/context-builder logic (section 16) has to exist regardless of transport. MCP is a thin protocol layer on top of that logic, not a parallel implementation.
- A static "export context to file" mode is still kept as a secondary path (same underlying query layer) for use with AI tools that don't support MCP, satisfying the PRD's AI-provider-independence goal (open question 5).

## 7. Resource Viewer: in-app preview, per file type

PRD section 10 asks for in-app viewing "whenever practical," with an external-app fallback otherwise. Implementation, per resource kind:

- **PDF, image** — rendered directly (`<iframe>`/`<img>` against a `file://` URL); Chromium's built-in PDF viewer handles PDFs with no extra library.
- **Markdown** — rendered to HTML via `marked`. Deliberately pinned to `marked@12` — v13+ dropped the CommonJS build Atlas's main process needs (it's ESM-only from v13 on), which crashes with `ERR_REQUIRE_ESM` under `require()`.
- **Text** — shown as-is.
- **DOCX** — converted to HTML via `mammoth` (pure JS, no native compile step, no Word installation needed).
- **PPTX** — **text-only** outline (each slide's text runs extracted from the raw XML inside the `.pptx` zip via `adm-zip`, XML-entity-decoded before HTML-escaping so characters like `&` round-trip correctly). There is no mature free/pure-JS library that renders real slide layout, images, or styling with good fidelity — attempting that would mean either a paid conversion API (ruled out by §0) or bundling a heavyweight rendering engine for uncertain payoff. This is a deliberate, documented scope line, not an oversight.
- **XLSX** — each sheet converted to an HTML `<table>` via `xlsx` (SheetJS), read with formula evaluation disabled (`cellFormula: false`) since Atlas only needs cell values for a read-only view. **Security note:** the `xlsx` npm package (last published 0.18.5) has known unpatched prototype-pollution/ReDoS advisories — SheetJS only ships fixed builds via their own CDN now, not npm. Accepted as low-risk here because Atlas only ever parses the user's own local files (never untrusted input from the network), and reading skips formula evaluation, which narrows the parser surface actually exercised. Worth revisiting if Atlas ever ingests spreadsheets from an external/untrusted source (e.g. a shared Drive folder in a later phase).

### Opening resources in the browser

Every resource has a native right-click context menu (Electron `Menu`, not an in-page dropdown) with **"Open in browser"** — opens the resource in the user's real default browser (actual switchable tabs), not Electron's own preview panel and not a native desktop app. Backed by a small loopback-only HTTP server (`src/main/localServer.ts`, bound to `127.0.0.1` only, random port, started at app launch) at `GET /resource/:id`:

- PDF/image/text are streamed as their native content type, so the browser uses its own built-in renderer.
- Markdown/DOCX/PPTX/XLSX are rendered through the exact same conversion functions the in-app preview uses (`getPreview()` in `preview.ts`), wrapped in a minimal standalone HTML page (no Atlas stylesheet available outside the app window).
- Anything else (zip, unrecognized types) is streamed as an `application/octet-stream` download — the browser's natural behavior for content it can't render, same role the old "Open in default app" fallback played.

This deliberately replaces what used to be "Open in default app" (`shell.openPath`, which launched the OS's associated desktop application — Word, Excel, etc.) — the user specifically wanted every file type reachable from browser tabs for fast switching while working, not separate desktop windows. It also deliberately does **not** route through Google Docs/Sheets/Slides: those can only preview a file they can fetch from a public URL, so the only way to get Office files in front of them would be uploading each one to Google Drive first — a real architecture change (Drive OAuth write scope, user files leaving local storage) that's scoped for Phase 3, not something to pull forward silently. The local-render approach reuses code that already existed for in-app preview and keeps everything on-machine.

## 8. Notes: Markdown, flat per course, live-rendering editor

Format and organization are both resolved — see `docs/open-questions.md` #1 for the full reasoning. Summary:

- **Format: Markdown**, not rich text. The deciding factor was Claude Code integration, not editing convenience: rich text (HTML or a JSON doc tree) would just get flattened to something markdown-like before Claude could use it anyway, so storing markdown from the start avoids a lossy round-trip and keeps notes trivially indexable by the existing FTS5 `search_index` table. `notes.content_markdown` (schema already had this column from Phase 0).
- **Organization: flat per course, no folders/subfolders.** The user's prior Notion workflow was structurally "semester > course > session-titled note" (e.g. "W1L1", "W1L2") — Atlas already provides the semester (see below) and course layers, so a note just needs a user-given title, not a second manually-maintained folder tree inside each course.
- **Editor: Milkdown, via the `@milkdown/crepe` preset** (MIT) — typing `#`, `-`/`*`, `1.`, `---`, etc. converts live to real headings/lists/dividers, matching the Notion/Obsidian feel the user asked for. **Toast UI Editor was tried first and replaced** after the user reported it felt "raw and unpolished": its WYSIWYG mode doesn't actually support typing markdown shortcuts to create lists (typing `- ` just inserted the literal characters), and its toolbar never shows an active/highlighted state for the current selection (pressing Ctrl+B bolded text but gave no visual feedback that Bold was now active). Both were confirmed as real gaps via hands-on browser testing, not assumed — and both are core to how the user actually works (bullet-heavy notes, frequent formatting). Crepe was verified to handle all of them correctly (live list/heading/divider shortcuts, Tab/Shift+Tab nesting, a floating selection toolbar with correct active-state highlighting) before switching, plus it bundles KaTeX math rendering out of the box, which Toast UI Editor has no equivalent for and the user needs for academic notes (formulas, complexity notation). Uses the official `frame-dark` theme to match Atlas's UI. Content autosaves 600ms after the last edit via Crepe's `markdownUpdated` listener (debounced) and flushes immediately on close.
- Milkdown's own dependencies (ProseMirror, CodeMirror for code blocks, KaTeX for math, a small internal Vue instance for its math/table block editors) are resolved and bundled by esbuild along with their CSS/webfont assets (`scripts/build-renderer.js` — needs `file` loaders for KaTeX's `.woff`/`.woff2`/`.ttf`, and emits a sibling `renderer.css` that `index.html` links directly).
- **The database is notes' real, live source of truth — but every save also mirrors the note out to a plain `.md` file**, at `files/<course>/notes/<title>.md` (`exportNoteToFile()` in `main.ts`). This resolves a real gap the user hit: with content living only in `notes.content_markdown`, there was no way to get a note out of Atlas for external use (grep, copy elsewhere, hand to another tool) — the on-disk-file-per-course design was supposed to be the "user can browse/use their stuff" layer (§2), and notes were the one thing that broke that promise.
  - **Strictly one-way.** Atlas never reads this file back — editing it externally just gets silently overwritten the next time the note is saved from within Atlas. Two-way sync (watching the file, merging external edits, resolving conflicts with the live DB copy) was considered and explicitly declined by the user as unneeded complexity for what's fundamentally an export, not a second editing surface.
  - **Renaming a note renames its export.** The exported filename is derived from the note's title (sanitized, collision-disambiguated the same way as resources); `notes.exported_path` tracks the last-written path so a title change can find and remove the stale file (and its assets folder, below) rather than leaving orphans behind.
  - **Embedded images are linked, not copied** — the note's local-server image URL is rewritten to a relative path pointing straight back at the single shared file in `note-images/` (e.g. `../../../note-images/<uuid>.png`), not a per-note duplicate. First shipped as a per-note copy in a `<title>.assets/` folder; the user noticed the same image existing twice on disk and asked whether one file could serve both jobs. It can: a relative link resolves standalone in any markdown viewer exactly like a copy would, as long as the exported `.md` stays somewhere under `Atlas-Storage` (or `note-images/` travels with it) — the one thing lost versus a copy is that moving a *single* exported note file completely outside that tree, without its images, would leave a broken link. Accepted trade-off, chosen over the disk-space duplication. The in-app editor and read-only browser view are unaffected — they still use the live local-server URL.
  - **Excluded from the managed-storage watcher.** Every course's `files/<course>/` folder is already watched to auto-import manually-added files as resources (§4) — without an exclusion, Atlas's own exported `.md`/`.assets` files would get picked up by that watcher and re-imported as bogus resources. Both the `add` and `unlink` handlers skip anything under the course's `notes/` subfolder.
- **Fonts are forced sans-serif** — Crepe's default theme uses a serif font for headings/quotes, which looked inconsistent against the rest of Atlas's sans-serif UI; overridden in `styles.css` scoped to `.milkdown` elements.
- **Title auto-follows the first line, Google-Docs style** (`notes.title_is_manual`, defaults to 0): every autosave derives a title from the note's first non-empty line (stripping heading/list/quote markup, inline emphasis like `**bold**`/`_italic_`/`` `code` ``, and skipping a line that's only an image — the image URL/alt text isn't meaningful title material, and turning it into one produced a genuinely broken export filename during development) and updates `title` — unless the user has ever edited the title field directly, which flips `title_is_manual` to 1 permanently for that note and decouples it from content from then on. A blur on an unchanged title field doesn't count as an edit, so merely clicking into the title and clicking away doesn't accidentally lock it.
- **Notes follow the same shared list/icon view toggle as resources** — no separate toggle, `renderNotes()` just reads the same app-wide `viewMode` setting resources already use, per the user's request that view mode be one consistent, standardized preference across the whole app rather than per-section.
- **"Open in browser" for notes is read-only**, unlike the WYSIWYG editor in the app. An editable browser copy would mean two live editing surfaces writing to the same note with no conflict resolution between them (the desktop Crepe instance and the browser tab); read-only sidesteps that entirely and matches the same "reference alongside other tabs" role the feature already plays for resources. Rendered via `marked`, with `$...$`/`$$...$$` math segments extracted and rendered through KaTeX (`katex.renderToString`) before the markdown pass, then spliced back in — `marked` has no native concept of math syntax. KaTeX's CSS/webfonts are served from two additional local-server routes (`/katex.css`, `/katex-fonts/:file`) rather than inlined, since the external browser tab has no access to Atlas's own bundled assets.
- **Slash-menu shorthand** (typing `/h1` then Tab to jump straight to Heading 1) isn't supported by Crepe's slash menu as shipped — its filter does substring matching against the full visible label ("Heading 1"), not fuzzy/alias matching, so `h1` (no space) matches nothing and the menu just closes. Investigated rather than assumed working. Not worth building a workaround for: the equivalent live markdown shortcut (typing `# ` for H1, `## ` for H2, etc., directly in the text — no menu at all) already works and is arguably faster than the slash-menu path the user described.
- **Heading labels in the slash menu are "H1"–"H6"**, not "Heading 1"–"Heading 6" — configured via Crepe's `BlockEdit` feature config (`textGroup.h1.label`, etc.), per the user's ask for something shorter/more scan-friendly.
- **Headings are bold by default, and Ctrl+B still toggles it off** — a real trade-off, not a simple CSS tweak. Crepe's own theme renders headings at `font-weight: 400` (size differs by level, weight doesn't), which read as visually flat. Forcing `font-weight: 700` on `h1`–`h6` via CSS alone would satisfy "bold by default" but make Ctrl+B a no-op *inside* a heading, since the CSS weight would always win regardless of whether the underlying `strong` mark is present — the two asks are in tension unless the boldness comes from a real, togglable mark rather than fixed CSS. Implemented as a small custom ProseMirror plugin (`$prose` from `@milkdown/kit/utils`, registered via `crepe.editor.use(...)` before `.create()`) with an `appendTransaction` hook: whenever the cursor sits inside an *empty* heading (freshly created, or emptied back out), it primes ProseMirror's `storedMarks` with `strong` so the next character typed comes out bold automatically — the same mechanism as clicking a Bold button then typing. Once real text exists in the heading, the plugin stops touching it, so it never fights a manual Ctrl+B afterward. Verified via both entry paths (typing `# ` and picking H1/H2 from the slash menu), toggling off and back on, and confirming plain paragraphs are unaffected.
- **Images embedded in note content are saved to a stable, Atlas-owned location**, not left as the `blob:` URL Crepe's image block defaults to. A `blob:` URL only lives as long as the renderer process that created it — dead on every app restart, and never resolvable from the read-only browser view (a separate process/origin entirely) either. `notes:saveImage` (main.ts) copies the uploaded file's bytes into `Downloads/Atlas-Storage/note-images/<uuid>.<ext>` (flat store — a note referencing an image is what ties it to a course, not the image's folder location) and returns a URL served by the local HTTP server, wired into Crepe's `ImageBlock` feature (`onUpload`/`inlineOnUpload`/`blockOnUpload`) instead of the default. Orphaned image files aren't cleaned up when a note is deleted — a known, accepted gap for now, not something to silently "fix" by guessing at retention rules.
- **The local HTTP server uses a fixed port (`47823`), not an ephemeral one.** This was a real bug caught during development: `server.listen(0, ...)` picks a random free port each launch, and since note images bake that server's URL directly into `content_markdown` (persisted in the database), a previously-inserted image would 404 the moment the app restarted with a different port — confirmed via an actual restart test before landing on the fix. "Open in browser" URLs for resources/notes don't have this problem since they're generated fresh on demand and never persisted; only note images needed a stable port. Falls back to an ephemeral port only if the fixed one is somehow already taken (rare on a single-user desktop app), accepting that any already-saved image references won't resolve for that one session.

### Semester filter

Courses already carried a `term` field (the fixed Monsoon/Spring dropdown). A course-list filter (`#semester-filter`) was added alongside the notes work, at the user's request, to scope the visible course list to one semester at a time — client-side filtering over the existing `courses.term` column, no schema change. The selection is a persisted `app_settings` entry (same mechanism as the view-mode setting, §2), so it survives a relaunch rather than resetting to "all" every time.

## Layer summary

```
┌─────────────────────────────────────────────┐
│  Electron shell (renderer: viewers, UI)      │
├─────────────────────────────────────────────┤
│  Sync adapters: Classroom · Gmail · Drive ·  │
│  Local folders · Manual upload               │
├─────────────────────────────────────────────┤
│  Normalization & relationship layer          │
├─────────────────────────────────────────────┤
│  SQLite (canonical DB) + on-disk file store  │
├─────────────────────────────────────────────┤
│  Context Builder (query layer)               │
├─────────────────────────────────────────────┤
│  MCP server  ──────────────►  Claude Code    │
│  (+ file export fallback)     (reasoning)    │
└─────────────────────────────────────────────┘
```
