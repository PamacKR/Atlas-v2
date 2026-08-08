# Atlas — Empty and First-Run States Plan

**Status:** Planning only. No product code is changed by this document.

**Scope:** Personal-use quality first, with a structure that can later support public release.

**Primary goal:** Make Atlas understandable and useful when it has little or no data, without turning it into a guided-tour product or changing the way an experienced user works.

## 1. Why this needs a plan

Atlas currently has several small fallback messages, but they describe different situations as if they were the same thing:

- A brand-new Atlas workspace with no courses or content.
- A normal workspace where a particular area has not been used yet.
- A list that is empty because the current course, source, term, or type filter excludes everything.
- A source that is not connected, waiting to sync, or needs Google authorization again.
- A quiet area where there is simply nothing new today.
- A real error or unsupported state.

Those states need different copy, actions, and visual weight. A first-run user needs a clear next step; an experienced user who has no deadlines this week should not be shown an onboarding panel; a filtered Resources list should offer a way to clear the filter rather than telling the user to upload a file.

This work should therefore establish a small, consistent state language across Atlas rather than adding isolated messages page by page.

## 2. Product boundaries

### Included

- A first-run experience for a genuinely new local Atlas workspace.
- Page-specific empty states for Dashboard, Courses, Resources, Notes, Calendar, and course detail.
- Context-aware states for filters, archived courses, missing connections, pending sync, and no recent activity.
- Clear actions connected to existing Atlas workflows.
- Dark/light theme support, keyboard accessibility, responsive behavior, and focused Electron verification.
- Minimal persisted first-run state using the existing `app_settings` mechanism if it is needed.

### Explicitly not included

- No AI or LLM calls inside Atlas.
- No cloud onboarding service, account creation, analytics, or paid API.
- No academic explanations, summaries, or generated sample content.
- No forced Google Drive or Classroom connection.
- No new data model for fake/demo records.
- No broad redesign of the completed personal-use surface.
- No public-release packaging work, despite designing the states so that work can use them later.

The central product rule remains: Atlas owns the data; the external AI agent owns the reasoning.

## 3. Current-state assessment

The relevant existing behavior is already discoverable in `src/renderer/renderer.ts` and `src/renderer/index.html`:

| Surface | Current fallback | Problem to solve |
| --- | --- | --- |
| Dashboard Courses | “No courses yet.” | No direct route to add a course or connect Classroom; the dashboard does not explain what Atlas is waiting for on a new workspace. |
| Dashboard Up next | “Nothing upcoming.” or “No upcoming deadlines.” | Correctly quiet, but not useful when the user has no deadlines because they have not created any course content yet. |
| Dashboard Recent | “No resources yet.” | Needs to distinguish a new workspace from a workspace whose Resources page is simply unused. |
| Dashboard Notes/activity | “Nothing changed today yet.” | A quiet day is not the same as no notes. The wording and action should reflect that. |
| Dashboard Announcements | “No new Classroom updates.” | Needs to distinguish Classroom not connected from Classroom connected with no new items. |
| Courses | “No courses yet.” / “No archived courses.” | Needs add/import/connect actions and a separate filtered-empty state. |
| Resources | “No resources match this filter.” | This is shown both when Atlas has no resources at all and when filters hide existing resources. |
| Notes | “No notes yet.” / “No notes match this filter.” | Needs a clear new-note route and a separate agent-only empty state. |
| Calendar | “Nothing scheduled.” / “Nothing upcoming.” | The calendar grid remains useful, but the user needs a clear route to add a deadline or course. |
| Course detail | Small “No resources/notes/deadlines yet” list rows. | Each subsection needs the appropriate action, and Classroom content needs connection-aware copy. |
| Settings → Sources | “Not connected.” with connect buttons. | The state is functional, but first-run prioritization and optionality should be clearer. |
| Course picker/review overlays | Small empty list messages. | Empty overlays must not present dead controls or imply that a sync/import failed when there is simply nothing to review. |

The existing database already contains the relevant truth: courses, resources, notes, deadlines, Classroom records, Drive pending records, sync status, and `app_settings`. The first implementation should reuse those values rather than adding duplicate counters or a second workspace model.

## 4. State vocabulary

Every empty-looking surface should resolve to one of these meanings before it chooses copy or actions.

### A. First run

The local workspace has not been started yet. Recommended definition:

- No courses, resources, notes, or deadlines exist.
- No meaningful first-run completion/dismissal has been recorded.

