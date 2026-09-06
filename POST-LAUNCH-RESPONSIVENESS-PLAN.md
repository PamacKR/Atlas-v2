# Atlas post-launch responsiveness and Drive review recovery plan

**Prepared for:** Pamac  
**Date:** 2026-09-06  
**Status:** Plan only. No implementation is authorised until Pamac explicitly approves this plan.  
**Supersedes:** The responsiveness completion claim in `STARTUP-RECOVERY-PLAN.md`. The completed remote extraction state repair remains valid.

## 1. Purpose

Atlas now displays its first window quickly, but a real first launch after an idle period can leave that visible window effectively unusable while Electron's main process loads Google and document-processing services and starts launch maintenance. This is the same user-facing failure as the previous slow launch, only moved to a later point in the sequence.

The same investigation exposed a separate but immediately visible defect in the automatic Google Drive review overlay. With seven pending files, the file-details column collapsed to roughly 42 px and each row expanded to hundreds of pixels in height.

This plan fixes both problems as one coordinated pass:

- keep the visible Atlas window responsive throughout launch, sync and extraction;
- avoid loading services when there is no work for them;
- isolate unavoidable heavy work from Electron's UI-owning main process;
- replace the intrusive automatic Drive overlay with a non-blocking review signal;
- rebuild the Drive review layout against Atlas's shared overlay and control contracts;
- replace startup tests that can pass while the real app is still unusable.

## 2. Confirmed evidence

### 2.1 Responsiveness trace from 2026-09-06

| Measurement | Result |
|---|---:|
| First window visible | 0.95 seconds |
| Main-process diagnostic connection unavailable after the window appeared | approximately 23.5 seconds |
| Main-process IPC after launch work settled | less than 1 ms normally |
| Later warm launch to usable Dashboard | 6.5 seconds |
| Remote resources still in `pending` extraction state | 0 |

The renderer's own timer did not report a comparable long animation gap after the trace became available. The blockage is concentrated in Electron's main process, which owns IPC dispatch and window-level application work.

### 2.2 Remote extraction state

The original 29-file extraction loop is not recurring. The live state after diagnosis was:

- 38 remote resources `done`;
- 1 `empty`;
- 4 `unsupported`;
- 2 terminal `failed` child links;
- 0 `pending`.

No remote resource was re-extracted during the 2026-09-06 test. This plan must preserve that repair and add regression coverage proving it stays preserved.

### 2.3 Drive review overlay

Seven newly detected Drive inbox files caused the existing launch-time review panel to open. Measured geometry at a 1920 x 1032 viewport:

| Element | Measured size |
|---|---:|
| Review panel | 760 px wide |
| Usable file-row width | approximately 700 px |
| Controls group | 430 px wide |
| Per-row action group | approximately 160 px wide |
| Remaining filename/details width | approximately 42 px |
| First file-row height | approximately 343 px |

The layout is therefore mathematically incapable of displaying the current row contents cleanly. The stylesheet also retains an older Drive-review rule set alongside the current rule set, allowing obsolete properties to participate in the cascade.

## 3. Root causes

### 3.1 The heavy work was deferred, not isolated

The previous recovery removed Google, extraction, preview and related services from the top-level import path. That correctly reduced time to the first window. Once the renderer signals readiness, however, Atlas immediately begins loading and executing those services in the same main process.

`require()` is synchronous. Calling it after the window appears does not make it background work. While a large module graph is being read, parsed and initialised, the main process cannot promptly service window and IPC work.

### 3.2 Lazy modules are still loaded on every ordinary launch

Several paths defeat the intended laziness:

- the renderer always asks for pending Drive files after its initial render;
- the corresponding IPC handler loads the complete Drive module, which imports the umbrella `googleapis` package, even though listing pending files is only a local SQLite query;
- Drive and Classroom schedules both start immediately after renderer readiness when configured for launch or interval sync;
- the remote extraction coordinator is invoked at launch even when a cheap SQL check could establish that no remote resource is pending;
- local server, watcher and maintenance initialisation is released in the same burst.

