import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  ClientOverview,
  type ClientOverviewData,
  type HealthScore,
} from '@/components/clients/client-overview';
import { normalizeAdminWorkspaceModules } from '@/lib/clients/admin-workspace-modules';

export const dynamic = 'force-dynamic';

const HEALTH_SCORES: readonly HealthScore[] = ['not_good', 'fair', 'good', 'great', 'excellent'] as const;
function parseHealthScore(value: unknown): HealthScore | null {
  return typeof value === 'string' && (HEALTH_SCORES as readonly string[]).includes(value)
    ? (value as HealthScore)
    : null;
}

export default async function AdminClientOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const admin = createAdminClient();

  // Viewer org scoping — mirror the API route's guard.
  const { data: me } = await admin
    .from('users')
    .select('role, organization_id')
    .eq('id', user.id)
    .single();

  const { data: row } = await admin
    .from('clients')
    .select(
      'id, name, slug, industry, logo_url, website_url, agency, organization_id, health_score, target_audience, brand_voice, topic_keywords, services, monthly_boosting_budget, google_drive_branding_url, google_drive_calendars_url, admin_workspace_modules',
    )
    .eq('slug', slug)
    .single();
  if (!row) notFound();

  if (me?.role === 'viewer' && row.organization_id !== me.organization_id) {
    notFound();
  }

  const client: ClientOverviewData = {
    id: row.id,
    name: row.name ?? slug,
    slug: row.slug ?? slug,
    industry: row.industry ?? null,
    logo_url: row.logo_url ?? null,
    website_url: row.website_url ?? null,
    agency: row.agency ?? null,
    organization_id: row.organization_id ?? null,
    health_score: parseHealthScore(
      (row as { health_score?: unknown }).health_score,
    ),
    target_audience: row.target_audience ?? null,
    brand_voice: row.brand_voice ?? null,
    topic_keywords: Array.isArray(row.topic_keywords) ? (row.topic_keywords as string[]) : [],
    services: Array.isArray(row.services) ? (row.services as string[]) : [],
    monthly_boosting_budget:
      (row as { monthly_boosting_budget?: number | null }).monthly_boosting_budget ?? null,
    google_drive_branding_url: row.google_drive_branding_url ?? null,
    google_drive_calendars_url: row.google_drive_calendars_url ?? null,
    admin_workspace_modules: normalizeAdminWorkspaceModules(
      (row as { admin_workspace_modules?: unknown }).admin_workspace_modules,
    ),
  };

  return <ClientOverview client={client} embeddedInShell />;
}
