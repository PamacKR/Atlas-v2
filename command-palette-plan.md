# Atlas Command Palette — Implementation Plan

**Status:** Planning only. No command-palette code has been added yet.

**Scope:** A keyboard-first command and navigation surface opened with `Ctrl+K`, implemented entirely with deterministic local matching. Atlas must not call an AI/LLM API or any paid service to interpret commands.

## 1. Product goal

The command palette should give Atlas one reliable place to:

- Navigate to pages, courses, notes, resources, deadlines, and settings.
- Find and open Atlas entities by name or code.
- Run common actions without hunting through the sidebar or page controls.
- Discover available actions and their current shortcuts.
- Collect missing information through a guided follow-up step instead of guessing.

The palette is not a second AI assistant and is not intended to understand unrestricted prose. It should understand a controlled, forgiving command language built from known commands, aliases, course names, course codes, and local Atlas data.

## 2. Non-negotiable behavior

### No silent guessing

Atlas must not execute an action against an approximate target unless exactly one strong match exists. Being on the Dashboard alone does not identify a course.

If the user types `export for ai` with no active course, the palette must ask them to choose a course. If the user types `export for ai dev eco`, it may resolve `dev eco` to Development Economics when that match is unique.

If multiple courses match, Atlas must display the choices. If no course matches, it must say so and offer a useful next step rather than doing nothing.

### Visible target

Before an action runs, the palette should show the resolved target wherever one exists:

- `Export for AI · Development Economics`
- `Run OCR · Lecture 4.pdf`
- `Move note to course · Week 3 Notes`

This is especially important for actions that create, export, archive, or delete data.

### Existing behavior remains authoritative

The palette should reuse the existing action functions, IPC calls, course picker, deadline editor, file picker, preview, and confirmation overlay. It must not create a second implementation of an existing feature or simulate arbitrary DOM clicks as its primary integration method.

## 3. Existing foundations to reuse

- `src/renderer/shortcuts.ts` already contains the central shortcut registry, action labels, groups, context guards, default bindings, and user overrides.
- `src/renderer/renderer.ts` already dispatches shortcuts, renders the shortcut cheat sheet, performs global search, opens search targets, and manages the existing overlays.
- The global search already understands courses, notes, resources, document parts, announcements, and assignments.
- The course picker already supports the multi-step pattern needed by commands that require a course.
- The deadline editor already provides the themed date, time, kind, description, and confirmation flow needed by `Add deadline`.
- The preload layer already exposes the principal course, note, resource, deadline, sync, settings, and export operations.
- `mockups/overlays-a.html`, `mockups/controls-a.html`, page mockups, and `DESIGN.md` define the visual and interaction contract.
- Focused Electron verification scripts already exist and should be extended with a dedicated command-palette verifier rather than relying only on the broad historical suite.

## 4. Context model

When `Ctrl+K` opens the palette, it should capture the current Atlas context. The context may include:

- Current page.
- Currently open course.
- Selected course or active course filter.
- Open resource, note, deadline, announcement, or assignment.
- Current view or tab.
- Whether a resource or note is being edited.

Context resolution order:

1. Explicitly open entity.
2. Explicitly selected entity.
3. Active course filter.
4. A course, resource, note, or code named in the query.
5. A guided parameter picker.

The palette must not silently rely on an old last-visited course. A recent course may be offered as a suggestion, but it must not become the target without a visible choice.

## 5. Deterministic command matching

The resolver should process input in stages:

1. Normalize case, punctuation, and whitespace.
2. Match known command labels, aliases, and keywords.
3. Treat remaining words as possible parameters.
4. Resolve parameters against local Atlas data.
5. Rank exact and strong matches above approximate matches.
6. Execute only when the result is unambiguous; otherwise enter selection mode.

Matching priority should be:

1. Exact command or entity name.
2. Exact course or resource code.
3. Exact word-token match.
4. Word-prefix match, such as `dev eco` for Development Economics.
5. Small typo correction.
6. Explicitly registered aliases.

The initial implementation should support forgiving command-like phrases such as `export for ai dev eco`, `new note`, and `sync classroom`. It should not attempt to interpret arbitrary conversational paragraphs.

## 6. Palette states

The palette should have a small, explicit set of states:

1. **Closed** — the palette is hidden and does not affect the page.
2. **Command search** — commands and entity results are filtered as the user types.
3. **Parameter selection** — the palette asks for a course, resource, note, or other missing value.
4. **Form step** — an existing Atlas control or editor collects structured fields such as a deadline date.
5. **Confirmation** — destructive or consequential actions show the resolved target and confirm button.
6. **Executing** — the selected action displays a clear in-progress state.
7. **Success or error** — the palette reports the result and offers a clear close or retry path.

Escape should move back one step where appropriate, then close the palette. Opening another overlay should close the palette first so two interaction surfaces never compete for focus.

## 7. Initial command set

### First milestone: high-value commands

- Go to Dashboard, Courses, Resources, Notes, Calendar, or Settings.
- Open a course, note, or resource.
- New note.
- Upload file.
- Sync all sources.
- Sync Drive.
- Sync Classroom.
- Export course for AI.
- Show keyboard shortcuts.
- Toggle sidebar.
- Open theme or settings controls.

### Second milestone: parameterized commands

- Add deadline.
- Edit deadline.
- Mark deadline complete.
- Run OCR on a PDF or handwritten note.
- Move note to course.
- Open a file in Google Drive.
- Import scan.
- Archive or edit a course.
- Connect or disconnect a course from Classroom.
- Manage watched folders.

