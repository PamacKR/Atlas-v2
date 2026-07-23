# Open Product Questions

Carried over from `prd.md`'s "Open Product Questions" section, plus decisions made since. When a question is resolved, keep it here with its answer and status rather than deleting it — this is the changelog of product decisions, not just a todo list.

## 1. Notes format

- Should notes support Markdown, rich text, or both?
- Should handwritten annotations be possible directly within the app (vs. only imported)?

**Status:** Open. Leaning toward Markdown-only for typed notes (simpler storage, trivially searchable, no rich-text editor to build/maintain) but not yet decided.

## 2. Synchronization

- How frequently should Classroom and Gmail sync?
- Should synchronization be manual, automatic, or configurable?

**Status:** Open. Deferred to Phase 3 (`ROADMAP.md`) — likely answer is "configurable, defaulting to automatic on an interval," but needs to account for API rate limits on both services before committing to a default.

## 3. Offline behavior

- Which features should remain fully functional without an internet connection?
- How should synchronization conflicts be handled after reconnecting?

**Status:** Partially resolved by the architecture decision to use embedded SQLite (`ARCHITECTURE.md` §2) — everything in the canonical database (viewing, notes, search, manual uploads) works fully offline by construction. What's still open: the conflict-resolution policy for data edited locally and changed at the source between syncs.

## 4. Course lifecycle

- How are semesters archived?
- Should old courses remain searchable by default?

**Status:** Open. Deferred to Phase 5.

## 5. AI provider independence

- While the initial target is Claude Code, should the data structures and documentation remain generic enough to support future reasoning engines without redesigning the platform?

**Status:** Yes, by design. The Context Builder (`ARCHITECTURE.md` §5) and canonical schema are Claude-agnostic; the MCP server (`ARCHITECTURE.md` §6) is one transport on top of them, and the static file-export fallback exists specifically so other AI tools aren't locked out. Course AI profiles (PRD §19) are the one place Claude-specific tuning lives, and even those are just structured preference data Atlas supplies to whatever reasoning engine is in use — not Claude-specific logic.

## New questions raised while documenting the architecture

### 6. Data directory layout

Where do original files (scans, PDFs, uploads) live on disk relative to the SQLite database and app config? Needs a decision before Phase 1 scaffolding starts.

**Status:** Open.

### 7. Google API credential handling

Classroom/Gmail/Drive all need Google Cloud credentials. Does the user bring their own Google Cloud project (OAuth client), or does Atlas ship with one baked in?

**Status:** Resolved — bring-your-own Google Cloud OAuth client, on the free tier, with no billing account attached (per the zero-API-fees constraint in `ARCHITECTURE.md` §0). OCR no longer needs a Google credential at all, since it moved to local Tesseract.js (`ARCHITECTURE.md` §3).

### 8. College Google Workspace access — real risk, not yet verified

The user's primary account for Classroom/Gmail is a **college Google Workspace for Education account**, not their personal Google account. Workspace admins commonly restrict which third-party/custom OAuth apps can access Classroom, Gmail, or Drive API scopes for accounts on the domain — independent of cost, this can block API access outright regardless of what Atlas builds.

**Status:** Open, and blocking for Phase 3 planning. Needs to be checked directly (e.g. attempt a test OAuth consent flow against the college account, or check the school's Google Workspace admin/API-access policy) before Classroom/Gmail sync work is scoped in detail. If the college domain blocks custom OAuth apps, Phase 3 may need a fallback (e.g. manual export/import from Classroom, or scoping sync to the personal Google account only where relevant).

### 9. Personal Google "Pro" subscription and Claude Pro — do they help with anything here?

The user has a Google One/Google AI Pro-type subscription on their personal account and a Claude Pro subscription. Worth being explicit: neither grants API credits or billing-free API access — Google One's AI features are app/web-based (e.g. Gemini in Gmail/Docs), not API quota, and Claude Pro covers Claude.ai/Claude Code usage, not the separate Anthropic API. Since Atlas makes no AI API calls at all (`ARCHITECTURE.md` §0), this is moot for Atlas itself — noted here only so it isn't assumed to unlock some API budget later.

**Status:** Resolved (informational) — not usable for API costs, and not needed given the zero-AI-integration constraint.
