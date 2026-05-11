// VFF-09 T10: "Use this format" CTA.
// Creates a new nerd_conversations row pinned to the video via the
// format_video_id column (added by migration 288). VFF-10 reads this
// column to augment the system prompt; for VFF-09 we just persist.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { gateAdmin } from '../_auth';

export const dynamic = 'force-dynamic';

const UseSchema = z.object({ client_id: z.string().uuid() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await gateAdmin(id);
  if (!gate.ok) return gate.res;

  let body: z.infer<typeof UseSchema>;
  try {
    body = UseSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid body', detail: String(err) }, { status: 400 });
  }

  // Use the source video's title (if any) as the seed conversation
  // title so the strategist's thread list reads like "Use: <hook>"
  // instead of "New conversation".
  const { data: video } = await gate.admin
    .from('viral_videos')
    .select('title, engagement_hook_descriptor, creator_handle')
    .eq('id', gate.video_id)
    .maybeSingle();
  const v = video as {
    title: string | null;
    engagement_hook_descriptor: string | null;
    creator_handle: string | null;
  } | null;
  const titleSeed =
    v?.title?.trim() ||
    v?.engagement_hook_descriptor?.trim() ||
    (v?.creator_handle ? `Format from @${v.creator_handle}` : 'Format conversation');
  const title = `Use: ${titleSeed.slice(0, 70)}`;

  const { data: conv, error } = await gate.admin
    .from('nerd_conversations')
    .insert({
      user_id: gate.user_id,
      client_id: body.client_id,
      format_video_id: gate.video_id,
      title,
    })
    .select('id')
    .single();
  if (error || !conv) {
    return NextResponse.json(
      { error: 'Could not create conversation', detail: error?.message },
      { status: 500 },
    );
  }

  const conversationId = (conv as { id: string }).id;
  return NextResponse.json({
    conversation_id: conversationId,
    redirect_url: `/admin/nerd?conversation=${conversationId}`,
  });
}
