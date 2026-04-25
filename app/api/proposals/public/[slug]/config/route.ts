import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { publicProposalUrl } from '@/lib/proposals/public-url';
import type { AgencyBrand } from '@/lib/agency/detect';

/**
 * Replaces the per-folder client.json that the original CF-hosted sign page
 * fetched. Returns the same shape the sign page's JS expects: tier prices +
 * agreement title + autofill fields. Source of truth is the proposals row +
 * its linked proposal_template.
 *
 * Tier dollar values come from `proposal_templates.tiers_preview`. We expect
 * each tier object to include `total_cents` + `deposit_cents` + `subscription`
 * + `cadence`. The seed in migration 160 is enriched at the end of this file
 * via SQL — see ENRICH_TIERS comment below.
 */

export const dynamic = 'force-dynamic';

type TierPreview = {
  id: string;
  name: string;
  monthly_cents?: number;
  total_cents?: number;
  deposit_cents?: number;
  subscription?: boolean;
  cadence?: 'month' | 'year' | 'week';
};

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const admin = createAdminClient();

  const { data: proposal } = await admin
    .from('proposals')
    .select(
      'id, slug, title, status, signer_legal_entity, signer_address, template_id, agency',
    )
    .eq('slug', slug)
    .maybeSingle();
  if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (proposal.status === 'draft' || proposal.status === 'canceled') {
    return NextResponse.json({ error: 'Not available' }, { status: 404 });
  }

  const { data: template } = await admin
    .from('proposal_templates')
    .select('name, source_folder, tiers_preview')
    .eq('id', proposal.template_id)
    .maybeSingle();
  if (!template) return NextResponse.json({ error: 'Template missing' }, { status: 500 });

  const tiers: Record<string, { name: string; total: number; deposit: number; subscription: boolean; cadence?: string }> = {};
  for (const t of (template.tiers_preview ?? []) as TierPreview[]) {
    const monthly = t.monthly_cents ?? 0;
    const totalCents = t.total_cents ?? monthly;
    const depositCents = t.deposit_cents ?? monthly;
    tiers[t.id] = {
      name: t.name,
      total: Math.round(totalCents / 100),
      deposit: Math.round(depositCents / 100),
      subscription: t.subscription ?? Boolean(t.cadence),
      cadence: t.cadence,
    };
  }

  // Canonical Cortex-hosted URL for the proposal — baked into the signed PDF.
  const agency: AgencyBrand = (proposal.agency as AgencyBrand | null) ?? 'anderson';
  const proposalUrl = publicProposalUrl(agency, proposal.slug);

  return NextResponse.json({
    slug: proposal.slug,
    projectName: proposal.title,
    projectShortName: template.name,
    proposalUrl,
    agreementTitle: template.name,
    clientLegalName: proposal.signer_legal_entity ?? '',
    clientName: proposal.signer_legal_entity ?? '',
    clientAddress: proposal.signer_address ?? '',
    tiers,
  });
}
