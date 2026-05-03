/**
 * /admin/onboarding/[id]
 *
 * Server-rendered detail. Loads the row + email log + team in parallel
 * and hands them to the client component which owns the per-step state
 * inspector + manual nudge composer.
 */

import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  describeProgress,
  getOnboardingById,
  listEmailLog,
  listTeamAssignments,
} from '@/lib/onboarding/api';
import { SCREENS } from '@/lib/onboarding/screens';
import { OnboardingDetail } from '@/components/onboarding/onboarding-detail';

export const dynamic = 'force-dynamic';

interface ClientLite {
  id: string;
  name: string;
  slug: string;
  agency: string | null;
  logo_url: string | null;
}

export default async function AdminOnboardingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const row = await getOnboardingById(id);
  if (!row) notFound();

  const admin = createAdminClient();
  const [{ data: clientRow }, emails, team, { data: members }] = await Promise.all([
    admin
      .from('clients')
      .select('id, name, slug, agency, logo_url')
      .eq('id', row.client_id)
      .single<ClientLite>(),
    listEmailLog(id),
    listTeamAssignments(row.client_id),
    admin
      .from('team_members')
      .select('id, name, email, role')
      .eq('is_active', true)
      .order('name'),
  ]);

  const progress = describeProgress(row);
  const screens = SCREENS[row.kind];

  return (
    <div className="cortex-page-gutter max-w-5xl mx-auto space-y-6">
      <Link
        href="/admin/onboarding"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-accent-text transition-colors"
      >
        <ArrowLeft size={14} />
        Back to onboarding
      </Link>

      <OnboardingDetail
        row={row}
        client={clientRow ?? null}
        emails={emails}
        team={team}
        members={members ?? []}
        progress={progress}
        screens={screens}
      />
    </div>
  );
}
