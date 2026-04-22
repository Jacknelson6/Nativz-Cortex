import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { OnboardingPublicView } from '@/components/onboarding/onboarding-public-view';

export const dynamic = 'force-dynamic';

type Tracker = {
  id: string;
  client_id: string;
  service: string;
  title: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  clients: { name: string; slug: string; logo_url: string | null } | null;
};

/**
 * /onboarding/[slug]?token=... — public client-facing timeline page.
 *
 * Access model: token-as-password. The slug is cosmetic (makes the URL
 * readable); the token is what grants access. A valid token returns
 * the timeline; an invalid or missing token returns a 404. Either way
 * we never leak whether the slug corresponds to a real client.
 */
export default async function PublicOnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const token = sp.token;

  if (!token || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    notFound();
  }

  const admin = createAdminClient();
  const { data: tracker, error } = await admin
    .from('onboarding_trackers')
    .select('id, client_id, service, title, status, started_at, completed_at, clients!inner(name, slug, logo_url)')
    .eq('share_token', token)
    .maybeSingle();

  if (error || !tracker) {
    notFound();
  }

  // Cosmetic slug check — if someone sends a mismatched slug + valid
  // token we still render (token is the real gate), but redirecting
  // would be weird. Just render.
  void slug;

  const [phasesRes, groupsRes] = await Promise.all([
    admin
      .from('onboarding_phases')
      .select('id, name, description, what_we_need, status, sort_order, actions, progress_percent')
      .eq('tracker_id', tracker.id)
      .order('sort_order', { ascending: true }),
    admin
      .from('onboarding_checklist_groups')
      .select('id, name, sort_order')
      .eq('tracker_id', tracker.id)
      .order('sort_order', { ascending: true }),
  ]);

  const groupIds = (groupsRes.data ?? []).map((g) => g.id);
  const { data: items } = groupIds.length
    ? await admin
        .from('onboarding_checklist_items')
        .select('id, group_id, task, description, owner, status, sort_order')
        .in('group_id', groupIds)
        .order('sort_order', { ascending: true })
    : { data: [] };

  // Supabase types `!inner` joins as arrays; 1:1 here so unwrap.
  const raw = tracker as unknown as Record<string, unknown> & {
    clients: Tracker['clients'] | Array<NonNullable<Tracker['clients']>>;
  };
  const normalized: Tracker = {
    ...(raw as unknown as Tracker),
    clients: Array.isArray(raw.clients) ? raw.clients[0] ?? null : raw.clients,
  };

  return (
    <OnboardingPublicView
      tracker={normalized}
      phases={phasesRes.data ?? []}
      groups={groupsRes.data ?? []}
      items={items ?? []}
    />
  );
}
