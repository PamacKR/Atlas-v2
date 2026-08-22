# Atlas QA Findings

**QA session:** 2026-08-22 15:25 IST
**Repository:** `Downloads/Atlas-v2`
**Branch tested:** `phase11b-atlas-read-only-mcp`
**Commit tested:** `bcf9dbd` (`feat: add notes-write Atlas MCP mode`)
**Test data:** isolated temporary fixtures plus the existing `Downloads/Atlas-Storage` data
**Code changes during QA:** none. This file is the QA report requested after testing.

## Executive verdict

**Overall: FAIL for unrestricted college-ready sign-off.**

The core local academic workflow is substantially functional and performed well under normal use. However, two confirmed security/data-boundary defects prevent treating Atlas as a safe general academic file store, especially once Drive/Classroom imports are reconnected:

1. A buffer-import filename can escape the managed course directory through path traversal.
2. Markdown preview renders executable HTML and can execute an event-handler payload.

These are not cosmetic issues and should be fixed before importing untrusted or externally sourced files.

## Severity scale

- **Critical:** security or data-integrity defect that can cross an intended boundary or cause serious loss/exposure.
- **High:** serious security, reliability, or release risk that should block normal sign-off.
- **Medium:** material usability, diagnostics, or test-quality problem, but not an immediate data-loss/security blocker.
- **Low:** polish, documentation, or development-only issue.

---

## Confirmed findings

### F-01 — Critical — Buffer upload allows path traversal

**Area:** resource uploads, drag-and-drop imports, Drive buffer imports, other buffer-based file paths.

**Reproduction:**

1. Create or select any course.
2. Call the buffer import path with the filename:

   ```text
   ../../escape.txt
   ```

3. Upload any small buffer.

**Observed:**

Atlas accepted the filename and wrote the file outside the course's managed directory. In the isolated test the resulting path was equivalent to:

```text
.../atlas-qa-hostile-ZrBE2h/escape.txt
```

instead of:

```text
.../atlas-qa-hostile-ZrBE2h/files/Hostile Name Test/escape.txt
```

The returned resource record still retained the traversal-style title.

**Why it matters:**

- Breaks the documented managed-storage boundary.
- Can place imported bytes outside the intended course folder.
- Affects buffer-based paths used by drag/drop and Drive imports, where filenames may come from outside Windows' normal filename restrictions.
- Could lead to stale or orphaned resource records because the file is outside the watched course storage directory.

**Recommended fix:**

- Strip all path components with a safe basename operation.
- Sanitise invalid Windows characters and reserved device names.
- Reject or safely rename `..`, absolute paths, separators, trailing dots/spaces, and reserved names.
- Resolve the final destination and assert it remains inside the intended course directory before writing.
- Apply the same protection to manual uploads, drag/drop, Drive imports, scan imports, and typed-note imports.
- Add regression tests for traversal, absolute paths, UNC paths, separators, and reserved Windows names.

---

### F-02 — High — Markdown preview permits executable HTML / XSS

**Area:** in-app Markdown resource preview and the read-only browser preview route.

**Reproduction payload used in an isolated temporary resource:**

```html
<img src="x" onerror="window.__qaXss=1">
<script>window.__qaScript=1</script>
```

**Observed in the in-app preview:**

- A raw `<script>` element remained in the preview DOM.
- A raw `onerror` attribute remained in the preview DOM.
- The image event handler executed: `window.__qaXss` became `1`.
- No page error was raised, so this is silent execution rather than a visibly failed preview.

**Observed in the browser route:**

The HTML returned by the local resource browser route still contained both `<script>` and `onerror` markup.

The same raw-markup exposure was also confirmed in the read-only browser rendering path for notes. The in-app Milkdown note editor did not execute the tested payload, but the browser export route retained the dangerous markup.

**Why it matters:**

- A malicious Markdown file can execute JavaScript when previewed.
- The risk applies to local files, Drive-imported files, Classroom-linked material, and any other source that eventually reaches Markdown rendering.
- The browser route is especially important because it is intended to open material from outside the main Atlas window.
- Electron context isolation reduces some escalation paths but does not make XSS acceptable.

