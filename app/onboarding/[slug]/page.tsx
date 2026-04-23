import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { detectAgencyFromHostname } from '@/lib/agency/detect';
import { OnboardingPublicView } from '@/components/onboarding/onboarding-public-view';

export const dynamic = 'force-dynamic';

type Tracker = {
  id: string;
  client_id: string;
  service: string;
  title: string | null;
  status: string;
  share_token: string;
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
    .select('id, client_id, service, title, status, share_token, started_at, completed_at, clients!inner(name, slug, logo_url)')
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
  const [{ data: items }, { data: uploads }, { data: socialProfiles }] = await Promise.all([
    groupIds.length
      ? admin
          .from('onboarding_checklist_items')
          .select('id, group_id, task, description, owner, status, sort_order')
          .in('group_id', groupIds)
          .order('sort_order', { ascending: true })
      : Promise.resolve({ data: [] as unknown[] }),
    admin
      .from('onboarding_uploads')
      .select('id, filename, size_bytes, mime_type, created_at')
      .eq('tracker_id', tracker.id)
      .order('created_at', { ascending: false }),
    // Zernio-connected social accounts for this tracker's client. Used to
    // surface "Connected as @handle" on connection cards even after the
    // client has re-opened the page on a different day.
    admin
      .from('social_profiles')
      .select('platform, username, is_active')
      .eq('client_id', tracker.client_id)
      .eq('is_active', true),
  ]);

  // Supabase types `!inner` joins as arrays; 1:1 here so unwrap.
  const raw = tracker as unknown as Record<string, unknown> & {
    clients: Tracker['clients'] | Array<NonNullable<Tracker['clients']>>;
  };
  const normalized: Tracker = {
    ...(raw as unknown as Tracker),
    clients: Array.isArray(raw.clients) ? raw.clients[0] ?? null : raw.clients,
  };

  // Detect agency from Host header so Anderson Collaborative clients
  // don\u2019t see the Nativz wordmark in the public footer.
  const hostHeader = (await headers()).get('host') ?? '';
  const agency = detectAgencyFromHostname(hostHeader);

  // Build the connected-handles map keyed by our PlatformKey. Zernio
  // platform slugs like "facebook" map back to both 'facebook' and
  // 'meta_business' in our matcher, so a single connection can satisfy
  // either onboarding card.
  const connected: Record<string, { username: string }> = {};
  for (const p of (socialProfiles ?? []) as { platform: string; username: string }[]) {
    if (!p.username) continue;
    const lower = p.platform.toLowerCase();
    if (lower === 'tiktok') connected.tiktok = { username: p.username };
    else if (lower === 'instagram') connected.instagram = { username: p.username };
    else if (lower === 'facebook') {
      connected.facebook = { username: p.username };
      connected.meta_business = { username: p.username };
    } else if (lower === 'youtube') connected.youtube = { username: p.username };
  }

  return (
    <OnboardingPublicView
      tracker={normalized}
      phases={phasesRes.data ?? []}
      groups={groupsRes.data ?? []}
      items={(items ?? []) as Parameters<typeof OnboardingPublicView>[0]['items']}
      uploads={(uploads ?? []) as Parameters<typeof OnboardingPublicView>[0]['uploads']}
      connected={connected as Parameters<typeof OnboardingPublicView>[0]['connected']}
      agency={agency}
    />
  );
}
