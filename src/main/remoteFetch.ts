import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { google } from 'googleapis';
import { getClassroomClient, getDriveClient } from './googleAuth';
import { extractDocumentParts, DocumentPart, DiscoveredLink } from './textExtraction';

// Reads a Drive file's *content* without ever writing it under
// Atlas-Storage/files/ (remote-attachments-spec.md §3.2) — bytes pass
// through a temp file (or memory, for exported text) purely so the existing
// format extractors can read them, and are deleted immediately after.

export type RemoteExtractStatus = 'done' | 'empty' | 'unsupported' | 'failed';

export interface RemoteExtractResult {
  status: RemoteExtractStatus;
  parts: DocumentPart[];
  discoveredLinks: DiscoveredLink[];
  error?: string;
  mimeType?: string;
  fetchedVersion?: string; // Drive's modifiedTime at fetch time (§6 caching)
  localTwinId?: number; // set when §3.3 found an existing local copy instead
}

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

const GOOGLE_NATIVE_PREFIX = 'application/vnd.google-apps.';
const GOOGLE_DOC = 'application/vnd.google-apps.document';
const GOOGLE_SLIDES = 'application/vnd.google-apps.presentation';
const GOOGLE_SHEET = 'application/vnd.google-apps.spreadsheet';
const GOOGLE_FOLDER = 'application/vnd.google-apps.folder';
const GOOGLE_SHORTCUT = 'application/vnd.google-apps.shortcut';

// The export target per Google-native type (§5). Forms have no document
// content to export — deliberately absent, falls through to 'unsupported'.
const EXPORT_MIME: Record<string, string> = {
  [GOOGLE_DOC]: 'text/plain',
  [GOOGLE_SLIDES]: 'text/plain',
  [GOOGLE_SHEET]: 'text/csv', // first sheet only — a documented export limitation (§5)
};

// Binary files fetched via alt:media — mirrors main.ts's EXTRACTABLE_KINDS,
// duplicated here rather than imported since main.ts's set is keyed by
// Atlas's own `kind` strings (derived from local file extensions) while this
// is keyed by Drive's reported MIME type.
const MIME_TO_KIND: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'text',
  'text/markdown': 'markdown',
};

interface DriveMetadata {
  id: string;
  name: string;
  mimeType: string;
  canDownload: boolean;
  modifiedTime: string | null;
}

// Classroom-sourced Drive files are shared by the professor with whichever
// Google account is connected *to Classroom* — a separate OAuth connection
// from the personal-account Drive client, which has no permission on them at
// all even though it also carries drive.readonly (see googleAuth.ts's
// CLASSROOM_SCOPES comment). Tried first since that's the case the evidence
// (ECO-2202, §2.1) is actually about; falls back to the personal Drive
// connection for a file that happens to be shared there instead (e.g. one
// discovered by following a link out of a Classroom-sourced document into
// something the user's own Drive inbox also has access to).
function candidateClients(): OAuth2Client[] {
  const clients: OAuth2Client[] = [];
  const classroomClient = getClassroomClient();
  if (classroomClient) clients.push(classroomClient);
  const driveClient = getDriveClient();
  if (driveClient) clients.push(driveClient);
  return clients;
}

async function getMetadata(
  drive: ReturnType<typeof google.drive>,
  fileId: string
): Promise<DriveMetadata> {
  const res = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, capabilities(canDownload), modifiedTime, shortcutDetails',
  });
  const data = res.data;
  if (data.mimeType === GOOGLE_SHORTCUT && data.shortcutDetails?.targetId) {
    // Resolve one level of shortcut indirection (§5.2) — a shortcut has no
    // content of its own to fetch.
    return getMetadata(drive, data.shortcutDetails.targetId);
  }
  return {
    id: data.id!,
    name: data.name ?? fileId,
    mimeType: data.mimeType ?? 'application/octet-stream',
    canDownload: data.capabilities?.canDownload !== false,
    modifiedTime: data.modifiedTime ?? null,
  };
}

async function writeStreamToTemp(
  drive: ReturnType<typeof google.drive>,
  fileId: string,
  ext: string
): Promise<string> {
  const tempPath = path.join(os.tmpdir(), `atlas-remote-${crypto.randomUUID()}${ext}`);
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(tempPath);
    (res.data as NodeJS.ReadableStream).pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
    (res.data as NodeJS.ReadableStream).on('error', reject);
  });
  return tempPath;
}

