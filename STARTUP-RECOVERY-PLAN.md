# Atlas cold-start and extraction recovery plan

**Status:** Implementation in progress from 2026-09-05 approval. Checkpoints are being applied incrementally; the live database repair remains gated behind copied-data verification.

**Progress:** Checkpoints 1 and 2 are implemented and verified. Remote state correction, single-flight extraction requests, single-instance protection, lazy heavy-module loading and the renderer-ready startup gate are in place. The live 29-row repair and final cold-cache benchmark remain pending.

## Problem statement

Atlas has two separate but interacting faults:

1. **Cold startup is much slower than warm startup.** On the current machine, a first launch after a cold period took about 24.8 seconds to show a window and 27.0 seconds to reach a usable Dashboard. An immediate relaunch showed a window in about 1.7 seconds and reached a usable Dashboard in about 3.9 seconds.
2. **Twenty-nine remote Drive resources are stuck in `pending`.** Atlas keeps downloading and parsing them on later launches because their Drive version was recorded as fetched before a successful extraction result was committed. A guard then treats a successful parse of that same version as already handled and returns without changing the resource out of `pending`.

The cold-launch pattern is primarily caused by the Windows filesystem cache being cold while Electron loads Atlas's large, unbundled dependency graph before creating the first window. Drive and Classroom work starts after window creation, so it is not the cause of the 20-plus seconds before the first window. The extraction loop and duplicate extraction triggers are nevertheless serious secondary problems: they waste network, CPU, memory and Drive quota after launch, and can make the newly opened app less responsive.

The earlier `start:fast` launcher did not help because it only skips TypeScript compilation. `Launch Atlas.bat` already uses that path. It does not reduce the modules Electron must discover, read and initialise on a genuinely cold start.

## Desired outcomes and acceptance criteria

The work is complete only when all of the following are true:

- [ ] A cold-like launch on the current machine shows the first Atlas window within 5 seconds at the median and reaches a usable Dashboard within 7 seconds at the median across three controlled runs.
- [ ] No controlled cold-like launch exceeds 10 seconds to a usable Dashboard. If Windows or security software makes this target unattainable, the measured external delay and the revised threshold must be documented rather than hidden.
- [ ] A warm relaunch remains at or below the current roughly 4-second usable-Dashboard time.
- [ ] Initial Drive scan, Classroom sync, backup, watching and extraction cannot delay first-window creation or the initial Dashboard render.
- [ ] There is never more than one remote-extraction pass active in an Atlas process.
- [ ] A second launcher invocation focuses the existing instance instead of starting another copy and another background queue.
- [ ] Each of the 29 legacy pending Drive resources reaches one terminal state: `done`, `empty`, `unsupported`, or a visible `failed` state with a genuine error.
- [ ] A second launch does not download or parse any unchanged terminal remote resource again.
- [ ] A newly imported remote resource stays `pending` until its content result and extracted parts have been committed successfully.
- [ ] A transient network or Google API failure remains safely retryable without creating an endless rapid retry loop.
- [ ] The existing local-resource, Classroom, Drive inbox, OCR, search, readiness and MCP behaviours keep passing their focused checks.

The 29-file loop is explicitly in scope. The work must not be marked complete while those rows are still cycling through extraction.

## Scope boundaries

In scope:

- Cold main-process bootstrap and module loading.
- Drive remote-resource version semantics and the legacy 29-row repair.
- Single-flight sync/extraction scheduling and duplicate-instance prevention.
- Moving CPU-heavy document parsing away from the UI-owning main process.
- Honest cold-start measurement, regression tests, rollout and documentation.

Out of scope:

- Disabling Drive or Classroom sync to make a benchmark look faster.
- Cosmetic UI changes or a redesign of the extraction progress surface.
- Changing Atlas's local-first data ownership model.
- Any AI API, paid API, or new cloud service.
- Packaging/public-release work except where a build-pipeline change is directly needed for startup.

## Implementation sequence

### Stage 0: Lock down evidence and reproducible fixtures

