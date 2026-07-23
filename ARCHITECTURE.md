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

## 2. Data store: SQLite (embedded, local-first)

Atlas maintains "the canonical academic database" (PRD section 15) — course info, metadata, file locations, deadlines, announcements, assignments, OCR text, indexes, and relationships.

SQLite (via `better-sqlite3`) is the store because:

- Single-user, single-machine app → no need for a client-server database.
- Ships as an embedded file — zero setup, trivial backup (copy one file).
- Fully functional offline by default, which resolves one of the PRD's own open questions (Offline Behavior) for the core data layer.
- SQLite's FTS5 extension provides full-text search across notes, OCR text, and metadata (PRD section 14) without introducing a separate search service like Elasticsearch.

Binary blobs (original scans, PDFs, images) are **not** stored in SQLite — they stay on disk in a managed Atlas data directory, with SQLite holding the file paths, metadata, and extracted/searchable text. This keeps the database small and keeps original files trivially recoverable/inspectable outside the app.

The managed data directory is `Downloads/Atlas-Storage/` (course subfolders inside it), not a hidden system app-data path — chosen deliberately so files stay somewhere the user can browse and manually add/remove from without digging through OS-hidden directories. The SQLite database and app config live alongside it under the same folder. This is a **separate folder from the Atlas source repo** (which also happens to live under `Downloads`), specifically so dev/git operations (clone, clean, checkout) can never touch real user data.

## 3. OCR: local, offline (Tesseract.js)

Handwritten notes are first-class (PRD section 7). The originally considered option — Google Cloud Vision — is a metered, paid API and is ruled out by the zero-API-fees constraint (§0). Instead, OCR runs locally via Tesseract.js: free, offline, no request costs, no credentials.

The honest tradeoff: Tesseract handles printed text well but handwriting recognition quality is meaningfully worse than a paid cloud OCR model. That's an accepted cost of the no-fees constraint, not an oversight. A possible future improvement, still zero-cost, is Windows' built-in ink/handwriting recognition (`Windows.UI.Input.Inking`), which runs on-device and ships with the OS — worth prototyping in Phase 2 if Tesseract's handwriting accuracy proves too poor to be useful, but not a Phase 2 blocker.

Both the original scanned image and the extracted OCR text are retained regardless of engine (per PRD section 7) — OCR failure or low confidence never discards the source image.

## 4. Sync layer

Each data source (Classroom, Gmail, Drive, local folders, manual upload) is implemented as an independent sync adapter that writes into the same canonical schema. Adapters are responsible only for pulling source data and normalizing it — course/course-resource association, deduplication, and relationship-building happen in a shared layer downstream of all adapters, so no single source's quirks leak into the core data model.

## 5. Context Builder

The Context Builder (PRD section 16) is a query layer over the canonical database: given a task (assignment help, exam revision, lecture summary, etc.) and a current course, it retrieves the relevant subset of resources, notes, assignments, and the course's AI profile (section 19) — it does not dump everything, and it never writes AI-inferred data back into the canonical store as fact (section 17).

## 6. Claude Code integration: local MCP server

Atlas exposes its Context Builder to Claude Code via a **local MCP (Model Context Protocol) server** bundled with the app, rather than only generating static context files.

Why MCP over static file export:

- The PRD's own goal (section 21) is that a user can start a *fresh* Claude Code conversation without manually re-explaining project structure — that calls for Claude being able to query live ("what's due this week in COMP301", "pull my notes on lecture 4"), not just receive a fixed snapshot made at export time.
- The query/context-builder logic (section 16) has to exist regardless of transport. MCP is a thin protocol layer on top of that logic, not a parallel implementation.
- A static "export context to file" mode is still kept as a secondary path (same underlying query layer) for use with AI tools that don't support MCP, satisfying the PRD's AI-provider-independence goal (open question 5).

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
