# Atlas performance and responsiveness plan

**Status:** Planning complete; measurement baseline complete; Phase 1 implementation in progress
**Last updated:** 2026-08-07
**Scope:** Personal-use responsiveness work on `ui-overhaul-v2`

This is the working plan for improving Atlas's launch speed, interaction latency, and real-time freshness. It is deliberately ordered so that correctness and reliable updates are established before caching, background work, or optimistic UI are introduced.

## Guiding constraints

- SQLite remains the canonical source of Atlas data.
- The search index is a rebuildable derived layer, not a second source of truth.
- No AI or paid API calls will be added to Atlas.
- The external AI agent remains responsible for reasoning; Atlas stores and exposes the user's academic data.
- Optimistic rows or placeholders are allowed only when the operation has a safe rollback path.
- No broad state-management rewrite or speculative abstraction will be introduced without evidence from the focused measurements.
- Full Electron verification will be used at meaningful milestones. Focused checks will be used during smaller iterations.
- Real user data may be used only for read-only diagnosis and carefully controlled smoke checks. Performance benchmarks use throwaway data.

## Current assessment

Atlas's responsiveness problem is a combination of four issues:

1. Some local actions wait for expensive work that does not need to block the user, especially full search-index rebuilds and note-file export.
2. Several mutation paths do not notify the renderer consistently, so the database changes while the visible page stays stale.
3. The renderer repeats work that is hidden or already available, including Dashboard renders while another page is open and repeated global IPC reads.
4. Large editor and PDF code is loaded during startup even when the user is opening a normal Dashboard or list page.

This is not a general database-speed problem. Deadline IPC was about 16ms, normal page navigation was about 0.22–0.30 seconds, global search was about 0.38 seconds, and the command palette was about 95–103ms. Those areas should be protected from regressions rather than treated as the first optimization targets.

## Measurement baseline

### Real-data read-only audit

The user's live database was inspected without changing it. The observed scale was:

- 5 courses
- 196 resources
- 3,081 extracted document parts
- 3,444 search-index rows
- 152 announcements
- 42 deadlines
- 2 notes

The main code-level findings were:

- Every non-Dashboard page currently also starts a Dashboard render, even though the Dashboard is hidden.
- Startup performs overlapping initial reads and renders.
- Note autosave writes the database, exports the Markdown mirror, and rebuilds the complete search index in the interaction path.
- Resource upload, deletion, extraction, and folder-watcher events can also rebuild the complete search index synchronously.
- Some page surfaces repeat global reads or issue avoidable per-course queries.
- Mutation events are inconsistent, which explains why some changes appear only after navigation or relaunch.
- The renderer bundle is approximately 6.76MB and the PDF worker is approximately 2.37MB.

### Throwaway-data benchmark

The reusable benchmark is `scripts/measure-performance.js`, run through `npm run measure:performance`. It launches the real built Electron app against a temporary database seeded to approximately the current scale and removes that data after the run.

The final focused run measured:

| Operation | Baseline |
|---|---:|
| Electron launch resolved | 3.27s |
| First window available | 4.76s |
| DOMContentLoaded | 5.72s |
| First usable Dashboard | 5.81s |
| Populated page navigation | 0.22–0.30s |
| New note editor available | 1.90s |
| Note edit through real Saving → Saved state | 2.11s |
| File choice through visible uploaded resource | 2.83s |
| Resource deletion through database removal | 1.30s |
| Deadline create/toggle IPC | 16ms |
| Global search | 0.38s |
| Command palette opening | 95–103ms |
| Underlying note-save IPC | 1.10s |

The deletion sample confirmed a freshness problem: the database no longer returned the deleted resource, but the visible Resources list still showed it 250ms later. The animation-frame sample did not show a renderer freeze; the main problem there is that the user is waiting for the operation to finish, not that the renderer is completely unable to paint.

### First target outcomes

These are directional goals rather than promises made before implementation:

- Make the first usable Dashboard materially faster than 5.8 seconds, with a longer-term target near 3 seconds at the current data scale.
- Make canonical note saves feel immediate, with the database save no longer waiting on file export or a full index rebuild.
- Make uploaded resources appear as soon as the essential local import succeeds, while extraction continues visibly in the background.
- Make accepted deletions disappear from the active list immediately and reliably.
- Keep search and the command palette at or below their current latency.
- Avoid visible page changes that require switching tabs or restarting Atlas.
- Avoid long renderer stalls during ordinary local actions.

## Implementation order

### Phase 0 — Measurement and baseline `[x]`

Completed on 2026-08-06.

