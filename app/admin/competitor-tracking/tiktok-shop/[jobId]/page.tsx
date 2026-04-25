import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import { TikTokShopResultsClient } from './results-client';

export default async function TikTokShopResultsPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const [{ data: userData }, { data: search }] = await Promise.all([
    admin.from('users').select('role').eq('id', user.id).single(),
    admin.from('tiktok_shop_searches').select('*').eq('id', jobId).maybeSingle(),
  ]);

  if (!userData || !['admin', 'super_admin'].includes(userData.role)) {
    redirect('/admin/dashboard');
  }
  if (!search) notFound();

  return <TikTokShopResultsClient initial={search} />;
}
