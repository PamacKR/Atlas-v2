// Standalone MCP server (Phase 4 architecture §6) — a separate Node process, NOT
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
  getCourseReadiness,
  resolveMaterial,
  searchAtlas,
  listResources,
  listDeadlines,
  readDocument,
  readNote,
  readClassroomItem,
  resolveVisualSource,
  writeCourseOrGeneralMemory,
  createAgentNote,
} from './contextBuilder';
import { renderVisual } from './mcpVisual';

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

type McpMode = 'read-only' | 'notes-write' | 'read-write';

// External MCP connections are read-only unless the launching process explicitly
// opts into note creation or the broader write-capable mode. Invalid or absent
// values stay on the safer default rather than silently widening the tool surface.
function getMcpMode(): McpMode {
  const mode = process.env.ATLAS_MCP_MODE?.trim().toLowerCase();
  if (mode === 'notes-write' || mode === 'read-write') return mode;
  return 'read-only';
}

const MCP_MODE = getMcpMode();

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
function indexNoteForSearch(db: Database.Database, noteId: number, courseId: number | null, title: string, body: string): void {
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
    'atlas_resolve_material',
    {
      description:
        'Resolve one named piece of material inside exactly one course before reading it. Use this first for requests such as "Lecture 10" or a specific note/resource title. It performs title resolution only and returns status found, ambiguous, or not_found. For found, read the returned exact item. For ambiguous, a client supporting MCP form elicitation may be asked to choose and the tool will return the selected item; otherwise stop and use the returned clarification question. Do not keep searching. For not_found, stop unless the user explicitly asks for a broader investigation. This never searches other courses.',
      inputSchema: {
        course: z.union([z.string(), z.number()]),
        query: z.string(),
      },
    },
    async ({ course, query }) => {
      const resolution = resolveMaterial(db, course, query);
      if (!resolution.ok || resolution.status !== 'ambiguous') return jsonResult(db, resolution);

      // MCP elicitation is the portable client-side equivalent of Codex's
      // blocking structured question. Clients that advertise form elicitation
      // can pause the current tool call and show the user the candidates;
      // clients that do not support it receive the same structured payload so
      // their agent can ask through its own interaction mechanism instead.
      try {
        const choiceValues = resolution.clarification.options.map((option) => `${option.type}:${option.id}`);
        const elicited = await server.server.elicitInput({
          mode: 'form',
          message: `${resolution.clarification.question} Choose one, or select Something else if none is correct.`,
          requestedSchema: {
            type: 'object',
            properties: {
              choice: {
                type: 'string',
                title: 'Material',
                oneOf: [
                  ...resolution.clarification.options.map((option, index) => ({
                    const: choiceValues[index],
                    title: option.label,
                  })),
                  { const: 'other', title: 'Something else' },
                ],
              },
              otherQuery: {
                type: 'string',
                title: 'Other material title (optional)',
                description: 'Only fill this in if you selected Something else.',
              },
            },
            required: ['choice'],
          },
        });

        if (elicited.action !== 'accept' || !elicited.content) {
          return jsonResult(db, { ...resolution, nextAction: 'stop', elicitationAction: elicited.action });
        }

        const choice = String(elicited.content.choice ?? '');
        if (choice === 'other') {
          const otherQuery = typeof elicited.content.otherQuery === 'string' ? elicited.content.otherQuery.trim() : '';
          if (!otherQuery) {
            return jsonResult(db, { ...resolution, nextAction: 'stop', elicitationAction: 'other_without_query' });
          }
          return jsonResult(db, {
            ...resolveMaterial(db, course, otherQuery),
            elicitationAction: 'other',
          });
        }

        const selected = resolution.clarification.options.find(
          (option, index) => choice === choiceValues[index]
        );
        if (!selected) {
          return jsonResult(db, { ...resolution, nextAction: 'stop', elicitationAction: 'invalid_choice' });
        }
        const selectedCandidate = resolution.candidates.find(
          (candidate) => candidate.type === selected.type && candidate.id === selected.id
        );
        if (!selectedCandidate) {
          return jsonResult(db, { ...resolution, nextAction: 'stop', elicitationAction: 'missing_choice' });
        }
        return jsonResult(db, {
          ok: true,
          status: 'found',
          nextAction: selectedCandidate.availability === 'readable' ? 'read_match' : 'handle_availability',
          course: resolution.course,
          query: resolution.query,
          match: selectedCandidate,
          selectedByUser: true,
        });
      } catch (error) {
        // Unsupported elicitation is expected for older or simpler MCP
        // clients. Returning the original result keeps the tool useful and
        // lets the connected agent use its own blocking-input mechanism.
        return jsonResult(db, {
          ...resolution,
          elicitation: {
            supported: false,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }
  );

  server.registerTool(
    'atlas_course_readiness',
    {
      description:
        'Report which resources and notes in a course have readable text for the external agent, and which are ready, pending, failed, unsupported, external, or need OCR. This is a deterministic text-availability report, not an assessment of academic quality or comprehension.',
      inputSchema: { course: z.union([z.string(), z.number()]) },
    },
    async ({ course }) => jsonResult(db, getCourseReadiness(db, course))
  );

  server.registerTool(
    'atlas_read_classroom_item',
    {
      description:
        'Read the full locally-synced body or description of one Classroom announcement or assignment, including its course, dates/status, source id, and attached Atlas resource ids. Use atlas_search or atlas_course_briefing first to find the item id.',
      inputSchema: {
        item_type: z.enum(['announcement', 'assignment']),
        item_id: z.number().int(),
      },
    },
    async ({ item_type, item_id }) => jsonResult(db, readClassroomItem(db, item_type, item_id))
  );

  server.registerTool(
    'atlas_search',
    {
      description:
        'Search notes, resources, extracted document pages/slides/sheets, announcements, and assignments. Returns short excerpts and locations (e.g. "Page 214"). Document-page hits include their parent resource id/title, source, and ordinal so atlas_read_document can read the exact page; use atlas_read_note or atlas_read_classroom_item for other hit types.',
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
    'atlas_read_visual',
    {
      description:
        'Return one visual Atlas source through the MCP image content type: a local PDF page or an image resource/handwritten scan. Provide exactly one resource_id or note_id. PDF pages are rendered locally and bounded to a practical image size; images are returned as-is when small enough and safely resized when unusually large. This never accepts an arbitrary filesystem path.',
      inputSchema: {
        resource_id: z.number().int().positive().optional(),
        note_id: z.number().int().positive().optional(),
        page: z.number().int().positive().optional(),
      },
    },
    async ({ resource_id, note_id, page }) => {
      if (!agentAccessAllowed(db)) return jsonResult(db, null);
      const source = resolveVisualSource(db, { resourceId: resource_id, noteId: note_id });
      if (!source.ok) return jsonResult(db, source);
      try {
        const visual = await renderVisual(source, page ?? 1);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  ok: true,
                  target: {
                    type: source.targetType,
                    id: source.id,
                    title: source.title,
                    kind: source.kind,
                    course: source.course,
                  },
                  page: visual.page,
                  pageCount: visual.pageCount,
                  resized: visual.resized,
                },
                null,
                2
              ),
            },
            {
              type: 'image' as const,
              data: visual.data.toString('base64'),
              mimeType: visual.mimeType,
            },
          ],
        };
      } catch (error) {
        return jsonResult(db, {
          ok: false,
          error: error instanceof Error ? error.message : 'Atlas could not render this visual source.',
        });
      }
    }
  );

  server.registerTool(
    'atlas_read_note',
    {
      description: "Read a note's full Markdown content by id.",
      inputSchema: { note_id: z.number().int() },
    },
    async ({ note_id }) => jsonResult(db, readNote(db, note_id))
  );

  if (MCP_MODE === 'read-write') {
  server.registerTool(
    'atlas_write_memory',
    {
      description:
        'Only call this after the user explicitly asks you to update persistent memory. Replace the memory about the user or a course — what they\'re familiar with, how they like things explained, how a course runs, what\'s already been done. Omit `course` to write the general (cross-course) memory. This fully replaces the file, so include everything still worth keeping, not just what changed. Once explicitly authorized, the write itself does not ask for a second confirmation.',
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
  }

  if (MCP_MODE === 'notes-write' || MCP_MODE === 'read-write') {
  server.registerTool(
    'atlas_create_note',
    {
      description:
        'Only call this after the user explicitly asks you to create a note. Create a new note in a course, or omit/null `course` to create it in General/unsorted (e.g. a study guide, summary, or cross-course reference). The note is saved and searchable later. This can only create a new note — it can never edit or overwrite a note the user wrote themselves.',
      inputSchema: {
        course: z.union([z.string(), z.number()]).nullable().optional(),
        title: z.string(),
        content_markdown: z.string(),
      },
    },
    async ({ course, title, content_markdown }) => {
      if (!agentAccessAllowed(db)) return jsonResult(db, null);
      const result = createAgentNote(db, course, title, content_markdown);
      if (result.ok) {
        const noteRow = db.prepare('SELECT course_id FROM notes WHERE id = ?').get(result.noteId) as { course_id: number | null };
        indexNoteForSearch(db, result.noteId, noteRow.course_id, title, content_markdown);
      }
      return jsonResult(db, result);
    }
  );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Atlas MCP server failed to start: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
