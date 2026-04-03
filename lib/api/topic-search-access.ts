import type { SupabaseClient } from '@supabase/supabase-js';
import { getUserAuth } from '@/lib/auth/permissions';

/**
 * All organization IDs a user may act within for portal-scoped data (legacy `users.organization_id`
 * plus every `user_client_access.organization_id`).
 */
export async function getUserOrganizationIdsForAccess(
  adminClient: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const ids = new Set<string>();

  const { data: userRow } = await adminClient
    .from('users')
    .select('organization_id')
    .eq('id', userId)
    .maybeSingle();

  if (userRow?.organization_id) {
    ids.add(userRow.organization_id as string);
  }

  const { data: accessRows } = await adminClient
    .from('user_client_access')
    .select('organization_id')
    .eq('user_id', userId);

  for (const row of accessRows ?? []) {
    if (row.organization_id) ids.add(row.organization_id as string);
  }

  return [...ids];
}

export type TopicSearchAccessDenied = { ok: false; status: 403 | 404; error: string };

export type TopicSearchAccessOk<T> = { ok: true; search: T };

/**
 * Enforce org scoping for topic searches:
 * - **admin / super_admin:** any search
 * - **viewer:** search must have `client_id`, and that client's `organization_id` must be in the user's org set
 */
export async function assertUserCanAccessTopicSearch<T extends Record<string, unknown>>(
  adminClient: SupabaseClient,
  userId: string,
  topicSearchId: string,
): Promise<TopicSearchAccessOk<T> | TopicSearchAccessDenied> {
  const auth = await getUserAuth(userId);
  if (!auth) {
    return { ok: false, status: 404, error: 'User not found' };
  }

  const { data: search, error } = await adminClient
    .from('topic_searches')
    .select('*')
    .eq('id', topicSearchId)
    .maybeSingle();

  if (error || !search) {
    return { ok: false, status: 404, error: 'Search not found' };
  }

  if (auth.role === 'super_admin' || auth.role === 'admin') {
    return { ok: true, search: search as T };
  }

  if (auth.role !== 'viewer') {
    return { ok: false, status: 403, error: 'Access denied' };
  }

  const clientId = search.client_id as string | null;
  if (!clientId) {
    return { ok: false, status: 403, error: 'Access denied' };
  }

  const { data: client } = await adminClient
    .from('clients')
    .select('organization_id')
    .eq('id', clientId)
    .maybeSingle();

  const orgId = client?.organization_id as string | undefined;
  if (!orgId) {
    return { ok: false, status: 403, error: 'Access denied' };
  }

  const orgIds = await getUserOrganizationIdsForAccess(adminClient, userId);
  if (!orgIds.includes(orgId)) {
    return { ok: false, status: 403, error: 'Access denied' };
  }

  return { ok: true, search: search as T };
}

/**
 * When creating a topic search, **viewers** must pass a `client_id` that belongs to one of their orgs.
 * Admins may use any client or omit `client_id` (internal runs).
 */
export async function assertViewerCanCreateSearchForClient(
  adminClient: SupabaseClient,
  userId: string,
  clientId: string | null | undefined,
): Promise<{ ok: true } | TopicSearchAccessDenied> {
  const auth = await getUserAuth(userId);
  if (!auth) {
    return { ok: false, status: 404, error: 'User not found' };
  }

  if (auth.role === 'super_admin' || auth.role === 'admin') {
    return { ok: true };
  }

  if (auth.role !== 'viewer') {
    return { ok: false, status: 403, error: 'Access denied' };
  }

  if (!clientId) {
    return { ok: false, status: 403, error: 'Client is required' };
  }

  const { data: client } = await adminClient
    .from('clients')
    .select('organization_id')
    .eq('id', clientId)
    .maybeSingle();

  const orgId = client?.organization_id as string | undefined;
  if (!orgId) {
    return { ok: false, status: 403, error: 'Access denied' };
  }

  const orgIds = await getUserOrganizationIdsForAccess(adminClient, userId);
  if (!orgIds.includes(orgId)) {
    return { ok: false, status: 403, error: 'Access denied' };
  }

  return { ok: true };
}

/**
 * For folder item lists: keep only topic search IDs the user is allowed to see (same rules as
 * {@link assertUserCanAccessTopicSearch}).
 */
export async function filterTopicSearchIdsAccessibleToUser(
  adminClient: SupabaseClient,
  userId: string,
  topicSearchIds: string[],
): Promise<string[]> {
  if (topicSearchIds.length === 0) return [];

  const auth = await getUserAuth(userId);
  if (!auth) return [];

  if (auth.role === 'super_admin' || auth.role === 'admin') {
    return topicSearchIds;
  }

  if (auth.role !== 'viewer') return [];

  const orgIds = await getUserOrganizationIdsForAccess(adminClient, userId);
  if (orgIds.length === 0) return [];

  const { data: searches } = await adminClient
    .from('topic_searches')
    .select('id, client_id')
    .in('id', topicSearchIds);

  const clientIds = [...new Set((searches ?? []).map((s) => s.client_id).filter(Boolean))] as string[];
  if (clientIds.length === 0) return [];

  const { data: clients } = await adminClient
    .from('clients')
    .select('id, organization_id')
    .in('id', clientIds);

  const clientOrg = new Map((clients ?? []).map((c) => [c.id as string, c.organization_id as string]));

  const allowed = new Set<string>();
  for (const s of searches ?? []) {
    const cid = s.client_id as string | null;
    if (!cid) continue;
    const oid = clientOrg.get(cid);
    if (oid && orgIds.includes(oid)) allowed.add(s.id as string);
  }

  return topicSearchIds.filter((id) => allowed.has(id));
}
