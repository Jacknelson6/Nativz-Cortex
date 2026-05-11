// VFF-07 T13: /admin/formats — Netflix-style format feed.
// Server entry resolves the admin's active brand, builds the 8-row feed,
// and hands it to the client island. Client island re-fetches when the
// brand pill changes.

import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveBrand } from '@/lib/active-brand';
import { buildFormatFeed } from '@/lib/analytics/format-feed';
import { FormatsClient } from './formats-client';

export const dynamic = 'force-dynamic';

export default async function FormatsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const role = (me as { role?: string } | null)?.role;
  const isSuper = (me as { is_super_admin?: boolean } | null)?.is_super_admin === true
    || role === 'super_admin';
  if (role !== 'admin' && role !== 'super_admin' && !isSuper) {
    redirect('/admin/dashboard');
  }

  const active = await getActiveBrand();
  const initialClientId = active.brand?.id ?? null;
  const initialPayload = await buildFormatFeed(initialClientId);

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-white">Formats</h1>
        <p className="text-sm text-white/60">
          What&apos;s working in short-form right now, ranked for{' '}
          {initialPayload.brand_name ?? 'your library'}.
        </p>
      </header>
      <FormatsClient initialPayload={initialPayload} initialClientId={initialClientId} />
    </div>
  );
}
