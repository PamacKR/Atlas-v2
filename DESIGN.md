# Atlas UI implementation contract

This is the handoff document for the ongoing UI overhaul. It records the user's settled expectations for **every UI change and new UI surface**. Read it after `AGENTS.md`, `STATUS.md`, and `open-questions.md` before making renderer or visual decisions.

This is not a design mood-board. The HTML mockups are the visual source of truth; this document captures the rules that apply across all of them, the interaction expectations that screenshots cannot fully express, and the known unfinished work.

## 1. The standard of completion

Atlas should look and behave like the supplied mockups, not like an application that has been loosely restyled in their direction.

- Do not reconstruct an interface from memory, from its feature name, or from a familiar application pattern. Read the relevant mockup HTML and copy its grouping, visible labels, ordering, control roles, spacing, and visual hierarchy into the app.
- `mockups/controls-a.html` and `mockups/overlays-a.html` are mandatory for **all** pages and overlays. Read both alongside the page mockup before starting a surface.
- Preserve working behavior while changing a surface. A mockup specifies its appearance; existing data, navigation, keyboard behavior, filtering, syncing, and mutations must remain correct unless the user asked to change them.
- Treat every page as one composition. Do not declare a change complete because one button or one list looks right. Review its shell, header, body, empty/loading states, long data, scroll behavior, controls, overlays, and interaction states together.
- Work deliberately. The user explicitly prefers one thoughtful, complete pass over fast partial fixes that require repeated correction.

Atlas is a dense personal academic workspace, not a generic SaaS dashboard. It should feel minimal, calm, typographic, and fast to scan, but never stripped of useful functionality. There must be no artificial “productivity” decoration, AI/chat UI, or invented data.

## 2. Source-of-truth order

When sources appear to disagree, use this order:

1. User's latest explicit instruction.
2. `AGENTS.md`, including product safety/architecture constraints.
3. This file for cross-page UI rules and established behavior.
4. `mockups/overlays-a.html` and `mockups/controls-a.html` for shared components.
5. The relevant page-specific mockup:
   - `dashboard-a.html`
   - `courses-a.html` and `course-detail-a.html`
   - `resources-a.html`
   - `notes-a.html`
   - `calendar-a.html`
   - `settings-a.html`
   - `search-a.html`
6. `STATUS.md` and `ROADMAP.md` for current implementation state and deferred work.

Do not alter `prd.md`. Do not add an AI/LLM API or paid service to implement a UI feature; Atlas owns data and an external agent owns reasoning.

## 3. Shared visual language

### Direction A: continuous, compact, dark-first

The approved language is Direction A: a near-black, low-contrast workspace with white primary text, muted secondary text, hairline separators, restrained amber as the default accent, and colour only where it conveys real information. The token layer in `src/renderer/styles.css` is the authority for exact values, themes, radii, spacing, type, and motion. Use those tokens; do not introduce one-off hard-coded visual values when an equivalent token exists.

- **Continuous surfaces over cards.** Sections and rows normally live on the page surface, separated by rhythm and hairline rules, not a pile of rounded boxes. A bordered box is only appropriate where the mockup explicitly makes it a control, tile, overlay, preview canvas, or similar bounded object.
- **No wasted space.** Compact does not mean removing features. Use space for legible real data and intentional breathing room, not redundant headings, duplicate metadata, empty cards, or oversized headers.
- **Typography carries hierarchy.** Page headings are simple and strong. Uppercase small section labels are muted. Metadata is smaller/muted. The weekday in Dashboard’s date heading is strong; the date is muted and normal-weight.
- **Colour is semantic, not decorative.** Course dots/swatches retain their data colour. Due/overdue/error states may use semantic colour. Utility icons and routine controls should be monochrome outline icons. Do not reintroduce emoji utility icons or arbitrary coloured icon fills.
- **Accent selection is global.** The Appearance accent picker must update not only primary solid controls, but also selected states, tinted/soft surfaces, focus/border treatments, and other subtle colour touches. A blue/purple/green/pink selection must not leave amber-tinted “light” surfaces behind.
- **Light and dark both matter.** Never solve a dark-mode appearance by hard-coding a dark colour. Use tokens that permit the light theme to remain coherent.

### Geometry and density

