// VFF-08 T07 (stub) / VFF-09 (fills): standalone detail page for a
// viral_video. Acts as the click target from FormatCard. The
// intercepting modal slot lives at `app/admin/formats/@modal/(.)[id]`
// and is filled by VFF-09; until then we render a bare placeholder so
// `/admin/formats/<id>` always resolves to a valid route.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

  const { data: video } = await admin
    .from('viral_videos')
    .select('id, source_url, creator_handle, title, why_it_works')
    .eq('id', id)
    .maybeSingle();

  if (!video) {
    return (
      <div className="p-6 text-sm text-white/60">
        Video not found. <Link className="accent-text underline" href="/admin/formats">Back to feed</Link>
      </div>
    );
  }

  const v = video as { id: string; source_url: string; creator_handle: string | null; title: string | null; why_it_works: string | null };

  return (
    <div className="space-y-4 p-6">
      <Link className="text-xs text-white/50 hover:text-white/80" href="/admin/formats">&larr; Back to formats</Link>
      <h1 className="text-xl font-semibold text-white">
        {v.title ?? v.creator_handle ?? 'Untitled video'}
      </h1>
      <p className="text-sm text-white/60">
        Full detail view lands in VFF-09. Source:{' '}
        <a className="accent-text underline" href={v.source_url} target="_blank" rel="noreferrer">
          {v.source_url}
        </a>
      </p>
      {v.why_it_works ? (
        <p className="rounded-md bg-surface p-4 text-sm text-white/80">{v.why_it_works}</p>
      ) : null}
    </div>
  );
}
