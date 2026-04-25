import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ProposalServicesClient } from '@/components/admin/proposals/proposal-services-client';

export const dynamic = 'force-dynamic';

/**
 * /admin/proposals/services — service catalog admin. Add / edit services
 * the chat-driven proposal builder draws from. Includes a "Paste a
 * proposal" panel that runs the source through an LLM extractor and
 * pre-fills new-service forms with the suggestions.
 */
export default async function ProposalServicesPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isAdmin = me?.is_super_admin === true || me?.role === 'admin' || me?.role === 'super_admin';
  if (!isAdmin) redirect('/admin/dashboard');

  const { data: services } = await admin
    .from('proposal_services')
    .select('id, agency, slug, name, category, description, scope_md, included_items, billing_unit, base_unit_price_cents, default_quantity, active, updated_at')
    .order('agency')
    .order('category')
    .order('name');

  return (
    <div className="cortex-page-gutter max-w-5xl mx-auto py-6 space-y-6">
      <ProposalServicesClient initialServices={(services ?? []) as never} />
    </div>
  );
}
