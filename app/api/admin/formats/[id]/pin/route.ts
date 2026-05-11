// VFF-09 T08: per-brand "Pinned" collection toggle.
// Body: { client_id: uuid }. Collection auto-created on first POST.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { gateAdmin, getOrCreateCollection } from '../_auth';

export const dynamic = 'force-dynamic';

const PinSchema = z.object({ client_id: z.string().uuid() });

async function parseBody(req: Request) {
  try {
    return PinSchema.safeParse(await req.json());
  } catch {
    return PinSchema.safeParse(null);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await gateAdmin(id);
  if (!gate.ok) return gate.res;

  const body = await parseBody(req);
  if (!body.success) {
    return NextResponse.json({ error: 'Invalid body', issues: body.error.issues }, { status: 400 });
  }

  const collectionId = await getOrCreateCollection(gate.admin, {
    client_id: body.data.client_id,
    created_by: gate.user_id,
    name: 'Pinned',
  });
  if (!collectionId) {
    return NextResponse.json({ error: 'Could not create Pinned collection' }, { status: 500 });
  }

  const { error } = await gate.admin
    .from('viral_collection_videos')
    .upsert(
      { collection_id: collectionId, video_id: gate.video_id },
      { onConflict: 'collection_id,video_id', ignoreDuplicates: true },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ collection_id: collectionId, is_pinned: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await gateAdmin(id);
  if (!gate.ok) return gate.res;

  const body = await parseBody(req);
  if (!body.success) {
    return NextResponse.json({ error: 'Invalid body', issues: body.error.issues }, { status: 400 });
  }

  const { data: existing } = await gate.admin
    .from('viral_collections')
    .select('id')
    .eq('client_id', body.data.client_id)
    .eq('name', 'Pinned')
    .maybeSingle();
  if (existing) {
    await gate.admin
      .from('viral_collection_videos')
      .delete()
      .eq('collection_id', (existing as { id: string }).id)
      .eq('video_id', gate.video_id);
  }

  return NextResponse.json({ is_pinned: false });
}
