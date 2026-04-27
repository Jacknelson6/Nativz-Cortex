import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const VariantSchema = z
  .object({
    tiktok: z.string().max(2000).optional(),
    instagram: z.string().max(2000).optional(),
    youtube: z.string().max(2000).optional(),
    facebook: z.string().max(2000).optional(),
  })
  .strict();

const PatchSchema = z.object({
  caption: z.string().min(1).max(2000).optional(),
  hashtags: z.array(z.string()).optional(),
  scheduledAt: z.string().datetime().optional(),
  captionVariants: VariantSchema.optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; videoId: string }> },
) {
  const { id, videoId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: video } = await admin
    .from('content_drop_videos')
    .select('id, drop_id, status, scheduled_post_id')
    .eq('id', videoId)
    .eq('drop_id', id)
    .single();
  if (!video) return NextResponse.json({ error: 'video not found' }, { status: 404 });
  if (video.scheduled_post_id) {
    return NextResponse.json(
      { error: 'video already scheduled — edit via the scheduler instead' },
      { status: 409 },
    );
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.caption !== undefined) update.draft_caption = parsed.data.caption;
  if (parsed.data.hashtags !== undefined) {
    update.draft_hashtags = parsed.data.hashtags
      .map((h) => h.replace(/^#/, '').trim())
      .filter(Boolean);
  }
  if (parsed.data.scheduledAt !== undefined) update.draft_scheduled_at = parsed.data.scheduledAt;
  if (parsed.data.captionVariants !== undefined) {
    const cleaned: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed.data.captionVariants)) {
      const trimmed = (value ?? '').trim();
      if (trimmed) cleaned[key] = trimmed;
    }
    update.caption_variants = cleaned;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  const { data, error } = await admin
    .from('content_drop_videos')
    .update(update)
    .eq('id', videoId)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ video: data });
}
