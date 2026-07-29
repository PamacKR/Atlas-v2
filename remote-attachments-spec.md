# Remote attachment reading (Drive now, Gmail later) — specification

Status: **built and verified 2026-07-29.** See STATUS.md's Handoff section for what the user needs to do (reconnect Google Classroom for the new Drive scope) before it's live against real data.

Extends Phase 4's page-aware extraction (`phase4-spec.md` §3) to files Atlas does **not** hold locally — Classroom attachments that live in the professor's Drive, and later Gmail attachments.

---

## 1. The problem

Classroom attachments are stored as `resources` rows with `kind = 'link'` and `file_path` holding a Drive URL — deliberately not downloaded, so Atlas doesn't duplicate files Google already hosts. But `EXTRACTABLE_KINDS` (main.ts) excludes `'link'`, so they get `extraction_status = 'unsupported'` and the AI agent sees a title and nothing else.

Two gaps found while auditing, both worse than expected:

- **`extractMaterialLinks()` (googleClassroom.ts) throws away the Drive file ID and the attachment type**, keeping only `{title, url}` — even though Google's API hands us both. Nothing downstream can tell a Drive PDF from a YouTube link.
- **Google-native files are invisible to Atlas entirely.** `scanDriveFolder()` line ~203 skips any `application/vnd.google-apps.*` file outright, and `downloadDriveFileContent()` only does `alt: 'media'`, which *fails by design* on Docs/Sheets/Slides. Since professor-authored Classroom material is very often a Google Doc or Slides deck, this is likely the single biggest blind spot.

## 2. Requirements (user's, verbatim intent)

1. **Never download Drive files locally** — reading must not create files in `Atlas-Storage/files/`.
2. **Unless a local copy already exists** because the user imported it themselves — then use that copy and don't fetch anything.
3. Design so **Gmail attachments** can reuse the same machinery when the Gmail adapter is built, if that costs little now.
4. The experience must be **seamless**: no silent failures, no silent long waits.
5. **Follow links *inside* documents.** A professor may share a single Google Sheet that is really an index of the whole course — notes, syllabus, practice questions all as links within it. One Classroom attachment can be the entry point to dozens of real documents.
6. **Attachment count grows through the semester** and will "not be less" — especially where notes are posted after every class. Incremental, not one-shot.
7. **Exam-scale access.** During midterms/finals the user may ask the agent to work across *every file in a course* — a mix of local files, Classroom links, Drive links, and (later) Gmail attachments — to produce notes or practice questions.

### 2.1 Evidence: a real course index (ECO-2202, Spring 2026)

The user shared the actual spreadsheet a professor used. Inspected directly:

- **4 sheets** — `Daily Plan`, `Appointments`, `Assessments`, `Attendance`.
- **21 embedded hyperlinks**, 19 of them in `Daily Plan`, one per class session.
- **Mixed link targets**, all in one file:
  - `docs.google.com/document/…` → Google Doc (practice questions)
  - `docs.google.com/presentation/…` → Google Slides (lecture topics)
  - `drive.google.com/file/d/…` → binary PDFs (syllabus, textbook chapters)
  - `data.worldbank.org/…` → external web, not Drive
  - `zoom.us/…` → external, not course content at all
- **Sparse but wide ranges** — `Daily Plan` is `A1:F1042` and `Attendance` is `A1:AD1041`, mostly empty.

This single file is the strongest argument for §5 (link-following): treated as one attachment it yields a wall of context-free labels; treated as an index it yields the entire course.

---

## 2.2 Prerequisite bug: current extraction destroys every hyperlink

**Found by running Atlas's existing extractor against the real file above.** Verified directly: the extracted text contains *no* `drive.google` or `docs.google` URL at all. What survives is `"Course Syllabus"` — the link text — with the target silently dropped.

The cause is per-format, and affects code already shipped in Phase 4:

| Format | Where links are lost |
|---|---|
| **XLSX** | `sheet_to_csv()` reads cell *values*; a hyperlink lives in `cell.l.Target`, a separate property never touched. |
| **DOCX** | `mammoth` emits real `<a href>` tags, then `extractDocxParts`'s `replace(/<[^>]+>/g, ' ')` strips the whole tag, href included. |
| **PDF** | `getTextContent()` returns glyphs only; link annotations live in `page.getAnnotations()`, never called. |
| **PPTX** | Slide XML relationship targets (`slideN.xml.rels`) are never read. |