This is the only state that should use welcoming setup language. It should be shown once, on Dashboard, rather than repeated in every page.

### B. Domain empty

The workspace is already in use, but this domain has no records:

- Courses exist, but there are no resources.
- A course exists, but it has no notes or deadlines.
- The calendar has no events.

These states should stay compact and action-oriented. They should not repeat first-run copy.

### C. Filtered empty

Records exist in the domain, but the current filter, term, source, course, type, or agent-only toggle removes all visible results.

This state must always provide a clear “Clear filter” or equivalent action. It must never recommend creating duplicate content when existing content is merely hidden.

### D. Archived/visibility empty

The user explicitly chose a view with no matching records, such as “Show archived” when no courses are archived. The copy should explain the selected view and offer a route back to the normal view.

### E. Source unavailable or waiting

The data could exist elsewhere but is not currently available because:

- Drive/Classroom is not connected.
- Google authorization must be renewed.
- A source is connected but has not been scanned yet.
- A source has no pending records to review.

These are status states, not empty database states. They should use source-specific actions and should not be styled as errors unless there is a real error.

### F. Quiet activity

There is no new or recent activity for the selected period. This is normal and should remain visually quiet. It should not use a large empty-state panel or imply that setup is incomplete.

### G. Error or unsupported

The operation failed, a file type cannot be read, or an external resource cannot be imported. These states keep their existing error/semantic treatment and are not converted into generic empty states.

## 5. Recommended first-run experience

### 5.1 Entry point

Use the Dashboard as the first-run entry point. Do not open a blocking modal on every fresh launch.

The Dashboard should remain structurally recognizable, but show one contained “Get started” surface above or within the existing dashboard layout. The surface should be compact enough that the app still feels like Atlas rather than a setup wizard.

Recommended copy:

- Heading: **Start with a course**
- Explanation: **Add a course, connect Classroom, or create a note to start building your Atlas workspace.**

Recommended actions, in this order:

1. **Add course** — opens the existing course form and focuses the course name.
2. **Connect Classroom** — opens the existing Classroom connection flow or takes the user to Settings → Sources, clearly marked optional.
3. **Create note** — uses the existing unsorted-note workflow, so a user can begin capturing something without inventing a course first.

The first-run surface should not make Drive the first action. Drive files need a course assignment before they become useful in Atlas, while Classroom can create or map courses and is the more natural setup path for a new academic workspace.

### 5.2 Dismissal and persistence

Use the existing `app_settings` store for one small first-run marker if needed. No schema migration is required.

Recommended behavior:

- Do not mark first run complete merely because Atlas launched.
- Mark it complete when the user creates/imports/maps a course, creates a note, or explicitly chooses **Not now**.
- If Classroom sync creates a course, mark it complete after the course is actually written.
- If the user opens an action and cancels without creating anything, leave the first-run surface available.
- Once dismissed or completed, do not show the large first-run surface again, even if the user later deletes all content.
- Existing users with data should never see the first-run surface during migration or after this feature ships.

The normal page-specific empty states remain available after dismissal. Dismissing first run does not hide useful actions such as Add course or New note.

### 5.3 What first run should not do

- It should not ask the user to configure every setting before using Atlas.
- It should not require Google access.
- It should not create sample courses, sample notes, or placeholder deadlines.
- It should not show a tutorial carousel.
- It should not explain MCP or the external AI agent before the user has data to work with.
- It should not reappear because one individual page is empty.

## 6. Page-by-page state plan

### Dashboard

#### Fresh workspace

Show the first-run surface described above. Keep the existing statistics and widget structure, but make the empty widgets quiet and subordinate so the primary setup action is obvious.

#### Started workspace with no courses

If first run has been dismissed but there are still no courses, replace the first-run wording with a compact Courses empty state:

- **No courses yet**
- Add course
- Import from Ashoka Planner, when available
- Connect Classroom, as an optional source action

The rest of the dashboard should not repeat the same three actions. Up next, Recent, Notes, and Classroom updates should use short contextual messages.

#### Courses exist but widgets are empty

- Up next: **No upcoming deadlines** with **Add deadline** only if a course is available to attach it to; otherwise keep it quiet.
- Recent: **No resources yet** with **Upload files** or **Add link**, routed through the existing course picker.
- Notes: **No notes yet** with **New note**.
- Activity: **No recent activity** rather than “nothing changed today” when the workspace has never had a note.
- Announcements: if Classroom is disconnected, **Connect Classroom to see announcements**; if connected, **No new Classroom updates**.

