/**
 * POST /api/analytics/competitors/resolve
 *
 * Triage input for the unified "add competitor" flow. Accepts:
 *   - A full social profile URL     (tiktok.com/@x, instagram.com/x, youtube.com/@x, facebook.com/x)
 *   - A website URL or bare domain  (acme.com, https://acme.com) — scraped for socials
 *
 * Returns `{ kind: 'profile', platform, username, profile_url }` for the first case,
 * or `{ kind: 'socials', domain, socials: [{platform, username, profile_url}] }` for the second.
 *
 * No DB writes — the client can then POST each discovered profile through the
 * existing /api/analytics/competitors endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { scrapeWebsite } from '@/lib/audit/scrape-website';

// Just the scrape + dedupe, no Apify. Keeps wall time to the website
// fetch (~3–8s) so rows show up fast. Each row is then hydrated
// independently by the frontend via /api/analytics/competitors/hydrate-social.
export const maxDuration = 20;

const schema = z.object({
  input: z.string().min(2).max(500),
  client_id: z.string().uuid(),
});

type Platform = 'tiktok' | 'instagram' | 'facebook' | 'youtube';

type DirectProfile = {
  kind: 'profile';
  platform: Platform;
  username: string;
  profile_url: string;
};

type HydratedSocial = {
  platform: Platform;
  username: string;
  profile_url: string;
  display_name: string | null;
  avatar_url: string | null;
  followers: number | null;
  verified: boolean;
};

type WebsiteResolution = {
  kind: 'socials';
  domain: string;
  website_url: string;
  socials: HydratedSocial[];
};


/** Detect if a raw string is a direct social profile URL. */
function detectDirectProfile(raw: string): DirectProfile | null {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  const withProto = /^https?:\/\//.test(lower) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try { url = new URL(withProto); } catch { return null; }
  const host = url.hostname.replace(/^www\./, '').toLowerCase();

  if (host === 'tiktok.com') {
    const m = url.pathname.match(/^\/@([\w.-]+)/);
    if (m) return { kind: 'profile', platform: 'tiktok', username: m[1], profile_url: `https://www.tiktok.com/@${m[1]}` };
  }
  if (host === 'instagram.com') {
    const m = url.pathname.match(/^\/([\w.]+)/);
    if (m && m[1] && !['p', 'reel', 'explore', 'stories'].includes(m[1])) {
      return { kind: 'profile', platform: 'instagram', username: m[1], profile_url: `https://www.instagram.com/${m[1]}/` };
    }
  }
  if (host === 'facebook.com' || host === 'fb.com') {
    const m = url.pathname.match(/^\/([\w.-]+)/);
    if (m && m[1] && !['pages', 'profile.php', 'people'].includes(m[1])) {
      return { kind: 'profile', platform: 'facebook', username: m[1], profile_url: `https://www.facebook.com/${m[1]}` };
    }
  }
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const m = url.pathname.match(/^\/(@[\w.-]+|channel\/[\w-]+|c\/[\w.-]+)/);
    if (m) {
      const handle = m[1].startsWith('@') ? m[1] : `@${m[1].split('/').pop()}`;
      return { kind: 'profile', platform: 'youtube', username: handle.replace(/^@/, ''), profile_url: `https://www.youtube.com/${handle}` };
    }
  }
  return null;
}

/** Detect if a raw string looks like a website (domain) we should crawl. */
function detectWebsite(raw: string): string | null {
  const trimmed = raw.trim();
  const withProto = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProto);
    // A hostname with at least one dot and no "@" is treated as a website.
    if (url.hostname.includes('.') && !url.hostname.includes('@')) {
      return url.toString();
    }
  } catch { /* not a URL */ }
  return null;
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  // Admin-only (same as other competitor routes).
  const adminClient = createAdminClient();
  const { data: userRow } = await adminClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (userRow?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const direct = detectDirectProfile(parsed.data.input);
  if (direct) {
    return NextResponse.json(direct);
  }

  const websiteUrl = detectWebsite(parsed.data.input);
  if (!websiteUrl) {
    return NextResponse.json(
      { error: 'Could not understand input. Paste a social profile URL or a website domain.' },
      { status: 400 },
    );
  }

  try {
    const result = await scrapeWebsite(websiteUrl);
    const ALLOWED: Platform[] = ['tiktok', 'instagram', 'facebook', 'youtube'];

    // Dedupe to one entry per (platform, username) before hydrating — the
    // scraper often picks the same handle up from both header and footer,
    // and we don't want to burn two Apify runs on it.
    const seen = new Set<string>();
    const raw = (result.socialLinks ?? [])
      .filter((s) => ALLOWED.includes(s.platform as Platform) && s.username.length > 0)
      .map((s) => ({
        platform: s.platform as Platform,
        username: s.username,
        profile_url: s.url,
      }))
      .filter((s) => {
        const key = `${s.platform}:${s.username.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    // Return rows immediately with `verified: false` + null metadata.
    // The frontend fires one /hydrate-social call per row in parallel so
    // each lights up as its Apify/Data-API lookup completes.
    const socials: HydratedSocial[] = raw.map((s) => ({
      platform: s.platform,
      username: s.username,
      profile_url: s.profile_url,
      display_name: null,
      avatar_url: null,
      followers: null,
      verified: false,
    }));

    const payload: WebsiteResolution = {
      kind: 'socials',
      domain: new URL(websiteUrl).hostname.replace(/^www\./, ''),
      website_url: websiteUrl,
      socials,
    };
    return NextResponse.json(payload);
  } catch (err) {
    console.error('[competitors/resolve] scrape failed', err);
    return NextResponse.json(
      { error: 'Could not reach that website' },
      { status: 502 },
    );
  }
}