This is a standalone defect worth fixing regardless of remote fetching: right now, **any** document whose value is its links is being flattened into meaningless labels. It is also a hard prerequisite — nothing can follow a link that extraction already threw away.

**Fix:** each extractor emits links alongside text, and the link URL is inlined into the stored part text (`Course Syllabus (https://drive.google.com/file/d/…)`), so it is searchable and visible to the agent *even when Atlas cannot fetch it* — which is exactly the right outcome for the Zoom and World Bank links, since the agent may have its own web access.

## 3. Key decisions

### 3.1 Atlas fetches, not the MCP server

The MCP server is a separate process. If it did its own Drive calls, two processes would refresh the same OAuth token independently — a real race that can invalidate the other's session. It would also add latency to every read and break offline use.

**Instead: Atlas fetches during sync, extracts text, stores the text, discards the bytes.** The MCP server needs *zero* changes — text lands in `document_parts`, so search, `atlas_read_document`, and page-level citation all work for free.

### 3.2 "No local download" means no file is written

To extract text the bytes must pass through memory; there is no way around that. The guarantee this spec makes is precise: **nothing is ever written to `Atlas-Storage/files/`**. Only extracted text is persisted, in `document_parts`. Buffers are released immediately.

### 3.3 Local-copy-first (requirement 2)

Before any network call, check whether Atlas already holds this exact Drive file locally. `resources.drive_file_id` is already set on anything imported via the Drive inbox, so a Classroom attachment pointing at the same Drive file ID is detectable with a single query.

**Resolution order for any remote resource:**

1. **This row has a real local file** → extract from disk. No network.
2. **Another resource row has the same `drive_file_id` and a local file** → extract from *that* file, and record the link (`resources.local_twin_id`) so the relationship is visible rather than a coincidence. No network.
3. **No local copy anywhere** → fetch to memory, extract, discard.

This satisfies the requirement exactly, and has a useful side effect: the same file arriving via two routes (Classroom attachment + Drive inbox import) stops being two disconnected rows.

### 3.4 A fetcher abstraction, so Gmail is a drop-in

Rather than Drive-specific code inside the extraction path:

```ts
interface RemoteFetcher {
  source: 'drive' | 'gmail';
  fetch(ref: string, mimeType: string | null): Promise<{ buffer: Buffer; mimeType: string }>;
}
```

`extractRemoteResource()` picks a fetcher by `resources.remote_source` and knows nothing about Drive or Gmail specifically. Adding Gmail later = one new implementation plus a `remote_source = 'gmail'` writer in the Gmail adapter. Everything else — caching, extraction, statuses, UI, verification — is shared.

Cost of building it this way now: small (one interface, one dispatch function). Worth it.

## 4. Schema

On `resources`:

```sql
remote_source TEXT,            -- 'drive' | 'gmail' | NULL (purely local)
remote_ref TEXT,               -- Drive file ID, or 'messageId:attachmentId' for Gmail
remote_mime_type TEXT,         -- as reported by the source; drives the export branch
remote_fetched_version TEXT,   -- Drive modifiedTime / Gmail immutable id, for cache skip
link_kind TEXT,                -- 'driveFile' | 'youTubeVideo' | 'link' | 'form' (Classroom only)
local_twin_id INTEGER REFERENCES resources(id) ON DELETE SET NULL
```

Deliberately **not** reusing the existing `drive_file_id`: it means "this resource was *imported from* Drive and has a local copy," carries a UNIQUE index, and reusing it would both collide and destroy that distinction.

As always, `schema.sql` and `migrate()` in `database.ts` change together.

## 5. Google-native export (the real work)

| Source type | Method | Target |
|---|---|---|
| PDF / DOCX / PPTX / XLSX | `files.get({ alt: 'media' })` | raw bytes → existing extractors |
| Google **Doc** | `files.export()` | `text/plain` |
| Google **Slides** | `files.export()` | `text/plain` |
| Google **Sheet** | `files.export()` | `text/csv` (first sheet only — a documented limitation of export) |
| Google **Form** | — | `unsupported` (a form structure, not a document) |

