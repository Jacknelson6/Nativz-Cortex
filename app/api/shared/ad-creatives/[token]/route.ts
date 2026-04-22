import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { evaluateShareToken } from '@/lib/ad-creatives/share-token';

/**
 * Public read — no auth required. Middleware's `/shared/` bypass covers
 * this route, and we use the service-role admin client to look up the
 * token + scoped concept list without needing any session.
 *
 * Payload is trimmed to what the client-facing gallery needs: concept
 * fields plus comment counts per card. The full image_prompt is
 * omitted (it's admin-internal) — the client sees visual_description
 * which reads like plain English.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 20) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

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

  const clientId = status.token.client_id;
  const batchId = status.token.batch_id;

  // Client name for the page title — no logo URL or brand DNA, we keep the
  // client-facing surface free of internal artifacts.
  const clientPromise = admin
    .from('clients')
    .select('name')
    .eq('id', clientId)
    .maybeSingle();

  // Scope concepts by batch if the token was batch-locked; else show the
  // full client gallery (pending+approved — rejected are hidden from the
  // client to avoid confusion).
  let conceptsQuery = admin
    .from('ad_concepts')
    .select(
      'id, slug, template_name, headline, body_copy, visual_description, source_grounding, image_storage_path, status, position, created_at',
    )
    .eq('client_id', clientId)
    .in('status', ['pending', 'approved'])
    .order('created_at', { ascending: false })
    .limit(500);
  if (batchId) conceptsQuery = conceptsQuery.eq('batch_id', batchId);

  const [{ data: clientRow }, { data: concepts }] = await Promise.all([
    clientPromise,
    conceptsQuery,
  ]);

  // Comment counts per concept — one round-trip to aggregate, parsed
  // into a lookup for the UI.
  const conceptIds = (concepts ?? []).map((c) => c.id);
  let commentCounts: Record<string, number> = {};
  let commentsByConcept: Record<string, Array<Record<string, unknown>>> = {};
  if (conceptIds.length > 0) {
    const { data: commentRows } = await admin
      .from('ad_concept_comments')
      .select('id, concept_id, author_name, body, kind, created_at')
      .in('concept_id', conceptIds)
      .order('created_at', { ascending: true });
    for (const c of commentRows ?? []) {
      const id = c.concept_id as string;
      commentCounts[id] = (commentCounts[id] ?? 0) + 1;
      if (!commentsByConcept[id]) commentsByConcept[id] = [];
      commentsByConcept[id].push(c as unknown as Record<string, unknown>);
    }
  }

  return NextResponse.json({
    clientName: clientRow?.name ?? 'Client',
    label: status.token.label,
    batchId,
    concepts: (concepts ?? []).map((c) => ({
      ...c,
      commentCount: commentCounts[c.id] ?? 0,
      comments: commentsByConcept[c.id] ?? [],
    })),
  });
}