- Prefer the tokenised compact rhythm from the mockups. Do not add large vertical gaps merely to make a page feel “clean.”
- Rounded corners belong on controls, hover surfaces, overlay panels, drop zones, and intentionally bounded tiles. They should be visible, but modest; the page itself is not a field of floating pills/cards.
- Avoid horizontal page scrolling everywhere. Reflow, truncate, wrap where the mockup permits, or use the existing bounded internal list scroll—not a horizontal scrollbar.
- The page shell should normally fit the available desktop height. Do not make an entire dashboard/calendar page scroll when the mockup fits it; an individual dense list/panel may scroll if that is the intended bounded region.
- Long names in constrained single-line contexts truncate with an ellipsis. Do not expand a rail/header/filter simply to reveal an overlong course name. Keep a usable full name in an appropriate chooser/list/detail context.

## 4. Page shell and topbar contract

All major pages use one stable shell and a common header alignment rule.

- The sidebar has a **fixed icon rail**. Expanding/collapsing may reveal/hide labels, but it must not shift the icons vertically or horizontally. The Atlas mark stays geometrically centred; the Settings icon is an **outlined cog**, not a sun, filled glyph, or emoji.
- A page title sits at the left of the shared top row. Its relevant action controls sit immediately **to the left of the search field**, not beside the title. This keeps page headers compact and makes the search field’s position stable.
- The title/action/search content is top-aligned consistently across Dashboard, Courses, Resources, Notes, Calendar, and future pages. Do not let page-specific CSS push a search field a few pixels lower than unchanged pages.
- Actions must be page-scoped. A hidden actions container must not be made visible by an unconditional ID/class `display` rule; use a `:not([hidden])` selector when a hidden-controlled element needs a layout display.
- Search stays in its shared right-side position. Selecting a search course filter must not close the search panel or make the search field jump.
- Header actions shown as navigation words in a mockup—e.g. **Manage**, **Calendar**, **Notes**, **View all**—are text links: no border, padded hitbox, background, or button hover. Their hover is a colour change only.
- Header actions shown as boxes in the mockup are actual controls, not text links. Match the mockup’s type; never decide from the action label alone.

## 5. Controls and interactions

### Buttons, links, and icon actions

- A normal boxed action is a neutral, bordered Atlas button with the mockup’s compact height, internal alignment, corner radius, and hover/focus state. It is not automatically amber because it creates something.
- Amber primary controls are reserved for the exact committed/positive actions that the mockup presents as primary (for example, a final Save, Upload, Import selected, or Confirm). Follow the page/overlay mockup rather than applying a global rule.
- Buttons must have centred text vertically and horizontally, a clear cursor, meaningful hover/focus feedback, and correct padding. No browser-default controls or unstyled legacy IDs are acceptable.
- The user particularly expects Discoverability: Edit, New note, Reset to Classroom, and any other interactive element must visibly respond on hover/focus. Do not make controls look inert.
- Destructive/reset actions use the mockup’s danger text/hover language. Hovering a close X must produce the subtle red-tinted/destructive state from `overlays-a.html`.
- Icon-only actions are compact, monochrome, outline SVGs with the same visual weight as sidebar icons. Align them optically and mechanically in their hitbox. Avoid filled icons unless the mockup explicitly uses one.
- Grid/list order is **Grid first, List second** everywhere, with neutral controls and the active state specified by the mockup—not an accent-filled button unless explicitly shown.

### Inputs, selects, checks, and dates

- Native OS `<select>`, native browser date/time pickers, browser alerts, and unthemed default controls are not final UI. Use the Atlas-owned `dselect` trigger/menu/option pattern from `controls-a.html`.
- An unchecked checkbox is dark/black rather than browser white. Checked, focused, disabled, and hover states follow the tokens and active accent.
- Deadline editing uses one coherent Due control for date and time—not two unrelated date/time rows—and validates the date/time before save. Its visual form must follow the shared control mockup.
- Popovers/menus must inherit Atlas background, border, radius, typography, hover, selected, and z-index treatment. They must not read as an external OS/browser element.
- Do not use native `title` tooltips as a final substitute for discoverability; use visible labels or the app’s established tooltip pattern when necessary.

### Hover and keyboard behavior

- Every apparent action must be functional, have hover/focus states, use a pointer where appropriate, and preserve keyboard semantics.
- Row hover applies to the row/item, not its whole surrounding section. It needs the mockup’s left/right padding and rounded hover surface; text should not be flush to the hover boundary.
- Hover should be restrained: colour/surface/border changes and short transitions, no heavy animation or bouncing.
- Never leave a clickable element with a smaller/oddly shaped hitbox than its visible control.

## 6. Overlay contract

All overlays follow `mockups/overlays-a.html`, regardless of feature.

