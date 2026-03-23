import { createHash } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { isHideFromRosterUnsupportedError } from '@/lib/clients/roster-visibility-query';

type AdminClient = ReturnType<typeof createAdminClient>;

function slugForOrgAndUrl(organizationId: string, websiteUrl: string) {
  const h = createHash('sha256').update(`${organizationId}:${websiteUrl}`).digest('hex').slice(0, 20);
  return `adc-${h}`;
}

const EPHEMERAL_ONBOARD = 'ad_creatives_url' as const;

/**
 * Resolve URL-only ephemeral client when `hide_from_roster` exists, or fall back to
 * `onboarded_via` + URL (migration 054 not applied yet).
 */
async function selectEphemeralClientId(
  admin: AdminClient,
  organizationId: string,
  websiteUrl: string,
): Promise<string | null> {
  const withHide = await admin
    .from('clients')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('hide_from_roster', true)
    .eq('website_url', websiteUrl)
    .limit(1)
    .maybeSingle();

  if (withHide.data?.id) return withHide.data.id;

  if (withHide.error && !isHideFromRosterUnsupportedError(withHide.error)) {
    console.error('[ephemeral-brand-client] select with hide_from_roster:', withHide.error);
    return null;
  }

  const legacy = await admin
    .from('clients')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('website_url', websiteUrl)
    .eq('onboarded_via', EPHEMERAL_ONBOARD)
    .limit(1)
    .maybeSingle();

  if (legacy.error) {
    console.error('[ephemeral-brand-client] select by onboarded_via:', legacy.error);
    return null;
  }

  return legacy.data?.id ?? null;
}

/**
 * Find or create a roster-hidden client used to persist Brand DNA for ad creatives URL-only flows.
 * Rows use `hide_from_roster: true` (migration 054) so they appear in Ad creatives / APIs by id but not on
 * `/admin/clients` or other roster UIs (`selectClientsWithRosterVisibility`).
 */
export async function findOrCreateEphemeralBrandClient(
  admin: AdminClient,
  organizationId: string,
  websiteUrl: string,
  displayName: string,
): Promise<string> {
  const existingId = await selectEphemeralClientId(admin, organizationId, websiteUrl);
  if (existingId) return existingId;

  const slug = slugForOrgAndUrl(organizationId, websiteUrl);
  const name = displayName.trim().slice(0, 200) || 'Website';

  const baseRow = {
    name,
    slug,
    industry: 'General',
    organization_id: organizationId,
    website_url: websiteUrl,
    feature_flags: { can_search: true, can_view_reports: true },
    onboarded_via: EPHEMERAL_ONBOARD,
    is_active: true,
  };

  let { data: inserted, error } = await admin
    .from('clients')
    .insert({ ...baseRow, hide_from_roster: true })
    .select('id')
    .single();

  if (error && isHideFromRosterUnsupportedError(error)) {
    ({ data: inserted, error } = await admin.from('clients').insert(baseRow).select('id').single());
  }

  if (error?.code === '23505') {
    const { data: bySlug } = await admin.from('clients').select('id').eq('slug', slug).maybeSingle();
    if (bySlug?.id) return bySlug.id;
    const again = await selectEphemeralClientId(admin, organizationId, websiteUrl);
    if (again) return again;
  }

  if (error || !inserted?.id) {
    throw new Error(error?.message ?? 'Failed to create ephemeral brand client');
  }

  return inserted.id;
}
