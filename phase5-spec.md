# Phase 5 — Search, Dashboard v2, and shortcuts (specification)

Status: **Implemented in the current app (2026-08-03).** This document remains the design record for the search, Dashboard v2, and shortcut work; `ROADMAP.md` is the live completion source.

Covers the three pieces Phase 5 actually reduced to after the 2026-07-29 scoping conversation. Two previously-listed Phase 5 items (relationship editing, offline-mode audit) were **dropped by the user**, not deferred — see `ROADMAP.md`.

---

## 1. Why these three, and in this order

Search comes first because it is the single surface the user touches most, it currently has a real bug (most results are dead clicks), and Phase 4's page-aware extraction just made it dramatically more powerful *and* dramatically more crowded at the same time. Dashboard v2 and configurable shortcuts are both additive quality-of-life work that nothing else depends on.

---

## 2. Search overhaul

### 2.1 What's actually true today (measured, not assumed)

Against the user's real database on 2026-07-29, after extraction completed:

| Indexed entity | Rows |
|---|---|
| `document_part` (individual pages/slides/sheets) | **3,067** |
| `resource` (file titles) | 195 |
| `announcement` | 152 |
| `assignment` | 27 |
| `note` | 2 |

Two things follow directly from those numbers:

- **Page-level hits will drown everything else.** 3,067 of 3,443 indexed rows (89%) are individual pages. A flat, globally-ranked list of 30 results will frequently be 30 pages out of one textbook. The user's instinct that "it could get very crowded" is correct, and it is worse than it looks.
- **Search already covers Classroom/Drive files.** The user asked whether this works for remote files or only local ones: **3,032 of those 3,067 pages come from Classroom Drive attachments.** Remote files aren't a special case in search — extraction stores their text in `document_parts` exactly like a local file's, so `rebuildSearchIndex()` picks them up with no remote-specific code at all. Searching genuinely reads through the professor's Drive documents.

### 2.2 The bug: most results do nothing when clicked — **fixed 2026-07-29**

`openSearchResult()` (`renderer.ts`) handles exactly two entity types:

```ts
if (result.entityType === 'note') { ... }
else if (result.entityType === 'resource') { ... }
// announcement / assignment / document_part fall through — the dropdown
// just closes and nothing opens
```

The `SearchResult` interface (`renderer.ts:179`) doesn't even list `document_part`, which is why this was never caught by the compiler — the type went stale when Phase 4 started indexing parts.

Real impact, measured: searching "growth" against the user's data returns 5 results, **3 of which are dead clicks**. Once page hits are ranked in, the large majority of all search results are dead.

**Done.** Every handler needed to fix this **already existed** — this was wiring, not new UI:

| Result type | Opens |
|---|---|
| `note` | `openNoteEditor()` — already wired |
| `resource` (local file) | `openPreview()` — already wired |
| `resource` (Classroom/Drive link) | `openExternalUrl()` — the existing link behavior, deliberately kept (§2.6) |
| `document_part` | its **parent resource**, resolved via `document_parts.resource_id` |
| `announcement` | `openClassroomItemDetail()` — exists, used by the course-detail Announcements tab |
| `assignment` | `openAssignmentDetail()` — exists, jumps to the mirrored deadline viewer |

### 2.3 Ranking: courses, then names, then content — **done 2026-07-29**

> "arrange it so that the file names that contain the search result show on top and only then you include the results where the word will be in the body" ... "i said i want the search ordering to be courses first. then files. then content in the files."

Implemented as a **hard partition into sections**, not a soft relevance weight — a weight would still let a strong body match outrank a weak title match, which is exactly what the user asked not to happen.