**Before any fetch attempt** (§10.2): a cheap metadata-only `files.get({fields: 'capabilities(canDownload)'})`. If `false`, skip straight to `failed: "restricted by the file's owner"` — no wasted fetch, no ambiguous error to parse afterwards.

**Export path** (§10.3): try `files.get({fields: 'exportLinks'})` and fetch from the returned URL first — not subject to the 10 MB cap `files.export()` has. Fall back to `files.export()` directly only if `exportLinks` is missing. This means the "too large" failure state below should be rare in practice, not routine.

### 5.1 The 10 MB cap does **not** apply to PDFs

Worth stating plainly, because it's easy to over-generalise: **the ~10 MB limit is a property of `files.export()`, which only exists for Google-native formats** (Docs/Sheets/Slides — files that have no native bytes and must be *converted* on Google's servers).

A PDF, DOCX, PPTX or XLSX is a real binary file, fetched with `files.get({alt: 'media'})`, which has **no such cap**. A 200 MB textbook PDF downloads fine.

Large PDFs pose different problems, and they're about resources, not permissions:

| Concern | Mitigation |
|---|---|
| Memory — buffering a very large PDF in RAM | Stream to a **temp file in the OS temp dir** above a threshold (~40 MB), extract from there, delete immediately. Not `Atlas-Storage/files/`, so requirement 1 holds. |
| Time — an 800-page textbook takes minutes to extract | Background, sequential, with visible progress (§8). Never blocks the app or a sync. |
| Text volume | ~800 pages ≈ 2–3 MB of text. Comfortable for SQLite; no special handling. |

So: a big Google Doc is a real constraint (handled by `exportLinks`, §5); a big PDF is just slow, not blocked.

### 5.2 Other constraints

- **Drive shortcuts** (`application/vnd.google-apps.shortcut`) must be resolved to their target before fetching.
- **`files.export()`'s ~10 MB cap** remains only as a fallback-path failure if `exportLinks` is unavailable — kept as an explicit status, not a generic error.

Google-native handling also fixes the Drive *inbox* blind spot (§1) as a side benefit, since both paths will share the fetch/export helper.

## 5.5 Following links inside documents (requirement 5)

The ECO-2202 case (§2.1) is the whole justification: one Classroom attachment, 19 links, an entire course behind them.

### 5.5.1 Discovery

Once §2.2 lands, extraction returns discovered links alongside text:

```ts
interface ExtractionResult {
  status; parts; error?;
  discoveredLinks?: { text: string; url: string; partOrdinal: number }[];
}
```

Two independent things then happen to each link, and keeping them separate is the key design point:

1. **Always** — the URL is inlined into the stored part text, so it is searchable and the agent can see it. This covers World Bank, Zoom, and anything else Atlas can't fetch. Atlas isn't judging what matters; it's preserving what's there.
2. **Only if it's a Drive link** — a child resource is created and queued for extraction.

### 5.5.2 Child resources

```sql
parent_resource_id INTEGER REFERENCES resources(id) ON DELETE CASCADE,
discovery_depth INTEGER NOT NULL DEFAULT 0
```

Child resources belong to the **same course** as their parent — no inference required, which is why this doesn't need the review-panel treatment the Drive inbox has (there, the course genuinely is ambiguous; here it isn't).

### 5.5.3 Limits, because this is a graph and graphs explode

| Guard | Default | Why |
|---|---|---|
| Max depth | **2** | ECO-2202 needs 1 (sheet → doc). Depth 2 covers a doc that links onward. Beyond that is almost certainly drift, not course material. |
| Max children per parent | 100 | A runaway index shouldn't queue thousands of fetches. |
| Max total per course per sync | 300 | Bounds worst-case sync time. |
| Cycle detection | Drive file ID seen-set | A links to B links to A must terminate. |
| Dedupe | By Drive file ID | The same doc linked from five rows is fetched once. |

Hitting a cap is **surfaced, never silent** — "stopped after 100 linked documents" is information the user needs, not an implementation detail to swallow.

### 5.5.4 Visibility and control

- Discovered children are marked as such in the UI and show their parent, so it's always clear *why* Atlas has a file the user never added.
- A per-course toggle to disable link-following, and the ability to prune a discovered subtree.
- Progress reports discovery separately: "reading 19 linked documents from *Daily Plan*."

---

## 5.6 Exam-scale access (requirement 7)