async function fetchExportText(
  client: OAuth2Client,
  drive: ReturnType<typeof google.drive>,
  fileId: string,
  exportMime: string
): Promise<string> {
  // exportLinks first — not subject to files.export()'s ~10MB cap (§5,
  // §10.3). Falls back to files.export() only if a link for this format
  // isn't offered for some reason.
  try {
    const linksRes = await drive.files.get({ fileId, fields: 'exportLinks' });
    const url = (linksRes.data.exportLinks as Record<string, string> | undefined)?.[exportMime];
    if (url) {
      const fetched = await client.request<string>({ url, responseType: 'text' });
      return typeof fetched.data === 'string' ? fetched.data : String(fetched.data);
    }
  } catch {
    // Fall through to the direct export path below.
  }
  const exported = await drive.files.export(
    { fileId, mimeType: exportMime },
    { responseType: 'text' }
  );
  return typeof exported.data === 'string' ? exported.data : String(exported.data);
}

async function fetchOneFile(
  client: OAuth2Client,
  fileId: string
): Promise<RemoteExtractResult> {
  const drive = google.drive({ version: 'v3', auth: client });
  const meta = await getMetadata(drive, fileId);

  if (meta.mimeType === GOOGLE_FOLDER) {
    return { status: 'unsupported', parts: [], discoveredLinks: [], mimeType: meta.mimeType };
  }

  // Cheap metadata-only pre-check (§10.2) — a restricted file goes straight
  // to a labeled failure rather than an ambiguous error surfacing later from
  // an attempted fetch.
  if (!meta.canDownload) {
    return {
      status: 'failed',
      parts: [],
      discoveredLinks: [],
      mimeType: meta.mimeType,
      error: "restricted by the file's owner",
    };
  }

  if (meta.mimeType.startsWith(GOOGLE_NATIVE_PREFIX)) {
    const exportMime = EXPORT_MIME[meta.mimeType];
    if (!exportMime) {
      // Google Forms and other native types with no document content.
      return { status: 'unsupported', parts: [], discoveredLinks: [], mimeType: meta.mimeType };
    }
    let text: string;
    try {
      text = await fetchExportText(client, drive, fileId, exportMime);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const tooLarge = /exportSizeLimitExceeded|too large/i.test(message);
      return {
        status: 'failed',
        parts: [],
        discoveredLinks: [],
        mimeType: meta.mimeType,
        error: tooLarge ? 'too large to export from Google Docs/Sheets/Slides' : message,
      };
    }
    const tempPath = path.join(os.tmpdir(), `atlas-remote-${crypto.randomUUID()}.txt`);
    fs.writeFileSync(tempPath, text, 'utf-8');
    try {
      const result = await extractDocumentParts('text', tempPath);
      return {
        status: result.status,
        parts: result.parts,
        discoveredLinks: result.discoveredLinks ?? [],
        error: result.error,
        mimeType: meta.mimeType,
        fetchedVersion: meta.modifiedTime ?? undefined,
      };
    } finally {
      fs.rmSync(tempPath, { force: true });
    }
  }

  const kind = MIME_TO_KIND[meta.mimeType];
  if (!kind) {
    return { status: 'unsupported', parts: [], discoveredLinks: [], mimeType: meta.mimeType };
  }

  const ext = path.extname(meta.name) || `.${kind}`;
  let tempPath: string;
  try {
    tempPath = await writeStreamToTemp(drive, fileId, ext);
  } catch (err) {
    return {
      status: 'failed',
      parts: [],
      discoveredLinks: [],
      mimeType: meta.mimeType,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  try {
    const result = await extractDocumentParts(kind, tempPath);
    return {
      status: result.status,
      parts: result.parts,
      discoveredLinks: result.discoveredLinks ?? [],
      error: result.error,
      mimeType: meta.mimeType,
      fetchedVersion: meta.modifiedTime ?? undefined,
    };
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

// Tries each candidate OAuth connection in turn (see candidateClients) —
// a permission failure on one account isn't necessarily real, since the
// file may simply be shared with a different one of the user's connected
// accounts. Only surfaces the first attempt's failure once every candidate
// has failed, so the reported reason reflects the account the file is
// actually most likely to belong to.
export async function fetchRemoteDriveFile(fileId: string): Promise<RemoteExtractResult> {
  const clients = candidateClients();
  if (clients.length === 0) {
    return {
      status: 'failed',
      parts: [],
      discoveredLinks: [],
      error: 'Neither Google Drive nor Google Classroom is connected.',
    };
  }

  let lastResult: RemoteExtractResult | null = null;
  for (const client of clients) {
    try {
      const result = await fetchOneFile(client, fileId);
      if (result.status !== 'failed' || !lastResult) return result;
      lastResult = result;
    } catch (err) {
      lastResult = {
        status: 'failed',
        parts: [],
        discoveredLinks: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
  return lastResult!;
}
