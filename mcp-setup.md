# Connecting an AI agent to Atlas (MCP server)

Atlas exposes its data — courses, resources, extracted document text, deadlines, notes, and per-course memory — to any MCP-capable AI tool via a standalone server. See `phase4-spec.md` §6 for the full design; this file is just the "how do I actually turn it on" instructions.

## Why a separate program, and why it's launched the way it is

The server is a small standalone script (`dist/main/mcpServer.js`), not a feature of the Atlas app window — it needs to answer an agent's questions whether or not Atlas itself happens to be open.

It reads the same SQLite database Atlas uses (`Downloads/Atlas-Storage/atlas.db`), via `better-sqlite3`. That library's native binding is compiled against **Electron's** bundled Node version, not whatever plain Node you have installed — running it with a normal `node` command fails with a `NODE_MODULE_VERSION` mismatch (confirmed directly while building this). So the server must be launched via **Electron's own binary with `ELECTRON_RUN_AS_NODE=1`** set, not `node` directly.

## One-time setup

1. Build Atlas at least once (`npm run build`) so `dist/main/mcpServer.js` exists.
2. Launch the Atlas app at least once, so `Downloads/Atlas-Storage/atlas.db` exists. The server refuses to start (with a clear error) if the database isn't there yet — it never creates one itself.
3. Find your Electron binary's path:
   ```bash
   node -e "console.log(require('electron'))"
   ```
   run from this repo. It'll print something like `...\Atlas-v2\node_modules\electron\dist\electron.exe`.

## Configuration

Add an entry to your AI tool's MCP config, using the Electron path from step 3 and the full path to `dist/main/mcpServer.js` in this repo:

```json
{
  "mcpServers": {
    "atlas": {
      "command": "C:\\path\\to\\Atlas-v2\\node_modules\\electron\\dist\\electron.exe",
      "args": ["C:\\path\\to\\Atlas-v2\\dist\\main\\mcpServer.js"],
      "env": { "ELECTRON_RUN_AS_NODE": "1" }
    }
  }
}
```

Where this JSON goes depends on the tool:

- **Claude Code**: project or user-level MCP config (`.mcp.json`, or via the `claude mcp add` command — see Claude Code's own MCP documentation for the exact file for your setup).
- **Codex**: its MCP server configuration file (check Codex's current docs for the exact path — this has moved between versions).
- **Cursor**: `.cursor/mcp.json` in the project, or the global MCP settings in Cursor's settings UI.

After adding it, restart the tool (or reload its MCP connections) and it should list nine `atlas_*` tools.

## What the agent can do

Read: search everything, list a course's resources/deadlines, read a specific page/slide/sheet/section range of a document, read a note.

Write: create a new note (can never edit or overwrite one you wrote yourself), and update its own persistent memory about you or a specific course — plain Markdown files in `Downloads/Atlas-Storage/course-profiles/`, readable and editable by you at any time, never shown inside the Atlas app itself.

## If your AI tool doesn't support MCP

Open the course in Atlas and click **"Export for AI"** on its detail page — it writes a plain-Markdown summary (profile, deadlines, announcements, resource/note inventory) to `Downloads/Atlas-Storage/exports/`, which you can paste into any chat tool by hand.

## Verifying it works without a real AI tool

```bash
npm run verify:mcp
```

Spins up the server against a temporary seeded database and calls every tool over the real MCP protocol, asserting the responses — not just that it starts without crashing.
