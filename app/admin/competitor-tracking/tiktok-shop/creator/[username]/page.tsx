import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import { CreatorDetailClient } from './creator-detail-client';
import type { CreatorEnrichment } from '@/lib/tiktok-shop/types';

export default async function TikTokShopCreatorPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username: raw } = await params;
  const handle = decodeURIComponent(raw).replace(/^@/, '').trim().toLowerCase();
  if (!handle) notFound();

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const admin = createAdminClient();
  const { data: userData } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!userData || !['admin', 'super_admin'].includes(userData.role)) {
    redirect('/admin/dashboard');
  }

  const { data: snapshot } = await admin
    .from('tiktok_shop_creator_snapshots')
    .select('username, data, fetched_at')
    .eq('username', handle)
    .maybeSingle();

  return (
    <CreatorDetailClient
      username={handle}
      initialCreator={(snapshot?.data as unknown as CreatorEnrichment | null) ?? null}
      initialFetchedAt={snapshot?.fetched_at ?? null}
    />
  );
}
