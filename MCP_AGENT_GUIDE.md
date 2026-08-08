# Atlas MCP agent guide

This document governs how an external reasoning agent should use Atlas's MCP server when answering questions about the user's academic data. It is separate from `AGENTS.md`: `AGENTS.md` governs software work on Atlas, while this file governs retrieval, clarification, and response behavior at query time.

## Core responsibility

Atlas is the source of truth. The connected agent is responsible for reasoning and explanation, but it must base factual claims about the user's courses and material on data actually retrieved from Atlas.

Useful output is better than forced output. If the requested material is not present, say so plainly. Never invent a lecture, infer its contents from a nearby file, or continue broadening a search indefinitely just to produce a summary.

## Resolve the request in bounded steps

For a request such as “summarize Lecture 10 from Course X”:

1. Resolve the course against `atlas_overview` and `atlas_course_briefing`.
   - Prefer an exact course-name match.
   - A unique substring match is acceptable.
   - If more than one course matches, ask the user to choose; never silently pick the first one.
   - If the named course is not found, report that directly and ask whether the user meant another course.

2. Inspect the course's resource inventory with `atlas_list_resources`.
   - Use the course's `resourceTotal` and the tool's `truncated` value to decide whether pagination is required.
   - When the request contains a number, inspect all likely numbered resource titles before concluding that the item is absent.
   - Treat filenames, resource titles, and slide/page ordinals as different things. “Lecture 10” is not automatically the same as “Slide 10.”

3. Use `atlas_search` only as a bounded follow-up.
   - Search the exact phrase first, then at most one or two sensible title variants such as “Session 10” or “Notes 10.”
   - Atlas search uses per-word prefix matching, not exact natural-language intent. A hit for the word “10” is not evidence that Lecture 10 exists.
   - Prefer a resource-title match over an incidental mention inside an unrelated document.

4. Read the matched source with `atlas_read_document`, `atlas_read_note`, or the appropriate Classroom-item tool.
   - Read enough of the source to support the requested answer, including all relevant pages/slides when the source is short.
   - If text is unavailable but the readiness report says a local visual is available, use `atlas_read_visual` with the Atlas id. Do not request or expose arbitrary filesystem paths.

## Missing or ambiguous numbered material

If the requested number is absent but nearby numbered items exist, stop and ask a concise clarification question. For example:

> I couldn't find Lecture 10. I found Lecture 9 and Lecture 11–12. Did you mean one of those, or is Lecture 10 stored under another title?

If the user confirms that the missing number is definitely correct, perform one additional bounded search for alternate titles. If it still cannot be found, say that it is not currently available in Atlas and stop. Do not read unrelated resources merely because they contain the same number or the word “lecture.”

If the course contains resources that appear to belong to another subject, mention the mismatch as a data-quality caveat. Do not silently reassign the material or assume the course label is correct.

## When to ask instead of continuing

Ask the user when:

- the course name is ambiguous or missing;
- multiple resources could be the requested lecture;
- a numbered item is missing but adjacent items are present;
- the source exists but is unsupported, empty, or awaiting OCR and another source would change the answer;
- the requested action would write, move, delete, or otherwise change Atlas data and the user has not clearly authorized it.

When the client supports structured user input, use it for a short choice list. Otherwise ask the same question in plain language. Do not hide a clarification question inside a long explanation.

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

MCP reads and writes are separate responsibilities. Reading and summarizing does not authorize creating notes, changing memory, moving resources, or deleting data. Use write tools only when the user explicitly requests that specific change, and describe what will be written before doing it when the scope could be misunderstood.
