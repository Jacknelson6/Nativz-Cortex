/**
 * Google Service Account authentication with domain-wide delegation.
 *
 * Used for any workspace API call that needs to act as a domain user without
 * per-user OAuth (Fyxer Gmail importer, team-availability calendar reads, etc).
 *
 * Provide credentials in one of two ways:
 * - `GOOGLE_SERVICE_ACCOUNT_KEY` — base64-encoded JSON or raw JSON string (Vercel-friendly)
 * - `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` — absolute path to the downloaded key file (local dev)
 *
 * **Domain-wide delegation:** The JWT sets `sub` to the impersonated user. Google only
 * accepts it if the SA's numeric Client ID is allowlisted in *that user's* Workspace
 * Admin console with the requested scope. Cortex impersonates users in two domains:
 * `nativz.io` and `andersoncollaborative.com`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SignJWT, importPKCS8 } from 'jose';

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

const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const CALENDAR_READONLY_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

const DEFAULT_GMAIL_IMPERSONATE =
  process.env.GOOGLE_SERVICE_ACCOUNT_IMPERSONATE_EMAIL ??
  'trevor@andersoncollaborative.com';

export const ALLOWED_IMPERSONATE_DOMAINS = ['nativz.io', 'andersoncollaborative.com'] as const;

const tokenCache = new Map<string, TokenCache>();

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
 * Get a Workspace API access token via domain-wide delegation.
 * Caches per (scope, impersonate) pair and refreshes 5 min before expiry.
 */
export async function getServiceAccountToken({
  scope,
  impersonate,
}: {
  scope: string;
  impersonate: string;
}): Promise<string> {
  const cacheKey = `${scope}|${impersonate}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt - 5 * 60_000) {
    return cached.accessToken;
  }

  const key = getServiceAccountKey();
  const now = Math.floor(Date.now() / 1000);

  const privateKey = await importPKCS8(key.private_key, 'RS256');

  const jwt = await new SignJWT({
    iss: key.client_email,
    sub: impersonate,
    scope,
    aud: key.token_uri,
  })
    .setProtectedHeader({ alg: 'RS256', kid: key.private_key_id })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

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
    throw new Error(`Service account token exchange failed for ${impersonate} (${scope}): ${err}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };

  tokenCache.set(cacheKey, {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });

  return data.access_token;
}

/** Gmail readonly token for the configured importer mailbox (Fyxer cron path). */
export function getServiceAccountGmailToken(impersonate: string = DEFAULT_GMAIL_IMPERSONATE): Promise<string> {
  return getServiceAccountToken({ scope: GMAIL_READONLY_SCOPE, impersonate });
}

/** Calendar readonly token for a workspace user (team-availability path). */
export function getServiceAccountCalendarToken(impersonate: string): Promise<string> {
  return getServiceAccountToken({ scope: CALENDAR_READONLY_SCOPE, impersonate });
}

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

export function isImpersonateAllowed(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return ALLOWED_IMPERSONATE_DOMAINS.includes(domain as (typeof ALLOWED_IMPERSONATE_DOMAINS)[number]);
}
