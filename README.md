# Atlas

*(previously "Academic OS")*

A centralized academic knowledge platform. Atlas is a desktop application that continuously organizes a student's academic life — lecture material, notes, assignments, announcements, deadlines, and handwritten notes — into structured, per-course workspaces pulled automatically from Google Classroom, Gmail, Drive, local folders, and manual uploads.

Atlas is **not** an AI application. It is the source of truth that external AI coding agents — Claude Code or any other MCP-capable tool — use for reasoning, studying, and assignment assistance.

## Philosophy

> Atlas owns the data. The AI agent owns the reasoning.

Atlas never tries to become an AI assistant. No AI agent ever becomes responsible for storing academic information. The two systems have strictly separated responsibilities, and Atlas's data model and documentation are designed to stay understandable by any reasoning engine, not just one specific tool.

## Documents

- [`prd.md`](prd.md) — the original product requirements document.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — technical architecture and the reasoning behind each stack decision.
- [`ROADMAP.md`](ROADMAP.md) — phased development plan for V1.
- [`AGENTS.md`](AGENTS.md) — how an AI coding agent (any of them) should behave, decide, and communicate while building Atlas. `CLAUDE.md` is a thin stub pointing here, kept only because Claude Code looks for that exact filename.
- [`open-questions.md`](open-questions.md) — open product questions from the PRD, with current recommendations/decisions and their status.

## Status

Phase 1 scaffolding in progress — see [`ROADMAP.md`](ROADMAP.md) and [`STATUS.md`](STATUS.md) for detail.

## Running it

```bash
npm install
npx @electron/rebuild -f -w better-sqlite3   # only needed after a fresh install
npm start
```

`better-sqlite3` is a native module and needs to be rebuilt against Electron's ABI (not your system Node) after `npm install` — `npm start` alone will fail with a module version mismatch if you skip that step. On first launch, Atlas creates its data folder at `Downloads/Atlas-Storage` (database + synced/uploaded files) — see `ARCHITECTURE.md` §2. This is intentionally a separate folder from this repo, so nothing about running/developing the app can ever touch real data through git operations.

**Everyday use, without a terminal:** double-click [`Launch Atlas.bat`](Launch%20Atlas.bat) (or the `Atlas` shortcut on the Desktop, which points to it) — it `cd`s into this folder and runs `npm start` for you. Still rebuilds before launching each time, so it always runs the current code; the console window it opens stays visible so build/runtime errors are easy to see while the app is still under active development.
