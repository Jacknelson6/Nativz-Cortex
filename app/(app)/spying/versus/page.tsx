import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveBrand } from '@/lib/active-brand';
import { VersusBoard } from '@/components/spying/versus-board';
import type { VersusAuditRow, VersusPlatformSummary } from '@/components/spying/versus-types';

export const dynamic = 'force-dynamic';

type ProspectDataShape = {
  name?: string;
  displayName?: string;
  favicon?: string;
  platforms?: Array<{
    platform?: string;
    profile?: {
      username?: string;
      displayName?: string;
      avatarUrl?: string | null;
      profileUrl?: string;
      followers?: number | null;
    };
    avgViews?: number | null;
    engagementRate?: number | null;
    postingFrequency?: string | null;
  }>;
} | null;

const ALLOWED_PLATFORMS = new Set(['tiktok', 'instagram', 'youtube', 'facebook', 'linkedin']);

function distillPlatforms(pd: ProspectDataShape): VersusPlatformSummary[] {
  if (!pd?.platforms?.length) return [];
  const out: VersusPlatformSummary[] = [];
  for (const p of pd.platforms) {
    const platform = (p.platform ?? '').toLowerCase();
    if (!ALLOWED_PLATFORMS.has(platform)) continue;
    const profile = p.profile;
    if (!profile?.username || !profile.profileUrl) continue;
    out.push({
      platform: platform as VersusPlatformSummary['platform'],
      username: profile.username,
      displayName: profile.displayName?.trim() || profile.username,
      avatarUrl: profile.avatarUrl ?? null,
      profileUrl: profile.profileUrl,
      followers: profile.followers ?? 0,
      avgViews: p.avgViews ?? 0,
      engagementRate: p.engagementRate ?? 0,
      postingFrequency: p.postingFrequency ?? '—',
    });
  }
  return out;
}

export default async function VersusPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { a, b } = await searchParams;

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
  if (me?.role !== 'admin' && !me?.is_super_admin) {
    redirect('/finder/new');
  }

  const { brand } = await getActiveBrand();

  let auditsQuery = admin
    .from('prospect_audits')
    .select(
      'id, status, created_at, attached_client_id, prospect_data, attached_client:attached_client_id(name)',
    )
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(50);
  if (brand) auditsQuery = auditsQuery.eq('attached_client_id', brand.id);

  const { data: auditsRaw } = await auditsQuery;

  const audits: VersusAuditRow[] = (auditsRaw ?? [])
    .map((row) => {
      const attached = Array.isArray(row.attached_client)
        ? row.attached_client[0]
        : row.attached_client;
      const pd = row.prospect_data as ProspectDataShape;
      const platforms = distillPlatforms(pd);
      // Hide audits with zero scrapeable platforms — they have nothing
      // to compare and only add noise to the picker.
      if (platforms.length === 0) return null;
      return {
        id: row.id,
        created_at: row.created_at,
        attached_client_id: row.attached_client_id ?? null,
        attached_client_name: attached?.name ?? null,
        brand_name: pd?.displayName ?? pd?.name ?? attached?.name ?? 'Untitled audit',
        favicon: pd?.favicon ?? null,
        platforms,
      };
    })
    .filter((row): row is VersusAuditRow => row !== null);

  return (
    <div className="cortex-page-gutter mx-auto max-w-6xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="ui-eyebrow text-accent-text/80">Mode · Versus</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-text-primary">
            Head-to-head benchmark
          </h1>
          <p className="mt-2 max-w-xl text-xs text-text-muted">
            Pick two completed audits and see how their short-form footprint stacks up
            platform-by-platform.
          </p>
        </div>
      </header>

      <VersusBoard audits={audits} initialA={a ?? null} initialB={b ?? null} />
    </div>
  );
}
