/**
 * Meta OAuth for Instagram Business + Facebook Pages
 *
 * Flow: User OAuth → short-lived user token → long-lived user token →
 *       list pages → get page access token (never expires) →
 *       get Instagram Business account linked to page
 */

import type { OAuthConfig, OAuthResult, OAuthTokens } from './types';

const META_GRAPH_URL = 'https://graph.facebook.com/v21.0';

function getConfig(): OAuthConfig {
  return {
    clientId: process.env.META_APP_ID!,
    clientSecret: process.env.META_APP_SECRET!,
    redirectUri: `${process.env.NEXT_PUBLIC_APP_URL}/api/social/callback/meta`,
  };
}

/** Build the Meta OAuth URL — handles both IG and FB via same flow */
export function getMetaAuthUrl(state: string): string {
  const config = getConfig();
  const scopes = [
    'pages_show_list',
    'pages_read_engagement',
    'read_insights',
    'instagram_basic',
    'instagram_manage_insights',
    'business_management',
  ].join(',');

  return (
    `https://www.facebook.com/v21.0/dialog/oauth?` +
    `client_id=${config.clientId}` +
    `&redirect_uri=${encodeURIComponent(config.redirectUri)}` +
    `&scope=${scopes}` +
    `&state=${encodeURIComponent(state)}` +
    `&response_type=code`
  );
}

/** Exchange auth code for short-lived token, then upgrade to long-lived */
export async function exchangeMetaCode(code: string): Promise<string> {
  const config = getConfig();

  // Short-lived token
  const tokenRes = await fetch(
    `${META_GRAPH_URL}/oauth/access_token?` +
      `client_id=${config.clientId}` +
      `&redirect_uri=${encodeURIComponent(config.redirectUri)}` +
      `&client_secret=${config.clientSecret}` +
      `&code=${code}`,
  );
  const tokenData = await tokenRes.json();
  if (tokenData.error) throw new Error(tokenData.error.message);

  // Long-lived token (60 days)
  const longRes = await fetch(
    `${META_GRAPH_URL}/oauth/access_token?` +
      `grant_type=fb_exchange_token` +
      `&client_id=${config.clientId}` +
      `&client_secret=${config.clientSecret}` +
      `&fb_exchange_token=${tokenData.access_token}`,
  );
  const longData = await longRes.json();
  if (longData.error) throw new Error(longData.error.message);

  return longData.access_token as string;
}

interface MetaPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string };
}

/** Get all pages the user manages with their page tokens */
export async function getMetaPages(userToken: string): Promise<MetaPage[]> {
  const res = await fetch(
    `${META_GRAPH_URL}/me/accounts?` +
      `fields=id,name,access_token,instagram_business_account` +
      `&access_token=${userToken}`,
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.data ?? [];
}

/** Get Facebook Page profile for reporting */
export async function getFacebookPageProfile(
  pageId: string,
  pageToken: string,
): Promise<OAuthResult> {
  const res = await fetch(
    `${META_GRAPH_URL}/${pageId}?fields=id,name,picture&access_token=${pageToken}`,
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  return {
    tokens: {
      accessToken: pageToken,
      pageAccessToken: pageToken,
      pageId,
    },
    profile: {
      platformUserId: data.id,
      username: data.name ?? '',
      avatarUrl: data.picture?.data?.url,
    },
  };
}

/** Get Instagram Business account profile linked to a page */
export async function getInstagramProfile(
  igAccountId: string,
  pageToken: string,
): Promise<OAuthResult> {
  const res = await fetch(
    `${META_GRAPH_URL}/${igAccountId}?fields=id,username,profile_picture_url&access_token=${pageToken}`,
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  return {
    tokens: {
      accessToken: pageToken,
      pageAccessToken: pageToken,
      pageId: igAccountId,
    },
    profile: {
      platformUserId: data.id,
      username: data.username ?? '',
      avatarUrl: data.profile_picture_url,
    },
  };
}

/** Refresh a long-lived Meta user token (call before it expires at ~60 days) */
export async function refreshMetaToken(longLivedToken: string): Promise<string> {
  const config = getConfig();
  const res = await fetch(
    `${META_GRAPH_URL}/oauth/access_token?` +
      `grant_type=fb_exchange_token` +
      `&client_id=${config.clientId}` +
      `&client_secret=${config.clientSecret}` +
      `&fb_exchange_token=${longLivedToken}`,
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.access_token as string;
}
