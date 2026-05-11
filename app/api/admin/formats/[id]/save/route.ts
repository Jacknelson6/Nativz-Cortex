// VFF-09 T07: per-user "Saved" collection toggle.
// POST inserts (idempotent), DELETE removes. Collection auto-created
// on first POST with client_id=null + created_by=user.id + name='Saved'.

import { NextResponse } from 'next/server';
import { gateAdmin, getOrCreateCollection } from '../_auth';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await gateAdmin(id);
  if (!gate.ok) return gate.res;

  const collectionId = await getOrCreateCollection(gate.admin, {
    client_id: null,
    created_by: gate.user_id,
    name: 'Saved',
  });
  if (!collectionId) {
    return NextResponse.json({ error: 'Could not create Saved collection' }, { status: 500 });
  }

  // ON CONFLICT DO NOTHING via upsert. PK is (collection_id, video_id).
  const { error } = await gate.admin
    .from('viral_collection_videos')
    .upsert(
      { collection_id: collectionId, video_id: gate.video_id },
      { onConflict: 'collection_id,video_id', ignoreDuplicates: true },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ collection_id: collectionId, is_saved: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await gateAdmin(id);
  if (!gate.ok) return gate.res;

  const collectionId = await getOrCreateCollection(gate.admin, {
    client_id: null,
    created_by: gate.user_id,
    name: 'Saved',
  });
  if (!collectionId) {
    return NextResponse.json({ is_saved: false });
  }

  await gate.admin
    .from('viral_collection_videos')
    .delete()
    .eq('collection_id', collectionId)
    .eq('video_id', gate.video_id);

  return NextResponse.json({ is_saved: false });
}