"Access every single file for the course" is a different access pattern from "find me the elasticity chapter", and the current tool limits weren't designed for it. With link-following, one course could plausibly reach 60+ documents and several thousand pages.

The architecture holds — search-then-targeted-read is exactly right at this scale, and far better than dumping everything — but three limits need changing, and one affordance is missing:

| Gap | Change |
|---|---|
| `atlas_course_briefing` caps its inventory at 20 items | Return a **total count** plus the first N, so the agent knows more exists and can paginate via `atlas_list_resources` |
| No way to see a document's structure without reading it | **`atlas_read_document` with no `from`/`to` returns an outline** — part labels and total count, no text. Cheap navigation: the agent can see "847 pages, Chapter 5 starts at 214" before pulling anything. Costs nothing to add and makes broad work tractable. |
| Search caps at 25 hits | Raise the ceiling for course-scoped searches; 25 is thin when sweeping a whole semester. |
| Nothing tells the agent a course is *large* | Briefing reports resource/part totals, so the agent can choose to sample broadly rather than read deeply. |

**Deliberately not building:** a "give me everything" bulk-dump tool. It cannot fit in context, it would make answers worse, and it recreates the manual-dump problem this project exists to remove.

---

## 6. Caching — never re-fetch unchanged files

`remote_fetched_version` stores Drive's `modifiedTime` at fetch time. A re-sync compares and skips unless it changed. Same pattern already proven by `drive_preview_synced_size/mtime_ms` for the Office-preview cache.

Result: the first sync after this ships does real work; subsequent syncs do almost nothing.

## 7. Failure states — all legible, none silent

`extraction_status` gains meaning for remote resources. The rule: **retryable conditions stay `pending`; permanent ones become explicit.**

| Situation | Status | Behaviour |
|---|---|---|
| Drive not connected | `pending` | Retries next sync. Never `failed` — it's a setup state. |
| Fetched and extracted | `done` | — |
| Fetched, no text found | `empty` | Offer OCR, same as a local scanned PDF. |
| YouTube / plain link / Form | `unsupported` | Never retried. |
| Restricted (`canDownload: false`) | `failed` + reason | Caught by the §10.2 pre-check before any fetch is attempted — never a raw API error. |
| Over size/export cap | `failed` + reason | Explicit "too large", not a generic failure. |
| Network/quota error | `pending` | Retried with backoff. |

## 8. Seamlessness

- **Visible progress.** Reuses the existing `extraction:backfillProgress` channel and the Settings "Text extraction" section. A silent multi-minute first sync is exactly how the Classroom bug went unnoticed for weeks (`STATUS.md`) — not repeating that.
- **Never blocks sync or the UI.** Fetching runs after the Classroom sync completes, sequentially, in the background.
- **Per-resource clarity.** The resource list shows whether the agent can actually read a given attachment, so "the agent didn't find it" is never a mystery.
- **Bounded.** Sequential fetches with a concurrency of 1 and a modest per-sync cap, to stay well inside Drive API quota.

## 9. Verification

Extends `scripts/verify-mcp.js` and adds fixtures:

1. A binary Drive attachment extracts and is readable via `atlas_read_document`.
2. A Google-native file goes through the **export** branch, not `alt: 'media'`.
3. **No new file appears in `Atlas-Storage/files/`** after any remote extraction — the headline requirement, asserted directly.
4. A resource whose Drive file already exists locally performs **zero network calls** (fetcher stubbed to throw if invoked).
5. A permission failure surfaces the real reason rather than being swallowed.
6. A YouTube link resolves to `unsupported` and is never retried.
7. An unchanged file on re-sync is skipped, not re-fetched.

Google API calls are stubbed at the fetcher interface, so this runs offline and deterministically in CI.

## 10. Spike findings (2026-07-29, research only — no code run, no live Google/Atlas access)

Researched against current Google documentation rather than testing against a real course, per the user's request not to execute anything yet.

### 10.1 Scope — resolved, no new risk

`drive.readonly` already covers this. A Classroom attachment is a regular Drive file the professor has shared with the student (Viewer access) — reading it is identical to reading any file shared via a normal Drive share link. Atlas already relies on exactly this access model for the existing Drive inbox feature, so nothing new is being asked of the OAuth grant.