The result is a fast shell followed by a synchronous main-process loading wave.

### 3.3 The benchmark omitted the real trigger

The copied-data cold-start profile did not retain active Google configuration and did not assert continuous main-process responsiveness after the window appeared. It therefore proved that the lightweight shell could render quickly, but did not prove that a normal connected Atlas session stayed usable.

### 3.4 The review row cannot fit its declared columns

The current row reserves fixed or minimum widths for three custom selectors and two action buttons before giving the filename flexible space. The panel is too narrow for those assumptions. Duplicate legacy and current CSS rules make the final result harder to reason about and easier to break.

## 4. Non-negotiable outcomes

Implementation is complete only when all of these are true:

- [ ] A cold first launch does not merely show a window quickly; the Dashboard remains clickable and IPC remains responsive throughout the following 60 seconds.
- [ ] No Google, PDF, Office or remote-extraction module is loaded on launch when its service is disabled, disconnected or has no queued work.
- [ ] Loading or using an enabled Google service cannot block the main event loop for a user-visible duration.
- [ ] A deliberately slow 15-second document parse does not freeze navigation, window controls or lightweight IPC.
- [ ] Drive and Classroom sync cannot overlap another run of the same source.
- [ ] The original remote extraction repair remains stable with zero false `pending` rows and zero repeat downloads for unchanged terminal resources.
- [ ] Newly detected Drive files never force a modal over the Dashboard during startup.
- [ ] The Drive review surface can display seven or more realistic filenames without collapsed text, horizontal overflow or controls leaving the panel.
- [ ] Every review control remains themed, keyboard-accessible and functional at desktop and narrow-window widths.
- [ ] Performance verification uses active Google configuration or controlled service doubles and measures main-process stalls after the first window.

## 5. Scope and constraints

### In scope

- Electron bootstrap and post-render maintenance scheduling.
- Lightweight database gates before service-module loading.
- Drive and Classroom adapter loading and per-source single-flight coordination.
- Utility-process or worker isolation for document parsing and other measured CPU-heavy work.
- Main-process event-loop and IPC responsiveness instrumentation.
- Drive pending-file notification behaviour.
- Drive review overlay markup, layout, controls, responsive behaviour and focused verification.
- Focused documentation and regression tests.

### Out of scope

- Disabling sync merely to improve a benchmark.
- Changing the user's Drive or Classroom data.
- Automatically importing or ignoring the seven pending Drive files.
- Reworking unrelated pages or applying opportunistic visual changes.
- Adding any AI API, paid API or new cloud service.
- Reopening the remote extraction version model unless a regression is found.

## 6. Target architecture

### 6.1 Lightweight main process

The main process remains the owner of:

- the canonical SQLite connection and all database writes;
- BrowserWindow creation and essential IPC registration;
- sync scheduling state;
- OAuth refresh tokens and persisted settings;
- validation and commit of results returned by background services.

Its launch path may synchronously load only the small modules required for those responsibilities.

### 6.2 Google service boundary

Local questions such as "are files waiting for review?" must be answered by a lightweight repository/query module that does not import `googleapis`.

For actual Google network work, the implementation should first measure and then choose the smallest reliable combination of:

1. narrower Drive and Classroom client packages instead of the umbrella `googleapis` package;
2. an esbuild service bundle to replace thousands of cold filesystem reads with a small number of lazy chunks;
3. a dedicated utility process for Google client initialisation and response processing if bundling alone still produces material main-process stalls.

If a utility process is used, it receives only the minimum short-lived authorisation material required for a request. Persisted refresh tokens and all SQLite access remain in the main process. Returned data is validated before it is committed.

### 6.3 Extraction worker

PDF, DOCX, PPTX and XLSX parsing runs outside the main process:

- the main process performs queue selection and, for remote files, coordinates authorised download;
- the worker receives a temporary file path plus an extraction kind;
- the worker loads the parser and returns structured parts or a typed error;
- the main process commits parts, status and fetched version atomically;
- temporary files are removed on success, failure, cancellation and shutdown;
- initial concurrency remains one heavy document at a time.

