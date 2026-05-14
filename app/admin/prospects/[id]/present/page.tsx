// SPY-09 T21: admin-only present mode. Builds the snapshot in-memory
// (no share-link row) so the rep can rehearse without burning a token.
// Loads server-side from the latest analysis + benchmark, falls back
// to clear empty states when prerequisites aren't met yet.

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLatestAnalysis } from '@/lib/prospects/analysis-queries';
import { computeScorecard } from '@/lib/prospects/checklist';
import { getLatestBenchmark } from '@/lib/prospects/benchmark-orchestrator';
import { buildPresentationSnapshot } from '@/lib/prospects/snapshot-presentation';
import { PresentModeShell } from '@/components/prospects/present-mode-shell';
import { detectAgencyFromHostname } from '@/lib/agency/detect';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminPresentPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, email, full_name')
    .eq('id', user.id)
    .single();
  if (!me || !['admin', 'super_admin'].includes(me.role)) {
    redirect('/admin');
  }

  const { data: prospect } = await admin
    .from('prospects')
    .select('id, brand_name, owner_user_id')
    .eq('id', id)
    .maybeSingle();
  if (!prospect) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-300">
        Prospect not found.
      </div>
    );
  }

  const analysis = await getLatestAnalysis(id);
  if (!analysis) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-300">
        Analyze the prospect first, then come back to present.
      </div>
    );
  }

  const scorecard = computeScorecard(analysis);
  const benchmark = await getLatestBenchmark(id);

  const h = await headers();
  const agency = detectAgencyFromHostname(h.get('x-agency') ?? h.get('host') ?? '');
  const isAC = agency === 'anderson';
  const fallbackTeam = isAC ? 'Anderson Collaborative team' : 'Nativz team';
  const fallbackEmail = isAC ? 'hello@andersoncollaborative.com' : 'hello@nativz.io';

  // Resolve contact: prospect owner > current user.
  let contactName = me.full_name ?? fallbackTeam;
  let contactEmail = me.email ?? user.email ?? fallbackEmail;
  if (prospect.owner_user_id) {
    const { data: owner } = await admin
      .from('users')
      .select('full_name, email')
      .eq('id', prospect.owner_user_id)
      .maybeSingle();
    if (owner) {
      contactName = owner.full_name ?? contactName;
      contactEmail = owner.email ?? contactEmail;
    }
  }

  const { data: socials } = await admin
    .from('prospect_socials')
    .select('platform, avatar_url')
    .eq('prospect_id', id)
    .order('created_at', { ascending: true });
  const brandLogoUrl = socials?.[0]?.avatar_url ?? null;

  const plan = analysis.thirty_day_plan ?? {
    generated_at: new Date().toISOString(),
    items: [
      { id: 'action_01', title: 'Draft the 30-day plan from the editor', body: 'Open the prospect detail page and run "Regenerate with AI" to fill this panel.', rationale: 'Empty plan blocks the public link.' },
      { id: 'action_02', title: '', body: '', rationale: '' },
      { id: 'action_03', title: '', body: '', rationale: '' },
    ],
    strategist_edited: false,
  };

  const snapshot = buildPresentationSnapshot({
    prospect: { brand_name: prospect.brand_name },
    brandLogoUrl,
    analysis,
    scorecard,
    benchmark: benchmark && (benchmark.status === 'succeeded' || benchmark.status === 'partial') ? benchmark : null,
    plan,
    contact: { sales_rep_name: contactName, sales_rep_email: contactEmail },
  });

  return (
    <PresentModeShell
      snapshot={snapshot}
      variant="internal"
      exitHref={`/admin/prospects/${id}`}
    />
  );
}
