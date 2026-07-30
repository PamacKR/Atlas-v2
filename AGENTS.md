# AGENTS.md — how an AI coding agent works on Atlas

This document describes how an AI coding agent (as an engineering collaborator, not as a feature of the product) should operate while building Atlas. It's project-specific guidance layered on top of whatever general defaults the agent already has — read it before making architectural calls or writing product-facing copy in this repo. It applies regardless of which tool is doing the work (Claude Code or anything else) and regardless of which model is behind it.

**Starting a fresh session (new chat, new agent, or after context compaction)?** Read, in order: this file, then [`STATUS.md`](STATUS.md) (what's actually been decided/built and what's pending), then [`open-questions.md`](open-questions.md). Don't re-derive decisions already recorded in those files or in `ARCHITECTURE.md`/`ROADMAP.md` — treat them as settled unless the user says otherwise. `STATUS.md` is the one document expected to go stale fastest; update it whenever real progress happens, not just at the end of a session.

## Identity in this repo

Commits authored while working on Atlas should use a clearly-attributed, tool-specific local git identity, configured per-repo (not globally) so it doesn't affect commits elsewhere on this machine — e.g. `Claude <noreply@anthropic.com>` for Claude Code, something reflecting the actual tool/model in use otherwise (`Pi Agent <...>`, etc.). The point is that anyone reading `git log` can tell which tool made a given commit without guessing. Don't change an already-configured identity to another one without being asked.

## The one rule that governs every decision here

> Atlas owns the data. The AI agent owns the reasoning.

Any time a design choice is ambiguous, resolve it against this line. Concretely:

- Never design a feature where Atlas tries to "reason" about academic content (summarizing, explaining, answering questions) — that's the AI agent's job at runtime, not Atlas's job as a stored feature.
- Never design a feature where the AI agent becomes a place academic data is stored or where the user is expected to re-upload the same material repeatedly. Atlas is the persistent store; the agent is stateless w.r.t. academic content between sessions.
- AI-generated associations (e.g., "this email probably relates to this assignment") may be used transiently to build context for a single request, but must never be written back into the canonical database as if they were fact (PRD §17). If a feature wants to do that, it needs an explicit user confirmation step first — at that point it's a user-originated relationship, not an AI-inferred one.

## Hard guardrails (do not revisit without the user explicitly reopening them)

- **No AI/LLM API calls from inside Atlas, ever** — not Anthropic, not OpenAI, not Google Gemini, not NVIDIA NIM, none. The only reasoning engine is whatever AI coding agent/model the user is running as its own external process (against their own subscription or API key). Do not add an "AI feature" to Atlas itself, even something that seems small or convenient (e.g. "just call an API to auto-summarize this"). If a request seems to need one, say so and propose the same external-agent-via-MCP path Atlas already uses instead of quietly implementing an API call.
- **No paid API usage anywhere in the project, for anything**, without the user explicitly approving it first. This is why OCR is local Tesseract.js rather than a cloud OCR API (`ARCHITECTURE.md` §3), and why Google API access is scoped to the free tier with no billing account (`ARCHITECTURE.md` §0). If a feature seems to require a metered/paid API, the default answer is to cut or redesign the feature, not to add the cost.
- Both guardrails above came from explicit user instruction (2026-07-23) and are load-bearing across the whole project — treat them the same as a hard product requirement in `prd.md`, not a preference that can be quietly traded off for convenience.

## Decision-making boundaries

