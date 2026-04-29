import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { postToGoogleChatSafe } from '@/lib/chat/post-to-google-chat';

const BodySchema = z.object({
  action: z.enum(['notify', 'skip']),
});

interface PendingVideo {
  id: string;
  scheduled_post_id: string | null;
  revised_video_url: string | null;
  revised_video_uploaded_at: string | null;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: link } = await admin
    .from('content_drop_share_links')
    .select('id, drop_id, post_review_link_map, expires_at, included_post_ids')
    .eq('token', token)
    .single<{
      id: string;
      drop_id: string;
      post_review_link_map: Record<string, string>;
      expires_at: string;
      included_post_ids: string[];
    }>();
  if (!link) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { data: pendingVideos } = await admin
    .from('content_drop_videos')
    .select('id, scheduled_post_id, revised_video_url, revised_video_uploaded_at')
    .eq('drop_id', link.drop_id)
    .eq('revised_video_notify_pending', true);

  const pending = (pendingVideos ?? []) as PendingVideo[];
  const pendingForLink = pending.filter(
    (v) => v.scheduled_post_id && link.included_post_ids?.includes(v.scheduled_post_id),
  );

  if (pendingForLink.length === 0) {
    return NextResponse.json({ ok: true, count: 0, action: parsed.data.action });
  }

  // Always clear the pending flags afterward — both Notify and Skip.
  const ids = pendingForLink.map((v) => v.id);

  if (parsed.data.action === 'skip') {
    await admin
      .from('content_drop_videos')
      .update({ revised_video_notify_pending: false })
      .in('id', ids);
    return NextResponse.json({ ok: true, count: pendingForLink.length, action: 'skip' });
  }

  // action === 'notify' — emit chat ping + comment row.
  const { data: drop } = await admin
    .from('content_drops')
    .select('id, clients(name, chat_webhook_url)')
    .eq('id', link.drop_id)
    .single<{
      id: string;
      clients: { name: string; chat_webhook_url: string | null } | null;
    }>();
  const clientName = drop?.clients?.name ?? 'Client';
  const chatWebhookUrl = drop?.clients?.chat_webhook_url ?? null;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  const shareUrl = `${appUrl}/c/${token}`;

  const { data: editorRow } = await admin
    .from('users')
    .select('full_name, email')
    .eq('id', user.id)
    .maybeSingle<{ full_name: string | null; email: string | null }>();
  const editorName =
    editorRow?.full_name?.trim() || editorRow?.email?.split('@')[0] || 'Editor';

  if (chatWebhookUrl) {
    const word = pendingForLink.length === 1 ? 'video has' : 'videos have';
    const text =
      `*${editorName}* re-uploaded ${pendingForLink.length} revised ${word} for *${clientName}*.\n` +
      `Open the share link to review the new cuts:\n${shareUrl}`;
    postToGoogleChatSafe(chatWebhookUrl, { text }, `revised-videos ${link.drop_id}`);
  }

  // Drop a comment row per re-uploaded post so the share link history reads as
  // an audit trail. Use the first review_link_id for posts in the link.
  const reviewLinkByPost = link.post_review_link_map ?? {};
  for (const v of pendingForLink) {
    const reviewLinkId = reviewLinkByPost[v.scheduled_post_id ?? ''];
    if (!reviewLinkId) continue;
    await admin.from('post_review_comments').insert({
      review_link_id: reviewLinkId,
      author_name: editorName,
      content: 'Revised video uploaded',
      status: 'video_revised',
      attachments: [],
      metadata: {
        revised_video_url: v.revised_video_url,
        uploaded_at: v.revised_video_uploaded_at,
      },
    });
  }

  await admin
    .from('content_drop_videos')
    .update({ revised_video_notify_pending: false })
    .in('id', ids);

  return NextResponse.json({ ok: true, count: pendingForLink.length, action: 'notify' });
}