#### Dashboard course filter

When a course filter is selected and returns no records, show a filtered-empty message with **Show all courses**. Do not show the global first-run surface.

### Courses

#### No active courses

Use a page-level empty state beneath the toolbar:

- **No courses yet**
- **Add course** as the primary action.
- **Import from Ashoka Planner** if its integration is available.
- **Connect Classroom** as an optional action.

The existing toolbar actions should remain discoverable. The empty state should not create a second course form; it should open the existing form.

#### No archived courses

When the archived view is selected and empty:

- **No archived courses**
- **Show active courses** as the recovery action.

#### Term-filtered empty

- **No courses in this term**
- **Clear term filter**.

#### Existing courses

Do not add an empty-state panel to the normal list. Course rows remain unchanged, including their “No upcoming deadlines” metadata where appropriate.

### Resources

Resources has the most important empty-state distinction because it now has source and course filters.

#### No courses exist

- **Add a course before adding resources**
- **Add course**.

The Upload files action should either remain available and route to the same message or be disabled with an accessible explanation. It must not open a picker containing an unexplained empty list.

#### Courses exist, no resources anywhere

- **No resources yet**
- **Upload files** as the primary action.
- **Add link** if the existing resource workflow supports it.

#### Filtered empty

- **No resources match these filters**
- **Clear filters**.

This applies to course, source, kind, extraction-review, and combinations of filters.

#### Source-specific empty

When a source filter is active:

- Local: **No local files yet** with Upload files.
- Classroom: if disconnected, **Connect Classroom**; if connected, **No Classroom resources yet**.
- All sources: use the global resource state.

Drive should be described through its existing connection/pending-review language rather than pretending Drive files are already local resources.

### Notes

#### No notes anywhere

- **No notes yet**
- **New note**.

The action should preserve the current unsorted-note behavior so the user is not forced to choose a course before capturing a thought.

#### Course-filtered empty

- **No notes in this course**
- **Clear course filter** and **New note**.

#### Agent-only empty

If “Show only agent notes” is active and no generated notes exist:

- **No agent-generated notes yet**
- **Show all notes**.

Do not imply that the external agent is broken or that Atlas should generate notes itself.

### Calendar

The calendar grid should remain visible even when it has no events; the empty treatment belongs inside the relevant event areas.

#### No events anywhere

- Month/week/day views show their normal date structure.
- Upcoming shows **Nothing upcoming**.
- A compact action offers **Add deadline** if at least one course exists.
- If there are no courses, offer **Add course** instead of presenting an unusable deadline form.

#### Filters hide all events

- **No events match these filters**
- **Clear filters**.

#### Source-dependent events

If Classroom is not connected, do not call the calendar empty because Classroom dates are unavailable. Keep local deadlines usable and expose the existing Classroom connection route from Settings when appropriate.

### Course detail

Course detail already has separate Overview, Readiness, Files, Notes, Deadlines, and Classroom-related sections. Each section should receive a compact, action-specific empty treatment.

- Files/resources: **No files in this course** → Upload files or Add link.
- Notes: **No notes in this course** → New note.
- Deadlines: **No deadlines yet** → Add deadline.
- Readiness: preserve the existing readiness-specific empty state; it must not be confused with “all resources are ready.”
- Announcements/assignments/classwork: if not connected, **Connect this course to Classroom**; if connected with no items, **No announcements/assignments/classwork yet**.
- Watched folders: if none exist, retain the existing Add folder action and explain that watched folders are optional.

The section actions should reuse the current handlers and not create duplicate modals or alternate forms.

### Settings and source states

Settings is not part of the global empty dashboard, but it is where first-run source state must remain understandable.

- Appearance stays Dark/Light only, as decided.
- Sources keeps separate Drive and Classroom connection states.
- “Not connected” means optional and actionable, not an error.
- “Reconnect required” remains the error/recovery state.
- “Connected but no folder selected” remains a configuration state, not an empty resources state.
- Storage should say **No active courses** and **No files yet** where appropriate, without showing a broken-looking zero-data review action.
- AI & Integration should explain that Atlas is ready for an external agent, but should not become an onboarding requirement.

### Overlays and pickers