- **Product decisions** (what a feature does, how data is modeled, what's in vs. out of scope) — check `prd.md` and `open-questions.md` first. If a question is already answered there, don't re-litigate it in code review or in passing; if it's genuinely still open, add it to `open-questions.md` rather than silently picking an answer.
- **Architecture decisions** (stack, libraries, schema shape) — check `ARCHITECTURE.md`. If a change would contradict a documented decision there, flag it and update the doc in the same change — don't let code and docs drift.
- **Implementation details** (function names, file layout within a module, internal helpers) — normal engineering judgment, no need to check in.

## How to work in this repo

- Keep `ARCHITECTURE.md`, `ROADMAP.md`, and `open-questions.md` current as living documents — when a decision changes, update the doc in the same commit as the code that changes it, not as an afterthought later.
- Prefer resolving an open question explicitly (move it from `open-questions.md` into the relevant doc with a decision recorded) over quietly working around it.
- Don't build ahead of the current roadmap phase (see `ROADMAP.md`) — e.g. don't start wiring Gmail sync while Phase 1 (local-only workflow) isn't done. Each phase should be a genuinely usable checkpoint on its own.
- Follow good general engineering defaults on top of this: no speculative abstraction, no unused config/feature flags, comments only where the *why* isn't obvious from the code, and don't add error handling for cases that can't occur.

### Documentation map — what gets updated, and when

The user (2026-07-23) asked for this to be trackable so they can audit whether a doc update was missed. Use this table as the checklist:

| Document | Update trigger | How the user can spot a miss |
|---|---|---|
| `STATUS.md` | Every session with real progress — features built, bugs found/fixed, decisions made. | Check the "Last updated" line matches the session just done. |
| `open-questions.md` | A question gets resolved, or a new one surfaces. | Any `**Status:** Open` item that was clearly decided in conversation but not closed out here. |
| `ARCHITECTURE.md` | A technical/stack decision changes or a new one is made. | Code does something the doc doesn't describe (schema shape, new library, changed data flow). |
| `ROADMAP.md` | Phases get reordered, descoped, or a milestone is completed (tick the checkbox). | `STATUS.md` says a phase item is done but its `ROADMAP.md` checkbox is unticked. |
| `phase*-spec.md` / `remote-attachments-spec.md` | **Not read by the user (2026-07-29 standing instruction) — treat as the agent's own internal working notes only.** `ROADMAP.md` must be self-contained: every bullet inlines whatever detail the user would need, never "see `phaseN-spec.md` §X." Don't tell the user to go read one of these files, and don't let `ROADMAP.md`'s status contradict what a spec file says — if they'd disagree, `ROADMAP.md` is what's real and the spec file is stale. | The user says something like "I only read ROADMAP" or points out a contradiction between what was said and what `ROADMAP.md` shows — that's this rule being violated. |
| `AGENTS.md` | The user gives a new standing instruction about how the AI agent should work (rare). | The agent visibly behaves differently from what's written here, without the file changing. |
| `README.md` | Setup/run instructions change (new dependency, new required step). | Following "Running it" from a clean checkout doesn't match reality. |
| `prd.md` | Never touched by the AI agent — it's the user's original source document. | N/A. |

Rule of thumb: `STATUS.md` and `open-questions.md` should get touched almost every session; `ARCHITECTURE.md`/`ROADMAP.md` only on structural changes; `AGENTS.md`/`README.md` only on workflow or setup changes.

## Standing rule: the UI is being replaced wholesale — don't patch it

**Added 2026-07-29 at the user's explicit instruction.** Phase 6 (`phase6-spec.md`) is a complete UI overhaul, not a series of improvements. Until it ships:

- **Don't make cosmetic fixes to `styles.css`/`index.html`.** If something looks wrong, off-theme, or misaligned, record it as input for the redesign (`phase6-spec.md` §8) instead of fixing it in place. The user's words: *"i do not want you editing the current ui files to make small fixes. i want a complete overhaul."*
- **Don't start the redesign without the user's design framework.** They are supplying visual direction and the logo concept themselves, deliberately and on their own schedule, and have said they won't ask to proceed without giving something concrete to work from. Absence of direction is a communicated pause, not a blocker to escalate.
- **Don't optimize this phase for speed.** The user has explicitly said they're willing to sit through a long build for a result they'd be excited to use daily. Don't propose a reduced-scope redesign to finish sooner.

Functional/logic changes to renderer code are still fine — this rule is about *visual* churn on a stylesheet that's about to be replaced. Non-UI work (packaging, startup performance, data layers) is unaffected and can proceed normally.

**Update, 2026-07-30 — the "no design direction yet" blocker above is resolved.** The user supplied and iterated on real HTML mockups for all six sidebar pages (`mockups/dashboard-a.html`, `courses-a`, `resources-a`, `notes-a`, `calendar-a`, `settings-a` — see `ui-brief.md` for the design thesis) across many rounds of hands-on feedback, then approved a full implementation plan for bringing that design into the real app (course-detail, all 15 overlays, search results, custom controls, both themes, responsive behavior, plus several Phase 6 items folded in: Settings redesign, Search results overhaul, Calendar rework, Dashboard v2, Empty/first-run states). **Do not treat "waiting on design direction" as still true** — read `STATUS.md`'s "Next session" section for exactly where implementation currently stands. The other two bullets above (no ad-hoc cosmetic patches outside the plan; don't rush it) still hold and apply to the implementation work itself.

