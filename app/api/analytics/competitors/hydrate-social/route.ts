/**
 * POST /api/analytics/competitors/hydrate-social
 *
 * Per-row hydration for a single `{platform, username}`. Called by the
 * "Add competitor" UI once per row after /resolve returns — rows render
 * immediately and then light up individually as each Apify / Data API
 * lookup completes. Keeps wall time bounded by one Apify run rather
 * than N of them serialized.
 *
 * Returns `{ verified: true, display_name, avatar_url, followers, ... }`
 * on success, or `{ verified: false }` when the profile couldn't be
 * confirmed (non-existent handle, private account, API failure). The
 * caller already has a clickable profile URL from /resolve, so an
 * un-hydratable row still renders — it just shows the "Unverified" pill.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  tryTikTokHandleDetailed,
  tryInstagramHandleDetailed,
  lookupYouTubeByHandle,
} from '@/lib/audit/search-competitor-socials';

// Apify TT/IG actors usually finish in 15–30s; give headroom.
export const maxDuration = 60;

const schema = z.object({
  platform: z.enum(['tiktok', 'instagram', 'facebook', 'youtube']),
  username: z.string().min(1).max(200),
});

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const adminClient = createAdminClient();
  const { data: userRow } = await adminClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (userRow?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const { platform, username } = parsed.data;

  try {
    if (platform === 'tiktok') {
      const c = await tryTikTokHandleDetailed(username, username);
      if (c) {
        return NextResponse.json({
          verified: true,
          platform,
          username: c.username,
          profile_url: c.url,
          display_name: c.displayName,
          avatar_url: c.avatarUrl,
          followers: c.followers,
        });
      }
    } else if (platform === 'instagram') {
      const c = await tryInstagramHandleDetailed(username, username);
      if (c) {
        return NextResponse.json({
          verified: true,
          platform,
          username: c.username,
          profile_url: c.url,
          display_name: c.displayName,
          avatar_url: c.avatarUrl,
          followers: c.followers,
        });
      }
    } else if (platform === 'youtube') {
      const c = await lookupYouTubeByHandle(username);
      if (c) {
        return NextResponse.json({
          verified: true,
          platform,
          username: c.username,
          profile_url: c.url,
          display_name: c.displayName,
          avatar_url: c.avatarUrl,
          followers: c.followers,
        });
      }
    }
    // Facebook has no verifier; return unverified.
    return NextResponse.json({ verified: false });
  } catch (err) {
    console.error(`[competitors/hydrate-social] ${platform}/${username} failed`, err);
    return NextResponse.json({ verified: false });
  }
}
