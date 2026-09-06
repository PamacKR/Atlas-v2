# Atlas

![Status: personal-use development build](https://img.shields.io/badge/status-personal--use%20development-d9a441)
![Platform: Windows desktop](https://img.shields.io/badge/platform-Windows%20desktop-30343b)
![Built with Electron](https://img.shields.io/badge/built%20with-Electron-47848f)

> A local-first academic workspace for keeping courses, resources, notes, deadlines, and classroom material in one searchable place - then making that information available to the AI agent of your choice.

Atlas is a personal-use Windows desktop application for organizing a student's academic life. It brings together lecture material, readings, notes, handwritten scans, assignments, announcements, deadlines, and course metadata from manual uploads, local folders, Google Drive, Google Classroom, and Ashoka Planner.

Atlas is deliberately **not an AI application**. It is the persistent source of truth. An external AI agent - Claude Code, Codex, Cursor, or another MCP-capable tool - reads Atlas data through a local MCP server and is responsible for reasoning, studying, summarizing, explaining, and helping with assignments.

> **Project status:** Atlas is an actively developed personal-use build. It is structured and documented like a public release, but it is not currently distributed as a public product.

## Contents

- [What Atlas does](#what-atlas-does)
- [Screenshots and demo](#screenshots-and-demo)
- [Core functionality](#core-functionality)
- [AI agent integration](#ai-agent-integration)
- [Data ownership and privacy](#data-ownership-and-privacy)
- [Current scope and known limitations](#current-scope-and-known-limitations)
- [Getting started](#getting-started)
- [Development and verification](#development-and-verification)
- [Project documentation](#project-documentation)

## What Atlas does

Atlas is designed around one rule:

> **Atlas owns the data. The AI agent owns the reasoning.**

The application provides the durable academic workspace:

- Courses and course metadata
- Course-specific resources and notes
- Deadlines and assignment tracking
- Google Classroom announcements, assignments, and classwork
- Google Drive inbox imports
- Local folder watching
- Searchable text extracted from documents
- Handwritten scans and optional local OCR
- Per-course and general memory for an external agent
- Backups, storage management, and data reset controls

The connected agent can then use that workspace to answer questions such as:

- "What is due this week?"
- "What did we cover in this course?"
- "Find the section about market failure in my lecture material."
- "Summarize pages 214 to 220 of this textbook."
- "Which resources still need OCR before you can read them?"
- "Create a study guide from the material I selected."

Atlas does not generate those answers itself. It retrieves the relevant source material and gives the agent enough structure to reason over the real data.

## Screenshots and demo

Media will be added as the personal-use workflow settles. This section is intentionally ready for screenshots and a video walkthrough.

| Surface | Suggested media |
| --- | --- |
| Dashboard | Overview of courses, upcoming deadlines, announcements, recent resources, and notes |
| Course workspace | Course overview, resources, notes, deadlines, Classroom content, files, and readiness |
| Resources and preview | Resource library, filters, document preview, OCR review, and fullscreen reading |
| Notes | Markdown editor, handwritten scan view, OCR review, and agent-note filter |
| Calendar | Month, week, and day deadline views with filters and upcoming items |
| AI integration | Settings > AI agent and an example connected-agent workflow |

<!--
When media is ready, replace this block with real assets:

![Atlas dashboard](docs/media/dashboard.png)

[Watch the Atlas walkthrough](https://example.com)
-->

## Core functionality

### Dashboard

The Dashboard is the daily starting point for the workspace. It provides:

- A compact overview of active courses
- Counts for courses, resources, notes, and deadlines due soon
- Upcoming deadlines
- Recent resources and activity
- Recent notes
- Google Classroom announcements and new assignments
- Per-item clearing and "Mark all read" for new Classroom items
- A user-curated important-announcement section
- Direct links into the relevant course, resource, note, or Calendar view

Dashboard data updates when local changes or sync events occur, without requiring a relaunch or manual page switching.

### Courses and course workspaces

The Courses page is the main organizational layer of Atlas.

Users can:

- Create courses with a name, code, and term
- Import courses from Ashoka Planner
- Edit course names, codes, and terms
- Archive and unarchive courses without deleting their data
- Delete a course and its local content through a confirmation flow
- Filter courses by semester or term
- Switch between Grid and List views
- Sort courses by name, term, deadlines, resources, or notes
- Open a dedicated course workspace

Each course workspace includes:

- An overview with recent resources, recent notes, and upcoming deadlines
- Resource and note previews
- A unified deadline list
- Announcements
- Assignments
- Classroom classwork
- Watched folders
- Files and source information
- Classroom connection controls
- An Agent readiness report
- Export for AI

Archived courses disappear from the normal active-course list but remain searchable and retain their files, notes, deadlines, and memory.

### Resources and document library

The Resources page is a unified library for material from every source. Resources can be filtered by course, source, and kind, sorted, and displayed in Grid or List view.

Atlas supports:

- Manual file uploads
- Drag-and-drop uploads
- Files copied from watched local folders
- Files imported from a Google Drive inbox
- Resources linked from Google Classroom
- PDF, image, Markdown, plain-text, configuration, and common document formats
- DOCX text extraction and preview
- XLSX spreadsheet extraction and HTML-table preview
- PPTX slide text and outline extraction
- CSV, TSV, JSON, XML, HTML, RTF, and other readable text formats
- Fullscreen previews
- PDF page navigation and zoom controls
- Opening local files in the system browser
- Opening supported Office files in Google Drive for full-fidelity viewing

Atlas keeps the original file in managed local storage and stores its metadata and extracted text in SQLite. The original source remains available even when extraction or OCR fails.

#### Page-aware extraction

Supported documents are broken into searchable parts rather than treated as one large block of text:

- PDFs become pages
- PowerPoint files become slides
- Excel files become sheets
- Word and text documents become readable sections or chunks

Search results can therefore point to the relevant page, slide, sheet, or section. An agent can read only the required range instead of loading an entire large document.

### Notes

Atlas notes are Markdown at their core and are edited through a live WYSIWYG-style editor powered by Milkdown.

The note system includes:

- Notes organized by course
- General or unsorted notes with no course assigned
- Live Markdown shortcuts for headings, lists, dividers, and formatting
- Math rendering through KaTeX
- Autosaving
- Embedded images
- Markdown export files stored alongside course files
- Grid and List views
- Sorting by recency, title, or course
- Course filtering
- A separate view for notes created by an AI agent
- A "Move to course" action for unsorted notes
- Empty-note cleanup when a new note is closed without content

#### Handwritten scans and OCR

Scans are first-class notes rather than temporary attachments. Atlas supports:

- Multi-page PDF scans
- Individual images
- Multi-select import
- Drag-and-drop scan import
- Viewing the original scan inside the note overlay
- Optional, on-demand local OCR through Tesseract.js
- Review-before-accepting OCR output
- Discarding OCR output without changing the note
- Inserting accepted OCR text into the note

OCR is never run silently on import. This preserves the original scan and avoids treating imperfect handwriting recognition as authoritative.

The same local OCR pipeline can be run on image-based PDFs from the Resources page. Extracted text is reviewed before it is saved and indexed.

### Deadlines and academic planning

Deadlines provide one timeline for manually created and Classroom-synced work.

Users can:

- Add deadlines manually
- Choose types such as assignment, reading, quiz, lab, project, exam, or other
- Set or clear due dates and times
- Add descriptions and references to resources or notes
- Mark work complete
- Edit or delete deadlines
- View deadlines from Courses, Dashboard, and Calendar

The Calendar provides:

- Month view
- Week view
- Day view
- Mini-calendar navigation
- Course filters
- Deadline-type filters
- Upcoming items
- Add-deadline flow
- Persistent filter settings

Classroom-synced deadlines handle source conflicts explicitly. If the user edits a field locally, that field is protected from being overwritten by a later sync while other fields can still update. The UI marks local overrides and provides a "Reset to Classroom version" action. Items removed from Classroom remain visible as removed-at-source until the user dismisses them.

### Google Drive integration

Google Drive can act as a designated academic inbox:

- The user selects one Drive folder
- Atlas scans that folder and its subfolders
- New files appear in a review queue
- Each file can be assigned to a course
- Each file can become a Resource or a Note
- Files can be imported individually or in bulk
- Files can be ignored without being repeatedly rediscovered
- Imported files are downloaded into Atlas's local managed storage
- Deleted, not-yet-reviewed Drive files are removed from the pending queue

Drive sync is polling-based while Atlas is open, with a full scan on launch. The interval is configurable in Settings.

Atlas can also upload supported local files to an Atlas-managed Drive preview folder when the user chooses "Open in Google Drive." Preview uploads are cached so later opens do not repeat the upload.

### Google Classroom integration

Google Classroom is a separate connection from Google Drive. Atlas supports:

- Discovering Classroom courses
- Reviewing new Classroom courses before mapping them
- Mapping a Classroom course to an existing Atlas course
- Creating a new Atlas course from a Classroom course
- Connecting an individual course from its course workspace
- Syncing assignments
- Mirroring assignments into the deadline timeline
- Syncing announcements
- Syncing ungraded classwork material
- Reading full locally synced announcement and assignment bodies
- Showing Classroom attachments and related Atlas resource ids
- Disconnecting a course and removing its synced Classroom content after confirmation

Course mapping is always explicit. Atlas may suggest a name match, but it does not silently decide which Atlas course a Classroom course belongs to.

Classroom attachments are generally represented as links rather than downloaded copies. The agent can still read supported linked material through Atlas's remote extraction path when the source permits it.

### Local folder watching

Users can assign a local folder to a course. Atlas watches it for:

- New files to import into that course
- Files removed from the source folder
- Changes that occurred while Atlas was closed

The mapping is explicit and course-specific. Atlas does not guess which course a folder or file belongs to.

Atlas also watches each course's own managed storage folder so files manually placed there remain visible in the application and files manually removed there do not leave stale resource records behind.

### Search

Global search uses SQLite FTS5 and searches across:

- Course names and metadata
- Resource titles
- Note titles and content
- Extracted document text
- OCR text
- Classroom announcements
- Classroom assignments

Results are grouped into:

1. Courses
2. Resource and note names
3. In-document content
4. Classroom items

Document-page hits include the parent resource title, source, and page/slide/sheet ordinal. Clicking a result opens the correct resource, note, Classroom item, or page target.

### Settings and desktop workflow

Settings includes:

- Dark and Light themes
- Configurable keyboard shortcuts
- A generated keyboard-shortcut cheat sheet
- Per-source sync schedules
- Per-source and global "Sync now"
- Last-sync timestamps
- Inline sync errors
- Google Drive connection and folder configuration
- Google Classroom connection
- Pending Drive-file review
- Pending Classroom-course review
- Agent/MCP access toggle
- MCP configuration copy action
- Storage usage by course
- Text-extraction review
- Local backup frequency
- Immediate backup creation
- Individual and bulk backup deletion
- Guarded deletion of all local Atlas data
- About and version information

The command palette, opened with Ctrl+K, can navigate to Atlas pages and items or run actions such as creating a note, syncing a source, exporting course context, switching themes, running OCR, and opening a resource.

The keyboard shortcut system supports rebinding, conflict confirmation, reset-to-default, and a global Ctrl+Shift+N quick-capture shortcut that works even when Atlas is not the focused window.

## AI agent integration

Atlas exposes a local MCP server over stdio. Any compatible external agent can connect to the same Atlas database without Atlas making an AI or cloud-model request.

### What the MCP server exposes

The default project MCP surface is read-only and contains eleven tools:

| Tool | Purpose |
| --- | --- |
| atlas_overview | Load active courses, counts, current semester, and general agent memory |
| atlas_course_briefing | Load one course's memory, upcoming deadlines, announcements, and inventory summary |
| atlas_resolve_material | Resolve a named resource or note inside one course before reading it |
| atlas_course_readiness | Report which course material has usable text, needs OCR, is pending, failed, unsupported, or external |
| atlas_search | Search names, notes, extracted pages, announcements, and assignments |
| atlas_list_resources | List a course's resources with extraction status and pagination |
| atlas_list_deadlines | List upcoming deadlines globally or for one course |
| atlas_read_document | Read a document outline or a bounded page, slide, sheet, or section range |
| atlas_read_visual | Return one PDF page, image, or handwritten scan as MCP image content |
| atlas_read_note | Read a note's full Markdown content |
| atlas_read_classroom_item | Read a full locally synced announcement or assignment |

`ATLAS_MCP_MODE=notes-write` adds only `atlas_create_note`. The broader
`ATLAS_MCP_MODE=read-write` mode adds both `atlas_create_note` and
`atlas_write_memory`. Pamac's normal project and shared Codex configurations
use `read-write` so requested reusable academic notes are saved in Atlas and
durable per-course response preferences are learned without a separate save
command.

### Retrieval behavior

The MCP workflow is intentionally bounded:

- A new conversation starts with the current Atlas overview.
- A named course is resolved before course-specific retrieval.
- A named material is resolved before broad content search.
- Exact matches are preferred.
- Ambiguous matches produce a clarification question instead of a guess.
- A missing material produces a direct not-found result instead of endless alternate searches.
- A requested item is not silently replaced with a nearby lecture or unrelated search hit.
- Document outlines and page ranges keep large reads targeted.
- Visual reads use Atlas ids only; the agent cannot provide an arbitrary filesystem path.
- The server's read-only fallback cannot write Atlas data. Pamac's normal `read-write` connection may create agent-owned notes when he asks for a reusable note-like artifact and may update course memory when he expresses a durable response preference. It still cannot edit canonical academic records, overwrite user-authored notes, or delete anything.

When a connected client supports standard MCP form elicitation, an ambiguous material lookup can pause and ask the user to choose from the returned candidates. Clients without that capability receive the same structured clarification data for their own interaction mechanism.

The full retrieval and clarification contract is documented in [MCP_AGENT_GUIDE.md](MCP_AGENT_GUIDE.md).

### Static fallback for non-MCP tools

Each course has an **Export for AI** action that writes a plain Markdown context file containing the course profile, deadlines, announcements, resources, and notes. This can be pasted into an AI tool that does not support MCP.

### Connecting an agent

The repository includes a portable project-level [.mcp.json](.mcp.json) configuration:

~~~json
{
  "mcpServers": {
    "atlas": {
      "command": "node",
      "args": ["scripts/run-mcp-server.js"],
      "env": {
        "ATLAS_MCP_MODE": "read-write"
      }
    }
  }
}
~~~

For Codex desktop, Codex CLI, and the Codex IDE extension, Atlas is also
registered in the shared host configuration at
`C:\Users\Pamac\.codex\config.toml`. That is the configuration used by new
Codex and ChatGPT desktop chats, including chats that do not independently
discover a project's `.mcp.json`:

```toml
[mcp_servers.atlas]
command = 'node'
args = ['scripts/run-mcp-server.js']
cwd = 'C:\Users\Pamac\Downloads\Atlas-v2'
env = { ATLAS_MCP_MODE = 'read-write' }
startup_timeout_sec = 30
tool_timeout_sec = 60
enabled = true
```

Atlas is a local STDIO server. The Codex host starts a dedicated process on
demand, so it does not need a separate always-running daemon. Restart the
client after changing the host configuration and use `/mcp` to confirm that
the `atlas_*` tools are available. ChatGPT web does not read local Codex
configuration and cannot access this local server.

The full setup instructions for Claude Code, Codex, Cursor, and other MCP-capable tools are in [mcp-setup.md](mcp-setup.md).

### Hermes connection

Hermes uses its own native `mcp_servers` configuration and does not
automatically discover this project-level `.mcp.json`. The default Hermes
profile should use the Atlas server with:

```yaml
mcp_servers:
  atlas:
    command: node
    args:
      - C:/Users/Pamac/Downloads/Atlas-v2/scripts/run-mcp-server.js
    env:
      ATLAS_MCP_MODE: read-write
```

Use `read-write` for Pamac's normal personal workflow so note-like academic
requests persist as agent-owned notes and durable response preferences update
course profiles. Use `notes-write` only for a deliberately restricted client
that may create notes but must not adapt profiles. Restart Hermes after changing
its native MCP configuration.

## Data ownership and privacy

Atlas is local-first:

- The canonical database is SQLite.
- Original files remain in a managed folder on disk.
- Atlas does not call OpenAI, Anthropic, Google Gemini, or any other LLM API.
- OCR runs locally through Tesseract.js.
- No paid API is required by the application.
- Google Drive and Classroom use the user's own OAuth client and account connections.
- Drive and Classroom connections are independent.
- Classroom-linked material is not automatically downloaded when a link is enough.
- External agents never receive arbitrary filesystem access through MCP.
- Agent memory is stored as readable Markdown files, not hidden inside a model service.
- Atlas data can be backed up, inspected, copied, or reset locally.

The default data directory is separate from the repository:

~~~text
Downloads/
  Atlas-Storage/
    atlas.db
    files/
    course-profiles/
    exports/
    backups/
    config/
      google-oauth-client.json
~~~

The exact storage and authentication decisions are documented in [ARCHITECTURE.md](ARCHITECTURE.md).

## Current scope and known limitations

Atlas is complete enough for personal academic use, but several release-oriented items are intentionally still open:

- The project is a personal-use development build, not a public service.
- The Windows installer and packaged-app validation are deferred until public-release preparation.
- First-run and polished empty states are deferred.
- Handwriting OCR quality varies; an external agent's visual reading may be more accurate for difficult scans.
- Local PPTX preview provides extracted slide text and structure rather than pixel-perfect slide layout.
- Some file types and external links cannot provide locally extracted text.
- Reading/coverage tracking for resources is proposed but not yet built.
- Atlas is single-user and desktop-focused.
- Mobile apps, collaboration, general life management, personal finance, fitness, and Gmail integration are out of scope.

The current implementation status and deferred decisions are maintained in [STATUS.md](STATUS.md), [ROADMAP.md](ROADMAP.md), and [open-questions.md](open-questions.md).

## Getting started

### Requirements

- Windows
- Node.js and npm
- A local checkout of this repository
- A Google OAuth desktop credential only if Google Drive or Google Classroom integration is needed

### Install and launch

From the repository root:

~~~bash
npm install
npx @electron/rebuild -f -w better-sqlite3
npm start
~~~

The native better-sqlite3 module must be rebuilt against Electron after a fresh install. The rebuild is normally only needed again after reinstalling dependencies or changing the Electron version.

`npm start` builds the TypeScript and renderer bundles before opening Atlas. For everyday development after the project has already been built:

~~~bash
npm run build
npm run start:fast
~~~

You can also double-click [Launch Atlas.bat](<Launch Atlas.bat>). It starts the already-built app without rebuilding first.

On first launch, Atlas creates `Downloads/Atlas-Storage/` automatically. This folder contains the database, managed files, settings, backups, exports, and agent memory. It is deliberately outside the repository.

### Optional Google setup

Google Drive and Google Classroom are optional. The local-only workflow works without them.

To use either integration:

1. Create a Google Cloud project for your own use.
2. Enable the relevant Google API.
3. Create a Desktop app OAuth credential.
4. Place the credential file at `Downloads/Atlas-Storage/config/google-oauth-client.json`.
5. Connect Drive or Classroom from Atlas Settings.

Drive and Classroom use separate OAuth connections because they may belong to different Google accounts.

For the complete connection flow and troubleshooting notes, see [mcp-setup.md](mcp-setup.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

## Development and verification

Useful commands:

| Command | Purpose |
| --- | --- |
| `npm run build` | Compile the main/preload TypeScript and bundle the renderer |
| `npm start` | Build and launch Atlas |
| `npm run start:fast` | Launch the already-built app |
| `npm run verify` | Run the main Electron regression suite against throwaway data |
| `npm run verify:mcp` | Verify the MCP server over the real MCP protocol |
| `npm run verify:extraction` | Verify local document extraction and page-aware indexing |
| `npm run verify:remote` | Verify remote Classroom attachment fetching with stubbed API calls |
| `npm run verify:readiness` | Verify the course Agent readiness report |
| `npm run verify:command-palette` | Verify command-palette navigation and actions |
| `npm run measure:performance` | Measure startup, navigation, search, mutations, and bundle size |
| `npm run package:win` | Build the configured Windows packaging path |

The verification scripts use isolated temporary Atlas data wherever possible. They are designed to exercise the real Electron application and MCP protocol rather than only checking that TypeScript compiles.

## Project documentation

- [prd.md](prd.md) - Original product requirements and decisions
- [ARCHITECTURE.md](ARCHITECTURE.md) - Technical architecture and data-flow decisions
- [ROADMAP.md](ROADMAP.md) - Build phases, completed milestones, and deferred work
- [STATUS.md](STATUS.md) - Living implementation status and session history
- [MCP_AGENT_GUIDE.md](MCP_AGENT_GUIDE.md) - Retrieval, clarification, stopping, and no-invention rules for connected agents
- [mcp-setup.md](mcp-setup.md) - MCP connection and verification instructions
- [DESIGN.md](DESIGN.md) - UI design and implementation contract
- [open-questions.md](open-questions.md) - Product questions and their recorded resolutions
- [AGENTS.md](AGENTS.md) - Engineering guidance for agents working on this repository

## License and distribution

Atlas is currently a private, personal-use project. Public distribution, licensing, and release packaging will be decided later.
