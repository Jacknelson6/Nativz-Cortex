import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TemplatesEditor } from './editor';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export type TierPreview = {
  id: string;
  name: string;
  monthly_cents?: number | null;
  total_cents?: number | null;
  deposit_cents?: number | null;
  cadence?: 'month' | 'year' | 'week' | null;
  subscription?: boolean | null;
  stripe_payment_link?: string | null;
};

export type TemplateRow = {
  id: string;
  agency: 'anderson' | 'nativz';
  name: string;
  source_folder: string;
  active: boolean;
  tiers: TierPreview[];
};

export default async function ProposalTemplatesPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login?next=/admin/proposals/templates');

  const admin = createAdminClient();
  const { data: userRow } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .maybeSingle();
  const isAdmin = userRow?.role === 'admin' || userRow?.is_super_admin === true;
  if (!isAdmin) redirect('/');

  const { data: rows } = await admin
    .from('proposal_templates')
    .select('id, agency, name, source_folder, active, tiers_preview')
    .eq('active', true)
    .order('agency')
    .order('name');

  const templates: TemplateRow[] = (rows ?? []).map((r) => ({
    id: r.id,
    agency: r.agency as 'anderson' | 'nativz',
    name: r.name,
    source_folder: r.source_folder,
    active: r.active,
    tiers: ((r.tiers_preview ?? []) as TierPreview[]).filter((t) => t.id),
  }));

  return (
    <div className="cortex-page-gutter max-w-3xl space-y-8">
      <header>
        <h1 className="ui-page-title-md">Proposal templates</h1>
        <p className="text-sm text-text-muted">
          Per-tier Stripe payment links for offer-link signing. Paste a Stripe payment link per tier; the offer flow uses it for the post-sign redirect.
        </p>
      </header>
      <TemplatesEditor templates={templates} />
    </div>
  );
}
