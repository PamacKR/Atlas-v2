# Connecting an AI agent to Atlas (MCP server)

Atlas exposes its data — courses, resources, extracted document text, deadlines, notes, and per-course memory — to any MCP-capable AI tool via a standalone server. See `phase4-spec.md` §6 for the full design; this file is just the "how do I actually turn it on" instructions.

## Why a separate program, and why it's launched the way it is

The server is a small standalone script (`dist/main/mcpServer.js`), not a feature of the Atlas app window — it needs to answer an agent's questions whether or not Atlas itself happens to be open.

It reads the same SQLite database Atlas uses (`Downloads/Atlas-Storage/atlas.db`), via `better-sqlite3`. That library's native binding is compiled against **Electron's** bundled Node version, not whatever plain Node you have installed — running it with a normal `node` command fails with a `NODE_MODULE_VERSION` mismatch (confirmed directly while building this). So the server must be launched via **Electron's own binary with `ELECTRON_RUN_AS_NODE=1`** set, not `node` directly.

## One-time setup

1. Build Atlas at least once (`npm run build`) so `dist/main/mcpServer.js` exists.
2. Launch the Atlas app at least once, so `Downloads/Atlas-Storage/atlas.db` exists. The server refuses to start (with a clear error) if the database isn't there yet — it never creates one itself.

That's it — no path-finding step. `scripts/run-mcp-server.js` locates Electron and `mcpServer.js` itself (via `require('electron')` and its own file location), so nothing below hardcodes where this repo happens to sit on disk. Move or re-clone the folder and the same config still works.

## Configuration

This repo already ships a working **`.mcp.json`** at its root:

```json
{
  "mcpServers": {
    "atlas": {
      "command": "node",
      "args": ["scripts/run-mcp-server.js"]
    }
  }
}
```

**Claude Code** picks this up automatically — just open this project and (re)start Claude Code; you'll likely get a one-time prompt to approve running the `atlas` server. No path needed at all.

**Codex / Cursor**: check whether the tool reads project-level `.mcp.json` directly (many do, since it's becoming a de facto convention). If not, copy the same `command`/`args` into that tool's own MCP config file — still no absolute path, since `node` and a path relative to the project root are portable regardless of which tool launches it, as long as it runs with this project as its working directory.

After it's connected, it should list nine `atlas_*` tools.

## What the agent can do

Read: search everything, list a course's resources/deadlines, read a specific page/slide/sheet/section range of a document (or, called with no range, get an outline of the whole document's parts), read a note. This transparently includes text read from Classroom Drive attachments — Docs, Slides, Sheets, and PDFs the professor shared, plus links discovered inside them (e.g. a course-index spreadsheet) — fetched and extracted without ever being downloaded into Atlas's local storage (`remote-attachments-spec.md`).

Write: create a new note (can never edit or overwrite one you wrote yourself), and update its own persistent memory about you or a specific course — plain Markdown files in `Downloads/Atlas-Storage/course-profiles/`, readable and editable by you at any time, never shown inside the Atlas app itself.

## If your AI tool doesn't support MCP

Open the course in Atlas and click **"Export for AI"** on its detail page — it writes a plain-Markdown summary (profile, deadlines, announcements, resource/note inventory) to `Downloads/Atlas-Storage/exports/`, which you can paste into any chat tool by hand.

## Verifying it works without a real AI tool

```bash
npm run verify:mcp
```

Spins up the server against a temporary seeded database and calls every tool over the real MCP protocol, asserting the responses — not just that it starts without crashing. `npm run verify:remote` separately verifies the Classroom Drive-attachment fetching itself (local-copy-first, link-following, failure states), with Google API calls stubbed at the fetcher boundary so it runs offline.