- Use a fixed full-viewport dim backdrop and a panel above the current page; an overlay must never appear underneath page content.
- Use the mockup’s panel size class, tokenised large radius, border, panel background, and header/body/footer segmentation. Do not invent a separate modal design per feature.
- Headers contain title/subtitle at left and compact 30px icon actions at right. Body content is padded according to the mockup; the footer owns Cancel/primary/destructive actions and is visually separated.
- Close icons are the shared small outline X—not an oversized glyph—and use danger-tinted hover.
- Confirm dialogs use the warning icon, concise title/body, neutral Cancel, and semantically correct confirm label (Archive, Disconnect, Delete, Reset, etc.). They should not all say Delete.
- Review overlays (Drive/Classroom/new courses/new files) use themed checks, custom selects, readable rows, bulk and individual actions, and source-appropriate counts. A count must never be shown without the corresponding renderable items.
- Classroom-only notices and reset actions are context-safe and mutually exclusive: manual content must never claim a Classroom version, and “removed from Classroom” cannot coexist with “Classroom version available.”
- File/classroom attachments inside overlays use compact Atlas attachment chips with monochrome file/link glyphs—not browser-white thumbnail blocks or unstyled anchors.
- Apply the hidden-state safeguard every time: if JavaScript toggles `element.hidden`, there must be no unconditional `display` declaration on that element’s own ID selector. Use `#id:not([hidden]) { display: ... }`.

## 7. Page-specific settled conventions

### Dashboard

- The top date and search share the header line. Render weekday and date separately: weekday is the heading; the date is muted, regular-weight.
- The course summary is a compact horizontal five-course strip with colour dots/swatches, metadata, and a text-only Manage link at the far side. It is not the old vertical course list, has no icons, and has no unnecessary separator between it and the dashboard widgets.
- The main body is compact, continuous, and unboxed. Avoid per-item dividers if the mockup doesn’t show them. Individual widgets can have their own bounded scroll if necessary, but Dashboard itself should not become a scrolling column of cards.
- Up Next is date-aware: past deadlines are excluded. It shows what is next; do not restore dashboard filter chips/buttons. Its Calendar link is text-only.
- Recent, notes, announcements, and related widgets use readable course metadata without letting long course names break a row; use ellipsis in constrained columns.
- Dashboard v2 adds Classroom updates: individual clear, filter-aware **Mark all read**, and a picker that pins an existing announcement as important. Pinning is not creation: it pins the same announcement, replaces its unread copy, and stays until the user removes the pin. The picker must be centred/themed above the Dashboard.

### Courses and course detail

- Courses is compact and unboxed. Do not restore the removed Term/Name/Files controls. Keep Grid first/List second; action spacing between Import and Add course must be deliberate.
- Course-detail actions (Edit course, Export for AI, Archive) belong with the detail action area, not alongside the course name. Archive always confirms through the shared confirmation overlay.
- Course detail has no horizontal scrollbars. Its Overview, resource/notes/up-next panels, and all tabs use continuous rows/tile treatment rather than floating cards.
- Deadline grid uses the continuous course-grid language. Put completion checkbox top-right, content at top-left, and avoid a centered checkbox above the title. Deadline list reserves enough non-wrapping space for due dates.
- Announcements show title plus one-line preview in lists—not the full assignment text. Attachments are compact themed chips.
- Watch folder is a neutral bordered button, not text-only and not yellow. Check its surrounding Files surface against the mockup each time.
- Overview's Classroom connection must show the actual connected provider folder/course name when known; never pretend a local course name is provider data. Disconnect uses the shared confirm overlay.

### Resources

- Resources follows the common title/actions/search row; upload remains a neutral bordered header action unless a mockup specifically makes it primary.
- Upload overlay is file-first: choose/drop a file first, then select a course. Its close action follows overlay sizing and theme.
- List rows and grid tiles are continuous/hairline and use aligned monochrome file glyphs. Keep real filters/sorting/preview functionality.
- File preview uses the shared overlay header/action language. Zoom controls are a compact floating group in the canvas, not a full-width outlined bar. Image scaling must not gain an unnecessary outline.

### Notes

- Notes follows the shared title/actions/search top row. Import scan and New note are neutral bordered actions unless a page mockup says otherwise; New note must have visible hover/focus feedback.
- Keep the compact course rail. Long course names in rails and list metadata ellipsize instead of expanding the column or overflowing the row. In list rows, course and time are separate elements so the time remains readable.
- The note editor has one identity header: title, then course / agent-written state / save state in a concise subtitle. Do not show a redundant “Note” label followed by the title again in the body.

### Calendar

- Calendar is only rendered on the Calendar page. Exactly one of Month, Week, or Day appears at once; hidden monthly markup must not leak into Week/Day or other pages.
- The calendar grid is neutral/unfilled with hairline rules, not coloured/floating cards. The Calendar page is a non-scrolling desktop surface matching the mockup’s layout.
- The mini calendar, course/type filters, and upcoming list are functional. Filters persist across launches through settings; do not reset them on startup.
- `+ Add deadline` belongs immediately left of Search in the common topbar. It opens the established course-picker/deadline-editor flow and leaves Calendar as the background page.

