/**
 * YouTube/Google OAuth for YouTube Analytics
 *
 * Flow: User OAuth → auth code → access_token + refresh_token →
 *       use refresh_token to get new access_token when expired
 */

import type { OAuthConfig, OAuthResult } from './types';

function getConfig(): OAuthConfig {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    redirectUri: `${process.env.NEXT_PUBLIC_APP_URL}/api/social/callback/youtube`,
  };
}

export function getYouTubeAuthUrl(state: string): string {
  const config = getConfig();
  const scopes = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/yt-analytics.readonly',
  ].join(' ');

  return (
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${config.clientId}` +
    `&redirect_uri=${encodeURIComponent(config.redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&access_type=offline` +
    `&prompt=consent` +
    `&state=${encodeURIComponent(state)}`
  );
}

export async function exchangeYouTubeCode(code: string): Promise<OAuthResult> {
  const config = getConfig();

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description ?? data.error);

  // Fetch channel info
  const channelRes = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true`,
    { headers: { Authorization: `Bearer ${data.access_token}` } },
  );
  const channelData = await channelRes.json();
  const channel = channelData.items?.[0];

  return {
    tokens: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
    },
    profile: {
      platformUserId: channel?.id ?? '',
      username: channel?.snippet?.title ?? '',
      avatarUrl: channel?.snippet?.thumbnails?.default?.url,
    },
  };
}

export async function refreshYouTubeToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresAt: Date;
}> {
  const config = getConfig();

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description ?? data.error);

  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
  };
}
