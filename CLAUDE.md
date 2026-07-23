# CLAUDE.md — how Claude works on Atlas

This document describes how Claude (as an engineering collaborator, not as a feature of the product) should operate while building Atlas. It's project-specific guidance layered on top of Claude's general defaults — read it before making architectural calls or writing product-facing copy in this repo.

## Identity in this repo

Commits authored while working on Atlas are made under the local git identity `Claude <noreply@anthropic.com>`, configured per-repo (not globally) so it doesn't affect commits elsewhere on this machine. Don't change this to another identity without being asked.

## The one rule that governs every decision here

> Atlas owns the data. Claude owns the reasoning.

Any time a design choice is ambiguous, resolve it against this line. Concretely:

- Never design a feature where Atlas tries to "reason" about academic content (summarizing, explaining, answering questions) — that's Claude Code's job at runtime, not Atlas's job as a stored feature.
- Never design a feature where Claude Code becomes a place academic data is stored or where the user is expected to re-upload the same material repeatedly. Atlas is the persistent store; Claude is stateless w.r.t. academic content between sessions.
- AI-generated associations (e.g., "this email probably relates to this assignment") may be used transiently to build context for a single request, but must never be written back into the canonical database as if they were fact (PRD §17). If a feature wants to do that, it needs an explicit user confirmation step first — at that point it's a user-originated relationship, not an AI-inferred one.

## Decision-making boundaries

- **Product decisions** (what a feature does, how data is modeled, what's in vs. out of scope) — check `prd.md` and `docs/open-questions.md` first. If a question is already answered there, don't re-litigate it in code review or in passing; if it's genuinely still open, add it to `docs/open-questions.md` rather than silently picking an answer.
- **Architecture decisions** (stack, libraries, schema shape) — check `ARCHITECTURE.md`. If a change would contradict a documented decision there, flag it and update the doc in the same change — don't let code and docs drift.
- **Implementation details** (function names, file layout within a module, internal helpers) — normal engineering judgment, no need to check in.

## How to work in this repo

- Keep `ARCHITECTURE.md`, `ROADMAP.md`, and `docs/open-questions.md` current as living documents — when a decision changes, update the doc in the same commit as the code that changes it, not as an afterthought later.
- Prefer resolving an open question explicitly (move it from `docs/open-questions.md` into the relevant doc with a decision recorded) over quietly working around it.
- Don't build ahead of the current roadmap phase (see `ROADMAP.md`) — e.g. don't start wiring Gmail sync while Phase 1 (local-only workflow) isn't done. Each phase should be a genuinely usable checkpoint on its own.
- Follow Anthropic's general engineering defaults on top of this: no speculative abstraction, no unused config/feature flags, comments only where the *why* isn't obvious from the code, and don't add error handling for cases that can't occur.

## Tone in user-facing product copy

Atlas's own UI copy (empty states, dashboard labels, settings) should be plain and functional — this is a workspace tool, not a consumer app trying to be delightful. Favor clarity over personality in anything the *student* sees inside Atlas. This document's guidance is about Claude's engineering behavior; it does not mean the product itself should have a "voice."

## When in doubt

Ask. This project is still being actively shaped — the PRD explicitly leaves several product questions open (`docs/open-questions.md`), and getting the data/reasoning split right matters more than moving fast on any individual feature.
