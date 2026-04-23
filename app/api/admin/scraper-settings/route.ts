import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { invalidateScraperSettingsCache, SCRAPER_DEFAULTS } from '@/lib/search/scraper-settings';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, body: { error: 'unauthorized' } };

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  if (me?.role !== 'admin' && !me?.is_super_admin) {
    return { ok: false as const, status: 403, body: { error: 'forbidden' } };
  }
  return { ok: true as const, user, admin };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const { data, error } = await auth.admin
    .from('scraper_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    settings: data ?? {
      id: 1,
      reddit_posts: SCRAPER_DEFAULTS.reddit.posts,
      reddit_comments_per_post: SCRAPER_DEFAULTS.reddit.commentPosts,
      youtube_videos: SCRAPER_DEFAULTS.youtube.videos,
      youtube_comment_videos: SCRAPER_DEFAULTS.youtube.commentVideos,
      youtube_transcript_videos: SCRAPER_DEFAULTS.youtube.transcriptVideos,
      tiktok_videos: SCRAPER_DEFAULTS.tiktok.videos,
      tiktok_comment_videos: SCRAPER_DEFAULTS.tiktok.commentVideos,
      tiktok_transcript_videos: SCRAPER_DEFAULTS.tiktok.transcriptVideos,
      web_results: SCRAPER_DEFAULTS.web.results,
    },
  });
}

const posInt = z.number().int().min(0).max(5000);

const UpdateSchema = z.object({
  reddit_posts: posInt.optional(),
  reddit_comments_per_post: posInt.optional(),
  youtube_videos: posInt.optional(),
  youtube_comment_videos: posInt.optional(),
  youtube_transcript_videos: posInt.optional(),
  tiktok_videos: posInt.optional(),
  tiktok_comment_videos: posInt.optional(),
  tiktok_transcript_videos: posInt.optional(),
  web_results: posInt.optional(),
});

export async function PUT(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid payload', details: parsed.error.flatten() }, { status: 400 });
  }

  const patch = { ...parsed.data, updated_at: new Date().toISOString(), updated_by: auth.user.id };

  const { data, error } = await auth.admin
    .from('scraper_settings')
    .update(patch)
    .eq('id', 1)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateScraperSettingsCache();
  return NextResponse.json({ settings: data });
}
