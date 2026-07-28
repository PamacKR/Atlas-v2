# Phase 4 — Context Builder & AI agent integration (specification)

Status: **draft for review, nothing built yet.**

This is the detailed design for Phase 4, written before any code so the shape can be argued with cheaply. It expands `ROADMAP.md` Phase 4 and PRD §16/§18/§19/§21.

---

## 1. What Phase 4 is for

Today the user assembles material by hand — finding the right files, pasting them into a chat, re-explaining what they want each time. Phase 4 removes that step: the user asks an AI agent a question in ordinary conversation, and the agent reaches into Atlas for whatever it needs.

Target interactions, in the user's own words:

- *"Summarise chapters 5 to 8 of Microeconomics for my exam."*
- *"Help me with this worksheet"* — agent finds the related notes and textbook sections itself.
- *"Exam is day after, prof said chapters X/Y/Z plus maybe G — what should I study first?"* — agent probes what the user already knows, then proposes an order.
- *"Prof uploaded one practice doc and said use the textbook, but the textbook has no answers — give me practice questions."* — agent reads both, notices the gap, and writes its own.

**Note-making is one task among many.** The user has explicitly not finished imagining the use cases, having never had this capability before. The tools below are therefore deliberately **primitives — find, read, remember, save — not features shaped around particular tasks.** Every example above resolves into the same nine calls; that generality is the design goal, not a coincidence.

Anything beyond Atlas's own data — web search, general knowledge, actually doing the reasoning — is the agent's job and needs nothing from us.

## 2. The governing constraint, and how relevance works without AI

`AGENTS.md` sets two hard rules: **Atlas makes zero AI/LLM API calls internally, ever**, and Atlas must not write AI-inferred conclusions back as canonical academic fact.

That appears to conflict with "relevance-based retrieval" (PRD §16), which sounds like it needs a model to judge relevance. It doesn't, because of how this is structured:

> **Atlas does not decide what is relevant. Atlas exposes good search and good structure, and the agent decides.**

The agent searches, sees what came back, narrows, and pulls the specific pages it wants. The relevance judgment happens inside the agent, which is exactly where the project's core principle says it belongs. This is also the grain of how MCP is designed to work, so it is not a workaround.

One deliberate exception is discussed in §5: **user preferences** are agent-written. Those are notes about the user, not academic facts, and are stored as plain text outside the database.

---

## 3. Part A — Page-aware text extraction

### 3.1 Why this comes first

Atlas currently indexes the *text* of `.txt`/`.md` files and accepted OCR output only. **PDF, PPTX and DOCX contents are searchable by filename alone** (`rebuildSearchIndex()` in `main.ts`). Since lecture slides and textbooks are exactly those formats, the agent would find nothing. Every other part of Phase 4 is hollow without this.

### 3.2 Why "page-aware" and not one blob per file

A textbook is one 600-page file. Handing the agent all of it recreates the manual dump the user is trying to escape, and will not fit in a context window. Extraction must therefore record **where** each piece of text came from, so search can answer *"page 214 of the textbook"* and the agent can then request only those pages.

This also settles the "chapters 5 to 8" question without the user mapping anything: the agent searches for the chapter heading, gets a page number back, and reads forward from there.

### 3.3 Terminology

PDFs have pages, decks have slides, spreadsheets have sheets, and DOCX/TXT have neither. The generic unit is a **part**, carrying a human-readable label:

| Format | Part = | Label example |
|---|---|---|
| PDF | page | `Page 214` |
| PPTX | slide | `Slide 12` |
| XLSX | sheet | `Sheet: Q3 Results` |
| DOCX | heading-delimited section (fallback: ~3000-char block) | `Section 4` |
| TXT / MD | ~3000-char block (single part if small) | `Part 1` |

### 3.4 Schema

```sql
CREATE TABLE IF NOT EXISTS document_parts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,      -- 1-based, in document order
  label TEXT NOT NULL,           -- 'Page 214', 'Slide 12'
  text TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'extracted',  -- 'extracted' | 'ocr'
  UNIQUE(resource_id, ordinal)
);
CREATE INDEX IF NOT EXISTS idx_document_parts_resource ON document_parts(resource_id);
```

Added to `resources`:

