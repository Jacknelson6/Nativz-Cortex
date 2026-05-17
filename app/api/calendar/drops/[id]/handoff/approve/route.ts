import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserAuth } from '@/lib/auth/permissions';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';
import { mintOrRefreshShareLink } from '@/lib/calendar/share-link';
import {
  appendHistory,
  canTransition,
  type HandoffHistoryEntry,
  type HandoffState,
} from '@/lib/calendar/handoff-state';

const RequestSchema = z.object({
  note: z.string().max(500).optional(),
  mintAndSend: z.boolean().optional().default(false),
  clientMessage: z.string().max(2000).optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await req.json().catch(() => ({})));
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid request', detail: err instanceof Error ? err.message : 'parse error' },
      { status: 400 },
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const auth = await getUserAuth(user.id);
  if (!auth || (auth.role !== 'admin' && auth.role !== 'super_admin')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  // TODO: once a granular permissions table exists, gate admin role on
  // permissions.calendar.approve and keep super_admin as the always-allowed
  // fallback. For now any admin can approve.

  const admin = createAdminClient();
  const { data: drop, error: dropErr } = await admin
    .from('content_drops')
    .select('id, client_id, handoff_state, handoff_history, clients(agency)')
    .eq('id', id)
    .single<{
      id: string;
      client_id: string;
      handoff_state: HandoffState;
      handoff_history: HandoffHistoryEntry[] | null;
      clients: { agency: string | null } | null;
    }>();
  if (dropErr || !drop) {
    return NextResponse.json({ error: 'drop not found' }, { status: 404 });
  }

  const currentState = drop.handoff_state;
  if (currentState !== 'smm_review') {
    return NextResponse.json(
      {
        error: 'invalid transition',
        handoff_state: currentState,
        hint:
          currentState === 'editing'
            ? 'editor has not handed off this drop yet'
            : currentState === 'smm_approved'
              ? 'this drop is already approved'
              : currentState === 'client_sent'
                ? 'this drop has already been sent to the client'
                : `cannot approve a drop in state ${currentState}`,
      },
      { status: 409 },
    );
  }

  if (!canTransition(currentState, 'smm_approved')) {
    return NextResponse.json(
      { error: 'invalid transition', handoff_state: currentState },
      { status: 409 },
    );
  }

  const approvedHistory = appendHistory(drop.handoff_history ?? [], {
    state: 'smm_approved',
    actor: user.id,
    ...(body.note ? { note: body.note } : {}),
  });

  const { error: approveErr } = await admin
    .from('content_drops')
    .update({
      handoff_state: 'smm_approved',
      handoff_history: approvedHistory,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (approveErr) {
    return NextResponse.json(
      { error: 'failed to approve drop', detail: approveErr.message },
      { status: 500 },
    );
  }

  if (!body.mintAndSend) {
    return NextResponse.json({
      drop: { id, handoff_state: 'smm_approved' as HandoffState },
      history: approvedHistory,
    });
  }

  // mintAndSend: mint or refresh the share link, but do NOT trigger the
  // email send here. The send route owns email composition + Resend wiring
  // and is invoked separately by the UI (CUP-03) after the link is minted.
  // We still flip the drop to client_sent once the link exists so that the
  // SMM action ("approve and send") leaves the drop in the terminal state
  // the caller expects.
  const { data: videos, error: videosErr } = await admin
    .from('content_drop_videos')
    .select('id, scheduled_post_id')
    .eq('drop_id', id)
    .not('scheduled_post_id', 'is', null);
  if (videosErr) {
    return NextResponse.json(
      { error: 'failed to load posts for share link', detail: videosErr.message },
      { status: 500 },
    );
  }
  const postIds = (videos ?? [])
    .map((v) => v.scheduled_post_id as string | null)
    .filter((p): p is string => typeof p === 'string');
  if (postIds.length === 0) {
    return NextResponse.json(
      { error: 'no scheduled posts on this drop', handoff_state: 'smm_approved' },
      { status: 409 },
    );
  }

  const linkRows = postIds.map((postId) => ({ post_id: postId }));
  const { data: reviewLinks, error: linkErr } = await admin
    .from('post_review_links')
    .insert(linkRows)
    .select('id, post_id');
  if (linkErr || !reviewLinks) {
    return NextResponse.json(
      { error: linkErr?.message ?? 'failed to mint review links' },
      { status: 500 },
    );
  }
  const reviewMap: Record<string, string> = {};
  for (const rl of reviewLinks) {
    reviewMap[rl.post_id as string] = rl.id as string;
  }

  let link;
  try {
    link = await mintOrRefreshShareLink(admin, {
      dropId: id,
      clientId: drop.client_id,
      postIds,
      reviewMap,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'failed to create share link' },
      { status: 500 },
    );
  }

  const sentHistory = appendHistory(approvedHistory, {
    state: 'client_sent',
    actor: user.id,
    note: body.clientMessage ?? body.note ?? 'minted share link via approve-and-send',
  });

  const { error: sentErr } = await admin
    .from('content_drops')
    .update({
      handoff_state: 'client_sent',
      handoff_history: sentHistory,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (sentErr) {
    return NextResponse.json(
      { error: 'failed to mark drop as sent', detail: sentErr.message },
      { status: 500 },
    );
  }

  const appUrl = resolveAppUrl(drop.clients?.agency);
  return NextResponse.json({
    drop: { id, handoff_state: 'client_sent' as HandoffState },
    history: sentHistory,
    shareLink: {
      id: link.id,
      token: link.token,
      expires_at: link.expires_at,
      url: `${appUrl}/s/${link.token}`,
      refreshed: link.refreshed,
    },
  });
}

function resolveAppUrl(agency: string | null | undefined): string {
  const brand = getBrandFromAgency(agency);
  return process.env.NODE_ENV !== 'production'
    ? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
    : getCortexAppUrl(brand);
}