- [ ] Add timestamped startup instrumentation for process entry, database ready, window constructed, renderer loaded, Dashboard usable, background scheduler released, sync start/end and extraction start/end.
- [ ] Keep instrumentation cheap and disabled or sampled outside diagnostics so logging does not become a new startup cost.
- [ ] Create a throwaway database fixture reproducing the exact fault: a Drive resource is `pending`, its stored fetched version equals Drive's current modified time, and it has no committed document parts.
- [ ] Record the live pre-repair counts and IDs read-only. Do not mutate the real Atlas database in this stage.
- [ ] Add a test double around Drive metadata/download calls so tests can count metadata checks, downloads and extraction attempts independently.

**Exit gate:** the fixture fails under the current code for the same reason as the real 29 rows, and the timing log reproduces the cold-versus-warm gap without running a build first.

### Stage 1: Correct the remote-resource state model

The existing `remote_fetched_version` field must mean only one thing: the version for which extraction output was successfully committed. It must never be pre-filled merely because Drive reported that a version exists.

- [ ] Add a separate nullable `remote_detected_version` field for the latest version observed during import or metadata refresh.
- [ ] On remote import, set `remote_detected_version` and leave `remote_fetched_version` null.
- [ ] Split the current remote fetch path into metadata lookup and content download. Use metadata to skip an unchanged resource before downloading bytes only when the resource is already in a valid terminal state and its committed fetched version matches the detected version.
- [ ] Never apply the unchanged-version shortcut to a `pending` or retryable resource.
- [ ] Commit replacement `document_parts`, terminal extraction status, error, MIME type, extraction timestamp and `remote_fetched_version` in one database transaction.
- [ ] If parsing succeeds but yields no text, commit `empty` and the fetched version. That is a valid terminal result, not a reason to retry every launch.
- [ ] If the kind is unsupported, commit `unsupported` once. If an actual parse fails, commit a visible `failed` result with the error and retain enough version information for an explicit retry.
- [ ] Update the schema comments and `ARCHITECTURE.md` so detected, attempted and successfully committed versions cannot be confused again.

**Exit gate:** a fresh remote import is processed once, persists its terminal state and parts atomically, and is skipped without a content download on the next run when unchanged.

### Stage 2: Migrate and repair the 29 trapped resources safely

- [ ] Ship the schema change and corrected extraction logic before touching any affected live row.
- [ ] Run the migration in a transaction. For remote Drive rows whose status is `pending`, copy the existing version into `remote_detected_version` and clear `remote_fetched_version`. Do not clear or reprocess valid `done`, `empty` or `unsupported` rows.
- [ ] Back up the live database immediately before the first migration launch using SQLite's safe backup path.
- [ ] Queue the repaired rows once in the normal background worker. Do not perform 29 network fetches inside the migration transaction or before the Dashboard is usable.
- [ ] Record a before/after audit with row ID, title, old state, new state, attempt count and final error where applicable.
- [ ] Relaunch once after completion and verify that unchanged rows cause zero content downloads and zero parse attempts.

**Exit gate:** all 29 affected rows have terminal outcomes or honest one-time failures, none remain in the false `pending` loop, and relaunching does not restart the batch.

### Stage 3: Make extraction and sync single-flight

- [ ] Replace the three independent callers of `runRemoteExtractionAndNotify()` with one coordinator.
- [ ] If the coordinator is already running, a new request only marks that another queue check is required; it never starts a concurrent pass.
- [ ] Coalesce launch, post-Classroom-sync and newly imported Drive-resource triggers into that coordinator.
- [ ] Add per-source single-flight protection for Drive and Classroom sync so scheduled and manual triggers cannot overlap the same source.
- [ ] Add bounded retry metadata for transient failures, including attempt count and next eligible retry time. Use backoff and never spin repeatedly during one launch.
- [ ] Acquire Electron's single-instance lock before expensive initialisation. A second launch should activate the existing window and exit.

**Exit gate:** concurrent trigger tests result in one download/extraction per resource, and double-clicking the launcher produces one Atlas process and one background queue.

### Stage 4: Build a genuinely lightweight startup path