No worker receives a database handle or writes canonical Atlas state.

### 6.4 Startup coordinator

Startup becomes an explicit sequence rather than a burst of fire-and-forget calls:

1. initialise the database and essential IPC;
2. create and render the first window;
3. receive renderer readiness;
4. perform cheap SQL gates for pending local extraction, remote extraction and Drive review items;
5. start only the required services;
6. schedule sync independently with per-source single-flight protection;
7. report status without forcing a modal or blocking navigation.

Idle delay may be used to reduce contention, but it is not accepted as the primary fix. Heavy work must remain responsive whenever it eventually begins.

## 7. Proposed Drive review behaviour

This plan proposes the following product behaviour. Approval of the full plan counts as approval of this change unless Pamac explicitly asks to retain automatic modal opening.

- A launch-time or background scan that finds new files updates a persistent Drive review count.
- Atlas shows a small non-blocking notification such as "7 Drive files ready to review" with a Review action.
- The Dashboard remains usable and no modal opens automatically.
- Settings continues to expose the existing Review action.
- Clicking either Review action opens the full review overlay.
- Closing the overlay leaves unresolved files waiting. It does not import, ignore or mutate them.
- Repeated scans update the count without repeatedly interrupting the user.

## 8. Drive review layout contract

The implementation must consult `DESIGN.md`, `mockups/overlays-a.html` and `mockups/controls-a.html` before editing the surface.

The panel will use the shared overlay anatomy:

- backdrop;
- tokenised radius and border;
- separate header and scrollable body;
- shared 30 px close action;
- Atlas `dselect` triggers, menus and options;
- themed checkboxes and buttons;
- correct `[hidden]` behaviour.

Each file will use a stacked review item rather than squeezing all content into one desktop grid row:

- first line: checkbox, file icon, full filename and source metadata;
- second line: course, import type and storage controls in a flexible grid;
- final actions: Import and Ignore aligned with the controls, wrapping below them when needed;
- filename receives the flexible width before secondary controls do;
- selectors use bounded widths and may wrap, but file text must never collapse into a one-character column.

The bulk area will follow the same principle:

- selection count and Select all remain readable;
- bulk defaults and actions wrap onto a second line when required;
- open dropdown menus are not clipped by the scroll container;
- the item list, rather than the whole overlay, scrolls when many files are present.

Legacy Drive-review CSS that no longer matches the final markup will be removed in the same change. This is a deliberately scoped reconstruction of the surface, not an isolated cosmetic tweak.

## 9. Implementation stages

### Stage 0: Instrumentation and reproducible baseline

- [ ] Add diagnostic-only timestamps for process entry, database ready, first window, Dashboard usable, renderer-ready receipt, each heavy module load, each maintenance task, sync start/end and extraction start/end.
- [ ] Add event-loop delay and lightweight IPC probes covering the first 60 seconds after window creation.
- [ ] Record a real connected launch and an immediate warm relaunch.
- [ ] Build a copied-data fixture that preserves schedule and queue shape without retaining usable OAuth secrets.
- [ ] Add controlled slow sync and slow parser doubles.
- [ ] Record the existing malformed seven-item review geometry and screenshot as the UI regression baseline.

**Exit gate:** the trace attributes the post-window stall to named tasks and the automated check fails for both the main-process pause and the collapsed review layout.

### Stage 1: Remove unconditional heavy loads

- [ ] Move pending Drive inbox reads into a lightweight database repository with no Google dependency.
- [ ] Move one-time Drive-source migration/recovery out of the ordinary list operation.
- [ ] Before loading remote extraction code, use a lightweight SQL query to check for eligible queued resources.
- [ ] Before loading local extraction code, check for eligible local pending rows.
- [ ] Do not initialise a disconnected or disabled source.
- [ ] Separate local-server, watcher, backup, sync and extraction scheduling so one task cannot hold the entire startup coordinator.

**Exit gate:** a launch with no queued extraction and sync disabled loads none of the Google or document parser graph and remains responsive throughout the trace.

### Stage 2: Shrink and isolate Google startup cost