### Settings

- Settings tabs/rail stay visible while a long settings panel scrolls; only the content area should move.
- Appearance's accent selection must actually update all accent-derived tokens, including subtle/tinted surfaces.
- Sources controls use the shared neutral control anatomy and centred label baseline. Audit legacy per-ID rules: no Source button should look like a browser/default/old UI button. Remove redundant separators when removing a section.
- Shortcuts uses compact uppercase heading language, neutral reset styling, and application-font keycaps rather than forced monospaced key text. The Ctrl+/ sheet is a shared themed overlay.
- AI & Integration configuration code retains readable multiline indentation.
- Storage owns extraction status/review. Sources must not duplicate that section. Backup controls allow individual deletion and Delete all, with equal vertical spacing; destructive behavior must be confirmed where appropriate.
- About labels use the mockup’s uppercase/muted language.

### Global search

- The search dropdown follows `mockups/search-a.html`: visible Courses / Names / Content / Classroom sections, source badges, and document page hits grouped beneath their parent resource.
- Course filter chips keep the panel open when clicked. Chosen labels may truncate to fit their stable control/chip width; full names belong in the dropdown/list.
- Hovering a section must not highlight the full section. Only individual result rows get the rounded hover state. Clicking/keyboard selection must still open the correct original target.

## 8. Implementation and verification workflow

1. Read this document, the page mockup, `controls-a.html`, and `overlays-a.html` fully.
2. Inspect current renderer markup, CSS, and behavior before changing it. Reuse the established shared component/token patterns only when the mockup's pattern is actually the same.
3. Build the complete surface, including data-dependent and empty states. Do not add placeholder dummy behavior for a real action.
4. During iteration use focused build/type checks. Do **not** run the entire Electron suite after every small CSS edit.
5. After a cohesive major surface/cross-cutting change, run the relevant focused Electron verifier or add one that drives the real Electron DOM with a throwaway `ATLAS_DATA_DIR`; inspect its screenshot. Use the full suite only at a sensible major milestone.
6. Check the rendered page for hidden-state leaks, overflow, control theming, actual hover/focus, long names, course-filter behavior, and close/overlay stacking before reporting completion.
7. Update `STATUS.md`; update `ROADMAP.md` for completed milestones or deliberately deferred work. Commit and push coherent changes without waiting for approval. Never stage `.claude/`.

The user uses `Launch Atlas.bat` for live feedback. Do not attribute a mismatch to an installer/release build unless there is direct evidence. The user has explicitly permitted using real `Atlas-Storage` data for careful diagnosis when test fixtures are insufficient, since it will be reset before semester; still protect data and never make irreversible changes without clear scope.

## 9. Known deferred work and next pickup point

### Do not silently claim these are fixed

1. **Scrollbar visual fidelity:** the user still sees square, overly thick scrollbar thumbs in the actual `Launch Atlas.bat` app. Multiple CSS-only fixes failed to reflect. Diagnose the live rendered cascade/environment in a dedicated pass rather than applying another speculative patch.
2. **Dashboard row-hover geometry:** the user still sees tight left/right hover padding and no visible rounded hover surface in Dashboard's main body. This is the same dedicated fidelity debt as the scrollbar issue; verify against the live rendered app before closing it.
3. **Search final verification:** the search overhaul is implemented, but the broad verifier stops in an unrelated historical course-detail flow before search. Add/run a focused Electron check and inspect its screenshot before calling the search pass fully verified.
4. **Dashboard v2 visual review:** behavior is implemented and covered by `scripts/verify-dashboard-v2.js`, but the user has not yet reviewed the finished surface. Keep its `ROADMAP.md` checkbox unchecked until they do.

### Start sequence for the next chat

1. Read `AGENTS.md`, `STATUS.md`, `open-questions.md`, and this file.
2. Read the current relevant mockups before editing.
3. Check `git status`; preserve the untracked `.claude/` directory and do not stage it.
4. Work from `ui-overhaul-v2` unless the user explicitly changes branch/scope.
5. Begin with the user’s next requested UI surface, while observing the deferred items above instead of reopening them opportunistically.

The immediate functional implementation at handoff is Dashboard v2 plus the Calendar deadline entry flow and Calendar filter persistence. The appropriate next product task is whatever the user supplies next; it is **not** a mandate to continue cosmetic scrollbar/hover changes without a real diagnosis.
