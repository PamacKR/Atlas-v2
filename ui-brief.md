# Atlas — UI design brief

**Purpose of this file:** the missing context that made external design tools produce generic results. Paste this whole file into any AI/design tool before asking it for Atlas mockups. It describes what Atlas *is* before it describes how it should look, because that was the failure mode: tools treated it as "a productivity dashboard" and designed the average of every productivity dashboard.

Written 2026-07-29 on the `ui-overhaul` branch.

---

## 1. What Atlas actually is

Atlas is a **desktop app that owns a student's academic data** — courses, files, notes, deadlines, announcements — pulled automatically from Google Classroom, Google Drive, watched local folders, and manual uploads.

The one line that governs every decision:

> **Atlas owns the data. The AI agent owns the reasoning.**

Atlas makes **zero AI/LLM API calls** and never will. It does not summarize, explain, chat, or answer questions. Instead it runs a local MCP server that an external AI coding agent (Claude Code, etc.) connects to, so the agent can read the student's actual course material and help them study. Atlas is the library; something else is the tutor.

**Design consequences:**
- There is no chat pane, no "ask AI" button, no assistant persona. Anything resembling one is wrong.
- The UI's job is *retrieval and awareness*, not conversation.
- The most important quality is that the student can find or notice something fast, then leave.

## 2. Who uses it

One person: an undergraduate at Ashoka University, 5 courses in a semester, comfortable with software, particular about visual quality. Not a team. No collaboration, no sharing, no permissions, no notifications-to-others.

## 3. How it's actually used

**In short bursts, not all day.** Opened to *get* something — a file to read, a deadline to check, a note to write — then closed. It is not an app you dwell in, and it should not be designed as one. It competes with "just open the Classroom tab in my browser" and has to be faster than that.

This means the home screen has about two seconds to answer:
1. What's due, and how soon?
2. What changed since I last looked?
3. Where's the file I want?

## 4. Real data scale (design against these, not toy numbers)

| | Actual |
|---|---|
| Courses | 5 |
| Files (resources) | 196 |
| Notes | 2 |
| Upcoming deadlines | 14 |
| Announcements | 152 |
| Indexed pages/slides/sheets (searchable) | 3,067 |

Two things follow: notes are nearly unused today (so the Notes surface shouldn't dominate), and search results can be flooded — 3,067 of ~3,443 indexed rows are individual document pages.

## 5. The screens that exist

- **Dashboard** — home. Stat row + upcoming deadlines + my courses + recently added + what changed today.
- **Courses** — grid of course cards → a course detail view with tabs (Overview / Deadlines / Announcements / Assignments / Classwork / Files).
- **Resources** — all 196 files across all courses, with a course rail, kind filter chips, sort dropdown, list/grid toggle.
- **Notes** — markdown editor (Milkdown/Crepe), list only, with a course rail.
- **Calendar** — month grid + upcoming sidebar.
- **Settings** — General / Sources / Shortcuts / About.
- **Overlays** — file preview, note editor, deadline viewer, course picker, shortcuts cheat sheet. These are global: opening one never navigates away from the current page.

## 6. What the user dislikes about the current UI (their own words, 2026-07-29)

**The organizing principle:**
> "I don't like wasted space. There is a difference between minimalism and wasted space. I like minimalism, but I don't like wasted space. Space should be used resourcefully and properly."

Also: *"minimalism does not mean that you cut down on features."*

**Specific complaints:**
- **Dashboard columns don't align at the bottom.** When forced to align, dead grey space appears. Neither state is acceptable. (This has been attempted and reverted four separate times — see `open-questions.md` #23/#24/#25/#27.)
- **Dashboard has too much empty space at the bottom.**
- **The stat row is inert.** "5 courses, 196 resources, 2 notes, 15 upcoming deadlines… it's just there. It's not really providing any value."
- **Courses page feels empty** and isn't the clearest.
- **Notes page has no grid view**, only list.
- **Buttons are oddly placed and inconsistently aligned** — this is a recurring irritation, not a one-off. Named examples: "Show only agent notes" sits too close to the course rail; Settings → Shortcuts "Reset all to defaults" is completely unstyled; Settings → Google Classroom has a large gap between "Connected" and the Disconnect button but no gap before "2 new courses".
- **Everything is a card.** Every element in its own box. Explicitly asked to explore moving away from this.

**What they want more of:**
- **Flow.** "It should not be breaking from just one thing to another… one thing should be able to transition to another very smoothly."
- **Quality-of-life micro-interactions** — hover states that expand something slightly, etc. Explicitly *not* heavy motion.

**Reference feel:** ChatGPT and Claude's interfaces. Minimal, typographic, calm — but dense with real content.

## 7. Hard constraints

- Electron desktop app, Windows. Not a website, not responsive-mobile.
- Light **and** dark themes both required. Dark is the current default.
- A later phase adds **design-style themes** (brutalism / neomorphism / minimalism) as a `data-style` axis independent of light/dark. This means the redesign must be built on **design tokens** (radius, shadow, border, type scale, spacing, motion) — not hardcoded values. Today all 106 `border-radius` and 119 `font-size` declarations in `styles.css` are literals, which is why this can't be retrofitted later.
- The note editor is Milkdown/Crepe and brings its own CSS that has to be themed alongside.
- Copy stays plain and functional. This is a workspace tool, not a consumer app with a personality.

## 8. The design thesis (proposed, open to rejection)

**Kill the card.** The complaints about misaligned column bottoms and dead grey space are not styling bugs — they're structural consequences of a card layout. A card has fixed padding, a border, a gap, and a height that never matches its neighbour's; three columns of them cannot align without forcing heights, and forcing heights manufactures the grey space. Four separate attempts to fix this have failed because the layout model itself causes it.

Without boxes, **unequal column heights stop reading as broken** — they read as content simply ending. The bug dissolves rather than being fixed.

What replaces cards: continuous surfaces, hierarchy carried by typography and hairline rules, sections exactly as tall as their content, density from consistent rhythm rather than from packing boxes.

**Make numbers mean something.** A count is inert; a change or a deadline is actionable. "196 resources" earns nothing. "12 added since you last opened Atlas", "3 due this week", "9 files the agent still can't read" each imply a next action.
