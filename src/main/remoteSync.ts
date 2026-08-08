import { getDb } from './db/database';
import { fetchRemoteDriveFile } from './remoteFetch';
import { DiscoveredLink } from './textExtraction';

// Orchestrates remote-attachment reading (remote-attachment architecture) —
// fetching a Classroom Drive attachment's text, and following links found
// inside it, without ever writing a file under Atlas-Storage/files/. Kept
// separate from main.ts's local-file extraction (scheduleExtraction/
// extractAllPendingResources in main.ts) since a resource here has
// kind='link' and no real file_path to read — the bytes, when any are
// fetched at all, exist only for the duration of one extraction call.

// §5.5.3 guards — a link-following graph that isn't bounded can explode.
const MAX_DISCOVERY_DEPTH = 2;
const MAX_CHILDREN_PER_PARENT = 100;
const MAX_TOTAL_PER_COURSE_PER_SYNC = 300;

export interface RemoteSyncProgress {
  courseId: number;
  done: number;
  total: number;
}

// Recognizes the Drive file ID out of the handful of URL shapes Google
// actually produces for Docs/Slides/Sheets/raw Drive files (§2.1's real
// evidence: all four appeared in one spreadsheet). Anything else (Zoom, an
// external dataset, a YouTube link already excluded upstream by link_kind)
// simply doesn't match and is left as inline-only text (§2.2) — Atlas never
// guesses at fetching a non-Drive URL. Forms are deliberately excluded even
// though they're also a docs.google.com URL — a Forms link's real shape is
// `/forms/d/e/<longid>/viewform`, so matching `/forms/d/` would capture the
// literal "e" as a bogus file ID instead of the actual form ID, and a Form
// has no fetchable document content anyway (§5's export table).
export function driveFileIdFromUrl(url: string): string | null {
  const patterns = [
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
    /docs\.google\.com\/(?:document|presentation|spreadsheets)\/d\/([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function isTransientError(message: string | undefined): boolean {
  if (!message) return false;
  return /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|rate limit|quota|network|5\d\d|not connected/i.test(message);
}

interface RemoteResourceRow {
  id: number;
  course_id: number;
  remote_ref: string | null;
  remote_fetched_version: string | null;
  discovery_depth: number;
  title: string;
}

function writeDocumentParts(resourceId: number, parts: { ordinal: number; label: string; text: string }[]): void {
  const db = getDb();
  const insertPart = db.prepare(
    'INSERT INTO document_parts (resource_id, ordinal, label, text, origin) VALUES (?, ?, ?, ?, ?)'
  );
  db.transaction(() => {
    db.prepare("DELETE FROM document_parts WHERE resource_id = ? AND origin = 'extracted'").run(resourceId);
    for (const part of parts) insertPart.run(resourceId, part.ordinal, part.label, part.text, 'extracted');
  })();
}

// §3.3 local-copy-first: if this exact Drive file already exists as a real,
// already-downloaded local resource (imported via the Drive inbox, or
// dropped in manually and later matched by drive_file_id), reuse that
// resource's already-extracted text instead of ever touching the network.
// Copies the text rather than only recording the link, so every existing
// read/search code path keeps working unmodified against this resource's own
// document_parts rows — the alternative (teaching every reader to follow
// local_twin_id) is more machinery for the same outcome.
function tryLocalTwin(resourceId: number, driveFileId: string): boolean {
  const db = getDb();
  const twin = db
    .prepare(
      "SELECT id FROM resources WHERE drive_file_id = ? AND id != ? AND kind != 'link' LIMIT 1"
    )
    .get(driveFileId, resourceId) as { id: number } | undefined;
  if (!twin) return false;

  const twinParts = db
    .prepare("SELECT ordinal, label, text FROM document_parts WHERE resource_id = ? ORDER BY ordinal")
    .all(twin.id) as { ordinal: number; label: string; text: string }[];
  if (twinParts.length === 0) return false; // twin not extracted yet — retry next pass

  writeDocumentParts(resourceId, twinParts);
  db.prepare(
    "UPDATE resources SET extraction_status = 'done', extraction_error = NULL, extracted_at = datetime('now'), local_twin_id = ? WHERE id = ?"
  ).run(twin.id, resourceId);
  return true;
}

// Fetches, extracts, and records the outcome for one remote resource —
// never called for a resource whose remote_source isn't 'drive'. Returns
// the links discovered inside it, so the caller can decide whether to
// follow any of them (kept separate from persistence, since which links
// are worth following depends on caps the caller tracks across the whole
// sync, not anything this resource alone knows about).
async function extractOneRemoteResource(resource: RemoteResourceRow): Promise<DiscoveredLink[]> {
  const db = getDb();
  if (!resource.remote_ref) {
    db.prepare("UPDATE resources SET extraction_status = 'unsupported' WHERE id = ?").run(resource.id);
    return [];
  }

  if (tryLocalTwin(resource.id, resource.remote_ref)) return [];

  const result = await fetchRemoteDriveFile(resource.remote_ref);

  // Unchanged since last successful fetch (§6) — nothing to redo. Detected
  // after tryLocalTwin/metadata fetch rather than skipped up front, since
  // the metadata call itself is what tells us the current modifiedTime.
  if (
    result.fetchedVersion &&
    result.fetchedVersion === resource.remote_fetched_version &&
    result.status === 'done'
  ) {
    return [];
  }

  // A transient failure (network hiccup, rate limit) must stay 'pending' so
  // the next sync retries it — only a genuinely permanent condition
  // (restricted, unsupported, too large) is worth recording as 'failed'
  // (§7's "retryable conditions stay pending; permanent ones become
  // explicit" rule). Google/network client errors surface as generic
  // Error messages with no structured code here, so this is a best-effort
  // pattern match rather than a status-code check.
  if (result.status === 'failed' && isTransientError(result.error)) {
    return result.discoveredLinks;
  }

  writeDocumentParts(resource.id, result.parts);
  db.prepare(
    `UPDATE resources SET extraction_status = ?, extraction_error = ?, extracted_at = datetime('now'),
     remote_mime_type = ?, remote_fetched_version = COALESCE(?, remote_fetched_version) WHERE id = ?`
  ).run(result.status, result.error ?? null, result.mimeType ?? null, result.fetchedVersion ?? null, resource.id);

  return result.discoveredLinks;
}

// Creates child resources for Drive links discovered inside a document
// (§5.5), respecting the depth/fan-out/total caps — a runaway index (a
// professor's course-index sheet that itself links to a dozen more indexes)
// must not queue thousands of fetches. Hitting a cap is recorded via the
// return value so the caller can surface it, never swallowed silently (§5.5.3).
function createChildResources(
  parent: RemoteResourceRow,
  links: DiscoveredLink[],
  seenDriveFileIds: Set<string>,
  remainingForCourse: number
): { created: RemoteResourceRow[]; cappedByDepth: boolean; cappedByFanOut: boolean } {
  if (parent.discovery_depth >= MAX_DISCOVERY_DEPTH) {
    return { created: [], cappedByDepth: links.some((l) => driveFileIdFromUrl(l.url)), cappedByFanOut: false };
  }

  const db = getDb();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO resources
      (course_id, title, kind, source, file_path, original_filename, remote_source, remote_ref, link_kind,
       parent_resource_id, discovery_depth, classroom_attachment_id, added_at)
    VALUES (?, ?, 'link', 'classroom', ?, ?, 'drive', ?, 'driveFile', ?, ?, ?, datetime('now'))
  `);

  const created: RemoteResourceRow[] = [];
  let fanOut = 0;
  let cappedByFanOut = false;
  let cappedByDepth = false;

  for (const link of links) {
    const fileId = driveFileIdFromUrl(link.url);
    if (!fileId) continue; // not a Drive link — already visible inline (§2.2), nothing more to do
    if (seenDriveFileIds.has(fileId)) continue; // dedupe + cycle detection (§5.5.3)
    if (fanOut >= MAX_CHILDREN_PER_PARENT) {
      cappedByFanOut = true;
      break;
    }
    if (remainingForCourse - created.length <= 0) break;

    seenDriveFileIds.add(fileId);
    const dedupeKey = `link:${parent.id}:${fileId}`;
    const result = insert.run(
      parent.course_id,
      link.label || fileId,
      link.url,
      link.label || fileId,
      fileId,
      parent.id,
      parent.discovery_depth + 1,
      dedupeKey
    );
    fanOut++;
    if (result.changes > 0) {
      const row = db
        .prepare('SELECT id, course_id, remote_ref, remote_fetched_version, discovery_depth, title FROM resources WHERE id = ?')
        .get(result.lastInsertRowid) as RemoteResourceRow;
      created.push(row);
    }
  }

  return { created, cappedByDepth, cappedByFanOut };
}

// Processes every remote resource still pending extraction, one at a time
// (concurrency 1, §8 — stays well inside Drive API quota and never blocks
// sync/UI), following discovered links breadth-first within this sync's
// per-course cap. Called after Classroom sync completes (main.ts) and from
// the launch-time backfill, same shape as extractAllPendingResources for
// local files.
export async function processPendingRemoteResources(
  onProgress?: (progress: RemoteSyncProgress) => void
): Promise<{ changed: boolean; capped: boolean }> {
  const db = getDb();
  const courses = db.prepare('SELECT id FROM courses WHERE archived = 0').all() as { id: number }[];

  let changed = false;
  let anyCapped = false;

  for (const course of courses) {
    // Seed the seen-set with every Drive file ID already present in this
    // course (both real attachments and previously-discovered children) so
    // a re-sync doesn't re-discover/re-queue the same file, and so a cycle
    // reaching back to an already-known file stops immediately.
    const existingRefs = db
      .prepare("SELECT remote_ref FROM resources WHERE course_id = ? AND remote_ref IS NOT NULL")
      .all(course.id) as { remote_ref: string }[];
    const seen = new Set(existingRefs.map((r) => r.remote_ref));

    let remainingForCourse = MAX_TOTAL_PER_COURSE_PER_SYNC - seen.size;

    // Breadth-first queue: start with every already-pending remote resource
    // for this course (real Classroom attachments), then whatever gets
    // created by following links out of them.
    let queue = db
      .prepare(
        "SELECT id, course_id, remote_ref, remote_fetched_version, discovery_depth, title FROM resources " +
          "WHERE course_id = ? AND remote_source = 'drive' AND extraction_status = 'pending' ORDER BY id"
      )
      .all(course.id) as RemoteResourceRow[];

    let done = 0;
    const total = queue.length; // best-effort — grows as link-following queues more, but this is what progress is measured against for the visible portion

    while (queue.length > 0 && remainingForCourse > 0) {
      const resource = queue.shift()!;
      onProgress?.({ courseId: course.id, done, total: Math.max(total, done + queue.length + 1) });

      const links = await extractOneRemoteResource(resource);
      changed = true;
      done++;

      if (links.length > 0) {
        const { created, cappedByFanOut } = createChildResources(resource, links, seen, remainingForCourse);
        if (cappedByFanOut) anyCapped = true;
        remainingForCourse -= created.length;
        queue.push(...created);
      }
    }
    if (queue.length > 0) anyCapped = true; // hit MAX_TOTAL_PER_COURSE_PER_SYNC with work still queued

    onProgress?.({ courseId: course.id, done, total: done });
  }

  return { changed, capped: anyCapped };
}