- Course picker with no courses: show **Add a course first** and an action that closes the picker and opens the existing course form.
- Course picker with a search query that matches nothing: keep **No matching courses**; this is a filtered-empty state.
- Drive review with no pending files: keep the panel hidden where possible; if opened directly, show **No new files to review** and hide bulk actions.
- Classroom review with no pending courses: use **No new Classroom courses to review** and hide bulk actions.
- Ashoka review with no secured courses: retain the honest **No secured courses found** state and keep import disabled.
- Command Palette empty results remain separate from content empty states.

## 7. Shared UI language

### Visual hierarchy

Use three levels rather than one universal component:

1. **First-run surface:** contained, prominent, one per Dashboard, with one primary action and a small number of secondary actions.
2. **Page/domain empty state:** centered or padded within the existing page content, with a heading, one sentence, and one or two actions.
3. **List/widget quiet state:** compact muted text inside an existing list or widget, optionally with one small text action.

This keeps the personal-use app dense and avoids filling every empty widget with a large card.

### Style rules

- Reuse the existing Direction A surfaces, spacing, typography, buttons, and overlay anatomy.
- Use the fixed amber accent only for primary actions and intentional active/focus indicators; keep empty-state backgrounds neutral.
- Use semantic red/green only for real error/success/connection meaning.
- The Atlas logo may appear once in the first-run surface if it improves recognition, but it should remain small and functional rather than becoming a splash screen.
- Do not add illustrations, stock graphics, motivational slogans, or decorative empty-state art for this personal-use pass.
- Keep headings and copy plain and functional.
- Do not cause layout shifts when a list changes from empty to populated; preserve the surrounding toolbar and page structure.

### Interaction rules

- Every empty-state action must have a working click path, visible hover/focus state, keyboard activation, and an accessible label.
- Actions must be disabled or rerouted when their prerequisites do not exist. For example, uploading a resource without a course must explain the prerequisite.
- Clearing a filter should be one action, not a manual sequence through multiple controls.
- Empty states must update immediately after the related mutation through the existing change-refresh path.
- Empty states must not appear over stale data during a background sync or async render.
- Any new `hidden`-controlled surface must follow the repository’s `:not([hidden])` CSS rule requirement.

## 8. Data and state implementation approach

### First-run marker

Use a single `app_settings` value rather than a schema migration. The plan should settle the final key name during implementation, but its meaning should be explicit: first-run is dismissed/completed, not merely launched.

Existing data should take precedence over the marker. If a user already has courses or content, Atlas should open normally even if the marker is absent.

### Workspace snapshot

Avoid making every page independently guess whether Atlas is new. The renderer should have one small, read-only workspace-state decision built from existing counts and connection state:

- Has any course/content been created?
- Is the first-run surface still eligible?
- Are Drive/Classroom connected or awaiting reauthorization?
- Are there pending remote items?

Page renderers can still use their existing domain queries for lists. The snapshot exists to choose the correct state category and prevent contradictory messages.

### No fake records

Do not seed sample courses, notes, resources, or deadlines. Do not write placeholder rows simply to make the UI look populated. Throwaway verifier data may seed records in an isolated temporary data directory, but production Atlas must stay truthful.

### Mutation integration

First-run completion and empty-state refresh should plug into the existing typed change-event path. Course creation/import, note creation, resource import, deadline creation, and Classroom mapping should all update the visible state without page switching or relaunching.

## 9. Implementation order

### Phase 0 — Confirm copy and state decisions

- Review this plan against the existing mockups and current user preference for personal-use density.
- Confirm the first-run action order and whether **Not now** should be visible.
- Confirm whether Connect Classroom should be shown on the first-run surface or only as a secondary action.
- Record any decision changes in `open-questions.md` before code work begins.

### Phase 1 — Shared state and empty-state primitives

- Add the first-run eligibility/completion handling through existing settings storage.
- Add a small renderer-side state vocabulary and shared empty-state construction path.
- Keep domain-specific copy and actions supplied by each page, rather than putting all behavior into a giant generic component.
- Add focused accessibility and hidden-state behavior at this stage.

### Phase 2 — Dashboard first run

- Add the single Dashboard first-run surface.
- Wire Add course, Connect Classroom, Create note, and Not now to existing workflows.
- Ensure the surface disappears after a real successful mutation or explicit dismissal.
- Keep the existing Dashboard widgets visible but quiet and non-repetitive.

### Phase 3 — Courses, Resources, and Notes

