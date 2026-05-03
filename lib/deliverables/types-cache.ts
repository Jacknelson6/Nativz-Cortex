/**
 * deliverable_types slug ↔ id cache.
 *
 * The deliverable_types table is small (3 rows in Phase A: edited_video,
 * ugc_video, static_graphic) and effectively read-only at runtime, so
 * round-tripping to Postgres on every consume/grant is wasteful. We cache
 * the table for 60s.
 *
 * The cache is process-local — Vercel Functions hot-pool instances under
 * Fluid Compute, so a single instance can serve thousands of requests off
 * one fetch. Stampede protection is handled by tracking the in-flight
 * promise: concurrent first-fetches share the same await.
 *
 * Cache invalidation: 60s TTL only. New slugs land via migration, so the
 * cache settles within a minute of any new type going live without an
 * explicit bust. Admin tooling that mutates types (none yet — Phase B+)
 * should call `invalidateDeliverableTypesCache()` after writes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeliverableTypeSlug } from '@/lib/credits/types';

interface CachedTypes {
  bySlug: Map<string, { id: string; display_name: string; sort_order: number }>;
  byId: Map<string, { slug: string; display_name: string; sort_order: number }>;
  fetchedAt: number;
}

const TTL_MS = 60_000;

let cache: CachedTypes | null = null;
let inflight: Promise<CachedTypes> | null = null;

async function fetchTypes(admin: SupabaseClient): Promise<CachedTypes> {
  const { data, error } = await admin
    .from('deliverable_types')
    .select('id, slug, display_name, sort_order, is_active')
    .eq('is_active', true)
    .returns<Array<{
      id: string;
      slug: string;
      display_name: string;
      sort_order: number;
      is_active: boolean;
    }>>();

  if (error) {
    throw new Error(`deliverable_types fetch failed: ${error.message}`);
  }

  const bySlug = new Map<string, { id: string; display_name: string; sort_order: number }>();
  const byId = new Map<string, { slug: string; display_name: string; sort_order: number }>();
  for (const row of data ?? []) {
    bySlug.set(row.slug, { id: row.id, display_name: row.display_name, sort_order: row.sort_order });
    byId.set(row.id, { slug: row.slug, display_name: row.display_name, sort_order: row.sort_order });
  }

  return { bySlug, byId, fetchedAt: Date.now() };
}

async function getCache(admin: SupabaseClient): Promise<CachedTypes> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) {
    return cache;
  }
  if (inflight) return inflight;
  inflight = fetchTypes(admin)
    .then((next) => {
      cache = next;
      return next;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Resolve a slug → id. Throws if the slug is unknown so callers fail loud
 * (typos in a feature flag won't silently fall back to edited_video).
 */
export async function getDeliverableTypeId(
  admin: SupabaseClient,
  slug: DeliverableTypeSlug,
): Promise<string> {
  const types = await getCache(admin);
  const row = types.bySlug.get(slug);
  if (!row) {
    throw new Error(`Unknown deliverable type slug: ${slug}`);
  }
  return row.id;
}

/**
 * Resolve an id → slug. Useful when a balance/transaction row carries
 * the id and a downstream consumer needs the slug for copy or routing.
 */
export async function getDeliverableTypeSlug(
  admin: SupabaseClient,
  id: string,
): Promise<DeliverableTypeSlug> {
  const types = await getCache(admin);
  const row = types.byId.get(id);
  if (!row) {
    throw new Error(`Unknown deliverable type id: ${id}`);
  }
  return row.slug as DeliverableTypeSlug;
}

/**
 * Return every active type, sorted. Phase B's deliverables shell uses this
 * to render per-type balance pills.
 */
export async function listDeliverableTypes(
  admin: SupabaseClient,
): Promise<Array<{ id: string; slug: DeliverableTypeSlug; display_name: string; sort_order: number }>> {
  const types = await getCache(admin);
  const rows = Array.from(types.bySlug.entries()).map(([slug, row]) => ({
    id: row.id,
    slug: slug as DeliverableTypeSlug,
    display_name: row.display_name,
    sort_order: row.sort_order,
  }));
  rows.sort((a, b) => a.sort_order - b.sort_order);
  return rows;
}

/**
 * Bust the cache. Call after any admin mutation to deliverable_types. The
 * 60s TTL means callers can usually skip this and accept up to a minute of
 * staleness; this is here for write paths that need immediate visibility.
 */
export function invalidateDeliverableTypesCache(): void {
  cache = null;
}