### Third milestone: confirmation-heavy commands

- Delete note, resource, deadline, or course.
- Reset keyboard shortcuts.
- Clear Drive preview cache.
- Create a backup.
- Review pending Drive files.
- Review pending Classroom courses.

The initial release should not attempt to expose every button in Atlas. It should establish a dependable core and add commands only when their parameter and confirmation behavior is clear.

## 8. Command and shortcut integration

The shortcut registry should remain the source of truth for shortcut labels and bindings. The palette should display a command's current binding, including user reassignments, without maintaining a duplicate shortcut list.

Not every palette command needs a keyboard shortcut. The palette may expose actions that are currently mouse-only, but those actions must still call the same underlying behavior as the existing UI.

Commands need additional metadata beyond the current shortcut definition:

- Human-readable label.
- Group.
- Search keywords and aliases.
- Whether it is available in the current context.
- Required parameters.
- Whether confirmation is required.
- How its target is resolved.
- How it reports progress, success, and failure.

The first implementation should extend the existing architecture conservatively rather than replacing the shortcut registry.

## 9. UI and visual contract

There is not yet a dedicated command-palette mockup. Until one exists, the palette should follow the shared overlay anatomy from `mockups/overlays-a.html` and the control language from `mockups/controls-a.html`.

The surface should include:

- A centered, compact overlay panel.
- A prominent focused search field.
- A small context line showing the current page and inferred target.
- Grouped result rows.
- Monochrome outline icons.
- Visible shortcut labels where a binding exists.
- A restrained selected-row state.
- Clear loading, empty, ambiguous, and error states.
- A compact keyboard-help footer.

The palette must work in dark and light themes, use existing design tokens, avoid native controls, and use hidden-safe selectors for every JavaScript-toggled element. It must not introduce a new unrelated modal language.

## 10. Keyboard, focus, and mouse behavior

- `Ctrl+K` opens the palette from any normal app page.
- The input receives focus immediately.
- Arrow keys move through visible results.
- Enter selects or executes the active result.
- Escape returns to the previous step or closes the palette.
- Mouse hover updates the active result.
- Mouse click selects the result.
- Focus returns to the element that was active before opening.
- The palette must not steal ordinary typing from note editing or form fields except for the deliberate `Ctrl+K` shortcut.
- If a command opens another overlay, the palette closes before the next overlay opens.

The behavior should be accessible: meaningful labels, keyboard-operable rows, visible focus, dialog semantics, and a clear active-result relationship.

## 11. Performance and reliability

- Filter local commands synchronously.
- Reuse already-loaded course/entity data where possible.
- Debounce only data searches that need it.
- Do not begin network work until the user selects a sync or remote action.
- Prevent stale asynchronous searches from replacing newer results.
- Keep result counts bounded and rendering lightweight.
- Cache short-lived palette data only while useful; invalidate it after course/resource/note changes.
- Do not rebuild the full search index merely because the palette opened.
- Keep all interpretation local and deterministic.

## 12. Verification plan

Add a focused Electron verifier, likely `scripts/verify-command-palette.js`, using a throwaway `ATLAS_DATA_DIR`.

It should cover:

- Opening with `Ctrl+K`.
- Initial focus.
- Command filtering.
- Direct navigation.
- Opening a course, note, and resource.
- `export for ai dev eco` resolving the correct unique course.
- `export for ai` asking for a course.
- Ambiguous course matches showing choices instead of guessing.
- Current course context being used on a course page.
- Add-deadline parameter steps.
- Escape and back-step behavior.
- Keyboard and mouse selection.
- Confirmation for destructive actions.
- Overlay stacking and focus restoration.
- Loading, success, empty, and error states.
- Dark and light theme screenshots.

Focused build/type checks should be used during implementation. The full Electron suite should run after a cohesive milestone, not after every small visual edit.

## 13. Implementation stages

### Stage 0 — Confirm product behavior

Before writing code, settle the initial command list, context rules, ambiguity behavior, target-preview behavior, and whether the palette should remain usable above existing overlays.

### Stage 1 — Build the resolver foundation

Implement command metadata, input normalization, command matching, course/entity matching, confidence ranking, ambiguity detection, and parameter-state transitions. Test the resolver independently of the visual layer.

### Stage 2 — Build the palette shell

Add the shared overlay markup, focused input, result groups, target/context display, keyboard navigation, focus restoration, empty states, and hidden-safe styles.

### Stage 3 — Connect the first commands

Connect navigation, entity opening, new note, syncing, Export for AI, shortcut help, sidebar, and settings/theme actions through existing Atlas behavior.

### Stage 4 — Add guided workflows

Connect course selection, resource selection, deadline creation, note reassignment, OCR, archive/edit, and confirmation flows.

### Stage 5 — Polish and verification

Review long names, loading, errors, themes, keyboard smoothness, overlay stacking, ambiguous matches, and real Electron behavior. Add focused verification and inspect screenshots.

## 14. Definition of done

The command palette is complete when:

- It opens reliably with `Ctrl+K`.
- Commands and Atlas entities are clearly separated and searchable.
- Context is used when it is genuinely available.
- Missing information produces a guided next step.
- Ambiguous matches never execute silently.
- Targets are visible before important actions run.
- Existing Atlas workflows remain the source of truth.
- Keyboard and mouse interaction both feel natural.
- Dark and light themes are coherent.
- No AI/API integration was added.
- Focused Electron verification passes and its screenshots have been inspected.