- [ ] Introduce a small bootstrap entry point whose top-level imports are limited to Electron and the minimum code needed to initialise the database, register essential IPC and create the window.
- [ ] Remove preview, OCR, document parsing, Google API and other heavy feature modules from the bootstrap's top-level import graph.
- [ ] Register lightweight IPC façades early so the renderer never races an unregistered handler. Dynamically load each heavy feature implementation on first use.
- [ ] Dynamically load Drive and Classroom services only after the renderer declares itself ready and only when their schedules or explicit user actions require them.
- [ ] Bundle the Electron main process into a small bootstrap plus lazy feature chunks using the existing build tooling or a narrowly added main-process esbuild step.
- [ ] Keep Electron and native modules such as `better-sqlite3` and `@napi-rs/canvas` external where bundling them would break their ABI or native loading.
- [ ] Prefer smaller official Google service packages or supported narrow imports if measurement shows the umbrella `googleapis` package still dominates cold reads. Do not change authentication behaviour merely for bundle size.
- [ ] Inspect the resulting dependency graph and bundle sizes. The bootstrap must not transitively include OCR, PDF, Office or Google service implementations.

**Exit gate:** the first window no longer waits for the large Google/document-processing dependency graph, and cold-like startup meets the timing threshold before background services load.

### Stage 5: Isolate background parsing from the UI process

- [ ] Add an explicit renderer-ready handshake after the initial Dashboard is rendered. Release maintenance work only after that signal, with a conservative timeout fallback for renderer failure cases.
- [ ] Split remote work into: main-process OAuth and asynchronous download, a temporary file or bounded buffer, isolated document parsing, then main-process database commit.
- [ ] Run PDF, DOCX, PPTX and XLSX parsing in an Electron utility process so CPU and module loading cannot block the BrowserWindow's main event loop.
- [ ] Keep Google tokens and all SQLite writes in the main process. The utility process receives only the file and extraction request, then returns structured parts or an error.
- [ ] Clean up temporary files on success, failure and app shutdown.
- [ ] Use the same isolated parsing service for local background extraction where practical, while keeping Tesseract OCR separately lazy and user-triggered.
- [ ] Limit extraction concurrency to one heavy document at a time initially. Raise it only if measurements show a net improvement without UI stalls or memory spikes.

**Exit gate:** an intentionally slow or CPU-heavy extraction does not produce material Dashboard input lag, long animation-frame gaps or blocked IPC responses.

### Stage 6: Remove avoidable post-launch churn

- [ ] Persist which authorised Google account can access each Drive source so a normal scan does not repeatedly try the wrong account first. Retain a safe fallback when access changes.
- [ ] Make Classroom upserts report `changed` only when stored values actually differ, preventing broad renderer refreshes after a no-op sync.
- [ ] Confirm scheduled Drive and Classroom scans begin after renderer readiness and remain independently configurable. The fix must not silently change the user's sync settings.
- [ ] Measure recursive Drive source scans separately from extraction so a slow folder traversal is visible and diagnosable instead of being reported as generic startup time.

**Exit gate:** a no-change sync causes no unnecessary page refresh and background scan timings are visible separately from launch and extraction timings.

### Stage 7: Replace the misleading performance benchmark

- [ ] Add a cold-start harness that does not run `npm run build` immediately before measuring.
- [ ] Launch the measured Electron process from ordinary Node/Playwright rather than first starting an Electron parent process that pre-warms Electron files.
- [ ] Include two profiles: a clean synthetic dataset for regression stability and a scrubbed structural clone matching the real database's scale and pending-work mix.
- [ ] Measure first-window time and usable-Dashboard time separately from sync/extraction completion.
- [ ] Run cold-like and immediate warm launches as separate labelled samples. Document that Windows cache eviction cannot be made perfectly deterministic without administrative controls.
- [ ] Keep sync enabled in at least one performance scenario and inject slow sync/extraction fakes to prove they do not gate usability.
- [ ] Add failure thresholds to CI/local verification without making a single noisy Windows sample fail the build. Use a small sample median and retain raw samples.

**Exit gate:** the harness detects the present 25-second cold launch, proves the improvement after the bootstrap change, and cannot pass merely because the build pre-warmed the dependency tree.

### Stage 8: Verification and controlled rollout

