/**
 * Google OAuth2 token management.
 *
 * Required env vars:
 * - GOOGLE_CLIENT_ID
 * - GOOGLE_CLIENT_SECRET
 * - GOOGLE_REDIRECT_URI (e.g. https://yourdomain.com/api/calendar/callback)
 * - ENCRYPTION_KEY (32-byte hex string for token encryption)
 */

import { createAdminClient } from '@/lib/supabase/admin';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

function getClientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new Error('GOOGLE_CLIENT_ID not set');
  return id;
}

function getClientSecret(): string {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error('GOOGLE_CLIENT_SECRET not set');
  return secret;
}

function getRedirectUri(): string {
  const uri = process.env.GOOGLE_REDIRECT_URI;
  if (!uri) throw new Error('GOOGLE_REDIRECT_URI not set');
  return uri;
}

export function isGoogleConfigured(): boolean {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REDIRECT_URI &&
    process.env.ENCRYPTION_KEY
  );
}

// ---------------------------------------------------------------------------
// Token encryption (AES-256-GCM via Web Crypto API)
// ---------------------------------------------------------------------------

function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY not set');
  return key;
}

async function importKey(hexKey: string): Promise<CryptoKey> {
  const keyBytes = new Uint8Array(hexKey.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptToken(plaintext: string): Promise<string> {
  const key = await importKey(getEncryptionKey());
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

  // Store as: iv_hex:ciphertext_base64
  const ivHex = Array.from(iv).map((b) => b.toString(16).padStart(2, '0')).join('');
  const ctBase64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
  return `${ivHex}:${ctBase64}`;
}

export async function decryptToken(encrypted: string): Promise<string> {
  const [ivHex, ctBase64] = encrypted.split(':');
  if (!ivHex || !ctBase64) throw new Error('Invalid encrypted token format');

  const key = await importKey(getEncryptionKey());
  const iv = new Uint8Array(ivHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  const ciphertext = Uint8Array.from(atob(ctBase64), (c) => c.charCodeAt(0));

  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

// ---------------------------------------------------------------------------
// OAuth2 flow
// ---------------------------------------------------------------------------

export function getGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: getRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Google token exchange failed: ${error}`);
  }

  return res.json();
}

export async function refreshAccessToken(refreshTokenEncrypted: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const refreshToken = await decryptToken(refreshTokenEncrypted);

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: getClientId(),
      client_secret: getClientSecret(),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Google token refresh failed: ${error}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Token management (get a valid access token, auto-refresh if expired)
// ---------------------------------------------------------------------------

export async function getValidAccessToken(connectionId: string): Promise<string> {
  const adminClient = createAdminClient();

  const { data: connection, error } = await adminClient
    .from('calendar_connections')
    .select('access_token_encrypted, refresh_token_encrypted, token_expires_at')
    .eq('id', connectionId)
    .single();

  if (error || !connection) throw new Error('Calendar connection not found');

  // Check if token is still valid (with 5 min buffer)
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at) : new Date(0);
  const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);

  if (expiresAt > fiveMinFromNow) {
    return decryptToken(connection.access_token_encrypted);
  }

  // Refresh the token
  const refreshed = await refreshAccessToken(connection.refresh_token_encrypted);
  const newAccessEncrypted = await encryptToken(refreshed.access_token);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  await adminClient
    .from('calendar_connections')
    .update({
      access_token_encrypted: newAccessEncrypted,
      token_expires_at: newExpiresAt,
    })
    .eq('id', connectionId);

  return refreshed.access_token;
}