- [ ] Measure the Drive and Classroom import graphs independently.
- [ ] Replace the umbrella Google package with supported narrow clients where the build and authentication behaviour remain correct.
- [ ] Bundle the service boundary into lazy chunks while keeping Electron and native modules external where required.
- [ ] Re-measure main-process event-loop delay.
- [ ] If the threshold is still exceeded, move Google client initialisation and response processing to a utility process using the boundary in section 6.2.
- [ ] Preserve existing account separation between personal Drive and college Classroom.

**Exit gate:** starting both connected sync sources cannot produce a main-process event-loop stall above the acceptance threshold.

### Stage 3: Isolate document extraction

- [ ] Build a reusable extraction utility-process service.
- [ ] Route local background extraction through it.
- [ ] Route remote temporary-file extraction through it.
- [ ] Preserve atomic database commits and detected-versus-fetched version semantics.
- [ ] Handle worker crash, app shutdown, malformed documents and temporary-file cleanup.
- [ ] Keep extraction concurrency at one until memory and responsiveness measurements justify otherwise.

**Exit gate:** an artificial 15-second parse runs to completion while Dashboard navigation, window controls and lightweight IPC remain responsive.

### Stage 4: Make sync genuinely single-flight

- [ ] Add one in-flight promise/coordinator for Drive and another for Classroom.
- [ ] Coalesce launch, interval, manual and reconnect triggers per source.
- [ ] Queue at most one follow-up pass when another trigger arrives during a run.
- [ ] Prevent a short Drive interval from accumulating concurrent scans.
- [ ] Preserve visible last-success, partial-error and reconnect-required states.
- [ ] Ensure sync completion requests extraction only when new eligible remote rows exist.

**Exit gate:** concurrent trigger tests produce one active request sequence per source and no duplicate extraction request.

### Stage 5: Rebuild the Drive review experience

- [ ] Replace automatic modal opening with the non-blocking count and Review action described in section 7.
- [ ] Transcribe the shared review-item and overlay structure from the mockups.
- [ ] Replace the impossible fixed-column row with the stacked responsive structure in section 8.
- [ ] Remove obsolete Drive-review CSS rules.
- [ ] Verify every custom selector, checkbox, bulk action, individual action, close path and keyboard path.
- [ ] Verify dropdown stacking and clipping inside the scrollable body.
- [ ] Test 0, 1, 7, 25 and very-long-filename cases.
- [ ] Inspect the actual Electron screenshot at normal, maximised and narrow window sizes.

**Exit gate:** no filename collapses, no horizontal overflow occurs, all controls remain usable, and launch never forces the overlay open.

### Stage 6: Honest performance and regression verification

- [ ] Extend the cold-start harness to retain realistic connected-source scheduling through safe doubles.
- [ ] Measure first-window time, Dashboard usable time, main-process event-loop delay, IPC latency, sync duration and extraction duration separately.
- [ ] Run three cold-like launches and three immediate warm launches.
- [ ] Verify offline launch and expired/revoked OAuth behaviour.
- [ ] Verify app termination during extraction and safe recovery on relaunch.
- [ ] Run build/type checks and focused sync, extraction, remote migration, readiness, search, MCP and Drive-review checks.
- [ ] Run the full Electron regression suite once the cross-cutting work is complete and inspect its screenshot.

**Exit gate:** every acceptance criterion has measured evidence and the benchmark cannot pass merely because the window appeared.

### Stage 7: Controlled live rollout and documentation

- [ ] Rehearse schema-neutral behaviour against a copy of the live database.
- [ ] Take a fresh SQLite backup before the first live launch of the changed coordinator.
- [ ] Confirm the original 29 repaired resources remain terminal before and after rollout.
- [ ] Confirm the seven Drive inbox files remain unresolved and unchanged unless Pamac acts on them.
- [ ] Perform a real first launch after an idle period and retain the raw timing summary.
- [ ] Update `STATUS.md`, `ROADMAP.md`, `ARCHITECTURE.md`, relevant verification documentation and this checklist.
- [ ] Commit and push each coherent verified checkpoint under the repository's normal workflow.