- [ ] Run type/build checks while implementing, then the focused extraction, remote-resource, sync, readiness, search, MCP and startup checks.
- [ ] Run the full Electron regression suite once the cross-cutting changes are integrated and inspect its screenshot.
- [ ] Test offline launch, expired Google authentication, Drive rate limiting, a corrupt document, a textless PDF, app termination during extraction and immediate relaunch.
- [ ] Test migration and repair against a copy of the real database first.
- [ ] Take a fresh live backup, then run the real migration and 29-file repair only after the copied-data result is correct.
- [ ] Compare live row counts and document-part counts before and after. Verify no completed remote resources were reset.
- [ ] Perform an immediate second launch to confirm the batch does not repeat.
- [ ] Capture three cold-like launches and three warm relaunches on the user's normal launcher. Record the raw results in `STATUS.md`.
- [ ] Update `ARCHITECTURE.md`, `ROADMAP.md`, `STATUS.md`, schema comments and relevant run/verification documentation in the same implementation series.

**Exit gate:** every acceptance criterion above is evidenced by tests or measurements, not just by code inspection.

## Test matrix

| Scenario | Expected result |
|---|---|
| Imported Drive file, current version, no prior extraction | One download and parse; terminal state and fetched version committed |
| Pending legacy row whose old fetched version equals Drive modified time | Migration clears the false success marker; one repair attempt occurs |
| Terminal remote row, unchanged version | Metadata check only; no content download or parse |
| Terminal remote row, changed version | One fresh download and atomic replacement of extracted parts/version |
| Textless PDF | `empty`, fetched version committed, no automatic repeat |
| Unsupported remote file | `unsupported`, no automatic repeat |
| Transient network failure | Retryable with backoff; no tight loop and no false success marker |
| Parser failure | Visible `failed` status and error; no silent endless retry |
| Two extraction triggers at once | One active worker and one attempt per resource |
| Launcher clicked twice during cold startup | One app instance; existing window is focused when available |
| Artificial 10-second sync/extraction | Window and Dashboard remain within startup thresholds |
| App killed during extraction | No partial parts/version commit; resource is safely recoverable |

## Delivery checkpoints and rollback

Implementation should be split into reviewable checkpoints:

1. Instrumentation, reproducible failure fixture and honest benchmark.
2. Remote state model, transaction rules, migration and 29-row repair tests.
3. Single-flight coordinator, retry control and single-instance lock.
4. Lightweight bundled bootstrap and lazy feature loading.
5. Utility-process extraction and post-launch churn reductions.
6. Copied-data rehearsal, live rollout, measurements and final documentation.

Each checkpoint should pass its focused tests before the next begins. The live database is not migrated until checkpoints 1 to 3 pass against a copy. Rollback consists of reverting the corresponding code checkpoint and restoring the pre-migration SQLite backup if the live migration itself misbehaves. Drive and Classroom source data remain untouched throughout.

## Main risks and controls

- **Migration resets valid completed resources.** Restrict the repair predicate to remote Drive rows still marked `pending`, run it transactionally and audit the exact IDs before live use.
- **Lazy IPC produces a race.** Register stable lightweight handlers before loading the renderer; handlers may await their feature module internally.
- **Bundling breaks native or ESM dependencies.** Externalise native modules, isolate problematic packages in lazy chunks and run the real Electron verification suite.
- **A worker gains access to credentials or corrupts SQLite.** Keep OAuth, database handles and commits in the main process; the worker only parses supplied content.
- **The one-time 29-file repair is still expensive.** Start it only after the Dashboard is ready, process one heavy document at a time, expose existing progress and make the work resumable.
- **Windows Defender or storage latency remains material.** Record process-entry-to-window measurements and dependency reads. If an external scanner remains the limiting factor after bundling, document the evidence before considering a narrowly scoped exclusion recommendation.
- **Performance is improved only in the benchmark.** Validate through the same `Launch Atlas.bat` path and with a copy of the real data, then repeat on an actual first launch after a cold period.

## Approval boundary

The user has approved implementation. Product changes may proceed through the checkpoints above, but the live Atlas database must not be migrated or repaired until the copied-data rehearsal and focused regression checks pass.
