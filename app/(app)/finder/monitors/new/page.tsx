import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NewTrendMonitorForm } from '@/components/trend-finder/new-trend-monitor-form';

export const dynamic = 'force-dynamic';

export default async function NewTrendMonitorPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin, email')
    .eq('id', user.id)
    .single();
  if (me?.role !== 'admin' && !me?.is_super_admin) {
    redirect('/admin/dashboard');
  }

  const { data: clients } = await admin
    .from('clients')
    .select('id, name, agency')
    .eq('is_active', true)
    .order('name');

  return (
    <div className="cortex-page-gutter max-w-3xl mx-auto space-y-6">
      <header className="space-y-2">
        <p
          className="font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-300/80"
          style={{ fontFamily: 'Rubik, system-ui, sans-serif', fontStyle: 'italic' }}
        >
          Trend Finder · automation
        </p>
        <h1
          className="text-3xl font-bold text-text-primary"
          style={{ fontFamily: 'var(--font-nz-display), system-ui, sans-serif' }}
        >
          New trend monitor
        </h1>
        <p className="text-sm text-white/70" style={{ fontFamily: 'Poppins, system-ui, sans-serif' }}>
          Define what to listen for. Cortex will search the web every cadence and deliver the findings.
        </p>
        <Link
          href="/finder/monitors"
          className="inline-block text-xs text-text-muted hover:text-cyan-300"
        >
          ← Back to monitors
        </Link>
      </header>

      <NewTrendMonitorForm clients={clients ?? []} defaultRecipient={me?.email ?? null} />
    </div>
  );
}
