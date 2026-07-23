# Atlas

*(previously "Academic OS")*

A centralized academic knowledge platform. Atlas is a desktop application that continuously organizes a student's academic life — lecture material, notes, assignments, announcements, deadlines, and handwritten notes — into structured, per-course workspaces pulled automatically from Google Classroom, Gmail, Drive, local folders, and manual uploads.

Atlas is **not** an AI application. It is the source of truth that external AI systems — primarily Claude Code — use for reasoning, studying, and assignment assistance.

## Philosophy

> Atlas owns the data. Claude owns the reasoning.

Atlas never tries to become an AI assistant. Claude never becomes responsible for storing academic information. The two systems have strictly separated responsibilities, and Atlas's data model and documentation are designed to stay understandable by any future reasoning engine, not just Claude.

## Documents

- [`prd.md`](prd.md) — the original product requirements document.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — technical architecture and the reasoning behind each stack decision.
- [`ROADMAP.md`](ROADMAP.md) — phased development plan for V1.
- [`CLAUDE.md`](CLAUDE.md) — how Claude (the assistant working on this repo) should behave, decide, and communicate while building Atlas.
- [`docs/open-questions.md`](docs/open-questions.md) — open product questions from the PRD, with current recommendations/decisions and their status.

## Status

Phase 1 scaffolding in progress — see [`ROADMAP.md`](ROADMAP.md) and [`STATUS.md`](STATUS.md) for detail.

## Running it

```bash
npm install
npx @electron/rebuild -f -w better-sqlite3   # only needed after a fresh install
npm start
```

`better-sqlite3` is a native module and needs to be rebuilt against Electron's ABI (not your system Node) after `npm install` — `npm start` alone will fail with a module version mismatch if you skip that step. On first launch, Atlas creates its data folder at `Downloads/Atlas` (database + synced/uploaded files) — see `ARCHITECTURE.md` §2.

Note: if you're running from this source checkout and it happens to live at `Downloads/Atlas` itself (as it does by default), the database/files folder is created inside the repo directory. That's harmless (and gitignored) — it's only a quirk of running from source at that particular path, not something that affects a packaged build.