## Testing UI changes yourself, don't just ask the user

Atlas is an Electron desktop app, not a website — there's no browser tab to preview it in. But it doesn't have to be manual-only: `npm run verify` (`scripts/verify-app.js`) launches the actual built app via Playwright's Electron driver, drives the real DOM (click, fill, read text), and saves a screenshot — read that screenshot to visually confirm the change yourself. It runs against a throwaway temp data directory (`ATLAS_DATA_DIR` env override in `src/main/paths.ts`), never the user's real `Downloads/Atlas-Storage`, so it's safe to run freely.

Use it as the default way to confirm a UI/renderer change actually works before telling the user it's done — extend `scripts/verify-app.js` as new features get added (uploads, viewers, notes, search) rather than only ever asking the user to click around. Still worth having the user glance at real usage periodically, but don't make them your only verification method.

### A recurring CSS bug to check for explicitly

This exact bug has been hit **three separate times** (`#preview-overlay`, `#confirm-overlay`, `#zoom-controls`) before finally being called out here — each time it looked like a JS logic bug but wasn't:

> An element toggled via `el.hidden = true/false` in JS also has a CSS rule setting `display` unconditionally on its **own ID selector** (e.g. `#zoom-controls { display: flex; }`). That ID selector outranks the browser's default `[hidden] { display: none }` rule, so the element stays visibly rendered even while `hidden` is `true`.

Fix: never set `display` unconditionally on an element's own ID selector if that same element is ever toggled via the `hidden` attribute — scope it with `#id:not([hidden]) { display: ...; }` instead. **Whenever adding a new `hidden`-toggled element, check this pattern immediately** rather than waiting for the user to report "it's still showing up" — that's what happened all three times.

### A second recurring CSS bug: partial property overrides

Hit once so far (`#dashboard-deadlines li.upcoming-row`, session 46) — flagging it early this time rather than waiting for a third occurrence:

> A more-specific selector that sets `display: flex` but not `flex-direction` does **not** "win" that property from a less-specific rule that does set `flex-direction`. CSS resolves cascade conflicts **per property**, not per rule — a rule can lose on `flex-direction` while winning on `display`. This bit a new dashboard row layout built directly on an `<li>` that already had a generic `.dashboard-widget ul li { flex-direction: column }` rule; the new rule's `display: flex` applied, but rows still stacked as a column and centered, because nothing in the new rule ever declared `flex-direction: row`.

Fix: when writing a more-specific override for an element that already has generic styling from a broader selector, **explicitly restate every layout property the override actually depends on** (`flex-direction`, `align-items`, etc.) — don't assume higher specificity on one property carries the others. The project already had the correct pattern elsewhere (`#dashboard-course-list.dashboard-course-chips li` sets `flex-direction: row` explicitly) — check for an existing analogous widget before writing a new one from scratch, since the fix was already sitting right there in the same file.

## Git workflow

Commit and push to this repo's remote continuously as work happens — **don't wait for approval before committing/pushing**. The user explicitly opted into this (2026-07-23, for the original `Atlas` repo; carried forward here) on the reasoning that git history makes any bad change trivially reversible. Still use judgment on commit granularity (a coherent chunk of work, not every keystroke) and write real commit messages — the autonomy is about not blocking on a confirmation round-trip, not about being careless.

## Tone in user-facing product copy

Atlas's own UI copy (empty states, dashboard labels, settings) should be plain and functional — this is a workspace tool, not a consumer app trying to be delightful. Favor clarity over personality in anything the *student* sees inside Atlas. This document's guidance is about engineering behavior; it does not mean the product itself should have a "voice."

## When in doubt

Ask. This project is still being actively shaped — the PRD explicitly leaves several product questions open (`open-questions.md`), and getting the data/reasoning split right matters more than moving fast on any individual feature.
