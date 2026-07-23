# Atlas — Status

Living snapshot of where the project actually is. This is the first thing to read (after `CLAUDE.md`) in a new chat or after context compaction — it should be possible to resume correctly from this file alone plus the other docs it points to, without the user having to re-explain anything.

**Last updated:** 2026-07-23

## Where things stand

- Repo created: [github.com/PamacKR/Atlas](https://github.com/PamacKR/Atlas), private, owned by the user (`PamacKR`).
- Commits in this repo are authored locally as `Claude <noreply@anthropic.com>` (repo-local git config, not global) — the user does not want their `thehawkeye` identity on these commits. Don't change this without being asked.
- No application code exists yet. Everything so far is documentation/planning (`ROADMAP.md` Phase 0).
- Files in place: `README.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `CLAUDE.md`, `STATUS.md` (this file), `docs/open-questions.md`, `prd.md`.

## Decisions locked in (don't re-litigate)

- **Stack:** Electron + TypeScript, SQLite (`better-sqlite3`, FTS5 for search). See `ARCHITECTURE.md` §1–2.
- **OCR:** local/offline via Tesseract.js — explicitly *not* a cloud OCR API, because of the zero-API-fees constraint. Handwriting accuracy will be mediocre; that's an accepted tradeoff, not a bug. See `ARCHITECTURE.md` §3.
- **Claude integration:** local MCP server exposing a Context Builder query layer; static file export kept as a fallback for non-MCP tools. See `ARCHITECTURE.md` §6.
- **Hard guardrails (user-mandated, 2026-07-23):**
  1. Atlas makes **zero AI/LLM API calls internally**, ever. Claude Code (external process, user's own subscription) is the only reasoning engine — this is why MCP was chosen over Atlas calling Claude's API itself.
  2. **Zero paid/metered API usage anywhere in the project**, for anything, without explicit user approval first. All Google API access must stay on the free tier with no billing account attached.
  - Full reasoning in `CLAUDE.md` "Hard guardrails" section and `ARCHITECTURE.md` §0 — treat both as settled requirements, not preferences.
- **Continuity practice:** the user compacts/switches chats deliberately and will give a heads-up first in case last-minute doc changes are needed. This `STATUS.md` file exists specifically so a fresh session can pick up correctly without acting against prior decisions — keep it honest and current.

## Genuinely open (needs a decision, don't assume)

See `docs/open-questions.md` for full detail. The two most consequential right now:

- **#6 Data directory layout** — where original files/scans live on disk relative to the SQLite DB and app config. Needs deciding before Phase 1 scaffolding starts.
- **#8 College Google Workspace access** — the user's primary Classroom/Gmail account is a college Workspace-for-Education account; school admins often block third-party OAuth apps regardless of cost. Not yet verified. This blocks detailed Phase 3 (sync) planning until checked.

Also still open, lower urgency: notes format (Markdown vs. rich text, #1), sync frequency/manual-vs-automatic (#2), sync-conflict policy (#3), course/semester archiving rules (#4).

## What's next

Per `ROADMAP.md`, the next real step is Phase 1 scaffolding (Electron + TypeScript skeleton, SQLite schema v1) — but the user's last instruction was "docs and planning only" for this session, so no code has been written. Confirm with the user before starting Phase 1 implementation.