**Recommended fix:**

- Disable raw HTML in Markdown rendering, or sanitise the generated HTML before insertion.
- Remove event-handler attributes, scripts, dangerous URLs, embedded objects, and unsafe SVG content.
- Use one shared safe-rendering policy for in-app preview and browser preview.
- Add regression tests for `<script>`, `onerror`, `javascript:` URLs, SVG payloads, and malformed HTML.
- Add a stronger production CSP; the current development build reports an insecure CSP warning.

---

### F-03 — High — Production dependency audit contains relevant vulnerabilities

Command run:

```text
npm audit --omit=dev --json
```

Result:

- **8 production-tree vulnerabilities**
- **6 high**
- **2 moderate**
- **0 critical**

Relevant affected packages included:

- `pdfjs-dist` — high-risk advisory involving arbitrary JavaScript execution when opening a malicious PDF.
- `xlsx` — high prototype-pollution and ReDoS advisories; no automatic npm fix was available.
- `brace-expansion`
- `fast-uri`
- `ip-address`
- `nanoid`
- `hono`
- `dompurify`

This is a release/security risk rather than a proof that every advisory is exploitable through Atlas. The PDF and spreadsheet findings are particularly relevant because Atlas deliberately opens PDFs and spreadsheets, and external sync means files should no longer be assumed to be entirely trusted.

**Recommended fix:**

- Prioritise upgrading `pdfjs-dist` to a fixed compatible version.
- Reassess the spreadsheet parser and its security posture; `xlsx` has no automatic npm fix in the installed tree.
- Review whether every vulnerable transitive dependency is reachable at runtime.
- Repeat the audit after the renderer sanitisation work.
- Document any consciously accepted residual risk with a current reason, not only the older “user-owned files” assumption.

---

### F-04 — Medium — Raw technical errors leak into user-facing UI

**Readiness example:**

A deliberately broken DOCX fixture produced a raw JSZip-style message including technical wording and a library documentation URL, equivalent to:

```text
Can't find end of central directory: is this a zip file? ... jszip/documentation/howto/read_zip.html
```

**Settings/sync example:**

A failed sync state could expose raw `ENOENT` text and an internal temporary path to `google-oauth-client.json`.

**Why it matters:**

- The app's documented UI direction calls for plain, functional user-facing copy.
- A student should see what failed and what action is available, not an implementation detail.
- Internal paths and library messages make failures look more alarming and are not useful for most users.

**Recommended fix:**

- Map known extraction/sync failures to concise explanations and recovery actions.
- Keep the original technical message in logs or an optional diagnostic detail area.
- Ensure failed, unsupported, pending, and needs-OCR states remain distinct.

---

### F-05 — Medium/Low — The shipped full regression command has stale hard-coded dates

`npm run verify` currently fails when run on 2026-08-22 because `scripts/verify-app.js` creates deadlines dated 1 August and 15 August 2026, then expects one to appear in the Dashboard's upcoming list.

The failure occurs at the Dashboard check because the fixture deadlines are now past. The application itself correctly filters old deadlines.

A temporary wrapper that substituted future dates allowed the complete test to run through and pass, including the late-stage watcher, persistence, image, Calendar, and Dashboard checks.

**Recommended fix:**

- Generate test dates relative to the current local date.
- Preserve the intended ordering between the fixture deadlines.
- Keep assertions about relative labels and ordering, not fixed historical dates.

---

### F-06 — Low/Medium — Long-name usability risk at smaller window sizes

At a real restored `1280×800` window, long course names, resource names, codes, and deadline titles were heavily truncated.

There was no horizontal overflow, and the design contract explicitly allows ellipsis in constrained contexts. Therefore this was not classified as a definite functional defect. It is still a practical risk for daily use because the Dashboard and list surfaces can become difficult to scan with real course names.

Potential improvements:

