import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NewProposalForm } from '@/components/admin/proposals/new-proposal-form';

export const dynamic = 'force-dynamic';

export default async function NewProposalPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isAdmin = me?.is_super_admin === true || me?.role === 'admin' || me?.role === 'super_admin';
  if (!isAdmin) redirect('/admin/dashboard');

  const { data: clients } = await admin
    .from('clients')
    .select('id, name, slug')
    .eq('hide_from_roster', false)
    .order('name');

  return (
    <div className="cortex-page-gutter max-w-3xl mx-auto space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-text/80">
          Cortex · admin · proposals
        </p>
        <h1 className="text-2xl font-semibold text-text-primary">New proposal</h1>
        <p className="text-sm text-text-muted">
          Create a draft. You&rsquo;ll assemble packages + terms on the next screen, then send it
          to the signer.
        </p>
      </header>

      <NewProposalForm
        clients={(clients ?? []).map((c) => ({
          id: c.id,
          name: c.name ?? 'Unnamed',
          slug: c.slug ?? '',
        }))}
      />
    </div>
  );
}
