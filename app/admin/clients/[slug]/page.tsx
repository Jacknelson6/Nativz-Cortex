import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { ClientProfileForm } from '@/components/clients/client-profile-form';
import { ImpersonateButton } from '@/components/clients/impersonate-button';
import type { ClientStrategy } from '@/lib/types/strategy';

export default async function AdminClientProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createAdminClient();

  // Fetch client first — everything else depends on it
  const { data: dbClient } = await supabase
    .from('clients')
    .select('id, name, slug, industry, organization_id, logo_url, website_url, target_audience, brand_voice, topic_keywords, is_active, feature_flags, health_score, agency, services, description, google_drive_branding_url, google_drive_calendars_url, preferences, uppromote_api_key, monthly_boosting_budget')
    .eq('slug', slug)
    .single();

  if (!dbClient) {
    notFound();
  }

  const id = dbClient.id;

  // Fetch all related data in parallel
  const [
    { data: searchData },
    { data: ideasData },
    { count: ideasCount },
    { data: contacts },
    { data: strategyData },
    { data: shoots },
    { data: moodboards },
    { data: knowledgeEntries },
  ] = await Promise.all([
    supabase
      .from('topic_searches')
      .select('id, query, status, search_mode, created_at, approved_at')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('idea_submissions')
      .select('id, title, category, status, created_at, submitted_by')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('idea_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', id)
      .in('status', ['new', 'reviewed']),
    dbClient.organization_id
      ? supabase
          .from('users')
          .select('id, full_name, email, avatar_url, job_title, last_login')
          .eq('organization_id', dbClient.organization_id)
          .eq('role', 'viewer')
          .order('full_name')
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string; email: string; avatar_url: string | null; job_title: string | null; last_login: string | null }> }),
    supabase
      .from('client_strategies')
      .select('*')
      .eq('client_id', id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('shoot_events')
      .select('id, title, shoot_date, location')
      .eq('client_id', id)
      .order('shoot_date', { ascending: false })
      .limit(3),
    supabase
      .from('moodboard_boards')
      .select('id, name, created_at, updated_at')
      .eq('client_id', id)
      .order('updated_at', { ascending: false })
      .limit(3),
    supabase
      .from('client_knowledge_entries')
      .select('type')
      .eq('client_id', id),
  ]);

  const client = {
    id: dbClient.id,
    name: dbClient.name ?? slug,
    slug: dbClient.slug,
    industry: dbClient.industry,
    logo_url: dbClient.logo_url || null,
    website_url: dbClient.website_url || null,
    target_audience: dbClient.target_audience || null,
    brand_voice: dbClient.brand_voice || null,
    topic_keywords: (dbClient.topic_keywords as string[]) || null,
    is_active: dbClient.is_active,
    feature_flags: (dbClient.feature_flags as { can_search?: boolean; can_view_reports?: boolean; can_edit_preferences?: boolean; can_submit_ideas?: boolean }) || null,
    health_score: (dbClient as { health_score?: string | null }).health_score as 'not_good' | 'fair' | 'good' | 'great' | 'excellent' | null,
    agency: (dbClient.agency as string) ?? null,
    services: (dbClient.services as string[]) ?? null,
    description: (dbClient.description as string) ?? null,
    google_drive_branding_url: (dbClient.google_drive_branding_url as string) ?? null,
    google_drive_calendars_url: (dbClient.google_drive_calendars_url as string) ?? null,
    preferences: (dbClient.preferences as import('@/lib/types/database').ClientPreferences) ?? null,
    monthly_boosting_budget: (dbClient as { monthly_boosting_budget?: number | null }).monthly_boosting_budget ?? null,
  };

  // Build knowledge summary by type
  const typeCounts = new Map<string, number>();
  for (const entry of knowledgeEntries ?? []) {
    typeCounts.set(entry.type, (typeCounts.get(entry.type) ?? 0) + 1);
  }
  const knowledgeSummary = Array.from(typeCounts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  return (
    <>
      {dbClient.organization_id && (
        <div className="flex justify-end px-6 pt-4 -mb-4">
          <ImpersonateButton organizationId={dbClient.organization_id} clientSlug={slug} />
        </div>
      )}
      <ClientProfileForm
        client={client}
        portalContacts={contacts || []}
        strategy={(strategyData as ClientStrategy) ?? null}
        searches={searchData || []}
        recentShoots={shoots || []}
        recentMoodboards={moodboards || []}
        ideas={ideasData || []}
        ideaCount={ideasCount ?? 0}
        knowledgeSummary={knowledgeSummary}
      />
    </>
  );
}
