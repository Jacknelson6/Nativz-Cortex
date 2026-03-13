/**
 * Google Service Account authentication with domain-wide delegation.
 *
 * Used by the Fyxer cron importer to access jack@nativz.io's Gmail
 * without requiring OAuth consent or app verification.
 *
 * Env var required: GOOGLE_SERVICE_ACCOUNT_KEY (base64-encoded JSON key)
 */

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

const IMPERSONATE_EMAIL = 'jack@nativz.io';
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

// In-memory cache to avoid re-signing JWTs on every request
let tokenCache: TokenCache | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getServiceAccountKey(): ServiceAccountKey {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY env var not set');

  try {
    // Try base64 first
    const decoded = Buffer.from(raw, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    // Fall back to raw JSON
    return JSON.parse(raw);
  }
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
  return !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
}
