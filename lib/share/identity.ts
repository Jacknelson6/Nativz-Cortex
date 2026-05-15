import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * PRD 02 (auth gateway) + PRD 04 (modal login) + PRD 05 (identity).
 *
 * Resolves the agency / client a share-link token belongs to, and decides
 * whether a current Supabase session can be auto-bound to that link. Both
 * calendar share links (`content_drop_share_links`) and editing-project
 * share links (`editing_project_share_links`) flow through here so the
 * gateway and the comment routes share one source of truth.
 *
 * Agency match rule:
 *  - admin / super_admin: matches when their organization's agency
 *    string equals the share link's agency string.
 *  - viewer: matches when their `organization_id` equals the share
 *    link's client's `organization_id` (viewers are scoped to one
 *    client; agency string is set on the client row).
 *
 * On mismatch we DO NOT log the user out of Cortex globally, we just
 * ignore their session for this share-link surface and render the
 * gateway with "wrong agency" copy. PRD 02 §"Server resolution".
 */

export type ShareLinkKind = 'calendar' | 'editing';

export interface ShareLinkContext {
  kind: ShareLinkKind;
  linkId: string;
  clientId: string;
  agency: string | null;
  organizationId: string | null;
  expiresAt: string | null;
  archivedAt: string | null;
}

export interface BoundIdentity {
  userId: string;
  email: string | null;
  displayName: string;
  role: 'admin' | 'super_admin' | 'viewer';
  agency: string | null;
  organizationId: string | null;
}

export type IdentityResolution =
  | { state: 'expired' }
  | { state: 'archived' }
  | { state: 'not_found' }
  | { state: 'gateway'; context: ShareLinkContext; sessionPresent: boolean; agencyMismatch: boolean }
  | { state: 'auto_bound'; context: ShareLinkContext; identity: BoundIdentity };

interface CalendarRow {
  id: string;
  expires_at: string | null;
  archived_at: string | null;
  drop_id: string;
  client_id: string | null;
  clients: { organization_id: string | null; agency: string | null } | null;
}

interface EditingRow {
  id: string;
  expires_at: string | null;
  archived_at: string | null;
  project_id: string;
}

async function resolveContext(token: string): Promise<
  | { ok: true; context: ShareLinkContext }
  | { ok: false; state: 'expired' | 'archived' | 'not_found' }
> {
  const admin = createAdminClient();

  // Fan out across both surfaces in parallel. Tokens are unique per table
  // and indexed; the parallel SELECTs cost ~2x one round trip total.
  // Calendar share links carry client_id directly + agency via a single
  // join; editing share links go through editing_projects to reach client.
  const [calendarRes, editingRes] = await Promise.all([
    admin
      .from('content_drop_share_links')
      .select('id, expires_at, archived_at, drop_id, client_id, clients(organization_id, agency)')
      .eq('token', token)
      .maybeSingle<CalendarRow>(),
    admin
      .from('editing_project_share_links')
      .select('id, expires_at, archived_at, project_id')
      .eq('token', token)
      .maybeSingle<EditingRow>(),
  ]);

  if (calendarRes.error) {
    console.warn('[share-identity] calendar lookup error', calendarRes.error);
  }
  if (editingRes.error) {
    console.warn('[share-identity] editing lookup error', editingRes.error);
  }

  if (calendarRes.data) {
    const link = calendarRes.data;
    if (link.archived_at) return { ok: false, state: 'archived' };
    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
      return { ok: false, state: 'expired' };
    }
    return {
      ok: true,
      context: {
        kind: 'calendar',
        linkId: link.id,
        clientId: link.client_id ?? '',
        agency: link.clients?.agency ?? null,
        organizationId: link.clients?.organization_id ?? null,
        expiresAt: link.expires_at,
        archivedAt: link.archived_at,
      },
    };
  }

  if (editingRes.data) {
    const link = editingRes.data;
    if (link.archived_at) return { ok: false, state: 'archived' };
    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
      return { ok: false, state: 'expired' };
    }
    const { data: project, error: projectErr } = await admin
      .from('editing_projects')
      .select('client_id, clients(organization_id, agency)')
      .eq('id', link.project_id)
      .maybeSingle<{
        client_id: string | null;
        clients: { organization_id: string | null; agency: string | null } | null;
      }>();
    if (projectErr) {
      console.warn('[share-identity] editing project lookup error', projectErr);
    }
    return {
      ok: true,
      context: {
        kind: 'editing',
        linkId: link.id,
        clientId: project?.client_id ?? '',
        agency: project?.clients?.agency ?? null,
        organizationId: project?.clients?.organization_id ?? null,
        expiresAt: link.expires_at,
        archivedAt: link.archived_at,
      },
    };
  }

  return { ok: false, state: 'not_found' };
}

/**
 * Check whether the authenticated user (if any) has access to the given
 * share-link context. Returns the bound identity on match, or null when
 * either the session is absent or the user is in the wrong agency.
 */
export async function resolveBoundIdentity(
  context: ShareLinkContext,
): Promise<{ identity: BoundIdentity | null; sessionPresent: boolean }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { identity: null, sessionPresent: false };

  const admin = createAdminClient();
  const { data: userRow } = await admin
    .from('users')
    .select('id, email, full_name, role, organization_id, organizations(agency)')
    .eq('id', user.id)
    .maybeSingle<{
      id: string;
      email: string | null;
      full_name: string | null;
      role: 'admin' | 'super_admin' | 'viewer' | null;
      organization_id: string | null;
      organizations: { agency: string | null } | null;
    }>();

  if (!userRow || !userRow.role) {
    return { identity: null, sessionPresent: true };
  }

  const role = userRow.role;
  const userAgency = userRow.organizations?.agency ?? null;
  const userOrgId = userRow.organization_id;

  let matches = false;
  if (role === 'admin' || role === 'super_admin') {
    // Admins are agency-scoped. Match by agency string only.
    matches = context.agency !== null && userAgency === context.agency;
  } else if (role === 'viewer') {
    // Viewers are scoped to one client's org. Match by organization_id.
    matches = context.organizationId !== null && userOrgId === context.organizationId;
  }

  if (!matches) {
    return { identity: null, sessionPresent: true };
  }

  return {
    identity: {
      userId: userRow.id,
      email: userRow.email,
      displayName: userRow.full_name ?? userRow.email ?? 'User',
      role,
      agency: userAgency,
      organizationId: userOrgId,
    },
    sessionPresent: true,
  };
}

/**
 * Top-level entry for the share page's server resolution. Returns the
 * gateway / auto_bound decision matrix from PRD 02 §"Server resolution".
 */
export async function resolveShareIdentity(token: string): Promise<IdentityResolution> {
  const ctx = await resolveContext(token);
  if (!ctx.ok) return { state: ctx.state };

  const { identity, sessionPresent } = await resolveBoundIdentity(ctx.context);
  if (identity) {
    return { state: 'auto_bound', context: ctx.context, identity };
  }

  return {
    state: 'gateway',
    context: ctx.context,
    sessionPresent,
    agencyMismatch: sessionPresent,
  };
}

export async function getShareContextOrNull(
  token: string,
): Promise<ShareLinkContext | null> {
  const r = await resolveContext(token);
  return r.ok ? r.context : null;
}
