// VFF-04 T13: server entry for /admin/formats/rejected.
// Streams the first page server-side; client island handles pagination +
// filters + restore.

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { RejectedGrid } from './rejected-grid';

const PAGE_SIZE = 40;

export const dynamic = 'force-dynamic';

export default async function RejectedVideosPage() {
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
  const isSuper = (me as { is_super_admin?: boolean } | null)?.is_super_admin;
  if (role !== 'admin' && role !== 'super_admin' && !isSuper) {
    redirect('/admin/dashboard');
  }

  const { data: videos, count } = await admin
    .from('viral_videos')
    .select(
      'id, platform, source_url, creator_handle, thumbnail_storage_url, thumbnail_source_url, views_count, duration_seconds, reject_reason, gate_metadata, posted_at, created_at',
      { count: 'exact' },
    )
    .eq('analysis_status', 'rejected')
    .order('gated_at', { ascending: false, nullsFirst: false })
    .range(0, PAGE_SIZE - 1);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Rejected videos</h1>
        <p className="text-sm text-white/60">What the gate dropped this week</p>
      </div>
      <RejectedGrid
        initialVideos={(videos ?? []) as Parameters<typeof RejectedGrid>[0]['initialVideos']}
        initialTotal={count ?? 0}
        initialPage={1}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
