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

Pre-implementation. Currently in the documentation and planning phase — see [`ROADMAP.md`](ROADMAP.md) for what comes next.