```sql
extraction_status TEXT NOT NULL DEFAULT 'pending',
  -- 'pending' | 'done' | 'empty' | 'unsupported' | 'failed'
extraction_error TEXT,
extracted_at TEXT
```

`empty` is the important one: a PDF that parsed fine but yielded no text is a **scan**, and is what drives the existing "Run OCR" affordance (§3.7). Distinguishing it from `failed` matters — one is fixable by the user, the other is a bug.

As always, both `schema.sql` (fresh installs) and `migrate()` in `database.ts` (existing installs) must be updated together.

### 3.5 Libraries

| Format | Library | Notes |
|---|---|---|
| PDF | **`pdfjs-dist`** (new) | Mozilla's, MIT-licensed, pure JavaScript, no native build step. Per-page text extraction is a first-class API. The one new dependency this phase needs. |
| PPTX | existing code | The slide-outline extractor already written for previews, moved from renderer to main and persisted. |
| DOCX | `mammoth` (existing) | Already a dependency. Produces HTML; split on headings. |
| XLSX | `xlsx` (existing) | Already a dependency. One part per sheet. |
| TXT/MD | none | Plain read + chunk. |

**Risk to verify early:** `pdfjs-dist` must run in a plain Node process for the MCP server's sake as well as Electron's. Its "legacy" build exists for exactly this, but this should be proven in the first hour of work, not assumed.

### 3.6 When extraction runs

**On import** (user's explicit choice), in the background, so a large textbook doesn't freeze the import. The resource appears immediately with `extraction_status = 'pending'` and becomes searchable when extraction finishes.

**Backfill:** everything already in the user's library predates this and would be invisible. A one-time pass extracts all existing resources, gated by an `app_settings` flag, following the same pattern as the existing `repairClassroomResourceAddedAtOnce()`. Progress must be visible — this could take minutes on a real library, and silent multi-minute work is how the Classroom adapter managed to fail unnoticed for weeks.

### 3.7 OCR — modifying what already exists

`resources:runOcr` already works: a "Run OCR" button on PDFs, page-by-page recognition via Tesseract, a review step, saved only on explicit acceptance. **No new OCR machinery is needed.** Two changes only:

1. On accept, write **one `document_parts` row per page** (`origin = 'ocr'`) instead of one lump into `resources.ocr_text`, so OCR'd scans get page numbers like everything else.
2. Surface the button automatically when `extraction_status = 'empty'`, so scans are flagged rather than silently absent.

`resources.ocr_text` is retained for backwards compatibility; `document_parts` becomes the source of truth for retrieval.

### 3.8 Search index

`search_index` gains part-level rows so a hit can point at a location:

```
entity_type = 'document_part', entity_id = document_parts.id
```

Existing rows are unchanged. `rebuildSearchIndex()` stays a full rebuild — at this scale that remains "always correct, trivially simple," and its own comment argues the case.

---

## 4. Part B — Agent-generated notes

The agent can **create** notes (e.g. a study guide it just produced) so they are searchable later instead of lost in a chat log. It **cannot edit or overwrite notes the user wrote** — the user explicitly declined that.

Requirement, in the user's words: an indicator that a note was agent-generated, and a way to filter for them. This is orthogonal to handwriting — it distinguishes *user-made* (typed, imported, scanned, all alike) from *agent-made*.

```sql
ALTER TABLE notes ADD COLUMN generated_by_agent INTEGER NOT NULL DEFAULT 0;
```

- A badge on the note in every list, following the existing ✍️ handwritten-badge pattern.
- A filter on the Notes page to show only agent-generated notes.
- Agent-created notes flow through the existing note pipeline, so they get exported to `files/<course>/notes/<title>.md` like any other note, for free.

**Cost note:** saving to Atlas means the note's text crosses the wire once more than a chat-only answer. The expensive part — the agent *composing* the guide — happens once either way. The overhead is small and buys permanence.

---

## 5. Part C — Persistent memory as files

### 5.0 Scope — deliberately wider than PRD §19

PRD §19 describes course profiles in terms of *presentation* (explanation style, detail level, formatting, citations). **That is too narrow.** The agent is a general-purpose assistant, not a note generator, and the use cases the user described need it to remember things §19 never contemplated:

- *Familiarity and weak spots* — "shaky on general equilibrium, comfortable with elasticity," learned by the agent probing in conversation and needed weeks later when planning revision.
- *How this course actually runs* — the professor's habits, exam format, what gets emphasised, whether practice material comes with answers.
- *What has already been done* — topics revised, practice attempted, plans made, so a fresh chat doesn't restart from zero.
- *Anything else the agent finds worth keeping.*

These files are therefore **whatever the agent has learned**, not a fixed form. Since Atlas never parses them (§5.2), widening the content costs nothing structurally — but building as if §19 were the whole story would produce the wrong thing.

**Two scopes:**

```
Atlas-Storage/course-profiles/<Course Name>.md   -- per course
Atlas-Storage/course-profiles/_general.md        -- across all courses
```

The general file holds what isn't course-specific: how the user likes to work, how they revise, recurring preferences. Without it, the agent relearns the same things in every course.

### 5.1 Location and shape

Per the user's decision: profiles live in **`Atlas-Storage`** (their data), not the repo (the app's source code), and are **not shown in the Atlas UI**.

