import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { evaluateShareToken } from '@/lib/ad-creatives/share-token';

const bodySchema = z.object({
  conceptId: z.string().uuid(),
  authorName: z.string().min(1).max(120),
  body: z.string().min(1).max(4000),
  kind: z.enum(['comment', 'approval', 'rejection']).default('comment'),
});

/**
 * Public comment submission via a share link. Validates the token is live,
 * that the target concept belongs to the same client as the token, and
 * that if the token is batch-scoped the concept is from that batch. Then
 * inserts the comment and returns it so the shared page can optimistically
 * render without a refetch.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 20) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }
  const { conceptId, authorName, body, kind } = parsed.data;

  const admin = createAdminClient();

  const { data: tokenRow } = await admin
    .from('ad_concept_share_tokens')
    .select('id, token, batch_id, client_id, label, expires_at, revoked_at, created_at')
    .eq('token', token)
    .maybeSingle();

  const status = evaluateShareToken(tokenRow);
  if (!status.ok) {
    return NextResponse.json({ error: status.reason }, { status: 404 });
  }

  // Verify the concept belongs to the token's client + batch scope so a
  // valid token for client A can't be used to comment on client B's work.
  const { data: concept } = await admin
    .from('ad_concepts')
    .select('id, client_id, batch_id')
    .eq('id', conceptId)
    .maybeSingle();
  if (!concept || concept.client_id !== status.token.client_id) {
    return NextResponse.json({ error: 'Concept not accessible via this link' }, { status: 403 });
  }
  if (status.token.batch_id && concept.batch_id !== status.token.batch_id) {
    return NextResponse.json({ error: 'Concept not in this share' }, { status: 403 });
  }

  const { data: inserted, error } = await admin
    .from('ad_concept_comments')
    .insert({
      concept_id: conceptId,
      share_token_id: status.token.id,
      author_name: authorName.trim(),
      body: body.trim(),
      kind,
    })
    .select('id, concept_id, author_name, body, kind, resolved_at, created_at')
    .single();

  if (error || !inserted) {
    return NextResponse.json(
      { error: error?.message ?? 'Failed to save comment' },
      { status: 500 },
    );
  }

  return NextResponse.json({ comment: inserted }, { status: 201 });
}