- Replace current generic list messages with the domain and filtered states defined above.
- Add prerequisite-aware actions for resource creation.
- Preserve unsorted note creation.
- Verify filter clearing, archived view, source filter, course rail, and agent-only note filter.

### Phase 4 — Calendar and course detail

- Add compact no-event and filter-empty states to Calendar without removing the date grid.
- Add action-specific empty sections to course detail.
- Keep Readiness’s technical state model separate from ordinary empty resource/notes states.
- Add Classroom connection-aware copy for course sections.

### Phase 5 — Settings and overlays

- Refine source, storage, course-picker, Drive-review, Classroom-review, and Ashoka-review empty states.
- Ensure optional source setup is clear and no bulk action appears when there is nothing to review.

### Phase 6 — Cross-surface polish

- Check light and dark themes.
- Check expanded and collapsed sidebar layouts.
- Check short and long copy, narrow window sizes, keyboard focus order, and screen-reader labels.
- Check transitions from empty → populated → empty again.
- Inspect the entire page surface for spacing and hierarchy, not just individual messages.

## 10. Verification plan

Create a focused Electron verifier using an isolated temporary `ATLAS_DATA_DIR`. It should test real DOM and existing workflows rather than only checking strings.

### Scenario matrix

1. Fresh database, no content and no connections.
2. Fresh database with first-run dismissed, still no content.
3. One course with no resources, notes, or deadlines.
4. One course with resources but no notes/deadlines.
5. Multiple courses with a term filter that returns zero results.
6. Resources exist but the selected source/course filter returns zero results.
7. Notes exist but the selected course or agent-only filter returns zero results.
8. Calendar with no events, then with a filter that hides all events.
9. Course detail with each subsection empty.
10. Classroom disconnected, connected with no content, and authorization-recovery state using throwaway settings.
11. Drive connected with no folder, folder with no pending files, and pending-file review state.
12. Archived-course view with no archived courses.

### Behavior assertions

- First-run appears only for an eligible new workspace.
- Add course opens the existing form and focuses the correct field.
- Create note preserves unsorted-note behavior.
- Connect actions route to the existing Settings/source flow.
- Not now persists and does not reappear after relaunch.
- Real mutations remove the first-run surface immediately after success.
- Filtered-empty states offer a working clear action.
- Prerequisite-blocked actions explain what is needed.
- Empty review panels hide bulk actions.
- Existing data and workflows are not altered by merely rendering an empty state.
- No empty state is visible while its associated content is populated.
- No `hidden` element is forced visible by an unconditional CSS display rule.

### Visual assertions

- Capture fresh-workspace Dashboard screenshots in dark and light themes.
- Capture Courses, Resources, Notes, Calendar, and course-detail empty states.
- Inspect the screenshots for neutral surfaces, restrained amber accents, consistent spacing, and no oversized onboarding treatment.
- Check that adding the first course does not create a flash of contradictory empty messages.

Run focused checks while implementing. Run the complete Electron regression suite once after all empty/first-run surfaces are complete.

## 11. Acceptance criteria

- A brand-new Atlas workspace immediately explains the first useful actions without a blocking wizard.
- The first-run surface appears only once and does not return after dismissal or real use.
- Every major page distinguishes first run, domain empty, filtered empty, unavailable source, quiet activity, and error states where those situations can occur.
- Every visible action from an empty state uses an existing valid Atlas workflow.
- No fake academic data is created.
- The app remains usable without Google Drive, Google Classroom, or an external AI agent.
- Empty states work in both themes and do not introduce a new visual language.
- Empty-to-populated transitions update immediately through the existing refresh path.
- Existing populated workflows, layout, data, and navigation remain unchanged.
- Focused Electron verification and the final full regression suite pass.
- `STATUS.md` is updated during implementation, and `ROADMAP.md` is updated only when the work is actually complete.

## 12. Open decisions to confirm before implementation

The plan has recommended defaults, but these are the few decisions worth confirming before writing product code:

1. Keep first run as one Dashboard surface with **Add course**, **Connect Classroom**, **Create note**, and **Not now**, rather than a multi-step wizard.
2. Keep Google connections optional and do not place Drive as the first-run primary action.
3. Allow first-run completion through an unsorted note, even before a course exists.
4. Keep normal page empty states after first-run dismissal so useful actions remain available.
5. Use a small fixed amber accent and neutral surfaces, matching the current personal-use visual contract.
