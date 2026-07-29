# Phase 6 — Design system, theming, and desktop polish (specification)

Status: **drafted 2026-07-29, nothing built yet.** Parts of §1–§3 deliberately need the user's visual direction before they can be specced further — flagged inline in §8.

The functional product is essentially complete (Phases 0–5 plus the MCP/Context Builder and remote attachment work). This phase is about Atlas *feeling* like a real, finished desktop app rather than a working prototype.

---

## 1. UI overhaul — and the one architectural decision that matters

The user's ask: *"A complete redesign of the ui to make it more modern and personalized. right now the ui looks functional sure, but still very basic."*

That's a fair description — `AGENTS.md` has always said Atlas's own UI is functional-first and not yet polished. The redesign itself is a design problem, not an engineering one, and needs the user's visual direction (§8).

But there **is** one engineering decision inside it that has to be made correctly the first time, because getting it wrong means doing the entire redesign twice.

### 1.1 The redesign must introduce a design-token layer, not just new CSS

The user wants (point 3) themes that are *"completely different design styles. For example brutalism, neomorphism, minimalism."* Those styles differ in far more than color:

| | Brutalism | Neomorphism | Minimalism |
|---|---|---|---|
| Corner radius | `0` | large, soft | small |
| Shadows | none, or hard offset | signature soft double-shadow | none |
| Borders | thick, high-contrast | none (shape comes from shadow) | hairline |
| Typography | heavy, often mono | light | light, generous spacing |
| Spacing | tight | generous | very generous |

Now the measured state of `styles.css` today:

| | Count |
|---|---|
| Total lines | 3,497 |
| `border-radius` declarations | 106 |
| …of those using a variable | **0** |
| `font-size` declarations | 119 |
| Existing CSS custom properties | 68 (essentially all color) |

**Every single one of those 106 corner radii and 119 font sizes is hardcoded.** The existing theming system (`data-theme` on `<html>`, swapping ~13 color variables) is genuinely good — but it can only ever change *color*. A brutalism theme cannot be expressed at all, because "corner radius" isn't a variable anywhere.

**So: the theme engine the user wants in point 3 is not a separate feature to build later. It is the token layer, and the token layer has to be built as part of the redesign itself.** Retrofitting tokens into a freshly-hardcoded 3,500-line stylesheet afterwards is a second full pass over every rule.

Concretely, the redesign should establish and use tokens for:

```css
:root {
  /* colour — already exists, keep */
  --color-bg, --color-text, --color-accent, ...

  /* shape — new */
  --radius-sm, --radius-md, --radius-lg, --radius-pill;
  --border-width, --border-style;

  /* depth — new */
  --shadow-sm, --shadow-md, --shadow-lg;

  /* type — new */
  --font-display, --font-body, --font-mono;
  --text-xs … --text-xl;  /* replaces 119 ad-hoc font-sizes */
  --weight-normal, --weight-medium, --weight-bold;

  /* rhythm — new */
  --space-1 … --space-8;
  --density-scale;  /* powers a compact/comfortable setting, §6.4 */

  /* motion — new */
  --transition-fast, --transition-base;
}
```

Rule of thumb for the redesign: **if a value would differ between a brutalist and a minimalist version of Atlas, it must be a token, not a literal.**

### 1.2 A caution worth stating once

Some of these styles fight against what Atlas actually is — a dense, text-heavy information tool. Neomorphism in particular is notorious for low contrast (its shapes come from subtle shadow, not borders), which gets genuinely hard to read across a page of deadlines and file lists.

Not an argument against building it — it's the user's app and it should look how they want. But the token set should include contrast floors for text so that *no* theme can render body text unreadable, and each theme should be checked against the densest screens (Resources list, Calendar month grid) rather than the Dashboard alone.

---

## 2. Settings redesign

The user's ask: *"a settings page redesign with more options to customize and a better layout rather than it all dumped on 1 tab."*

