import { shell } from 'electron';
import * as fs from 'fs';
import * as http from 'http';
import type { AddressInfo } from 'net';
import { google } from 'googleapis';
import { getGoogleCredentialsPath } from './paths';

// Avoid importing the `OAuth2Client` type directly from `google-auth-library`
// — googleapis' own dependency tree hoists a second, separately-typed copy
// of that package, and TypeScript treats the two as structurally
// incompatible. Deriving the type from `google.auth.OAuth2` itself sidesteps
// the duplicate-package issue entirely.
type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;
import { getDb } from './db/database';

const REFRESH_TOKEN_SETTING_KEY = 'google_drive_refresh_token';

// Read-only is enough — Atlas only ever downloads a copy into local managed
// storage (docs/open-questions.md #19), it never writes back to Drive.
const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

// Separate refresh token from Drive's — Classroom is expected to be
// connected against the user's college Workspace account, not the personal
// account used for Drive (docs/open-questions.md #8), so the two
// connections are tracked and can be connected/disconnected independently.
const CLASSROOM_REFRESH_TOKEN_SETTING_KEY = 'google_classroom_refresh_token';

// `.me` scopes ("coursework assigned to me") rather than `.students`, which
// requires teacher/domain-admin-level access — this is a student account
// (docs/open-questions.md #8). classroom.courseworkmaterials.readonly has no
// `.me` variant (unlike coursework) — it's the same scope for both teacher
// and student contexts — needed once courseWorkMaterials.list (the
// ungraded "Classwork" tab, docs/open-questions.md #21) was added.
const CLASSROOM_SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
  'https://www.googleapis.com/auth/classroom.announcements.readonly',
  'https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly',
];

interface GoogleClientCredentials {
  client_id: string;
  client_secret: string;
}

// The user's own bring-your-own OAuth client (docs/open-questions.md #7) —
// downloaded once from Google Cloud Console as a "Desktop app" credential and
// copied into Atlas-Storage/config/ (never the git repo, it's tied to the
// user's own Cloud project).
function loadClientCredentials(): GoogleClientCredentials {
  const raw = fs.readFileSync(getGoogleCredentialsPath(), 'utf-8');
  const parsed = JSON.parse(raw);
  const section = parsed.installed ?? parsed.web;
  if (!section) {
    throw new Error('google-oauth-client.json is missing an "installed" or "web" section');
  }
  return { client_id: section.client_id, client_secret: section.client_secret };
}

function getStoredRefreshToken(settingKey: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(settingKey) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function storeRefreshToken(settingKey: string, token: string): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
  ).run(settingKey, token, token);
}

export function isGoogleDriveConnected(): boolean {
  return getStoredRefreshToken(REFRESH_TOKEN_SETTING_KEY) !== null;
}

export function disconnectGoogleDrive(): void {
  const db = getDb();
  db.prepare('DELETE FROM app_settings WHERE key = ?').run(REFRESH_TOKEN_SETTING_KEY);
}

export function isGoogleClassroomConnected(): boolean {
  return getStoredRefreshToken(CLASSROOM_REFRESH_TOKEN_SETTING_KEY) !== null;
}

export function disconnectGoogleClassroom(): void {
  const db = getDb();
  db.prepare('DELETE FROM app_settings WHERE key = ?').run(CLASSROOM_REFRESH_TOKEN_SETTING_KEY);
}

// google.auth.OAuth2 refreshes the short-lived access token from the stored
// refresh token automatically on each API call — callers never touch access
// tokens directly. Returns null if the user hasn't connected yet.
export function getDriveClient(): OAuth2Client | null {
  const refreshToken = getStoredRefreshToken(REFRESH_TOKEN_SETTING_KEY);
  if (!refreshToken) return null;
  const { client_id, client_secret } = loadClientCredentials();
  const client = new google.auth.OAuth2(client_id, client_secret);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

export function getClassroomClient(): OAuth2Client | null {
  const refreshToken = getStoredRefreshToken(CLASSROOM_REFRESH_TOKEN_SETTING_KEY);
  if (!refreshToken) return null;
  const { client_id, client_secret } = loadClientCredentials();
  const client = new google.auth.OAuth2(client_id, client_secret);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

// Loopback-redirect OAuth flow (RFC 8252) — the only flow Google supports for
// "Desktop app" clients now that the old out-of-band
// ("urn:ietf:wg:oauth:2.0:oob") flow is retired. A local HTTP server on an
// ephemeral port catches the single redirect after the user approves access
// in their real browser; the registered redirect URI is just "http://localhost"
// with no port, which Google matches against any port chosen at runtime for
// this client type.
//
// Testing-mode caveat (accepted — see docs/open-questions.md #19): since this
// app isn't submitted for Google's verification review (would need a live
// privacy policy and, for a scope like Drive, a security assessment — real
// overkill for a personal single-user tool), refresh tokens for
// sensitive/restricted scopes expire after about 7 days. The user just
// reconnects (one click through the consent screen again) rather than
// needing any re-setup.
function authorize(settingKey: string, scopes: string[], connectedLabel: string): Promise<void> {
  const { client_id, client_secret } = loadClientCredentials();

  return new Promise((resolve, reject) => {
    let redirectUri = '';

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        error
          ? '<p>Google sign-in failed. You can close this tab and try again in Atlas.</p>'
          : `<p>${connectedLabel} connected. You can close this tab and return to Atlas.</p>`
      );
      server.close();

      if (error) {
        reject(new Error(`Google OAuth error: ${error}`));
        return;
      }
      if (!code) {
        reject(new Error('Google OAuth redirect had no authorization code'));
        return;
      }

      const client = new google.auth.OAuth2(client_id, client_secret, redirectUri);
      client
        .getToken(code)
        .then(({ tokens }) => {
          if (!tokens.refresh_token) {
            reject(
              new Error(
                'Google did not return a refresh token — remove Atlas\'s access at ' +
                  'myaccount.google.com/permissions and reconnect'
              )
            );
            return;
          }
          storeRefreshToken(settingKey, tokens.refresh_token);
          resolve();
        })
        .catch(reject);
    });

    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      redirectUri = `http://localhost:${port}`;
      const client = new google.auth.OAuth2(client_id, client_secret, redirectUri);
      const authUrl = client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        prompt: 'consent', // always issue a fresh refresh token, even on re-auth
      });
      void shell.openExternal(authUrl);
    });

    server.on('error', reject);
  });
}

export function authorizeGoogleDrive(): Promise<void> {
  return authorize(REFRESH_TOKEN_SETTING_KEY, DRIVE_SCOPES, 'Google Drive');
}

// Uses the same bring-your-own OAuth client as Drive (docs/open-questions.md
// #7) but a separate consent/token, since this is expected to be connected
// against the college Workspace account rather than the personal account
// used for Drive (docs/open-questions.md #8).
export function authorizeGoogleClassroom(): Promise<void> {
  return authorize(CLASSROOM_REFRESH_TOKEN_SETTING_KEY, CLASSROOM_SCOPES, 'Google Classroom');
}
