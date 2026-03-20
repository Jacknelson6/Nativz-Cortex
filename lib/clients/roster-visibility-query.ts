import { createAdminClient } from '@/lib/supabase/admin';

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * PostgREST / Postgres error when `hide_from_roster` column is missing (migration 054 not applied yet).
 */
export function isHideFromRosterUnsupportedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { message?: string; details?: string; hint?: string };
  const blob = `${e.message ?? ''} ${e.details ?? ''} ${e.hint ?? ''}`.toLowerCase();
  return blob.includes('hide_from_roster');
}

type RosterQueryOptions = {
  select: string;
  /** When set, adds .eq('is_active', true) */
  onlyActive?: boolean;
  /** Additional equality filters */
  eq?: Record<string, string | boolean | null>;
  /** Column → values for .in() */
  in?: Record<string, readonly string[]>;
  orderBy?: { column: string; ascending?: boolean };
};

/**
 * Queries clients for UI rosters. Applies `hide_from_roster = false` when the column exists;
 * retries without that filter if the column is missing so local DBs without migration 054 still work.
 */
export async function selectClientsWithRosterVisibility<Row = Record<string, unknown>>(
  admin: AdminClient,
  options: RosterQueryOptions,
): Promise<{ data: Row[]; error: unknown | null }> {
  const build = (applyHideFilter: boolean) => {
    let q = admin.from('clients').select(options.select);
    if (options.onlyActive) q = q.eq('is_active', true);
    if (options.eq) {
      for (const [key, val] of Object.entries(options.eq)) {
        q = q.eq(key, val);
      }
    }
    if (options.in) {
      for (const [key, vals] of Object.entries(options.in)) {
        if (vals.length > 0) q = q.in(key, [...vals]);
      }
    }
    if (applyHideFilter) q = q.eq('hide_from_roster', false);
    if (options.orderBy) {
      q = q.order(options.orderBy.column, { ascending: options.orderBy.ascending ?? true });
    }
    return q;
  };

  const primary = await build(true);
  if (!primary.error) {
    return { data: (primary.data ?? []) as Row[], error: null };
  }

  if (isHideFromRosterUnsupportedError(primary.error)) {
    const fallback = await build(false);
    if (fallback.error) {
      return { data: [], error: fallback.error };
    }
    return { data: (fallback.data ?? []) as Row[], error: null };
  }

  return { data: [], error: primary.error };
}
