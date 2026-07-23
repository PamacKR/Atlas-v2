# CLAUDE.md — how Claude works on Atlas

This document describes how Claude (as an engineering collaborator, not as a feature of the product) should operate while building Atlas. It's project-specific guidance layered on top of Claude's general defaults — read it before making architectural calls or writing product-facing copy in this repo.

**Starting a fresh session (new chat, or after context compaction)?** Read, in order: this file, then [`STATUS.md`](STATUS.md) (what's actually been decided/built and what's pending), then [`docs/open-questions.md`](docs/open-questions.md). Don't re-derive decisions already recorded in those files or in `ARCHITECTURE.md`/`ROADMAP.md` — treat them as settled unless the user says otherwise. `STATUS.md` is the one document expected to go stale fastest; update it whenever real progress happens, not just at the end of a session.

## Identity in this repo

Commits authored while working on Atlas are made under the local git identity `Claude <noreply@anthropic.com>`, configured per-repo (not globally) so it doesn't affect commits elsewhere on this machine. Don't change this to another identity without being asked.

## The one rule that governs every decision here

> Atlas owns the data. Claude owns the reasoning.

Any time a design choice is ambiguous, resolve it against this line. Concretely:

- Never design a feature where Atlas tries to "reason" about academic content (summarizing, explaining, answering questions) — that's Claude Code's job at runtime, not Atlas's job as a stored feature.
- Never design a feature where Claude Code becomes a place academic data is stored or where the user is expected to re-upload the same material repeatedly. Atlas is the persistent store; Claude is stateless w.r.t. academic content between sessions.
- AI-generated associations (e.g., "this email probably relates to this assignment") may be used transiently to build context for a single request, but must never be written back into the canonical database as if they were fact (PRD §17). If a feature wants to do that, it needs an explicit user confirmation step first — at that point it's a user-originated relationship, not an AI-inferred one.

## Hard guardrails (do not revisit without the user explicitly reopening them)

- **No AI/LLM API calls from inside Atlas, ever** — not Anthropic, not OpenAI, not Google Gemini, none. The only reasoning engine is Claude Code, run as its own process against the user's existing Claude subscription. Do not add an "AI feature" to Atlas itself, even something that seems small or convenient (e.g. "just call an API to auto-summarize this"). If a request seems to need one, say so and propose the Claude-Code-via-MCP path instead of quietly implementing an API call.
- **No paid API usage anywhere in the project, for anything**, without the user explicitly approving it first. This is why OCR is local Tesseract.js rather than a cloud OCR API (`ARCHITECTURE.md` §3), and why Google API access is scoped to the free tier with no billing account (`ARCHITECTURE.md` §0). If a feature seems to require a metered/paid API, the default answer is to cut or redesign the feature, not to add the cost.
- Both guardrails above came from explicit user instruction (2026-07-23) and are load-bearing across the whole project — treat them the same as a hard product requirement in `prd.md`, not a preference that can be quietly traded off for convenience.

## Decision-making boundaries

- **Product decisions** (what a feature does, how data is modeled, what's in vs. out of scope) — check `prd.md` and `docs/open-questions.md` first. If a question is already answered there, don't re-litigate it in code review or in passing; if it's genuinely still open, add it to `docs/open-questions.md` rather than silently picking an answer.
- **Architecture decisions** (stack, libraries, schema shape) — check `ARCHITECTURE.md`. If a change would contradict a documented decision there, flag it and update the doc in the same change — don't let code and docs drift.
- **Implementation details** (function names, file layout within a module, internal helpers) — normal engineering judgment, no need to check in.

## How to work in this repo

- Keep `ARCHITECTURE.md`, `ROADMAP.md`, and `docs/open-questions.md` current as living documents — when a decision changes, update the doc in the same commit as the code that changes it, not as an afterthought later.
- Prefer resolving an open question explicitly (move it from `docs/open-questions.md` into the relevant doc with a decision recorded) over quietly working around it.
- Don't build ahead of the current roadmap phase (see `ROADMAP.md`) — e.g. don't start wiring Gmail sync while Phase 1 (local-only workflow) isn't done. Each phase should be a genuinely usable checkpoint on its own.
- Follow Anthropic's general engineering defaults on top of this: no speculative abstraction, no unused config/feature flags, comments only where the *why* isn't obvious from the code, and don't add error handling for cases that can't occur.

## Testing UI changes yourself, don't just ask the user

Atlas is an Electron desktop app, not a website — there's no browser tab to preview it in. But it doesn't have to be manual-only: `npm run verify` (`scripts/verify-app.js`) launches the actual built app via Playwright's Electron driver, drives the real DOM (click, fill, read text), and saves a screenshot — read that screenshot with the Read tool to visually confirm the change yourself. It runs against a throwaway temp data directory (`ATLAS_DATA_DIR` env override in `src/main/paths.ts`), never the user's real `Downloads/Atlas-Storage`, so it's safe to run freely.

Use it as the default way to confirm a UI/renderer change actually works before telling the user it's done — extend `scripts/verify-app.js` as new features get added (uploads, viewers, notes, search) rather than only ever asking the user to click around. Still worth having the user glance at real usage periodically, but don't make them your only verification method.

## Git workflow

Commit and push to `github.com/PamacKR/Atlas` continuously as work happens — **don't wait for approval before committing/pushing** in this repo. The user explicitly opted into this (2026-07-23) on the reasoning that git history makes any bad change trivially reversible. Still use judgment on commit granularity (a coherent chunk of work, not every keystroke) and write real commit messages — the autonomy is about not blocking on a confirmation round-trip, not about being careless.

## Tone in user-facing product copy

Atlas's own UI copy (empty states, dashboard labels, settings) should be plain and functional — this is a workspace tool, not a consumer app trying to be delightful. Favor clarity over personality in anything the *student* sees inside Atlas. This document's guidance is about Claude's engineering behavior; it does not mean the product itself should have a "voice."

## When in doubt

Ask. This project is still being actively shaped — the PRD explicitly leaves several product questions open (`docs/open-questions.md`), and getting the data/reasoning split right matters more than moving fast on any individual feature.
