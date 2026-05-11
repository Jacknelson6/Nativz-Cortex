// VFF-09 T16: intercepting route that renders the format detail in a
// modal when the user clicks a card in the feed, without losing the
// scroll position on /admin/formats. A direct visit / refresh of the
// same URL falls through to the standalone full-page route at
// `app/admin/formats/[id]/page.tsx`.

import { redirect, notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveBrand } from '@/lib/active-brand';
import { getFormatDetail } from '@/lib/analytics/format-detail';
import { FormatDetailModal } from '@/components/formats/format-detail-modal';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export default async function InterceptedFormatDetail({ params }: { params: Params }) {
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

  return <FormatDetailModal data={data} brand_name={active.brand?.name ?? null} />;
}