- Added the isolated Electron performance benchmark.
- Seeded it to the current approximate data volume.
- Measured launch, first usable Dashboard, page navigation, note creation, autosave, upload, deletion, deadlines, search, command palette, bundle size, and animation-frame behaviour.
- Added an explicit deletion-freshness observation.
- Recorded the results in `STATUS.md`.
- Committed and pushed the measurement-only work as `4f588f3`.

No production performance code was changed in this phase.

### Phase 1 — Establish reliable mutation freshness `[ ]`

Create one consistent change-notification path from the main process to the renderer.

Progress on 2026-08-07: the first implementation slice is in place. Course,
resource, note, and deadline CRUD mutations now emit a typed `atlas:changed`
notification, as do local folder watcher changes, Classroom/Drive-derived
sync changes, and remote extraction updates. The renderer consumes one queued
refresh path that updates only the visible page; hidden pages are left for
their normal page-entry render. The old resource-only watcher event was
removed so resource changes no longer depend on one special-case listener.
The focused Electron regression `npm run verify:mutation-freshness` confirms
resource creation/deletion, note creation/title updates, and deadline creation
appear without navigation or relaunch.

Still remaining before this phase is complete: add the same focused coverage
for extraction/OCR and Classroom/Drive mutations, exercise deadline completion
and course-detail refreshes, and add generation protection so a slow refresh
cannot paint over a newer page state. Those generation and duplicate-render
changes overlap with the next renderer-work phase and will be kept explicit
rather than silently treating this first slice as the whole phase.

It should cover course, note, resource, deadline, extraction, OCR, Classroom, and Drive changes. Each notification should identify what changed and which record or course was affected.

The renderer should then:

- Update the visible list or widget that owns the changed record.
- Remove deleted records immediately after the database confirms deletion.
- Refresh the course detail sections affected by a change.
- Mark hidden pages as dirty instead of rendering them in the background.
- Prevent an older asynchronous refresh from replacing newer data.

Initial acceptance checks:

- A deleted resource disappears without changing pages.
- A newly created note appears without relaunching Atlas.
- Note titles and timestamps update beside the open editor.
- Deadline completion updates the calendar, course detail, and Dashboard where visible.
- Extraction and OCR status changes appear while Atlas remains open.

Why first: later performance work will intentionally make background operations complete at different times. The interface must already have a reliable way to receive and display those changes.

### Phase 2 — Remove redundant renderer and IPC work `[ ]`

Reduce work that is currently repeated or invisible:

- Stop non-Dashboard pages from triggering Dashboard renders.
- Prevent duplicate renders caused by navigation and mutation callbacks arriving together.
- Load independent startup settings in parallel.
- Avoid repeated Drive/Classroom status reads inside one Settings render.
- Replace avoidable per-course query loops with combined database reads where that is straightforward.
- Add simple render-generation protection so a slow old response cannot overwrite a newer page state.

Acceptance checks:

- Navigation remains correct while background events arrive.
- The focused benchmark shows fewer repeated IPC calls.
- Navigation stays at least as fast as the baseline.
- No page displays data belonging to a previous course or filter.

Why second: these are relatively contained changes that lower the amount of noise and repeated work before the larger search-index change.

### Phase 3 — Replace full search-index rebuilds with targeted updates `[ ]`

Treat the full search rebuild as a repair and migration tool, not as the normal response to every edit.

Target behaviour:

- Note edits update one note entry.
- Resource creation adds one resource entry.
- Resource deletion removes that resource and any associated document-part entries.
- Extraction replaces only the affected resource's document parts.
- OCR updates replace only the affected OCR-backed entries.
- Course deletion removes entries belonging to that course.
- Multiple nearby changes are coalesced so the same entity is not indexed repeatedly.

The index update must remain recoverable. A lightweight count or consistency check can continue to detect corruption and schedule a full repair during an idle period or the next launch.

Acceptance checks:

- Search results remain correct after note edits, uploads, extraction, OCR, and deletion.
- A note save no longer scans thousands of unrelated document parts.
- Resource deletion no longer waits for a full rebuild.
- A failed index update never loses the canonical note, resource, or course data.
- Search and command-palette timings do not regress.

Why third: this directly addresses the largest measured cost in note saves, uploads, and deletions.

### Phase 4 — Move mirrors, extraction, and cleanup out of the critical path `[ ]`

Separate the operation the user asked for from supporting work that can finish afterward.

For notes:

- Save the content to SQLite first.
- Update the editor and visible note list.
- Update the targeted search entry.
- Export the Markdown mirror asynchronously because it is a mirror, not the canonical edit store.
- Give mirror-export failures a retryable status rather than delaying the save.

For resources:

- Keep the essential local copy safe and verified.
- Insert and display the resource once it is valid.
- Run extraction after the resource is visible.
- Send extraction progress and completion through the mutation event path.

