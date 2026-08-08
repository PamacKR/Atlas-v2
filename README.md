# Atlas

*(previously "Academic OS")*

A centralized academic knowledge platform. Atlas is a desktop application that continuously organizes a student's academic life — lecture material, notes, assignments, announcements, deadlines, and handwritten notes — into structured, per-course workspaces pulled automatically from Google Classroom, Google Drive, local folders, and manual uploads. It also reads the content of Classroom Drive attachments (PDFs, Docs, Slides, Sheets — including links discovered inside them, like a professor's course-index spreadsheet) without ever downloading them into local storage.

Atlas is **not** an AI application. It is the source of truth that external AI coding agents — Claude Code or any other MCP-capable tool — use for reasoning, studying, and assignment assistance, via a local MCP server that exposes courses, resources, notes, deadlines, full-text search, and persistent per-course memory.

Gmail is explicitly **not** part of Atlas — considered early on, later decided against entirely as out of scope for this project.

## Philosophy

> Atlas owns the data. The AI agent owns the reasoning.

Atlas never tries to become an AI assistant — it makes no AI/LLM API calls of any kind, ever. No AI agent ever becomes responsible for storing academic information. The two systems have strictly separated responsibilities, and Atlas's data model and documentation are designed to stay understandable by any reasoning engine, not just one specific tool.

## Documents

- [`prd.md`](prd.md) — the original product requirements document.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — technical architecture and the reasoning behind each stack decision.
- [`ROADMAP.md`](ROADMAP.md) — phased development plan for V1.
- [`AGENTS.md`](AGENTS.md) — how an AI coding agent (any of them) should behave, decide, and communicate while building Atlas. `CLAUDE.md` is a thin stub pointing here, kept only because Claude Code looks for that exact filename.
- [`open-questions.md`](open-questions.md) — open product questions from the PRD, with current recommendations/decisions and their status.
- [`DESIGN.md`](DESIGN.md) — the active UI implementation contract for pages, overlays, controls, themes, and visual review.
- [`mcp-setup.md`](mcp-setup.md) — how to connect an MCP-capable AI tool to Atlas's local MCP server.
- [`STATUS.md`](STATUS.md) — living session-by-session log of what's actually been built, found, and fixed; the first thing to read after this file.

## Status

Phases 0–5 and the personal-use scope of Phase 6 are complete. Public-release packaging and first-run/empty-state polish remain intentionally deferred — see [`ROADMAP.md`](ROADMAP.md) and [`STATUS.md`](STATUS.md) for the accurate current detail.

## Connecting an AI agent

Atlas ships a local MCP server (`npm run mcp:server`) that any MCP-capable tool (Claude Code, Codex, Cursor, ...) can connect to for live, queryable access to your courses, resources, notes, and deadlines — see [`mcp-setup.md`](mcp-setup.md) for the exact steps. A project-scoped `.mcp.json` is already checked into this repo, fully portable (no hardcoded paths).

## Running it

```bash
npm install
npx @electron/rebuild -f -w better-sqlite3   # only needed after a fresh install
npm start
```

`better-sqlite3` is a native module and needs to be rebuilt against Electron's ABI (not your system Node) after `npm install` — `npm start` alone will fail with a module version mismatch if you skip that step. On first launch, Atlas creates its data folder at `Downloads/Atlas-Storage` (database + synced/uploaded files) — see `ARCHITECTURE.md` §2. This is intentionally a separate folder from this repo, so nothing about running/developing the app can ever touch real data through git operations.

**Everyday use, without a terminal:** double-click [`Launch Atlas.bat`](Launch%20Atlas.bat) — it `cd`s into this folder and launches the already-built app immediately. The development workflow builds after every code change, so normal launches no longer spend several seconds compiling first. If you ever edit source files yourself, run `npm run build` once before launching.

**Windows packaging is configured but is not yet considered complete**:

```bash
npm run package:win
```

The command is the pending packaging path; a release installer and packaged-app validation still need to be completed. The approved Atlas logo and Windows icon assets are already integrated; packaged-app validation remains deferred until public-release preparation.

For a focused Electron check of the command palette, run `npm run verify:command-palette`. It uses a throwaway data directory and does not touch the real Atlas storage folder.
