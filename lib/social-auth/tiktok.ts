/**
 * TikTok OAuth for TikTok Business API
 *
 * Flow: User OAuth → auth code → access_token + refresh_token →
 *       use refresh_token to get new access_token when expired (24h)
 *
 * Requires TikTok Developer Portal app with "Video List" scope approved.
 */

import type { OAuthConfig, OAuthResult } from './types';

const TIKTOK_AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const TIKTOK_USER_URL = 'https://open.tiktokapis.com/v2/user/info/';

function getConfig(): OAuthConfig {
  return {
    clientId: process.env.TIKTOK_CLIENT_KEY!,
    clientSecret: process.env.TIKTOK_CLIENT_SECRET!,
    redirectUri: `${process.env.NEXT_PUBLIC_APP_URL}/api/social/callback/tiktok`,
  };
}

export function getTikTokAuthUrl(state: string): string {
  const config = getConfig();
  const scopes = ['user.info.basic', 'video.list'].join(',');

  return (
    `${TIKTOK_AUTH_URL}?` +
    `client_key=${config.clientId}` +
    `&redirect_uri=${encodeURIComponent(config.redirectUri)}` +
    `&scope=${scopes}` +
    `&response_type=code` +
    `&state=${encodeURIComponent(state)}`
  );
}

export async function exchangeTikTokCode(code: string): Promise<OAuthResult> {
  const config = getConfig();

  const res = await fetch(TIKTOK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description ?? data.error);

  const tokenData = data.data ?? data;

  // Fetch user profile
  const userRes = await fetch(
    `${TIKTOK_USER_URL}?fields=open_id,display_name,avatar_url`,
    { headers: { Authorization: `Bearer ${tokenData.access_token}` } },
  );
  const userData = await userRes.json();
  const user = userData.data?.user ?? {};

  return {
    tokens: {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: new Date(Date.now() + (tokenData.expires_in ?? 86400) * 1000),
    },
    profile: {
      platformUserId: tokenData.open_id ?? user.open_id ?? '',
      username: user.display_name ?? '',
      avatarUrl: user.avatar_url,
    },
  };
}

export async function refreshTikTokToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}> {
  const config = getConfig();

  const res = await fetch(TIKTOK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description ?? data.error);

  const tokenData = data.data ?? data;

  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + (tokenData.expires_in ?? 86400) * 1000),
  };
}