The **7-day refresh-token expiry** is real but is Atlas's existing, already-accepted testing-mode tradeoff (`googleAuth.ts`, `open-questions.md` #19) — a consequence of not submitting for Google's verification review, not something this feature introduces. The user already reconnects periodically today.

### 10.2 Per-file download restriction — confirmed, and there's a cheap pre-check

A file owner *can* disable download/copy independently of sharing access (Drive's "Disable download, print, and copy" toggle) — this is the real, expected failure mode for a restricted attachment, exactly as §7 anticipated.

**Refinement:** Drive exposes this as `capabilities.canDownload` in a metadata-only `files.get` call — cheap, and answerable *before* attempting a fetch. **Plan updated:** check `capabilities.canDownload` first; a `false` result goes straight to `failed: "restricted by the file's owner"` without ever attempting the actual fetch/export. Cleaner than parsing a raw API error after the fact.

### 10.3 The 10 MB export cap — confirmed, but there's a known workaround

`files.export()` (Google-native → PDF/text/csv) hard-caps at ~10 MB and throws `exportSizeLimitExceeded` above that — this validates §5's size concern.

**But:** requesting the `exportLinks` field via a plain `files.get` call returns pre-signed per-format URLs that are **not subject to the same 10 MB cap**, per Google's own issue tracker guidance for exactly this limitation.

**Plan updated:** try `files.get({fields: 'exportLinks'})` → fetch from the returned URL as the primary path, falling back to `files.export()` only if `exportLinks` is absent for some reason. This removes the 10 MB ceiling as a default failure case rather than just labeling it clearly (§5's original "large file" status becomes rare instead of routine) — worth confirming end-to-end against one real large Google Doc before relying on it, since community reports aren't the same as verifying it against Atlas's actual OAuth client.

### 10.4 Still unresolved — needs you, not research

**How many attachments does a real course actually have?** This determines whether sequential, one-at-a-time fetching (§3.4/§8) is fine or needs batching/pagination. I can't answer this from documentation, and checking it myself would mean either running a script against your real Classroom data or querying your real database — both of which you asked me not to do right now. Rough ballpark from you (a handful per course? dozens?) is enough to size this correctly before I build it.

### 10.5 Net effect on the plan

No red flags — nothing here suggests reconsidering the feature. Two concrete improvements (§10.2's cheap pre-check, §10.3's `exportLinks` path) are folded into §5/§7 below. The only remaining gate is §10.4, and it only affects fetch batching, not the core design.

## 11. Build order

| # | Piece | Size | Notes |
|---|---|---|---|
| 0 | ~~Spike the three unknowns~~ | — | **Done 2026-07-29** (research-only, §10). No blocker found; two design refinements folded in. Only open item is attachment volume (§10.4), needed from the user before sizing fetch batching. |
| 1 | **Preserve hyperlinks in extraction (§2.2)** | Medium | **Standalone bug fix, ships value on its own.** Hard prerequisite for #6. Do first. |
| 2 | Stop discarding attachment type + Drive file ID (§1) | Small | Nothing remote can work without it. |
| 3 | Schema + migration (§4, §5.5.2) | Small | |
| 4 | Fetcher interface + Drive impl, incl. export/`exportLinks` branch (§3.4, §5) | **Large** | The bulk of the work. |
| 5 | Local-copy-first resolution (§3.3) | Medium | Requirement 2. |
| 6 | Link-following + limits + visibility (§5.5) | **Large** | Requirement 5. Needs #1 and #4. |
| 7 | Wire into sync + backfill + progress (§6, §8) | Medium | |
| 8 | Failure states + UI surfacing (§7) | Medium | |
| 9 | Exam-scale tool changes (§5.6) | Small | Cheap, and the payoff is high during finals. |
| 10 | Verification (§9) | Medium | |
| 11 | Gmail fetcher | — | Deferred to the Gmail adapter; interface exists from #4. |

**Suggested split:** #1 is independently valuable and low-risk — worth shipping alone first, since it fixes a live defect and can be verified against the real ECO-2202 file. #2–#5 are the remote-fetch core. #6 is the ambitious part and should follow only once fetching is proven.

## 12. Out of scope

- Fetching arbitrary (non-Drive) web links — a different capability, and Atlas making open web requests is a new behaviour class needing its own decision.
- YouTube transcripts — separate API, separate scope.
- Writing back to Drive.
