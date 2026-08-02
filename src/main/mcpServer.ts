// Standalone MCP server (phase4-spec.md §6) — a separate Node process, NOT
// part of the Atlas Electron app, so it can answer an AI agent's questions
// whether or not the Atlas window happens to be open. Talks over stdio, the
// standard MCP transport every current MCP-capable tool (Claude Code, Codex,
// Cursor) supports.
//
// MUST be launched via Electron's own binary with ELECTRON_RUN_AS_NODE=1,
// not plain `node` — better-sqlite3's native binding is compiled against
// Electron's bundled Node ABI, and a plain Node runtime will fail to load it
// (confirmed directly while building this: NODE_MODULE_VERSION mismatch).
// See mcp-setup.md for the exact command.
import Database from 'better-sqlite3';
import * as fs from 'fs';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getDbPath } from './paths';
import {
  getOverview,
  getCourseBriefing,
  searchAtlas,
  listResources,
  listDeadlines,
  readDocument,
  readNote,
  writeCourseOrGeneralMemory,
  createAgentNote,
} from './contextBuilder';

function openDb(): Database.Database {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) {
    throw new Error(
      `No Atlas database found at ${dbPath}. Launch the Atlas app at least once first — it creates the database on startup.`
    );
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  return db;
}

// Every tool response is JSON text — simplest, most literal way to hand
// back the exact same shape contextBuilder.ts already returns, without a
// second per-tool formatting layer to keep in sync.
function agentAccessAllowed(db: Database.Database): boolean {
  const access = db.prepare("SELECT value FROM app_settings WHERE key = 'agentAccess'").get() as { value: string } | undefined;
  return access?.value !== '0';
}

function jsonResult(db: Database.Database, value: unknown) {
  if (!agentAccessAllowed(db)) {
    return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'Agent access is disabled in Atlas Settings.' }) }] };
  }
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

// Incremental search_index update for a single agent-created note — main.ts's
// own rebuildSearchIndex() does a full delete-and-rebuild of every entity
// type, which is the right call there (a handful of milliseconds, always
// correct) but overkill here for one new row, and duplicating that whole
// function would mean two copies of the same logic drifting apart. This
// only ever adds, never removes, so it can't leave search_index stale for
// anything this server doesn't touch.
function indexNoteForSearch(db: Database.Database, noteId: number, courseId: number, title: string, body: string): void {
  db.prepare("DELETE FROM search_index WHERE entity_type = 'note' AND entity_id = ?").run(noteId);
  db.prepare('INSERT INTO search_index (entity_type, entity_id, course_id, title, body) VALUES (?, ?, ?, ?, ?)').run(
    'note',
    noteId,
    courseId,
    title,
    body
  );
}

async function main(): Promise<void> {
  const db = openDb();
  const server = new McpServer({ name: 'atlas', version: '1.0.0' });

  server.registerTool(
    'atlas_overview',
    {
      description:
        "Get the current semester's active courses plus overall counts, and the general (not course-specific) memory file. Always call this first in a new conversation.",
      inputSchema: {},
    },
    async () => jsonResult(db, getOverview(db))
  );

  server.registerTool(
    'atlas_course_briefing',
    {
      description:
        'Get one course\'s memory file, upcoming deadlines, recent announcements, and an inventory summary. Accepts either a course name or numeric id.',
      inputSchema: { course: z.union([z.string(), z.number()]) },
    },
    async ({ course }) => jsonResult(db, getCourseBriefing(db, course))
  );

  server.registerTool(
    'atlas_search',
    {
      description:
        'Search notes, resources, extracted document pages/slides/sheets, announcements, and assignments. Returns short excerpts and locations (e.g. "Page 214"), never full text — use atlas_read_document/atlas_read_note to read what a hit points at.',
      inputSchema: {
        query: z.string(),
        course: z.union([z.string(), z.number()]).optional(),
        types: z.array(z.string()).optional(),
        limit: z.number().int().positive().optional(),
      },
    },
    async ({ query, course, types, limit }) => jsonResult(db, searchAtlas(db, query, { course, types, limit }))
  );

  server.registerTool(
    'atlas_list_resources',
    {
      description: 'List a course\'s resources (files) with kind, extraction status, and part count.',
      inputSchema: {
        course: z.union([z.string(), z.number()]),
        kind: z.string().optional(),
        limit: z.number().int().positive().optional(),
        offset: z.number().int().nonnegative().optional(),
      },
    },
    async ({ course, kind, limit, offset }) => jsonResult(db, listResources(db, course, { kind, limit, offset }))
  );

  server.registerTool(
    'atlas_list_deadlines',
    {
      description: 'List upcoming deadlines, optionally scoped to one course and/or a number of days ahead.',
      inputSchema: {
        course: z.union([z.string(), z.number()]).optional(),
        days: z.number().int().positive().optional(),
      },
    },
    async ({ course, days }) => jsonResult(db, listDeadlines(db, course, days))
  );

  server.registerTool(
    'atlas_read_document',
    {
      description:
        'Read a specific page/slide/sheet/section range from a resource, by the ordinal numbers atlas_search or atlas_list_resources returned. This is how "chapters 5 to 8" actually gets read — search first to find the range, then read it. Called with neither `from` nor `to`, returns an outline instead (every part\'s label and the total count, no text) — cheap way to see a large document\'s shape (e.g. "847 pages, Chapter 5 starts at 214") before deciding what to actually read.',
      inputSchema: {
        resource_id: z.number().int(),
        from: z.number().int().positive().optional(),
        to: z.number().int().positive().optional(),
      },
    },
    async ({ resource_id, from, to }) => jsonResult(db, readDocument(db, resource_id, from, to))
  );

  server.registerTool(
    'atlas_read_note',
    {
      description: "Read a note's full Markdown content by id.",
      inputSchema: { note_id: z.number().int() },
    },
    async ({ note_id }) => jsonResult(db, readNote(db, note_id))
  );

  server.registerTool(
    'atlas_write_memory',
    {
      description:
        'Replace your persistent memory about the user or a course — what they\'re familiar with, how they like things explained, how a course runs, what\'s already been done. Omit `course` to write the general (cross-course) memory. This fully replaces the file, so include everything still worth keeping, not just what changed. Writes silently — no confirmation needed.',
      inputSchema: {
        course: z.union([z.string(), z.number()]).optional(),
        content: z.string(),
      },
    },
    async ({ course, content }) => {
      if (!agentAccessAllowed(db)) return jsonResult(db, null);
      return jsonResult(db, writeCourseOrGeneralMemory(db, course, content));
    }
  );

  server.registerTool(
    'atlas_create_note',
    {
      description:
        'Create a new note in a course (e.g. a study guide or summary you just produced) so it\'s saved and searchable later. This can only create a new note — it can never edit or overwrite a note the user wrote themselves.',
      inputSchema: {
        course: z.union([z.string(), z.number()]),
        title: z.string(),
        content_markdown: z.string(),
      },
    },
    async ({ course, title, content_markdown }) => {
      if (!agentAccessAllowed(db)) return jsonResult(db, null);
      const result = createAgentNote(db, course, title, content_markdown);
      if (result.ok) {
        const noteRow = db.prepare('SELECT course_id FROM notes WHERE id = ?').get(result.noteId) as { course_id: number };
        indexNoteForSearch(db, result.noteId, noteRow.course_id, title, content_markdown);
      }
      return jsonResult(db, result);
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Atlas MCP server failed to start: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
