// VFF-09 T09: per-brand dismissal toggle.
// POST upserts into viral_video_brand_dismissals (refreshes
// dismissed_at + reason on conflict). DELETE removes the row.
// Demotes the video in /admin/formats feed (T17) without hiding it.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { gateAdmin } from '../_auth';

export const dynamic = 'force-dynamic';

const DismissSchema = z.object({
  client_id: z.string().uuid(),
  reason: z.string().max(200).optional(),
});

const UndismissSchema = z.object({ client_id: z.string().uuid() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await gateAdmin(id);
  if (!gate.ok) return gate.res;

  let body: z.infer<typeof DismissSchema>;
  try {
    body = DismissSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid body', detail: String(err) }, { status: 400 });
  }

  const { error } = await gate.admin
    .from('viral_video_brand_dismissals')
    .upsert(
      {
        video_id: gate.video_id,
        client_id: body.client_id,
        dismissed_by: gate.user_id,
        reason: body.reason ?? null,
        dismissed_at: new Date().toISOString(),
      },
      { onConflict: 'video_id,client_id' },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ is_dismissed: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await gateAdmin(id);
  if (!gate.ok) return gate.res;

  let body: z.infer<typeof UndismissSchema>;
  try {
    body = UndismissSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid body', detail: String(err) }, { status: 400 });
  }

  await gate.admin
    .from('viral_video_brand_dismissals')
    .delete()
    .eq('video_id', gate.video_id)
    .eq('client_id', body.client_id);

  return NextResponse.json({ is_dismissed: false });
}
