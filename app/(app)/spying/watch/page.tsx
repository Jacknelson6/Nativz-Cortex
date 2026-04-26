import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { WatchWizard } from '@/components/spying/watch-wizard';

export const dynamic = 'force-dynamic';

export default async function WatchPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const [{ data: me }, { data: clients }] = await Promise.all([
    admin.from('users').select('role, is_super_admin').eq('id', user.id).single(),
    admin.from('clients').select('id, name, agency, logo_url').eq('is_active', true).order('name'),
  ]);
  if (me?.role !== 'admin' && !me?.is_super_admin) {
    redirect('/finder/new');
  }

  return (
    <div className="cortex-page-gutter max-w-3xl mx-auto space-y-6 pt-6">
      <header className="space-y-2">
        <p
          className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent-text/80"
          style={{ fontFamily: 'Rubik, system-ui, sans-serif', fontStyle: 'italic' }}
        >
          Competitor intelligence
        </p>
        <h1
          className="text-3xl font-bold text-text-primary"
          style={{ fontFamily: 'var(--font-nz-display), system-ui, sans-serif' }}
        >
          Set up an ongoing watch
        </h1>
        <p
          className="max-w-2xl text-sm text-white/70"
          style={{ fontFamily: 'Poppins, system-ui, sans-serif', fontWeight: 300 }}
        >
          Pick a client, paste the competitors you want to track, choose how often to refresh. Snapshots
          feed the Benchmarking tab under Analytics and any recurring reports you&apos;ve subscribed the client to.
        </p>
        <Link
          href="/spying"
          className="inline-block text-xs text-text-muted hover:text-accent-text"
        >
          ← Back to Competitor intelligence
        </Link>
      </header>

      <WatchWizard clients={clients ?? []} />
    </div>
  );
}
