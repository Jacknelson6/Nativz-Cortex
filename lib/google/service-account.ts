/**
 * Google Service Account authentication with domain-wide delegation.
 *
 * Used by the Fyxer cron importer and Nerd Fyxer tools to access a workspace
 * user's Gmail without OAuth in the cron path.
 *
 * Provide credentials in one of two ways:
 * - `GOOGLE_SERVICE_ACCOUNT_KEY` — base64-encoded JSON or raw JSON string (Vercel-friendly)
 * - `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` — absolute path to the downloaded key file (local dev)
 *
 * Optional: `GOOGLE_SERVICE_ACCOUNT_IMPERSONATE_EMAIL` — Workspace user to impersonate (default `trevor@andersoncollaborative.com`).
 *
 * **Domain-wide delegation:** The JWT sets `sub` to that user. Google only accepts it if the service
 * account’s numeric Client ID is allowlisted in Admin with scope `GMAIL_SCOPE` below.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SignJWT, importPKCS8 } from 'jose';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
}

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const IMPERSONATE_EMAIL =
  process.env.GOOGLE_SERVICE_ACCOUNT_IMPERSONATE_EMAIL ??
  'trevor@andersoncollaborative.com';
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

// In-memory cache to avoid re-signing JWTs on every request
let tokenCache: TokenCache | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseKeyString(raw: string): ServiceAccountKey {
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return JSON.parse(raw);
  }
}

function getServiceAccountKey(): ServiceAccountKey {
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.trim();
  if (inline) {
    return parseKeyString(inline);
  }

  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH?.trim();
  if (keyPath) {
    const absolute = resolve(keyPath);
    if (!existsSync(absolute)) {
      throw new Error(`GOOGLE_SERVICE_ACCOUNT_KEY_PATH not found: ${absolute}`);
    }
    const json = readFileSync(absolute, 'utf-8');
    return JSON.parse(json);
  }

  throw new Error(
    'Set GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_SERVICE_ACCOUNT_KEY_PATH (service account JSON)',
  );
}

/**
 * Get a valid Gmail access token using the service account.
 * Caches the token in memory and refreshes 5 min before expiry.
 */
export async function getServiceAccountGmailToken(): Promise<string> {
  // Return cached token if still valid (with 5 min buffer)
  if (tokenCache && Date.now() < tokenCache.expiresAt - 5 * 60_000) {
    return tokenCache.accessToken;
  }

  const key = getServiceAccountKey();
  const now = Math.floor(Date.now() / 1000);

  // Import the private key
  const privateKey = await importPKCS8(key.private_key, 'RS256');

  // Create a signed JWT assertion
  const jwt = await new SignJWT({
    iss: key.client_email,
    sub: IMPERSONATE_EMAIL,
    scope: GMAIL_SCOPE,
    aud: key.token_uri,
  })
    .setProtectedHeader({ alg: 'RS256', kid: key.private_key_id })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600) // 1 hour
    .sign(privateKey);

  // Exchange JWT for access token
  const res = await fetch(key.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Service account token exchange failed: ${err}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };

  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}

/**
 * Check if service account auth is configured.
 */
export function isServiceAccountConfigured(): boolean {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.trim()) return true;
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH?.trim();
  if (!keyPath) return false;
  try {
    return existsSync(resolve(keyPath));
  } catch {
    return false;
  }
}
