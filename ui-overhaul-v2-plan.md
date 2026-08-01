# UI overhaul v2 — implementation plan

**Status:** Proposed 2026-08-01. No application UI code is changed by this document.

## Purpose and source of truth

This is a complete replacement of the current renderer UI, not a polish pass. The authoritative visual source is the approved mockup set in `mockups/`, read literally:

- `dashboard-a.html` and `dashboard-light-a.html`
- `courses-a.html` and `course-detail-a.html`
- `resources-a.html`
- `notes-a.html`
- `calendar-a.html`
- `settings-a.html` and `settings-light-a.html`
- `search-a.html`, `overlays-a.html`, and `controls-a.html`

Implementation must copy mockup structure, literal token values, class semantics, and content patterns from those files. Do not reconstruct a comparable design from a summary or reuse a shared class for two visually distinct mockup patterns.

## Guardrails

1. Preserve the existing local-first database, IPC contracts, sync behavior, MCP server, and renderer functionality unless a mockup explicitly calls for a related change.
2. Build a single token layer first. The approved Direction A values are the baseline: dark `#0f0f0e`, light `#faf8f4`, amber accent, typography/spacing/radius/motion tokens from the mockup `:root` blocks. Light/dark is a color axis; later design styles remain a separate `data-style` axis.
3. Do not retain old visual components by default. Existing markup may be retained only where it faithfully supports the mockup's structure and interaction.
4. Never put unconditional `display` on an element whose own `hidden` attribute is toggled. Use `:not([hidden])` when an explicit display rule is necessary.
5. When specializing a layout selector, explicitly restate each dependent layout property (`flex-direction`, alignment, sizing) rather than assuming specificity carries across properties.
6. Make a small coherent commit after each verified stage and push it. Update `STATUS.md` after each implementation session; update `ROADMAP.md` only when a roadmap item genuinely completes.

## Stage 0 — establish a safe visual baseline

- Run the existing verification suites before changes: `verify`, `verify:mcp`, `verify:extraction`, and `verify:remote`.
- Capture the real app's current screenshot and generate/reference screenshots for every approved mockup at the same desktop viewport.
- Make a concrete page-by-page mapping from current DOM anchors and renderer functions to the corresponding mockup markup. This mapping is an implementation aid, not a replacement for opening the relevant mockup while coding.
- Extend the verification fixture only where the app needs representative data to render a mockup feature; never seed real user storage.

**Exit criterion:** baseline verification passes and comparisons use a consistent viewport/data fixture.

## Stage 1 — shell, routing surface, and primitive controls

Use the sidebar and main-shell markup/values from the page mockups, plus the exact control variants in `controls-a.html`.

- Replace the global shell: sidebar, collapse behavior, top search, main-scroll ownership, page headers, action placement, separators, and hover/focus states.
- Add the Direction A token layer for color, type scale, spacing, radius, border, shadow, and motion. Theme switching must use the documented dark and light values rather than an invented palette.
- Establish distinct primitives only where mockups demonstrate distinct patterns: text action, bordered control, icon control, segmented view toggle, filter chip, select/dropdown, status indicator, row rule, and empty state.
- Keep page routing and all current keyboard shortcuts functional while the shell changes.

**Exit criterion:** every page shares the mockup shell at the target viewport, theme switching uses literal mockup values, and no old generic button/chip/card styling leaks into the new primitives.

## Stage 2 — Dashboard and Courses

Implement against `dashboard-a.html`, `dashboard-light-a.html`, `courses-a.html`, and `course-detail-a.html`.

- Dashboard: actionable stat strip, continuous section layout, course/deadline/resource/activity rows, true content-height behavior, and mockup empty states. Do not reintroduce equal-height card stretching.
- Courses: term-grouped list/grid structures, card/list alignment, archive controls, and direct mockup values.
- Course detail: header, navigation/back behavior, Overview/Deadlines/Announcements/Assignments/Classwork/Files content, view toggle, and real existing data/actions.
- Where a mockup depicts a Phase 6 surface not in current data/logic (for example unread/new widgets), implement its data path only when it is required by the approved scope and verify migration behavior.

**Exit criterion:** both pages behave with the real renderer data and visually match their mockups at the agreed viewport; verify covers navigation, tabs, archive/edit controls, and a representative deadline/resource action.

## Stage 3 — Resources and Notes

Implement against `resources-a.html` and `notes-a.html`.

- Resources: course rail, filters, sort control, recency groupings, list/grid views, source/extraction status, upload/picker flow, and resource opening behavior.
- Notes: course rail, list/grid views, unsorted and agent-generated filters, note creation/import, and Milkdown integration themed to the token layer.
- Ensure these layouts are dense continuous surfaces, not a return to the old card system.

**Exit criterion:** list/grid/filter/sort/course-selection interactions work and previews/editor open without page navigation; the Milkdown editor is legible in both themes.

## Stage 4 — Calendar, Settings, search, and overlays

Implement against `calendar-a.html`, `settings-a.html`, `settings-light-a.html`, `search-a.html`, and `overlays-a.html`.

- Calendar: mockup month/week/day surfaces, date navigation, filters, course/kind filtering, upcoming list, and deadline mutation refreshes.
- Settings: Appearance, Shortcuts, Sources, Files & storage, AI agent, and About sections; retain working connection/sync controls and expose the specified new read-only status surfaces.
- Search: visual section headers, course filter chips, grouped page hits under their parent resource, source badges, keyboard navigation, and click-through behavior.
- Overlays: resource preview, note editor, course picker, deadline viewer/editor, confirmations, and shortcut sheet; layer over the current page and preserve Escape/focus behavior.

**Exit criterion:** each overlay opens from at least two pages without changing the background route; search no longer visually floods with page hits; Calendar and Settings match their light/dark mockups.

## Stage 5 — themes, first-run states, and final fidelity pass

- Apply the token layer to every remaining renderer/Milkdown/overlay surface, including disabled, hover, focus, loading, empty, and error states.
- Build the required empty and first-run states using the approved visual language and actual app actions.
- Add the `data-style` foundation needed for later design-style themes, without inventing unapproved alternate styles.
- Compare every real-app screenshot directly against the corresponding mockup and correct literal differences: colors, spacing, typography, radii, borders, button treatment, and omitted structures.

**Exit criterion:** no known mockup feature is omitted, no visually incompatible primitive is shared, and both light and dark screenshots have been manually inspected.

## Verification and handoff

After every stage:

1. Run the smallest relevant Electron Playwright check, then `npm run verify` before committing.
2. Run `verify:mcp`, `verify:extraction`, and `verify:remote` after changes that could affect builds, startup, data access, or shared renderer/main contracts.
3. Inspect the saved screenshot rather than treating a passing DOM assertion as visual verification.
4. Record completed work, verification, decisions, and any remaining mismatch in `STATUS.md`.

Before merge to `main`, run all four suites and perform a page-by-page real-app vs. mockup comparison at the agreed viewport. The work is not complete until the real UI is faithful to every approved mockup, not merely functional.