**Exit gate:** live Atlas remains responsive through sync and extraction, the Drive review notification/layout behaves correctly, and continuity documents match reality.

## 10. Acceptance thresholds

These thresholds apply on the current Windows machine and normal Atlas data scale:

| Metric | Required result |
|---|---:|
| Median first window across three cold-like runs | 2 seconds or less |
| Median usable Dashboard across three cold-like runs | 4 seconds or less |
| Maximum single main-process event-loop stall during first 60 seconds | 250 ms |
| 95th percentile lightweight IPC latency during first 60 seconds | 100 ms or less |
| Artificial 15-second parser test | no navigation or window-control freeze |
| No-work launch | zero Google/parser module loads caused by queue checks |
| Unchanged terminal remote resource | zero content downloads and parses |
| Drive review at 620 px panel width | no horizontal overflow or collapsed filename text |

If Windows Defender or another external process prevents a threshold, the implementation must capture evidence identifying that external delay. The threshold must not be silently relaxed.

## 11. Test matrix

| Scenario | Expected result |
|---|---|
| Connected sources, no changes | Sync may run; the Dashboard stays responsive and no broad refresh occurs |
| Sync disabled | Google service modules are not loaded automatically |
| Remote extraction queue empty | Remote parser/service graph is not loaded |
| One new remote PDF | Download and parsing occur once outside the main process; atomic terminal commit |
| Large or corrupt PDF | UI stays responsive; success or typed failure is committed once |
| Two sync triggers for one source | One active pass and at most one coalesced follow-up |
| Original 29 repaired rows | All remain terminal; none are downloaded again unchanged |
| Seven Drive inbox files | Non-blocking count appears; no automatic overlay |
| User opens Drive review | Seven readable rows, working controls and internal scrolling |
| Very long filename | Ellipsis or wrapping within a useful-width title area, never one-character stacking |
| Narrow window | Controls reflow below metadata without overflow |
| Dropdown near bottom of list | Menu remains visible and selectable rather than clipped |
| App closes during worker parse | No partial database commit; temporary file is cleaned or recovered safely |
| Offline launch | Local Atlas is usable immediately; sync failure is reported without freezing |

## 12. Risks and controls

- **Worker boundary changes extraction output.** Reuse the existing extractor functions and compare exact structured results in focused fixtures before switching callers.
- **Google worker weakens credential handling.** Keep persisted refresh tokens in the main process and pass only minimum short-lived request authority if process isolation is required.
- **Bundling breaks native or ESM dependencies.** Externalise Electron and native modules, inspect emitted chunks and run real Electron checks.
- **Deferral only moves the freeze again.** Event-loop thresholds apply for 60 seconds after the window, not only until Dashboard render.
- **A queue gate misses recoverable work.** Define one shared eligibility query per queue and test pending, failed-retryable and terminal states explicitly.
- **Review UI loses capability while reflowing.** Verify every individual and bulk action against 0, 1 and many-item fixtures.
- **Automatic notification becomes noisy.** Coalesce repeated scan events and update one count rather than stacking notifications.
- **The seven real Drive items are accidentally mutated.** All automated UI checks use isolated fixtures; live rollout only observes those rows unless Pamac explicitly acts on them.

## 13. Delivery checkpoints

Implementation should be committed and verified in these coherent checkpoints:

1. Instrumentation and failing responsiveness/UI fixtures.
2. Lightweight queue repositories and no-work gates.
3. Google dependency reduction and service isolation.
4. Extraction utility process and atomic-result verification.
5. Per-source sync coalescing.
6. Drive review notification and complete overlay reconstruction.
7. Cold/warm/live verification and final documentation.

No checkpoint is considered complete merely because it builds. Each must pass its focused behavioural or performance exit gate.

## 14. Approval boundary

Creating this document does not authorise implementation. After Pamac approves the plan, work may proceed through the checkpoints without repeated approval for ordinary code, test, documentation, commit and push operations. Any action that mutates live Drive/Classroom data, changes the seven pending files, restores a database backup, deletes material or introduces a paid service still requires separate explicit authority.
