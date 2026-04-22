import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { evaluateShareToken } from '@/lib/ad-creatives/share-token';
import { SharedAdGalleryClient } from '@/components/ad-creatives/shared-ad-gallery-client';

// `[token]` is a dynamic segment so Next treats the render as dynamic by
// default; we don't need to opt out of caching manually.

/**
 * Public shared view of an ad-creative batch. No auth required —
 * middleware's `/shared/` bypass covers this route. The page fetches
 * server-side so the first paint already has the concept grid; comments
 * post via /api/shared/ad-creatives/[token]/comments and the client
 * component optimistically renders them.
 */
export default async function SharedAdCreativesPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token || token.length < 20) notFound();

  const admin = createAdminClient();

  const { data: tokenRow } = await admin
    .from('ad_concept_share_tokens')
    .select('id, token, batch_id, client_id, label, expires_at, revoked_at, created_at')
    .eq('token', token)
    .maybeSingle();

  const status = evaluateShareToken(tokenRow);
  if (!status.ok) {
    return <InvalidShareState reason={status.reason} />;
  }

  const clientId = status.token.client_id;
  const batchId = status.token.batch_id;

  const clientPromise = admin
    .from('clients')
    .select('name, logo_url')
    .eq('id', clientId)
    .maybeSingle();

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

  const conceptIds = (concepts ?? []).map((c) => c.id);
  const { data: commentRows } = conceptIds.length
    ? await admin
        .from('ad_concept_comments')
        .select('id, concept_id, author_name, body, kind, created_at')
        .in('concept_id', conceptIds)
        .order('created_at', { ascending: true })
    : { data: [] };

  const commentsByConcept: Record<string, Array<{
    id: string;
    concept_id: string;
    author_name: string;
    body: string;
    kind: 'comment' | 'approval' | 'rejection';
    created_at: string;
  }>> = {};
  for (const c of (commentRows ?? []) as Array<{
    id: string;
    concept_id: string;
    author_name: string;
    body: string;
    kind: 'comment' | 'approval' | 'rejection';
    created_at: string;
  }>) {
    if (!commentsByConcept[c.concept_id]) commentsByConcept[c.concept_id] = [];
    commentsByConcept[c.concept_id].push(c);
  }

  // Derive the Supabase origin once, server-side, so the client component
  // doesn't need to import public-env (keeps the shared page bundle tiny).
  const supabaseOrigin = (() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    try {
      return supabaseUrl ? new URL(supabaseUrl).origin : '';
    } catch {
      return '';
    }
  })();

  return (
    <SharedAdGalleryClient
      token={token}
      clientName={clientRow?.name ?? 'Client'}
      label={status.token.label ?? null}
      supabaseOrigin={supabaseOrigin}
      initialConcepts={(concepts ?? []).map((c) => ({
        ...c,
        comments: commentsByConcept[c.id] ?? [],
      }))}
    />
  );
}

function InvalidShareState({
  reason,
}: {
  reason: 'not-found' | 'revoked' | 'expired';
}) {
  const copy: Record<typeof reason, { title: string; body: string }> = {
    'not-found': {
      title: 'This link is invalid',
      body: 'Double-check the URL, or ask for a fresh share link.',
    },
    revoked: {
      title: 'This link has been revoked',
      body: 'The person who shared this link pulled it. Ask for a new one.',
    },
    expired: {
      title: 'This link has expired',
      body: 'Share links have a time limit. Ask for a new one.',
    },
  };
  const c = copy[reason];
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-nativz-border bg-surface p-8 text-center shadow-elevated">
        <h1 className="text-xl font-semibold text-text-primary">{c.title}</h1>
        <p className="mt-2 text-sm text-text-muted">{c.body}</p>
      </div>
    </div>
  );
}