```
Atlas-Storage/course-profiles/<Course Name>.md
```

Plain Markdown, human-readable, one file per course. Rationale:

- Readable in any text editor, so nothing is hidden from the user despite having no UI.
- Portable — survives a new chat, a different AI tool, or Atlas not running.
- Trivially backed up and copied.

Atlas keeps these files renamed in step with the course, reusing the same logic that already renames `files/<course name>/` and note exports. Without that, renaming a course silently orphans its memory.

### 5.2 Atlas does not interpret them

Atlas **stores and serves this text without parsing, validating, or acting on it.** The content is the agent's to structure. This keeps the guardrail intact: Atlas is not reasoning, it is holding a file.

A new profile is seeded with a comment listing suggested topics — presentation preferences (PRD §19), plus familiarity and weak areas, how the course is run, and work already done (§5.0) — purely as a hint. The agent is free to ignore the structure entirely.

### 5.3 Writes are silent

Per the user's decision, the agent updates profiles without announcing it or asking. Oversight comes from the file being plain text they can read at any time, and from the user correcting the agent conversationally when it drifts. No review queue is being built pre-emptively.

---

## 6. Part D — The MCP server

### 6.1 Form

A **separate Node program** in `mcp/` in this repo, launched by the AI tool, communicating over stdio (the standard MCP transport, supported by Claude Code, Codex and Cursor alike).

Separate rather than inside the Atlas window because it must answer whether or not the app happens to be open.

**Database access:** opens the same SQLite file with WAL and `busy_timeout = 5000`. Reads are always safe alongside a running Atlas. The only two write operations (create note, write profile) are rare and small.

**Schema coupling risk:** the server reads Atlas's tables directly, so a schema change could break it silently. Mitigation: it lives in the same repository and imports the same TypeScript type definitions, so a mismatch is a build error rather than a runtime surprise.

### 6.2 Identifying a course

Every course-taking tool accepts **either a numeric ID or a name**. Names are matched case-insensitively: exact first, then unique substring. An ambiguous name returns an error listing the candidates rather than guessing — guessing here silently answers a question about the wrong course.

By default, tools consider **active (non-archived) courses in the current semester**. Archived courses remain reachable by explicit ID.

### 6.3 The tools

Nine, deliberately. Fewer and the agent can't work; more and it picks wrongly.

**Orientation**

| Tool | Arguments | Returns |
|---|---|---|
| `atlas_overview` | — | Current semester, active courses (id, name, code), counts of resources/notes/upcoming deadlines, **and the general memory file (§5.0)**. The fresh-conversation bootstrap (PRD §18) — the first call in any new chat, and what makes the agent start out already knowing the user. |
| `atlas_course_briefing` | `course` | That course's memory file, upcoming deadlines, recent announcements, and an inventory summary (counts by kind + most recent 20 titles with IDs). Enough to orient without dumping content. |

**Finding**

| Tool | Arguments | Returns |
|---|---|---|
| `atlas_search` | `query`, `course?`, `types?`, `limit?` | Ranked hits across notes, resources, document parts, announcements, assignments. Each hit: entity type, ID, title, **location label** (`Page 214`), and a short excerpt. **Never full text.** |
| `atlas_list_resources` | `course`, `kind?`, `limit?`, `offset?` | Inventory: id, title, kind, part count, extraction status. Lets the agent see what exists before searching. |
| `atlas_list_deadlines` | `course?`, `days?` | Upcoming deadlines, optionally across all courses. |

