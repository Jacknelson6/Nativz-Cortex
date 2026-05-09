import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

const BodySchema = z.object({
  postId: z.string().uuid(),
  authorName: z.string().min(1).max(80),
  caption: z.string().max(5000),
});

/**
 * Split a user-edited caption blob into the body text + the hashtag column.
 *
 * The publisher cron (`/api/cron/publish-posts`) and Zernio expect hashtags
 * as a separate array, but the share-link UI presents them merged so
 * reviewers can edit one field. We pull only the *trailing* block of
 * pure-hashtag lines (i.e. lines whose tokens all start with `#`) and
 * leave any mid-sentence `#word` inline. That way "Going #live tomorrow"
 * stays in the caption text, but a bottom block like
 *
 *   This week we shipped X.
 *
 *   #marketing #shorts #fyp
 *
 * splits cleanly with `["marketing", "shorts", "fyp"]` in the array and
 * the body text on top.
 */
function splitMergedCaption(merged: string): { captionText: string; hashtags: string[] } {
  const lines = merged.split('\n');
  let cut = lines.length;
  let i = lines.length - 1;
  // Skip pure-blank trailing lines.
  while (i >= 0 && lines[i].trim() === '') i--;
  while (i >= 0) {
    const trimmed = lines[i].trim();
    if (trimmed === '') {
      i--;
      continue;
    }
    const tokens = trimmed.split(/\s+/);
    if (tokens.every((t) => /^#\w+$/.test(t))) {
      cut = i;
      i--;
    } else {
      break;
    }
  }
  const trailing = lines.slice(cut).join(' ');
  const seen = new Set<string>();
  const hashtags: string[] = [];
  for (const m of trailing.matchAll(/#(\w+)/g)) {
    const key = m[1].toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      hashtags.push(m[1]);
    }
  }
  return {
    captionText: lines.slice(0, cut).join('\n').trimEnd(),
    hashtags,
  };
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: link } = await admin
    .from('content_drop_share_links')
    .select('drop_id, post_review_link_map, expires_at, included_post_ids')
    .eq('token', token)
    .single<{
      drop_id: string;
      post_review_link_map: Record<string, string>;
      expires_at: string;
      included_post_ids: string[];
    }>();
  if (!link) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'link expired' }, { status: 410 });
  }

  if (!link.included_post_ids?.includes(parsed.data.postId)) {
    return NextResponse.json({ error: 'post is not part of this share link' }, { status: 400 });
  }
  const reviewLinkId = link.post_review_link_map?.[parsed.data.postId];
  if (!reviewLinkId) {
    return NextResponse.json({ error: 'post is not part of this share link' }, { status: 400 });
  }

  const newMerged = parsed.data.caption.trim();
  const { captionText: newCaption, hashtags: newHashtags } = splitMergedCaption(newMerged);

  const { data: post } = await admin
    .from('scheduled_posts')
    .select('id, caption, hashtags, scheduled_at')
    .eq('id', parsed.data.postId)
    .single<{ id: string; caption: string | null; hashtags: string[] | null; scheduled_at: string | null }>();
  if (!post) return NextResponse.json({ error: 'post not found' }, { status: 404 });

  // Build the previous merged form so the no-op check matches what the user
  // saw before they hit Save (otherwise re-submitting an unchanged blob with
  // hashtags would always look "changed" because we compare body-only).
  const prevCaption = post.caption ?? '';
  const prevHashtags = post.hashtags ?? [];
  const previousMerged =
    prevCaption +
    (prevHashtags.length > 0
      ? (prevCaption.trim().length > 0 ? '\n\n' : '') + prevHashtags.map((h) => `#${h}`).join(' ')
      : '');
  if (previousMerged.trim() === newMerged) {
    return NextResponse.json({ error: 'caption unchanged' }, { status: 400 });
  }

  const { error: updErr } = await admin
    .from('scheduled_posts')
    .update({ caption: newCaption, hashtags: newHashtags })
    .eq('id', parsed.data.postId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  const { data: commentRow, error: insErr } = await admin
    .from('post_review_comments')
    .insert({
      review_link_id: reviewLinkId,
      author_name: parsed.data.authorName.trim(),
      content: 'Updated the caption',
      status: 'caption_edit',
      // Store the merged form so the timeline diff matches what the
      // reviewer actually edited in the textarea.
      caption_before: previousMerged,
      caption_after: newMerged,
      attachments: [],
    })
    .select('id, review_link_id, author_name, content, status, created_at, attachments, caption_before, caption_after, metadata')
    .single();
  if (insErr || !commentRow) {
    return NextResponse.json({ error: insErr?.message ?? 'failed to record edit' }, { status: 500 });
  }

  return NextResponse.json({
    caption: newCaption,
    hashtags: newHashtags,
    comment: commentRow,
  });
}
