# Connecting an AI agent to Atlas (MCP server)

Atlas exposes its data — courses, resources, extracted document text, deadlines, notes, and per-course memory — to any MCP-capable AI tool via a standalone server. The current architecture and data boundary are documented in `ARCHITECTURE.md`; this file is the "how do I actually turn it on" guide.

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
      "args": ["scripts/run-mcp-server.js"],
      "env": {
        "ATLAS_MCP_MODE": "read-only"
      }
    }
  }
}
```

### Shared Codex host configuration

For Codex desktop, Codex CLI, and the Codex IDE extension, the reliable shared
configuration is the host-level `C:\Users\Pamac\.codex\config.toml`. Add this
table there, using the actual path to this checkout if it ever moves:

```toml
[mcp_servers.atlas]
command = 'node'
args = ['scripts/run-mcp-server.js']
cwd = 'C:\Users\Pamac\Downloads\Atlas-v2'
env = { ATLAS_MCP_MODE = 'read-only' }
startup_timeout_sec = 30
tool_timeout_sec = 60
enabled = true
```

The ChatGPT desktop app, Codex CLI, and IDE extension share this host
configuration. Atlas uses a local STDIO server, so the Codex host starts its
own server process when a client needs it. A separate permanently running
daemon is not necessary and would not be the process that a new chat uses.
Restart the client after changing the configuration, then use `/mcp` to check
that `atlas_*` tools are present.

## Safe MCP mode

Atlas MCP connections default to **read-only**. If `ATLAS_MCP_MODE` is absent,
invalid, or set to `read-only`, the server exposes exactly the 11 read-only
`atlas_*` tools. The project configuration above sets the safe value explicitly.

`ATLAS_MCP_MODE=notes-write` exposes the 11 read-only tools plus
`atlas_create_note` for explicitly requested agent-owned study notes. It does
not expose `atlas_write_memory`. This is the recommended mode for Pamac's
permanent default Hermes connection.

The full write-capable mode is separate:

- `atlas_write_memory`
- `atlas_create_note`

A process may explicitly opt into the full surface with:

```text
ATLAS_MCP_MODE=read-write
```

`read-write` exposes all 13 tools and must not be added to the normal Hermes or
Codex client configuration without a deliberate decision. The `agentAccess`
setting remains the master switch and can disable all MCP operations.

**Claude Code** picks this up automatically — just open this project and (re)start Claude Code; you'll likely get a one-time prompt to approve running the `atlas` server. No path needed at all.

**Codex desktop / CLI / IDE** should use the shared host configuration above. Do
not rely on the project-level `.mcp.json` being discovered by those clients.

**ChatGPT web** does not read local Codex configuration files and cannot start
this local server. It can use remote MCP-backed tools supplied by installed
plugins, but local Atlas retrieval should use the ChatGPT desktop app or a
local Codex client.

**Cursor and other MCP clients** can use the project-level `.mcp.json` or their
own native MCP configuration.

After it's connected, the project read-only configuration should list exactly
11 `atlas_*` tools. A permanent Hermes profile configured with
`ATLAS_MCP_MODE=notes-write` should list 12 tools, adding only
`atlas_create_note`; `atlas_write_memory` should remain absent. The full
`read-write` mode lists all 13 tools and is not the recommended normal mode.
Clients that support standard MCP form elicitation can receive the resolver's
blocking candidate question directly; other clients receive a structured
fallback result.

## What the agent can do

When using Atlas MCP for an academic request, the connected agent should also read [`MCP_AGENT_GUIDE.md`](MCP_AGENT_GUIDE.md). That guide defines the resolver-first lookup, course/resource disambiguation, missing-lecture clarification, stop conditions, and no-invention rules; it is intentionally separate from the software-development instructions in `AGENTS.md`.

The MCP surface includes course readiness, full locally-synced Classroom announcement/assignment reads, and General/unsorted agent-note creation when the connection uses `notes-write` or `read-write` mode. Document-page search hits include the parent resource id/title, source, and ordinal so the agent can follow a page result directly into `atlas_read_document`.

`atlas_read_visual` returns one local PDF page or image/handwritten scan as an MCP image block. The agent supplies an Atlas `resource_id` or `note_id`, never a filesystem path. PDFs are rendered locally one page at a time; small images remain in their original format, while unusually large images are safely resized. This gives a vision-capable client the visual surface without Atlas calling an AI service or exposing arbitrary files.

Read-only operations include: search everything, list a course's resources/deadlines,
inspect a course's text readiness, read a specific page/slide/sheet/section
range of a document (or, called with no range, get an outline of the whole
document's parts), read a note, and read the full locally-synced body of a
Classroom announcement or assignment. This transparently includes text read
from Classroom Drive attachments — Docs, Slides, Sheets, and PDFs the professor
shared, plus links discovered inside them — fetched and extracted without ever
being downloaded into Atlas's local storage.

Write operations are deliberately opt-in and unavailable in the default mode.
`notes-write` enables only `atlas_create_note`, for explicit requests such as
saving a generated study guide or revision notes. `read-write` additionally
enables `atlas_write_memory`, which replaces course or general agent memory and
should remain disabled for normal study-note creation. Both operations still
require an explicit user request under `MCP_AGENT_GUIDE.md`.

## If your AI tool doesn't support MCP

Open the course in Atlas and click **"Export for AI"** on its detail page — it writes a plain-Markdown summary (profile, deadlines, announcements, resource/note inventory) to `Downloads/Atlas-Storage/exports/`, which you can paste into any chat tool by hand.

## Verifying it works without a real AI tool

```bash
npm run verify:mcp
```

This command builds Atlas, seeds a temporary database, and verifies the real
MCP protocol. It first starts the server with no mode override and confirms the
11-tool read-only surface, all required read paths, ambiguity handling,
Atlas-ID visual validation, and unchanged temporary database contents. It then
starts a temporary `notes-write` server and confirms that only
`atlas_create_note` is added, followed by a temporary `read-write` server for
memory/note regression coverage. It never uses `Downloads/Atlas-Storage`.
