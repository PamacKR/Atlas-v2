# Remote attachment reading (Drive now, Gmail later) — specification

Status: **draft for review, nothing built yet.**

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

Other constraints to design around:

- **Drive shortcuts** (`application/vnd.google-apps.shortcut`) must be resolved to their target before fetching.
- **`files.export()`'s ~10 MB output cap** still applies as a fallback-path failure if `exportLinks` is ever unavailable — kept as an explicit status, not a generic error.

Google-native handling also fixes the Drive *inbox* blind spot (§1) as a side benefit, since both paths will share the fetch/export helper.

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
| 1 | Stop discarding attachment type + Drive file ID (§1) | Small | Nothing else can work without it. |
| 2 | Schema + migration (§4) | Small | |
| 3 | Fetcher interface + Drive impl, incl. export branch (§3.4, §5) | **Large** | The bulk of the work. |
| 4 | Local-copy-first resolution (§3.3) | Medium | Requirement 2. |
| 5 | Wire into sync + backfill + progress (§6, §8) | Medium | |
| 6 | Failure states + UI surfacing (§7) | Medium | |
| 7 | Verification (§9) | Medium | |
| 8 | Gmail fetcher | — | Deferred to the Gmail adapter; interface exists from #3. |

## 12. Out of scope

- Fetching arbitrary (non-Drive) web links — a different capability, and Atlas making open web requests is a new behaviour class needing its own decision.
- YouTube transcripts — separate API, separate scope.
- Writing back to Drive.