**Built and shipped** (`main.ts`'s `search:query`), four sections, in this fixed order, each its own SQL query with its own `LIMIT` so a flood of page hits can never push name matches off the list:

1. **Courses** — a plain `courses.name LIKE` match. Courses were never a searchable entity at all before this (typing a course name returned nothing unless that text also happened to appear in a title/body) — the user hit this directly. Archived courses included on purpose, same as everywhere else in search (`open-questions.md` #4).
2. **Names** — files and notes whose *title* matches, via FTS5's column-filter syntax (`search_index MATCH 'title:...'`) so a resource that only matches somewhere in its *body* doesn't land here.
3. **Content** — page/slide/sheet hits (`document_part` rows always land here, they have nothing but body text to match on) plus any resource/note that matched by body but not title (excluded from Names above, so not lost — just moved here). De-duplicated against Names by `entityType:entityId` so nothing appears twice.
4. **Classroom** — announcements and assignments, one section regardless of whether the match was in the title or body.

The current app now also implements the formerly deferred UI work: visible section headers, source badges, course-filter chips that keep the dropdown open, and document-part hits collapsed beneath their parent resource with expandable page rows. The result-opening paths remain covered by the existing renderer behavior and focused Dashboard/search work.

### 2.4 Crowding: collapse page hits under their file

The core fix for §2.1. Instead of 12 separate rows for 12 matching pages of one textbook, **one row per file**, with its pages nested under it:

```
Names
  📕 Solow Growth Model.pdf            Development Economics
  📃 W3L2 growth notes                 Development Economics

Inside content
  📕 Weil Textbook.pdf                 Development Economics · 12 matches
       Page 5   …exogenous growth models assume…
       Page 41  …growth accounting decomposes…
       + 10 more
  📊 ECO 2202 (Spring 2026)   Classroom · 2 matches

Classroom
  📢 Readings for 2 April…             Development Economics
  📌 Government n Growth                Development Economics
```

`GROUP BY document_parts.resource_id`, showing a match count plus the top 2–3 page snippets, expandable to the rest. This turns "30 rows from one textbook" into "one row that says 12", which is both less crowded *and* more informative — the user learns which *file* is the right place to look, which is what they actually wanted to know.

A file that matches in **both** A and B appears once, in A, with its inside-content matches attached — never duplicated across sections.

### 2.5 Source badges and filters

- **Source badge** on every result: local file, Classroom, or Drive. The user was explicit (point 5) that knowing "this is a Classroom file, not something I stored locally" is valuable, so search should carry that signal too rather than only the resource list.
- **Course filter** — a dropdown to scope the whole search to one course. Highest-value narrowing by far for exam prep, and the query layer already supports it (`contextBuilder.ts`'s `searchAtlas` takes a `course` option; the in-app `search:query` handler currently takes nothing but a string).
- Per-section **"show more"** rather than one global 30-row cap.

Worth noting the irony this fixes: the AI agent's search (`atlas_search`) already supports course scoping, type filtering, and a 100-result ceiling for course-scoped queries. The user's own search box supports none of that. Phase 5 brings the human's search up to the agent's.

### 2.6 Deliberately NOT doing

- **Showing extracted text in-app for Classroom/Drive files.** Considered and **rejected by the user**: opening the real file in Drive is better than reading text pulled out of it (real formatting, images, tables), and the "open link" behavior also makes it unmistakable that the file lives in Classroom/Drive rather than locally. Search still *finds* text inside those files — it just hands off to Drive to actually read them. This is a product decision, not a limitation.

---

## 3. Dashboard v2

### 3.1 Unread announcements — with a way to clear them

The user's requirement, verbatim: *"there needs to be a read all or ignore button or something that removes them from dashboard."*

- New column `announcements.read_at TEXT` (NULL = unread).
- Widget lists unread announcements, newest first, with an unread count.
- Clicking one opens it (existing detail overlay) **and** marks it read.
- A **"Mark all read"** action on the widget header clears the whole list at once.
- When nothing is unread the widget shows a quiet empty state rather than disappearing entirely, so the dashboard layout doesn't jump around (the dashboard has a history of column-height problems — `open-questions.md` #23/#24/#25 — and a widget that vanishes would reopen exactly that).

**Migration detail that matters:** the user has **152 existing announcements**. Marking them all unread on first launch would open the app to a wall of 152 items — a terrible first impression of a feature meant to reduce noise. So the migration **backfills every existing announcement as already read**, and only genuinely new ones from that point forward show as unread. Flagging this explicitly because it's the kind of decision that's invisible until it's wrong.

### 3.2 New assignments

Same pattern, same reasoning:

- New column `assignments.seen_at TEXT` (NULL = new).
- Widget lists unseen assignments; clicking opens the mirrored deadline viewer and marks it seen; "Mark all seen" clears.
- Same backfill-as-seen migration for the 27 existing rows.

### 3.3 "Recently synced items" — recommend dropping

The original Phase 5 line lists this as a third widget. **The dashboard already has two widgets doing almost exactly this**: "Recently added resources" and "What changed today". A third would be near-duplicate content competing for the same space, on a dashboard that has already needed three separate rounds of layout fixes.

**Recommendation:** don't build a third widget. If "what did the last sync actually pull in" is worth surfacing, the better home is the existing Settings → Sync section, next to each source's "last synced" timestamp, as a count ("last sync: 3 new announcements, 1 new assignment"). Flagged for the user's decision rather than silently cut.

### 3.4 Schema

```sql
ALTER TABLE announcements ADD COLUMN read_at TEXT;   -- NULL = unread
ALTER TABLE assignments  ADD COLUMN seen_at TEXT;    -- NULL = new
```

Plus the backfill described above, in `migrate()` — and, as always, `schema.sql` and `database.ts` change together.

---

## 4. Configurable keyboard shortcuts

The user's ask: shortcuts for anything (not just notes), **configurable**, plus *"a shortcut to view the shortcuts 😂"*.

### 4.1 A real registry, not scattered key handlers

Today's shortcuts are hardcoded in ad-hoc `keydown` listeners (Ctrl+L focuses search; Escape closes overlays; Arrow/Enter navigate search results). Making them configurable means one registry instead:

```ts
interface ShortcutAction {
  id: string;              // 'search.focus', 'note.new', ...
  label: string;           // shown in Settings and the cheat sheet
  defaultBinding: string;  // 'Ctrl+L'
  scope: 'app' | 'global'; // global = works even when Atlas isn't focused
  run: () => void;
}
```

User overrides stored as one JSON blob in `app_settings` (`shortcuts_overrides`), so an unset action just falls back to its default and the stored value stays small and inspectable.

### 4.2 Proposed default set

| Action | Default | Scope |
|---|---|---|
| Focus search | `Ctrl+L` | app *(exists today)* |
| Quick capture note | `Ctrl+Shift+N` | **global** |
| New note | `Ctrl+N` | app |
| Upload file | `Ctrl+U` | app |
| Sync now (all sources) | `Ctrl+R` | app |
| Go to Dashboard / Courses / Resources / Notes / Calendar / Settings | `Ctrl+1`…`Ctrl+6` | app |
| Toggle sidebar | `Ctrl+B` | app |
| Show shortcuts | `?` | app |
| Close overlay | `Esc` | app *(exists today)* |

**Quick capture is the one that genuinely needs to be global** (Electron's `globalShortcut`, registered in the main process): its whole value is getting a thought down mid-lecture without first finding and focusing the Atlas window. Everything else is an in-app `keydown` handler and should stay that way — global shortcuts are seized OS-wide and silently steal the key from every other app, so the fewer the better.

### 4.3 The cheat sheet

`?` (or the rebound equivalent) opens an overlay listing every action and its current binding, grouped by area, generated from the registry so it can never drift from what's actually bound. Reachable from Settings too, for discoverability — a shortcut you can only find via a shortcut is a joke that stops being funny the first time you forget it.

### 4.4 Rebinding UI

Settings gains a **Shortcuts** section: one row per action showing its current binding, click-to-rebind (captures the next key combination pressed), a per-row reset-to-default, and a reset-all.

Two rules worth stating up front:
- **Conflict detection.** Binding a combination already in use shows which action currently owns it and requires confirming the steal — silently double-binding a key is how a shortcut becomes "randomly broken."
- **Reserved keys.** A small blocklist (plain `Esc`, plain typing keys with no modifier while a text field is focused, `Ctrl+C/V/X/A/Z`) can't be captured, so shortcuts can't make the note editor unusable.

---

## 5. Build order

| # | Piece | Size | Notes |
|---|---|---|---|
| 1 | Search: make every result clickable (§2.2) | Small | **Done 2026-07-29.** Pure bug fix, all handlers already existed. |
| 2 | Search: sectioned results + collapse page hits (§2.3, §2.4) | **Large** | **Done 2026-08-03.** |
| 3 | Search: source badges + course filter (§2.5) | Medium | **Done 2026-08-03.** |
| 4 | Dashboard: schema + migration/backfill (§3.4) | Small | **Done 2026-08-03.** |
| 5 | Dashboard: unread announcements widget (§3.1) | Medium | **Done 2026-08-03.** |
| 6 | Dashboard: new assignments widget (§3.2) | Small | **Done 2026-08-03.** |
| 7 | Shortcuts: registry + rewire existing handlers (§4.1) | Medium | **Done 2026-07-29.** |
| 8 | Shortcuts: cheat-sheet overlay (§4.3) | Small | **Done 2026-07-29.** |
| 9 | Shortcuts: Settings rebinding UI + conflicts (§4.4) | Medium | **Done 2026-07-29.** |
| 10 | Shortcuts: global quick capture (§4.2) | Medium | **Done 2026-07-29.** |
| 11 | Verification across all three | Medium | Focused Dashboard verification exists; dedicated search visual verification remains useful. |

**#1 is independently valuable and low-risk** — it fixes a live bug in a few lines and can ship well before the rest.

---

## 6. Out of scope

- Relationship editing and the offline-mode audit — **dropped by the user** 2026-07-29, not deferred (`ROADMAP.md`).
- Rendering Classroom/Drive file *content* inside Atlas (§2.6) — rejected on purpose.
- Search across archived courses as a separate toggle — archived courses already stay searchable by design (`open-questions.md` #4); no new control needed unless it becomes noisy in practice.

---

## 7. Separately logged: three small things found while measuring §2.1

Not part of Phase 5, but found during the same audit and worth not losing:

1. **9 Classroom PDFs are scanned images with no text layer** (`extraction_status = 'empty'`, all in Development Economics). The existing "Run OCR" flow can't help them: OCR renders pages from a *local* file, and these are remote by design. Either OCR needs a temp-fetch path, or these stay permanently unreadable — worth a decision, not a silent gap.
2. **One link-following false positive.** A resource titled "Page 80 link" failed with `File not found: 83182` — `driveFileIdFromUrl()`'s loosest fallback pattern (`[?&]id=…`) matched a non-Drive URL's `id` parameter and manufactured a bogus Drive file ID. Only 1 case out of 3,000+, and it failed loudly rather than corrupting anything, but that pattern should be tightened or dropped.
3. **The ECO 2202 sheet is stored and extracted twice** (resource IDs 5322 and 5330 — same Drive file, posted in two different announcements, so two legitimate attachment rows). Harmless but wasteful: the same file was fetched and extracted twice. The `local_twin_id` mechanism (`remote-attachments-spec.md` §3.3) already solves exactly this shape of problem for local copies and could be extended to remote-to-remote duplicates.
