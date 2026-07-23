# Atlas — Status

Living snapshot of where the project actually is. This is the first thing to read (after `CLAUDE.md`) in a new chat or after context compaction — it should be possible to resume correctly from this file alone plus the other docs it points to, without the user having to re-explain anything.

**Last updated:** 2026-07-23 (session 4)

## Where things stand

- Repo created: [github.com/PamacKR/Atlas](https://github.com/PamacKR/Atlas), private, owned by the user (`PamacKR`).
- Commits in this repo are authored locally as `Claude <noreply@anthropic.com>` (repo-local git config, not global) — the user does not want their `thehawkeye` identity on these commits. Don't change this without being asked.
- Phase 0 (docs) is done. Phase 1 scaffolding has started and the app **runs end to end**: Electron main process, preload/contextBridge, SQLite schema (courses/resources/notes/deadlines/announcements/assignments + FTS5 search index), and a minimal renderer (course list + add-course form) all verified working together.
- Verified: `npm install --ignore-scripts` then `npx @electron/rebuild -f -w better-sqlite3` gets a working native binary (no Visual Studio/build tools needed on this machine — a prebuilt Electron-ABI binary was available). Plain `npm install` fails here because there's no prebuilt `better-sqlite3` binary for the host Node version (v24.18.0) and no C++ build toolchain installed. Documented in `README.md` "Running it".
- App launch confirmed: creates `Downloads/Atlas-Storage/atlas.db` + `files/` on first run, no runtime errors. Not yet visually inspected by the user in a real window (only verified programmatically — process ran, DB file appeared, no crash/log errors). Worth a manual look next session to confirm the UI actually renders as expected.
- Data folder is `Downloads/Atlas-Storage/`, deliberately separate from this repo (`Downloads/Atlas/`) — an earlier pass used the same folder name as the repo and caused the dev database to land inside the git working directory; renamed to avoid any git operation ever touching real data.
- Files in place: all Phase 0 docs, plus `package.json`, `tsconfig.json`, `scripts/copy-assets.js`, `.gitignore`, and `src/{main,preload,renderer}/*` (see `ROADMAP.md` Phase 1 for what's still missing: folder watching, resource viewers, notes UI beyond the stub, dashboard, global search UI).

## Decisions locked in (don't re-litigate)

- **Stack:** Electron + TypeScript, SQLite (`better-sqlite3`, FTS5 for search). See `ARCHITECTURE.md` §1–2.
- **OCR:** local/offline via Tesseract.js — explicitly *not* a cloud OCR API, because of the zero-API-fees constraint. Handwriting accuracy will be mediocre; that's an accepted tradeoff, not a bug. See `ARCHITECTURE.md` §3.
- **Claude integration:** local MCP server exposing a Context Builder query layer; static file export kept as a fallback for non-MCP tools. See `ARCHITECTURE.md` §6.
- **Data directory:** `Downloads/Atlas/` — an Atlas-managed folder, deliberately placed somewhere browsable rather than a hidden system path, so the user can manually add/remove files. DB and config live alongside it. See `ARCHITECTURE.md` §2 and `docs/open-questions.md` #6.
- **Hard guardrails (user-mandated, 2026-07-23):**
  1. Atlas makes **zero AI/LLM API calls internally**, ever. Claude Code (external process, user's own subscription) is the only reasoning engine — this is why MCP was chosen over Atlas calling Claude's API itself.
  2. **Zero paid/metered API usage anywhere in the project**, for anything, without explicit user approval first. All Google API access must stay on the free tier with no billing account attached.
  - Full reasoning in `CLAUDE.md` "Hard guardrails" section and `ARCHITECTURE.md` §0 — treat both as settled requirements, not preferences.
- **Continuity practice:** the user compacts/switches chats deliberately and will give a heads-up first in case last-minute doc changes are needed. This `STATUS.md` file exists specifically so a fresh session can pick up correctly without acting against prior decisions — keep it honest and current.

## Genuinely open (needs a decision, don't assume)

See `docs/open-questions.md` for full detail. Nothing blocking right now — all previously-blocking items are resolved:

- **#8 College Google Workspace access** — resolved 2026-07-23. Verified via OAuth Playground: both Classroom and Gmail read scopes authorize cleanly against the college account, no admin block. Phase 3 can be scoped against the college account.

Still open, lower urgency (not blocking Phase 1): notes format (Markdown vs. rich text, #1), sync frequency/manual-vs-automatic (#2), sync-conflict policy (#3), course/semester archiving rules (#4).

## What's next

User has the app running locally (`npm start`) and should take a look at the actual window to confirm the UI looks/behaves as expected — that hasn't been visually confirmed yet, only verified programmatically. After that, next Phase 1 work: local folder watching (chokidar), manual file upload flow, resource viewer (PDF/image/markdown/text), notes UI beyond the current course-list stub, dashboard, and global search UI wired to the FTS5 index. User has said to commit/push continuously without waiting for approval in this repo (see `CLAUDE.md` "Git workflow") — keep doing that.