- Preserve ellipsis in constrained rows but expose the full value through an accessible tooltip or detail affordance.
- Ensure full names remain immediately available in detail/chooser views.
- Recheck the smallest supported practical window size with all five real courses.

---

### F-07 — Low — Development CSP warning appears on every source launch

The normal development launch reports Electron's insecure Content-Security-Policy warning about missing or unsafe CSP configuration.

The documentation states that this warning should not appear in a packaged build. It did not create a visible in-app failure during QA, but it remains present when using the normal `Launch Atlas.bat` source workflow.

This is not a college-use blocker by itself, but it should be rechecked before packaging or wider distribution.

---

## Verified functionality

The following passed in isolated or real-data testing:

- TypeScript/main/preload/renderer build.
- Dashboard, Courses, Resources, Notes, Calendar, and Settings routing.
- Course Grid/List, semester filtering, sorting, archive flows, and course detail navigation.
- Exposed course-detail tabs: Overview, Deadlines, Files, and Readiness.
- All six Settings panels: Appearance, Sources, Shortcuts, AI & Integration, Storage, and About.
- Calendar Month/Week/Day exclusivity, filters, mini-calendar, and persistence.
- Command palette navigation, keyboard movement, confirmations, and light/dark theme handling.
- Global search, grouped results, page hits, OCR content, keyboard selection, and `Ctrl+L`.
- PDF, DOCX, PPTX, XLSX, image, TXT, Markdown, ZIP unsupported-state, and Classroom link preview paths.
- Notes autosave, title derivation, Markdown shortcuts, math/editor behaviour, image persistence, export mirrors, scan view, OCR review, and Escape handling.
- Invalid date/time rejection, including a leap-day case.
- Watch-folder import, live add, source deletion, and managed-storage watching.
- Mutation freshness without page navigation or relaunch.
- Master-delete confirmation flow in isolated data.
- Real-data startup, navigation, search, previews, and semester-sized list rendering.
- Native Windows launch through `Launch Atlas.bat`.
- Native restore/maximise behaviour and sidebar collapse/expand behaviour.
- Ashoka Planner review panel against the real local `planner.db`.
- Remote extraction fixture limits, local-twin reuse, child-link discovery, and permission error propagation.
- MCP read-only, notes-write, and read-write tool-surface boundaries.
- Real-data read-only MCP overview, readiness, resource pagination, and missing-material stop behaviour.

## Integration limitations during this QA pass

### Google Drive and Google Classroom

The real connections were in the documented expired/revoked-authorisation state. Atlas correctly displayed reconnect-required states and recovery actions.

I did not click through OAuth consent or permission screens and did not enter credentials. Therefore:

- Recovery/error UI: tested.
- Full live reconnect and import round-trip: not tested in this pass.

### Deliberately not treated as current Atlas requirements

- Gmail integration: explicitly out of scope.
- Public installer/packaged-app validation: intentionally deferred in the project documentation.
- PDF zoom memory: documented open product question.
- OCR for remote scanned Classroom PDFs: documented open product question.
- External browser scrollbar styling: outside Atlas's control.

## Data and repository integrity

- No application source files were modified during QA.
- No code fixes were applied.
- No commits or pushes were made.
- Real `Atlas-Storage` counts were unchanged before and after the read-only real-data smoke pass.
- Runtime metadata such as database modification time and sync/runtime state was allowed to update during normal app launch, as authorised for this QA session.
- The real sidebar preference was restored to its original collapsed state after native UI testing.
- Temporary QA databases and fixtures were used for destructive and hostile-input tests.

## Recommended starting order

1. Fix path traversal and filename sanitisation across every import path.
2. Remove executable HTML from Markdown and note browser rendering.
3. Upgrade or replace vulnerable PDF/spreadsheet dependencies where practical.
4. Add regression tests for both security findings before making other polish changes.
5. Replace raw technical errors with plain recovery-oriented UI copy.
6. Repair the stale date assumptions in `scripts/verify-app.js`.
7. Reconnect Drive/Classroom and perform a separate live integration pass.

**No fixes are included in this report.**
