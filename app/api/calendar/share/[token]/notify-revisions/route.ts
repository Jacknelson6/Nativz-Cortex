import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { postToGoogleChatSafe } from '@/lib/chat/post-to-google-chat';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { sendCalendarRevisedVideosEmail } from '@/lib/email/resend';
import { syncMondayApprovalForDrop } from '@/lib/monday/calendar-approval';
import { summarizeRevisionEdits } from '@/lib/calendar/summarize-revisions';

// Same role exclusions as scripts/send-calendar-batch.ts — keep these in sync.
// Paid-media-only POCs don't care about organic content; "Avoid bulk" is a
// manual flag for contacts who get hand-curated comms only.
const EXCLUDE_ROLE_PATTERNS = [/paid media only/i, /avoid bulk/i];

function firstName(full: string): string {
  return (full.split(/\s+/)[0] || full).trim();
}

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
    // Notify-pending flags just flipped false; recompute and push the Monday
    // label. With no pending notifies, the calendar drops out of "Revised"
    // back into "Waiting on approval".
    after(async () => {
      try {
        await syncMondayApprovalForDrop(admin, link.drop_id);
      } catch (err) {
        console.error('[notify-revisions:skip] Monday sync failed:', err);
      }
    });
    return NextResponse.json({ ok: true, count: pendingForLink.length, action: 'skip' });
  }

  // action === 'notify' — emit chat ping + comment row + email POCs.
  const { data: drop } = await admin
    .from('content_drops')
    .select('id, client_id, clients(id, name, agency, chat_webhook_url)')
    .eq('id', link.drop_id)
    .single<{
      id: string;
      client_id: string;
      clients: {
        id: string;
        name: string;
        agency: string | null;
        chat_webhook_url: string | null;
      } | null;
    }>();
  const clientName = drop?.clients?.name ?? 'Client';
  const clientId = drop?.clients?.id ?? drop?.client_id ?? null;
  const agency = getBrandFromAgency(drop?.clients?.agency ?? null);
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

  // Build the email payload. We pull every `changes_requested` comment on the
  // review_links of revised-and-pending posts, then ask the LLM to translate
  // them into past-tense "what we did" bullets. The reviewer's exact words
  // would read awkward bounced back at them; the LLM rewrite makes the email
  // sound like the editing team is reporting on a finished job.
  const pendingPostIds = pendingForLink
    .map((v) => v.scheduled_post_id)
    .filter((id): id is string => !!id);
  const reviewLinkByPost = link.post_review_link_map ?? {};
  const reviewLinkIds = pendingPostIds
    .map((pid) => reviewLinkByPost[pid])
    .filter((id): id is string => !!id);

  const [commentsRes, contactsRes] = await Promise.all([
    reviewLinkIds.length > 0
      ? admin
          .from('post_review_comments')
          .select('review_link_id, content, created_at')
          .in('review_link_id', reviewLinkIds)
          .eq('status', 'changes_requested')
          .order('created_at', { ascending: true })
      : Promise.resolve({
          data: [] as Array<{ review_link_id: string; content: string; created_at: string }>,
        }),
    clientId
      ? admin
          .from('contacts')
          .select('name, email, role')
          .eq('client_id', clientId)
      : Promise.resolve({
          data: [] as Array<{ name: string; email: string | null; role: string | null }>,
        }),
  ]);

  const allChangeRequests = ((commentsRes.data ?? []) as Array<{
    review_link_id: string;
    content: string;
    created_at: string;
  }>)
    .map((c) => (c.content ?? '').trim())
    .filter((s) => s.length > 0);

  const eligibleContacts = ((contactsRes.data ?? []) as Array<{
    name: string;
    email: string | null;
    role: string | null;
  }>).filter(
    (c) =>
      !!c.email && !EXCLUDE_ROLE_PATTERNS.some((re) => re.test(c.role ?? '')),
  );

  if (eligibleContacts.length > 0) {
    const summaryBullets = await summarizeRevisionEdits(allChangeRequests);

    const recipients = eligibleContacts.map((c) => c.email!) as string[];
    const pocFirstNames = eligibleContacts.map((c) => firstName(c.name));

    try {
      const result = await sendCalendarRevisedVideosEmail({
        to: recipients,
        pocFirstNames,
        clientName,
        shareUrl,
        summaryBullets,
        revisedCount: pendingForLink.length,
        agency,
        clientId: clientId ?? undefined,
        dropId: link.drop_id,
      });
      if (!result.ok) {
        console.error(
          '[notify-revisions] revised-videos email failed:',
          result.error,
        );
      }
    } catch (err) {
      console.error('[notify-revisions] revised-videos email threw:', err);
    }
  } else {
    console.warn(
      `[notify-revisions] no eligible POC contacts for client ${clientId ?? '?'}; skipping email`,
    );
  }

  // Drop a comment row per re-uploaded post so the share link history reads as
  // an audit trail. Reuses `reviewLinkByPost` resolved above.
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

  // Ball is back in the client's court — recompute the Monday approval label
  // and push. With no remaining notify-pending rows, the calendar falls out
  // of "Revised" and back into "Waiting on approval". Wrapped in `after()`
  // so the response returns immediately; Vercel keeps the function alive.
  after(async () => {
    try {
      await syncMondayApprovalForDrop(admin, link.drop_id);
    } catch (err) {
      console.error('[notify-revisions:notify] Monday sync failed:', err);
    }
  });

  return NextResponse.json({ ok: true, count: pendingForLink.length, action: 'notify' });
}
