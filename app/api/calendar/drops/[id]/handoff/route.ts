import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import {
  appendHistory,
  canTransition,
  type HandoffHistoryEntry,
  type HandoffState,
} from '@/lib/calendar/handoff-state';

const RequestSchema = z.object({
  note: z.string().max(500).optional(),
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

  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: drop, error } = await admin
    .from('content_drops')
    .select('id, handoff_state, handoff_history')
    .eq('id', id)
    .single();
  if (error || !drop) {
    return NextResponse.json({ error: 'drop not found' }, { status: 404 });
  }

  const currentState = drop.handoff_state as HandoffState;
  const targetState: HandoffState = 'smm_review';

  if (!canTransition(currentState, targetState)) {
    return NextResponse.json(
      {
        error: 'invalid transition',
        handoff_state: currentState,
        hint:
          currentState === 'smm_review'
            ? 'this drop is already awaiting SMM review'
            : currentState === 'client_sent'
              ? 'this drop has already been sent to the client'
              : `cannot move from ${currentState} to ${targetState}`,
      },
      { status: 409 },
    );
  }

  // Refuse handoff when the drop has zero scheduled posts (nothing for the SMM to review)
  // or when every post is already published. Posts are linked to drops via
  // content_drop_videos.scheduled_post_id, so we resolve through that join.
  const { data: videoRows, error: postsError } = await admin
    .from('content_drop_videos')
    .select('scheduled_post_id, scheduled_posts:scheduled_post_id(status)')
    .eq('drop_id', id)
    .not('scheduled_post_id', 'is', null);
  if (postsError) {
    return NextResponse.json({ error: 'failed to load posts' }, { status: 500 });
  }
  type VideoWithStatus = {
    scheduled_post_id: string | null;
    scheduled_posts: { status: string } | { status: string }[] | null;
  };
  const postList = (videoRows ?? []) as unknown as VideoWithStatus[];
  if (postList.length === 0) {
    return NextResponse.json(
      {
        error: 'no scheduled posts on this drop',
        handoff_state: currentState,
        hint: 'add posts before handing off to the SMM',
      },
      { status: 409 },
    );
  }
  const statusOf = (row: VideoWithStatus): string | null => {
    const sp = row.scheduled_posts;
    if (!sp) return null;
    return Array.isArray(sp) ? (sp[0]?.status ?? null) : sp.status;
  };
  if (postList.every((row) => statusOf(row) === 'published')) {
    return NextResponse.json(
      {
        error: 'all posts already published',
        handoff_state: currentState,
        hint: 'this drop is finished, nothing left to review',
      },
      { status: 409 },
    );
  }

  const newHistory = appendHistory(
    (drop.handoff_history as HandoffHistoryEntry[] | null) ?? [],
    {
      state: targetState,
      actor: user.id,
      ...(body.note ? { note: body.note } : {}),
    },
  );

  const { error: updateError } = await admin
    .from('content_drops')
    .update({
      handoff_state: targetState,
      handoff_history: newHistory,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (updateError) {
    return NextResponse.json(
      { error: 'failed to update handoff state', detail: updateError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    drop: { id, handoff_state: targetState },
    history: newHistory,
  });
}