For deletions:

- Ensure the database and visible UI leave the same logical state immediately.
- Move slow physical cleanup out of the user-facing wait where it is safe to do so.
- Preserve a recoverable cleanup path if deleting a physical file or Drive preview copy fails.

For OCR, sync, and folder watching:

- Keep them outside local CRUD interaction paths.
- Report progress without blocking unrelated local actions.
- Coalesce watcher bursts into one refresh and one indexing pass.

Why fourth: these operations currently overlap with indexing and renderer refreshes. They should be separated after the targeted index contract is in place so the resulting background events are predictable.

### Phase 5 — Shorten the startup critical path `[ ]`

Reorder startup so the shell and first useful page are not waiting on optional work.

Planned changes:

- Create the window and render the basic shell as early as possible.
- Defer local-server setup unless it is immediately required.
- Start folder watchers after the first usable page.
- Start extraction backfill after the first usable page.
- Defer backups, memory-file loading, and optional sync work.
- Keep launch-time search validation to cheap checks; schedule repair only when needed.
- Ensure Drive/Classroom auth or network work cannot delay a local Dashboard.

Acceptance checks:

- The first Dashboard remains correct even while background work is starting.
- A user can navigate while deferred work runs.
- No background task causes repeated full-page renders.
- Cold startup improves against the 5.81-second baseline.

Why fifth: the earlier phases define the events and refresh rules needed for deferred startup work to update the interface safely.

### Phase 6 — Lazy-load heavy editor and PDF features `[ ]`

Split the renderer so the normal application shell does not load every specialist feature upfront.

- Load the note editor when a note is opened or created.
- Load PDF rendering only when a PDF preview is opened.
- Keep format-specific helpers close to the feature that needs them.
- Confirm that normal Dashboard, Courses, Resources, Calendar, and Settings launches do not initialize those libraries.

Acceptance checks:

- The normal renderer bundle becomes materially smaller.
- Cold startup improves without changing ordinary page behaviour.
- Opening a note still initializes the editor correctly.
- Opening a PDF still renders and scrolls correctly.
- Editor and PDF failures remain isolated to those features.

Why sixth: this targets the large static bundle cost after the application’s data and refresh behaviour are already reliable.

### Phase 7 — Add a small invalidation-aware renderer cache and interaction polish `[ ]`

Only after the event path is reliable, add lightweight caching for recently loaded courses, resources, notes, deadlines, Dashboard summaries, and command-palette targets.

The cache must:

- Never replace SQLite as the source of truth.
- Be updated or invalidated by mutation events.
- Avoid returning old data after a create, edit, or delete.
- Prevent overlapping reads from repainting stale results.

Then add user-facing polish:

- Immediate Saving and Saved states for notes.
- Importing and Extracting states for resources.
- Disabled duplicate-action buttons while an operation is active.
- Safe optimistic removal or insertion only where rollback is defined.
- Clear retry states for background failures.

Why seventh: a cache or optimistic display introduced before reliable invalidation would hide stale-state bugs instead of solving them.

### Phase 8 — Final verification and real-data smoke testing `[ ]`

After the implementation phases:

- Run the focused benchmark against the same seed scale.
- Compare every key metric with the baseline.
- Extend the benchmark for note, course, deadline, and resource freshness checks.
- Run focused feature verifiers for the changed surfaces.
- Run the complete Electron suite at the end of the coherent performance milestone.
- Perform careful smoke checks against the user's real data without rebuilding or rewriting it unnecessarily.
- Confirm that search repair, backup, Drive/Classroom sync, extraction, and file previews still work.
- Update `STATUS.md` and this plan after each completed phase.

## Work log

| Date | Work | Status |
|---|---|---|
| 2026-08-06 | Read-only real-data audit and code performance audit | Complete |
| 2026-08-06 | Added isolated performance benchmark and temporary current-scale seed | Complete |
| 2026-08-06 | Recorded baseline and confirmed resource deletion freshness issue | Complete |
| 2026-08-06 | Mutation event/freshness implementation | Not started |
| 2026-08-06 | Redundant render and IPC cleanup | Not started |
| 2026-08-06 | Incremental search-index implementation | Not started |
| 2026-08-06 | Background side-work separation | Not started |
| 2026-08-06 | Startup and lazy-loading work | Not started |
| 2026-08-06 | Cache, interaction polish, and final verification | Not started |

## Files and commands

- Working plan: `performance-plan.md`
- Current project status: `STATUS.md`
- Roadmap item: `ROADMAP.md`
- Benchmark: `scripts/measure-performance.js`
- Benchmark command: `npm run measure:performance`
