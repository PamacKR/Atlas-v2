# Atlas MCP agent guide

This document governs how an external reasoning agent should use Atlas's MCP server when answering questions about the user's academic data. It is separate from `AGENTS.md`: `AGENTS.md` governs software work on Atlas, while this file governs retrieval, clarification, and response behavior at query time.

## Core responsibility

Atlas is the source of truth. The connected agent is responsible for reasoning and explanation, but it must base factual claims about the user's courses and material on data actually retrieved from Atlas.

Useful output is better than forced output. If the requested material is not present, say so plainly. Never invent a lecture, infer its contents from a nearby file, or continue broadening a search indefinitely just to produce a summary.

## Default for Pamac

For every academic-related request, use Atlas MCP before local files. Atlas may contain Google Classroom and Google Drive material that has no local copy, so creating a local working file or searching the repository is not an acceptable first response.

If the `atlas_*` tools are not available in the current client, treat that as a connection or configuration problem. Restore or diagnose the MCP connection when possible; do not silently answer from local files, ask Pamac to repeat the MCP instruction, or pretend that a local-only result is complete. If the connection cannot be restored, report the limitation and use a fallback only after Pamac explicitly authorises it.

## Connection mode and write boundary

The server itself still defaults to read-only when no mode is selected. Pamac's
normal project and shared Codex configurations deliberately use
`ATLAS_MCP_MODE=read-write`, which exposes the 11 retrieval tools plus
`atlas_write_memory` and `atlas_create_note`. This is the intended personal-use
surface: profile learning and note persistence are core Atlas workflows, not
exceptional administration tasks.

`ATLAS_MCP_MODE=notes-write` remains available for clients that should create
agent-owned notes but not update profiles. `ATLAS_MCP_MODE=read-only` remains
available for retrieval-only clients. The Atlas `agentAccess` setting is the
master switch for all modes.

The write boundary is narrow. `atlas_write_memory` only replaces a general or
course memory file. `atlas_create_note` only creates a new agent-owned note; it
cannot edit a note Pamac wrote. Neither tool can edit courses, resources,
deadlines, announcements, assignments, or source data.

## Adaptive course profiles

Course memory exists so a fresh conversation can immediately answer each
course in the way Pamac wants. Treat the following as durable profile signals:

- a standing phrase such as "for this course", "always", "from now on", or
  "when you explain this subject";
- a direct course-specific preference about detail, reasoning, simplification,
  bullets, prose, derivations, examples, citations, or tone;
- a correction that clearly describes how future answers for that course
  should differ.

When one of those signals appears, resolve the course, read its current memory
with `atlas_course_briefing`, and update it in the same turn. Expressing the
standing preference is authorisation to store it. Do not ask Pamac to repeat
the preference as a separate save command.

Do not persist a one-off constraint such as "answer this in three bullets" or
"keep this particular answer short" unless Pamac frames it as ongoing or later
repeats the correction. Do not infer preferences from silence, guess that a
subject requires a particular style, or store uncertain academic claims as
facts. Because `atlas_write_memory` fully replaces the file, preserve all
useful non-conflicting existing content and revise or remove only what the new
instruction supersedes.

General preferences belong in general memory. Course-specific preferences
belong only in that course's memory. A preference supplied by Pamac is
user-originated profile data, not an AI-inferred canonical academic
relationship prohibited by PRD section 17.

## Persistent note creation

When Pamac asks for reusable academic notes, a study guide, revision material,
or a lecture summary intended as notes, create the finished artifact in Atlas
with `atlas_create_note` in the same turn. The note-like request itself
authorises persistence, so do not require the extra phrase "save this". Use the
resolved course when one is clear; use General only for genuinely cross-course
or unsorted material.

Do not save ordinary factual answers, quick explanations, transient drafts, or
casual question-and-answer exchanges. If the user asks only for an answer, give
an answer. If the user asks for notes, the durable Atlas note is the primary
artifact and the response should state where it was saved.

## Resolve the request in bounded steps

For a request such as “summarize Lecture 10 from Course X”:

1. Resolve the course against `atlas_overview` and `atlas_course_briefing`.
   - Prefer an exact course-name match.
   - A unique substring match is acceptable.
   - If more than one course matches, ask the user to choose; never silently pick the first one.
   - If the named course is not found, report that directly and ask whether the user meant another course.
   - If the named course does exist but the user accidentally named the wrong course, search only that named course. Do not search other courses or infer which course the user intended. If the requested material is absent there, say so plainly and stop the lookup so the user can correct the course.

