// VFF-09 T15: standalone full-page detail. Used when the user lands on
// /admin/formats/<id> directly (deep link, refresh, or new tab). The
// intercepting modal at app/admin/formats/@modal/(.)formats/[id] takes
// over when navigating in-app from the feed.

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveBrand } from '@/lib/active-brand';
import { getFormatDetail } from '@/lib/analytics/format-detail';
import { FormatDetailPane } from '@/components/formats/format-detail-pane';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export default async function FormatDetailPage({ params }: { params: Params }) {
  const { id } = await params;
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
  const clientId = active.brand?.id ?? null;

  const data = await getFormatDetail(id, clientId, user.id);
  if (!data) notFound();

  return (
    <div className="space-y-4 p-6">
      <Link className="text-xs text-white/50 hover:text-white/80" href="/admin/formats">
        &larr; Back to formats
      </Link>
      <FormatDetailPane data={data} brand_name={active.brand?.name ?? null} />
    </div>
  );
}
