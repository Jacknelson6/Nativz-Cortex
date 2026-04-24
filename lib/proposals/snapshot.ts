import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Shape we freeze into `proposals.sent_snapshot` on first send. The public
 * signing page reads from this snapshot whenever `status !== 'draft'` so the
 * signer can't be shown a different version than what they agreed to.
 */
export type ProposalSnapshot = {
  version: 1;
  captured_at: string;
  title: string;
  scope_statement: string | null;
  body_markdown: string | null;
  terms_markdown: string | null;
  currency: string;
  total_cents: number | null;
  deposit_cents: number | null;
  packages: Array<{
    id: string;
    name: string;
    description: string | null;
    tier: string | null;
    monthly_cents: number | null;
    annual_cents: number | null;
    setup_cents: number | null;
    sort_order: number;
    deliverables: Array<{
      id: string;
      name: string;
      quantity: string | null;
      sort_order: number;
    }>;
  }>;
};

export async function buildProposalSnapshot(
  admin: SupabaseClient,
  proposalId: string,
): Promise<ProposalSnapshot | null> {
  const { data: proposal } = await admin
    .from('proposals')
    .select(
      'title, scope_statement, body_markdown, terms_markdown, currency, total_cents, deposit_cents',
    )
    .eq('id', proposalId)
    .maybeSingle();
  if (!proposal) return null;

  const { data: packages } = await admin
    .from('proposal_packages')
    .select('id, name, description, tier, monthly_cents, annual_cents, setup_cents, sort_order')
    .eq('proposal_id', proposalId)
    .order('sort_order');

  const pkgIds = (packages ?? []).map((p) => p.id);
  const { data: deliverables } = pkgIds.length
    ? await admin
        .from('proposal_deliverables')
        .select('id, package_id, name, quantity, sort_order')
        .in('package_id', pkgIds)
        .order('sort_order')
    : { data: [] as Array<{ id: string; package_id: string; name: string; quantity: string | null; sort_order: number }> };

  return {
    version: 1,
    captured_at: new Date().toISOString(),
    title: (proposal.title as string) ?? 'Proposal',
    scope_statement: (proposal.scope_statement as string | null) ?? null,
    body_markdown: (proposal.body_markdown as string | null) ?? null,
    terms_markdown: (proposal.terms_markdown as string | null) ?? null,
    currency: (proposal.currency as string) ?? 'usd',
    total_cents: (proposal.total_cents as number | null) ?? null,
    deposit_cents: (proposal.deposit_cents as number | null) ?? null,
    packages: (packages ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      tier: p.tier ?? null,
      monthly_cents: p.monthly_cents ?? null,
      annual_cents: p.annual_cents ?? null,
      setup_cents: p.setup_cents ?? null,
      sort_order: p.sort_order ?? 0,
      deliverables: (deliverables ?? [])
        .filter((d) => d.package_id === p.id)
        .map((d) => ({
          id: d.id,
          name: d.name,
          quantity: d.quantity,
          sort_order: d.sort_order ?? 0,
        })),
    })),
  };
}

export function isValidSnapshot(raw: unknown): raw is ProposalSnapshot {
  if (!raw || typeof raw !== 'object') return false;
  const r = raw as Record<string, unknown>;
  return r.version === 1 && typeof r.title === 'string' && Array.isArray(r.packages);
}
