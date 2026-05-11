// SPY-10 T29 (queue page): list of drafted digests with approve/reject/preview
// actions. Read-once on the server, hand off the rows to the client component.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DigestApprovalQueue } from '@/components/prospects/digest-approval-queue';
import type { DigestDraft } from '@/lib/prospects/types';

export const dynamic = 'force-dynamic';

interface SearchParams {
  mine?: string;
  kind?: string;
}

export default async function DigestsQueuePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
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

  let prospectIdFilter: string[] | null = null;
  if (params.mine === '1') {
    const { data: owned } = await admin
      .from('prospects')
      .select('id')
      .eq('owner_user_id', user.id);
    prospectIdFilter = (owned ?? []).map((r) => r.id as string);
    if (prospectIdFilter.length === 0) prospectIdFilter = ['00000000-0000-0000-0000-000000000000'];
  }

  let q = admin
    .from('prospect_digest_drafts')
    .select('id, prospect_id, kind, status, created_at, sent_at, subject, expires_at')
    .eq('status', 'drafted')
    .order('created_at', { ascending: false })
    .limit(50);
  if (params.kind === 'weekly_competitor' || params.kind === 'monthly_format') {
    q = q.eq('kind', params.kind);
  }
  if (prospectIdFilter) q = q.in('prospect_id', prospectIdFilter);
  const { data: drafts } = await q;

  const list = (drafts ?? []) as DigestDraft[];
  const prospectIds = Array.from(new Set(list.map((d) => d.prospect_id)));
  const { data: prospects } = prospectIds.length
    ? await admin.from('prospects').select('id, brand_name').in('id', prospectIds)
    : { data: [] };
  const nameById = new Map(((prospects ?? []) as { id: string; brand_name: string | null }[]).map((p) => [p.id, p.brand_name]));

  const enriched = list.map((d) => ({ ...d, prospect_name: nameById.get(d.prospect_id) ?? null }));

  const tabs: Array<{ label: string; href: string; active: boolean }> = [
    { label: 'All drafts', href: '/admin/prospects/digests', active: !params.mine },
    { label: 'Assigned to me', href: '/admin/prospects/digests?mine=1', active: params.mine === '1' },
  ];

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Digest approval queue</h1>
          <p className="text-sm text-white/60 mt-1">
            Review and ship drafted prospect digests. Approved digests send immediately.
          </p>
        </div>
        <Link
          href="/admin/prospects/digests/stats"
          className="text-sm text-blue-300 hover:text-blue-200 transition"
        >
          View stats →
        </Link>
      </div>
      <div className="flex items-center gap-2">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs transition-colors ${
              t.active
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border bg-surface text-text-muted hover:text-foreground'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <DigestApprovalQueue initialDrafts={enriched} />
    </div>
  );
}