Settings already has a three-tab shell (General / Sources / About), but General has become a dumping ground and Sources is a long unstructured scroll. This has been an open request since `open-questions.md` #23 ("Settings-page revamp — still waiting on the user's detail"); this spec finally gives it a shape.

Proposed structure — a left nav with real sections rather than three tabs:

| Section | Contents |
|---|---|
| **Appearance** | Theme (light/dark/system), design style (§3), accent color, density (§6.4), font size |
| **Shortcuts** | The rebinding UI from `phase5-spec.md` §4.4 — this is where the user asked for it to live (point 2) |
| **Sources** | Google Drive, Google Classroom, sync schedules, Ashoka Planner import |
| **Files & storage** | Data folder location, watched folders, Drive preview cache, extraction status, **backup** (§6.3) |
| **AI agent** | MCP connection status/instructions, memory file location + a way to open them, agent-note behavior |
| **About** | Version, description, links, licenses |

Two of those sections are genuinely new surfaces, not just re-filing: **AI agent** (today the MCP setup is documented only in `mcp-setup.md`, invisible from inside the app — the user had no in-app way to tell whether the agent connection was working) and **Files & storage** (extraction status is currently buried, and there's no backup at all).

---

## 3. Design-style themes

Once §1.1's tokens exist, a theme is just a token set — which makes this section small, and is exactly why it must come after the redesign, matching the user's own instinct: *"we can work on this once we can get 1 functional and good looking ui working first."*

Shape:

```
:root[data-style="default"]     { --radius-md: 8px;  --shadow-md: …; --font-display: …; }
:root[data-style="brutalist"]   { --radius-md: 0;    --shadow-md: 4px 4px 0 #000; --border-width: 2px; }
:root[data-style="minimal"]     { --radius-md: 4px;  --shadow-md: none; --border-width: 1px; }
:root[data-style="neomorphic"]  { --radius-md: 16px; --shadow-md: inset …, …; --border-width: 0; }
```

Two independent axes, stored separately in `app_settings`:
- `data-theme` — light / dark / follow-system *(exists today)*
- `data-style` — the design language *(new)*

Keeping them independent means "brutalist + dark" and "brutalist + light" both work without writing two themes, and the existing light/dark work isn't thrown away.

A handful of styles will need more than tokens (neomorphism's inset shadows on inputs, brutalism's offset shadows on hover). Allow each style an optional small override stylesheet on top of its tokens — but if a style needs more than ~50 lines of overrides, that's a signal the token set is missing something, and the token set should grow instead.

**Live preview** in Settings matters here: switching design language is a much bigger visual jump than switching accent color, and users should see it applied instantly rather than committing blind.

---

## 4. Package Atlas as a real app (fixes the `.bat` **and** the slow start — same root cause)

The user raised these as two separate items (5.1 "starting the app takes a little bit", 5.3 "rather than a batch file shortcut, a shortcut that looks like an app"). **They're the same problem.**

### 4.1 What's actually happening today

`Launch Atlas.bat` runs `npm start`, and:

```json
"start": "npm run build && electron .",
"build":  "tsc -b && tsc --noEmit -p tsconfig.renderer.json && node scripts/build-renderer.js && node scripts/copy-assets.js"
```

So **every single launch** does a full TypeScript compile, a second full type-check pass of the renderer, an esbuild bundle, and an asset copy — *before the window even opens*. That's the startup delay. It isn't Electron being slow; it's a full development build running every time the user wants to read their notes.

And `electron-builder` is already installed as a devDependency — but there is **no build configuration anywhere**: no `build` key in `package.json`, no `electron-builder.yml`, no `build/` directory. The app has never been packaged. That's why the `.bat` file exists at all.

### 4.2 The fix

Configure `electron-builder` and produce a real installed Windows application:

- A real `Atlas.exe` with a proper icon, Start Menu entry, and Desktop shortcut — created by the installer, not hand-made.
- **No build step at launch.** The packaged app ships already-compiled code, so startup is Electron cold-start only.
- Proper app identity (`appId`, `productName: "Atlas"`) so Windows treats it as one application.
- NSIS installer target, per-user install (no admin prompt needed).

Keep `Launch Atlas.bat` for development, but add a dev-only fast path for when nothing has changed:

```json
"start:fast": "electron ."
```

### 4.3 The old Atlas v1 shortcut — not touching it without confirmation

The user suggested deleting the existing Atlas (v1) desktop shortcut so v2 can simply be called "Atlas". Reasonable, but that's a real file outside this repo, and the v1 app may still be installed and in use.

**This spec does not delete anything.** The installer will create its own correctly-named, correctly-iconed entry; whether the old v1 shortcut (or the v1 app itself) gets removed is a separate, explicit decision for the user to make and act on. Worth confirming v1 is genuinely retired first — it has its own separate `Atlas-Storage` expectations and its own repo.

---

## 5. Startup performance beyond the build step

Removing the per-launch build (§4) is the big win, but there's a second, real cost that will keep growing.

**`rebuildSearchIndex()` runs unconditionally on every launch**, and it deletes and re-inserts the *entire* FTS5 index. Measured against the user's real data today:

| Indexed rows rebuilt on every launch | |
|---|---|
| `document_part` | 3,067 |
| `resource` | 195 |
| `announcement` | 152 |
| `assignment` | 27 |
| `note` | 2 |
| **Total** | **3,443** |

Plus a `readFileSync` per text/markdown resource, every launch.

`ARCHITECTURE.md` §14 explicitly justified the full-rebuild approach as correct-by-construction and cheap *"at this app's actual scale (one user's own courses/resources/notes — tens to low hundreds of rows, not thousands)"* — and called out that it's *"worth revisiting only if that scale assumption stops holding."* Phase 4's page-aware extraction is exactly the event that broke it: from ~380 rows to 3,443, and it grows with every document added.

**Proposed fix — keep the full rebuild, but stop running it when nothing changed.** A cheap consistency check at launch (compare source-table row counts against the indexed counts) is a handful of `COUNT(*)` queries; only a mismatch triggers the real rebuild. This preserves the "always correct by construction" property that made the original decision right, while making the common launch path effectively free. Incremental per-call-site index maintenance — the alternative `ARCHITECTURE.md` deliberately rejected — stays rejected, for the same reason as before.

---

## 6. Additional recommendations (the user asked: "any other ideas you have?")

### 6.1 A command palette — the strongest new idea here

`Ctrl+K` opens a single search-and-act box: type to jump to any course, note, or file, *or* to run any action ("sync now", "new note", "export for AI", "switch theme").

Why this specifically, for this app:

- **It's the modern-UI answer to the shortcuts request.** Configurable shortcuts (`phase5-spec.md` §4) are powerful but undiscoverable — a shortcut only helps once memorized. A command palette exposes *every* action by name, with its shortcut shown next to it, so it doubles as the discovery surface for shortcuts rather than competing with them.
- **It reuses work already planned.** The shortcut registry (`phase5-spec.md` §4.1) is already a list of named actions with bindings — that list *is* the palette's command source, for free.
- **It suits a keyboard-heavy study workflow** far better than clicking through a sidebar, and it's the single most recognizable "modern desktop app" affordance there is.

Recommended as part of Phase 6 rather than Phase 5, so it's designed into the new UI rather than retrofitted.

### 6.2 Reading / coverage tracking — still the highest-value *functional* idea

Raised previously and not yet decided on, so re-stating once: a simple per-resource marker (unread / reading / done) would let the user see what they've actually worked through across ~195 files, and — more importantly — let them ask the AI agent *"build me a study plan for what I haven't covered."* The agent currently knows what exists but has no idea what the user has engaged with. For finals, that's the single most useful missing signal, and it's a small feature.

### 6.3 Backup

Every deadline, every extracted page, all agent memory, and all note content lives in one `atlas.db` file with no backup of any kind. Files are safe (plain files in a browsable folder) and notes are mirrored as `.md`, but a semester of everything else is not. A scheduled local copy (keep the last N, in `Atlas-Storage/backups/`) is cheap insurance and belongs in the new Settings → Files & storage section (§2).

### 6.4 Density setting

Compact / comfortable, driven by the `--space-*` tokens from §1.1. Near-free once tokens exist, and genuinely useful on a laptop screen for the dense list views.

### 6.5 Empty and first-run states

Easy to forget in a redesign, and currently poor: a fresh Atlas shows blank widgets and empty lists with no guidance. Since the redesign touches every screen anyway, each list/widget should get a real empty state ("No courses yet — add one, or connect Google Classroom"). This is also the natural home for a first-run setup flow (connect Drive/Classroom, pick a data folder) that today only exists as instructions in `README.md`.

### 6.6 Per-course readiness view

From the real extraction data: Development Economics has 17 readable files, 9 that are scans needing OCR, and 1 that failed. Nothing in the UI surfaces that. Before an exam, "can the agent actually read everything for this course?" is a question worth one glance rather than clicking through 30 files. Small, and it makes the whole extraction system legible.

---

## 7. Build order

| # | Piece | Size | Notes |
|---|---|---|---|
| 1 | Package with electron-builder: real `.exe`, installer, icon, no build-at-launch (§4) | Medium | **Independent of everything else, immediate daily payoff.** Good first move. |
| 2 | Skip the redundant launch-time search reindex (§5) | Small | Pairs with #1 to make startup genuinely fast. |
| 3 | Design a logo/icon (§8) | — | Needed by #1; can ship with a placeholder and be replaced. |
| 4 | **Design-token layer + UI overhaul** (§1) | **Very large** | The core of this phase. Needs the user's visual direction first. |
| 5 | Settings redesign into sections (§2) | Large | Part of #4; hosts the shortcut UI from `phase5-spec.md`. |
| 6 | Empty/first-run states (§6.5) | Medium | Do alongside #4 — cheap then, expensive as a separate pass. |
| 7 | Density setting (§6.4) | Small | Falls out of #4's tokens. |
| 8 | Design-style themes (§3) | Medium | Only sensible after #4. |
| 9 | Command palette (§6.1) | Medium | Reuses `phase5-spec.md` §4.1's action registry. |
| 10 | Backup (§6.3) | Small | Independent; can slot in anywhere. |

### Sequencing note against Phase 5

Phase 5 (`phase5-spec.md`) and this phase overlap on two surfaces, and the order matters:

- **The search dead-click fix** (`phase5-spec.md` §2.2, build item #1 there) is pure logic and design-independent — **do it now, regardless of any of this.**
- **The search results redesign, Dashboard v2 widgets, and the shortcuts rebinding UI** are all new *visual* surfaces. Building them against today's CSS and then redesigning means building them twice. Recommendation: build their **logic and data layers** in Phase 5 (schema, queries, the shortcut registry, marking things read), and let their **visual surfaces** land as part of the Phase 6 redesign.

---

## 8. What this spec deliberately does not decide — needs the user

The redesign itself can't be specced further from here without direction:

1. **Visual direction.** Reference apps the user likes the look of, screenshots, or a rough mockup would settle more in one message than paragraphs of description. (This worked well before — the Calendar page and Dashboard "Upcoming" widget were both built from screenshots the user shared.)
2. **Which parts of the current UI they dislike specifically.** *"aspects of it that i do not like"* — knowing which aspects prevents redesigning things that were fine.
3. **Logo concept.** Needs to work as a 16px taskbar icon and a 256px installer icon. Deliverable is a `.ico` (multi-resolution) plus an SVG master. Can be drafted here for the user to react to, or supplied by the user.
4. **Which design styles to actually ship** in §3, and whether the default should stay close to today's look or change entirely.
5. **Whether Atlas v1 is retired** (§4.3), before anything touches its shortcut.
