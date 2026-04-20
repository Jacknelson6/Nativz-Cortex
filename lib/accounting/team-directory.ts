/**
 * Accounting uses a narrower view of the team_members table than the rest
 * of the app — the table has years of duplicates (e.g. three rows for the
 * same person created during separate invite flows) and "test" rows that
 * would clutter the payroll dropdowns. This helper dedupes by normalised
 * full_name and drops obvious junk.
 */

interface RawTeamMember {
  id: string;
  full_name: string | null;
  role?: string | null;
  is_active?: boolean | null;
  user_id?: string | null;
  created_at?: string | null;
}

interface ActiveTeamMember {
  id: string;
  full_name: string;
  role: string | null;
}

const JUNK_NAMES = new Set(['test', 'tester', 'demo', 'placeholder']);

function normalise(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Return the set of team members that should show up in payroll UIs:
 *   - is_active = true
 *   - full_name not blank and not on the junk list
 *   - one row per normalised name (prefer the row with a user_id and the
 *     most recent created_at)
 */
export function selectPayrollTeamMembers(rows: RawTeamMember[]): ActiveTeamMember[] {
  const byName = new Map<string, RawTeamMember>();

  for (const row of rows) {
    if (row.is_active === false) continue;
    const name = (row.full_name ?? '').trim();
    if (!name) continue;
    if (JUNK_NAMES.has(name.toLowerCase())) continue;

    const key = normalise(name);
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, row);
      continue;
    }

    // Prefer rows with a user_id attached, then newer created_at.
    const existingHasAuth = Boolean(existing.user_id);
    const candidateHasAuth = Boolean(row.user_id);
    if (candidateHasAuth && !existingHasAuth) {
      byName.set(key, row);
      continue;
    }
    if (existingHasAuth && !candidateHasAuth) continue;

    const existingTs = existing.created_at ? Date.parse(existing.created_at) : 0;
    const candidateTs = row.created_at ? Date.parse(row.created_at) : 0;
    if (candidateTs > existingTs) {
      byName.set(key, row);
    }
  }

  return Array.from(byName.values())
    .map((r) => ({
      id: r.id,
      full_name: (r.full_name ?? '').trim(),
      role: r.role ?? null,
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}
