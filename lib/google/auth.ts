/**
 * Google OAuth 2.0 — native implementation.
 *
 * Env vars required:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   NEXT_PUBLIC_APP_URL   (e.g. http://localhost:3000 or https://cortex.nativz.io)
 *
 * Scopes requested:
 *   - drive.readonly   — browse client Drive folders
 *   - chat.spaces.readonly + chat.messages.readonly — read Google Chat
 *   - userinfo.email   — identify the connected account
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { encrypt, decryptToken } from '@/lib/crypto';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/chat.spaces.readonly',
  'https://www.googleapis.com/auth/chat.messages.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  // Calendar read scope — used by the team-availability scheduler to query
  // each team member's busy windows via the freebusy.query endpoint and
  // surface overlap-free slots to clients picking a kickoff/shoot time.
  // Existing connections need to re-consent before freebusy queries return.
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ');

function getClientId() {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new Error('GOOGLE_CLIENT_ID not set');
  return id;
}

function getClientSecret() {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error('GOOGLE_CLIENT_SECRET not set');
  return secret;
}

function getRedirectUri() {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${base}/api/google/callback`;
}

export function isGoogleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

// ---------------------------------------------------------------------------
// OAuth flow
// ---------------------------------------------------------------------------

/**
 * Build the Google OAuth consent URL.
 * `state` should include the user ID + a CSRF token for verification.
 */
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for access + refresh tokens.
 */
export async function exchangeCode(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  id_token?: string;
}> {
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
    const err = await res.json();
    throw new Error(`Token exchange failed: ${err.error_description || err.error}`);
  }

  return res.json();
}

/**
 * Refresh an expired access token using the stored refresh token.
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Token refresh failed: ${err.error_description || err.error}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Token storage (Supabase)
// ---------------------------------------------------------------------------

export interface GoogleTokenRow {
  id: string;
  user_id: string;
  email: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Store or update tokens after OAuth flow completes.
 */
export async function storeTokens(
  userId: string,
  email: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
) {
  const supabase = createAdminClient();
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  // Encrypt token values before storing
  const encryptedAccessToken = encrypt(accessToken);
  const encryptedRefreshToken = encrypt(refreshToken);

  const { error } = await supabase
    .from('google_tokens')
    .upsert(
      {
        user_id: userId,
        email,
        access_token: encryptedAccessToken,
        refresh_token: encryptedRefreshToken,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

  if (error) throw new Error(`Failed to store tokens: ${error.message}`);
}

/**
 * Get a valid access token for a user, refreshing if expired.
 */
export async function getValidToken(userId: string): Promise<string | null> {
  const supabase = createAdminClient();

  const { data: row } = await supabase
    .from('google_tokens')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!row) return null;

  // Decrypt tokens — handles both plaintext (pre-migration) and encrypted values
  const storedAccessToken = decryptToken(row.access_token);
  const storedRefreshToken = decryptToken(row.refresh_token);

  // Check if token is still valid (with 5 min buffer to stay ahead of cron cycles)
  const expiresAt = new Date(row.expires_at).getTime();
  if (Date.now() < expiresAt - 5 * 60_000) {
    return storedAccessToken;
  }

  // Refresh
  try {
    const { access_token, expires_in } = await refreshAccessToken(storedRefreshToken);
    const newExpiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    // Encrypt the new access token before storing
    const encryptedNewToken = encrypt(access_token);

    await supabase
      .from('google_tokens')
      .update({
        access_token: encryptedNewToken,
        expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    return access_token;
  } catch {
    // Refresh token revoked — delete the row
    await supabase.from('google_tokens').delete().eq('user_id', userId);
    return null;
  }
}

/**
 * Disconnect: remove stored tokens for a user.
 */
export async function disconnectGoogle(userId: string) {
  const supabase = createAdminClient();
  await supabase.from('google_tokens').delete().eq('user_id', userId);
}

/**
 * Check if a user has a connected Google account.
 */
export async function getGoogleConnection(userId: string): Promise<{ email: string } | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('google_tokens')
    .select('email')
    .eq('user_id', userId)
    .single();
  return data ? { email: data.email } : null;
}
