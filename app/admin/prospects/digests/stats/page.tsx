// SPY-10 T29 (stats page): aggregate digest telemetry. Active subscriptions,
// drafted-vs-sent volume, open rate, CTR, unsubscribe rate.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DigestStatsDashboard } from '@/components/prospects/digest-stats-dashboard';

export const dynamic = 'force-dynamic';

export default async function DigestsStatsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isAdmin = me?.is_super_admin === true || me?.role === 'admin' || me?.role === 'super_admin';
  if (!isAdmin) redirect('/');

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Digest stats</h1>
          <p className="text-sm text-white/60 mt-1">Last 30 days of stickiness telemetry.</p>
        </div>
        <Link
          href="/admin/prospects/digests"
          className="text-sm text-blue-300 hover:text-blue-200 transition"
        >
          ← Back to queue
        </Link>
      </div>
      <DigestStatsDashboard windowDays={30} />
    </div>
  );
}