2. If the request names one material, call `atlas_resolve_material` inside the resolved course before using broad search.
   - `status: "found"` means there is one exact title match. If `nextAction` is `read_match`, use its indicated `readTool`; if it is `handle_availability`, handle the returned `availability` state and stop or ask rather than launching another search.
   - `status: "ambiguous"` means the server found multiple exact or nearby numbered candidates. Stop and use its `clarification` payload for a blocking user question.
   - `status: "not_found"` means the requested title is not present in that course. Stop. Do not search other courses or keep trying title variations unless the user explicitly asks for a broader investigation.
   - Inspect the returned `availability` before reading. A source can exist but still be pending, OCR-dependent, unsupported, failed, or external.

3. Inspect the course's resource inventory with `atlas_list_resources` when the user asks for a broad inventory or when a deliberate investigation requires it.
   - Use the returned `total`, `offset`, and `truncated` values to decide whether pagination is required.
   - Treat filenames, resource titles, and slide/page ordinals as different things. “Lecture 10” is not automatically the same as “Slide 10.”

4. Use `atlas_search` only as a bounded follow-up for concepts, content, or an explicitly requested broader investigation.
   - Search the exact phrase first, then at most one or two sensible title variants such as “Session 10” or “Notes 10.”
   - Atlas search uses per-word prefix matching, not exact natural-language intent. A hit for the word “10” is not evidence that Lecture 10 exists.
   - Prefer a resource-title match over an incidental mention inside an unrelated document.

5. Read the matched source with `atlas_read_document`, `atlas_read_note`, or the appropriate Classroom-item tool.
   - Read enough of the source to support the requested answer, including all relevant pages/slides when the source is short.
   - If text is unavailable but the readiness report says a local visual is available, use `atlas_read_visual` with the Atlas id. Do not request or expose arbitrary filesystem paths.

## Missing or ambiguous numbered material

If the requested number is absent but nearby numbered items exist, stop and ask a concise clarification question. For example:

> I couldn't find Lecture 10. I found Lecture 9 and Lecture 11–12. Did you mean one of those, or is Lecture 10 stored under another title?

If the user confirms that the missing number is definitely correct, say that it is not currently available in Atlas and stop. Do not keep trying alternate titles or read unrelated resources merely because they contain the same number or the word “lecture,” unless the user explicitly asks for a broader investigation.

If the course contains resources that appear to belong to another subject, mention the mismatch as a data-quality caveat. Do not silently reassign the material or assume the course label is correct.

## Current development priority

The first priority is the agent's retrieval and decision process, not the wording of its final answer. Design and test how it resolves the request, chooses MCP tools, recognizes found/missing/ambiguous results, stops, and pauses for clarification. The response wording and presentation can be refined after that control flow is reliable.

## When to ask instead of continuing

Ask the user when:

- the course name is ambiguous or missing;
- multiple resources could be the requested lecture;
- a numbered item is missing but adjacent items are present;
- the source exists but is unsupported, empty, or awaiting OCR and another source would change the answer;
- the requested action would move, delete, overwrite user-authored content, or otherwise change canonical Atlas data and the user has not clearly authorised it.

When the client supports structured user input, use it for a short choice list. For Codex specifically, use the blocking structured question interaction used in Plan mode: the current task must pause until the user answers. Do not continue searching, spend tokens on more guesses, or produce the final answer while waiting for that response. Otherwise ask the same question in plain language. Do not hide a clarification question inside a long explanation.

`atlas_resolve_material` can also use standard MCP form elicitation when the connected client advertises it. In that case the tool call itself pauses, and an accepted choice returns the selected material as `found`; a declined/cancelled choice is a stop condition. If the client does not support elicitation, the tool returns the same candidates and clarification payload for the agent's own interaction mechanism. This is a client question, not an Atlas UI popup.

## Response standard

For a successful academic summary:

- identify the exact source used;
- mention any course or filename mismatch;
- summarize only the retrieved content;
- distinguish what the source explicitly says from any interpretation or inference;
- state when the source does not contain a final answer or conclusion.

For an unsuccessful lookup, be direct:

> I couldn't find that material in Atlas.

Then give the closest verified candidates, if any, and ask one focused question. Do not present a summary of a nearby lecture as though it were the requested one.

## Search and token discipline

- Do not repeat the same search with increasingly broad keywords without new information.
- Do not inspect full unrelated documents to manufacture a result.
- Do not treat a loose search hit as a match when the request names a specific course, lecture, page, or assignment.
- Stop after the bounded lookup and clarification path above unless the user explicitly asks for a broader investigation.

## Data boundary

MCP reads and writes remain separate responsibilities. Pamac's normal
`read-write` connection can update agent memory and create agent-owned notes
under the rules above, but it cannot mutate canonical academic records. Asking
for a note-like artifact authorises creation of that new note. Expressing a
durable response preference authorises the corresponding profile update.
Reading or summarising alone never authorises moving, deleting, overwriting
user-authored content, or otherwise changing Atlas data.