**Reading**

| Tool | Arguments | Returns |
|---|---|---|
| `atlas_read_document` | `resource_id`, `from?`, `to?` | Text of a part range. This is how "chapters 5 to 8" actually gets read, after search locates them. |
| `atlas_read_note` | `note_id` | A note's full Markdown. |

**Writing**

| Tool | Arguments | Effect |
|---|---|---|
| `atlas_write_memory` | `course?`, `content` | Replaces the memory file — the course's, or the general one when `course` is omitted (§5.0). Silent, per §5.3. |
| `atlas_create_note` | `course`, `title`, `content_markdown` | Creates a note with `generated_by_agent = 1`. Cannot modify existing notes. |

### 6.4 Response size limits

**The single most common way a server like this fails.** If a search returns forty pages of raw text, the agent's answer gets worse, not better. Limits are enforced server-side, not left to the agent's discretion:

| Tool | Limit |
|---|---|
| `atlas_search` | 10 hits default, 25 max; excerpts capped at 400 characters |
| `atlas_read_document` | 25 parts per call; hard ceiling 60,000 characters |
| `atlas_course_briefing` | 20 most recent titles per category |
| `atlas_list_resources` | 50 default, 200 max |

Every truncated response says **explicitly** that it was truncated and how to fetch the remainder. A silently truncated response is worse than an error, because the agent will confidently answer from a partial view — and so will the user.

### 6.5 Setup

Connecting is a small JSON entry in the AI tool's config pointing at the server. The exact file differs per tool (Claude Code, Codex, Cursor), so `README.md` gets a short section per tool, written once the user picks one.

---

## 7. Part E — Static export fallback

A "write my course context to a file" action producing `Atlas-Storage/exports/atlas-context-<course>.md`: profile, deadlines, note titles, resource inventory, and recent announcements as plain Markdown to paste into any AI tool.

For tools that can't speak MCP. Small, and reuses the same query layer.

---

## 8. Testing

The existing `scripts/verify-app.js` drives the Atlas window with Playwright and **cannot reach a separate background program at all.** The MCP server needs its own check: a script that starts the server, calls every tool over stdio, and asserts the response shapes and that the size limits actually hold.

New `npm run verify:mcp`, alongside the existing suite rather than folded into it.

Extraction gets its own fixtures — a real multi-page PDF, a deck, a DOCX, and a text-layer-free scan — asserting part counts and labels.

---

## 9. Build order

| # | Piece | Size | Why here |
|---|---|---|---|
| 1 | Page-aware extraction + backfill (§3) | **Large** | Everything else is hollow without it. Riskiest, so first — including proving `pdfjs-dist` runs under plain Node on day one. |
| 2 | Memory files, course + general (§5) | Small | Self-contained; the query layer needs it. |
| 3 | Agent-note flag, badge, filter (§4) | Small | Self-contained UI + one column. |
| 4 | Query layer (§6.3 logic, no MCP yet) | Medium | Plain functions over SQLite, shared by the server and the export. |
| 5 | MCP server + `verify:mcp` (§6) | Medium | The bridge. |
| 6 | Static export (§7) | Small | Reuses #4. |

## 10. Open items

- **Which AI tool** the user settles on (Claude Code / Codex / Cursor) — all three support MCP, so this affects only the setup documentation, not the design.
- **`pdfjs-dist` under plain Node** — to be proven immediately, not assumed.
- **DOCX/TXT have no true pages**, so their part boundaries are Atlas's invention. Acceptable, but labels must not imply a precision that isn't there.
- **Extraction time on a large library** during backfill — needs visible progress.
- **Should the agent be able to create deadlines?** Not currently in the tool set. If the user mentions "exam is on the 14th" and Atlas doesn't know about it, the agent can't record it. Arguably fine (the user stated it, so it isn't AI inference), but deadlines are academic data and writing them touches the Classroom conflict-handling rules from Phase 3. Left out of v1 deliberately; easy to add later if it proves annoying.
