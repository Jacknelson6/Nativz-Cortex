import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Pipeline team assignees live in two places during the NAT-27 dual-write
 * window: `<role>` (TEXT display name, used by the Monday.com sync) and
 * `<role>_id` (UUID FK to team_members, used by new code like the NAT-25
 * accounting auto-link). Callers may set either or both — this helper
 * makes sure the row that actually lands in the DB has both columns
 * consistent, regardless of which one the caller provided.
 *
 * Rules:
 *   - If the caller set only `_id`, look up the team member and mirror
 *     full_name into the text column.
 *   - If the caller set only the text name, look up a matching active
 *     team member by normalised full_name and mirror the id.
 *   - If both are set, trust what the caller sent (no DB round-trip).
 *   - If neither is set, the field is untouched.
 *   - Setting either to null/empty clears *both* — callers explicitly
 *     passing `null` want an un-assignment.
 */

export const TEAM_ASSIGNEE_ROLES = [
  'strategist',
  'videographer',
  'editing_manager',
  'editor',
  'smm',
] as const;
export type TeamAssigneeRole = (typeof TEAM_ASSIGNEE_ROLES)[number];

interface AssigneePatch {
  [key: string]: string | null | undefined;
}

interface NormalizedMember {
  id: string;
  full_name: string;
  norm: string;
}

function normalise(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

// NAT-47 — rewrite Monday.com-shaped display names to our canonical forms so
// the Monday sync doesn't keep re-introducing the old spellings. Jack's rule:
// first-name-wins where it disambiguates, preserve the real last name, drop
// decorative prefixes like "Neo". Runs on each comma-separated segment.
const CANONICAL_NAME_MAP: Record<string, string> = {
  'neo khen gelizon': 'Khen Gelizon',
  'jedidiah panganiban': 'Jed Panganiban',
  'jedidiah  panganiban': 'Jed Panganiban',
  'jedidiah nativz': 'Jed Panganiban',
  'jashanjot singh': 'Jashan Singh',
};

export function canonicaliseAssigneeName(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s*,\s*/).map((part) => {
    const lc = normalise(part);
    return CANONICAL_NAME_MAP[lc] ?? part;
  });
  return parts.join(', ');
}

let memberCache: { at: number; rows: NormalizedMember[] } | null = null;
const CACHE_TTL_MS = 60_000;

async function loadMembers(
  admin: ReturnType<typeof createAdminClient>,
): Promise<NormalizedMember[]> {
  if (memberCache && Date.now() - memberCache.at < CACHE_TTL_MS) {
    return memberCache.rows;
  }
  const { data } = await admin
    .from('team_members')
    .select('id, full_name, user_id, created_at, is_active')
    .eq('is_active', true);
  const rows: NormalizedMember[] = [];
  const seen = new Map<string, { idx: number; priority: number }>();
  for (const row of data ?? []) {
    const name = (row.full_name ?? '').trim();
    if (!name) continue;
    if (['test', 'tester', 'demo', 'placeholder'].includes(name.toLowerCase())) continue;
    const norm = normalise(name);
    const priority =
      (row.user_id ? 2 : 0) + (row.created_at ? new Date(row.created_at).getTime() / 1e13 : 0);
    const existing = seen.get(norm);
    if (!existing || priority > existing.priority) {
      if (existing) rows.splice(existing.idx, 1);
      seen.set(norm, { idx: rows.length, priority });
      rows.push({ id: row.id, full_name: name, norm });
    }
  }
  memberCache = { at: Date.now(), rows };
  return rows;
}

/**
 * Apply name↔id mirroring to a patch before it hits `content_pipeline.update()`.
 * Returns a fresh object with both sides populated (or cleared) as needed.
 */
export async function syncTeamAssignees<T extends AssigneePatch>(
  patch: T,
): Promise<T> {
  const hasAny = TEAM_ASSIGNEE_ROLES.some(
    (role) => patch[role] !== undefined || patch[`${role}_id`] !== undefined,
  );
  if (!hasAny) return patch;

  const admin = createAdminClient();
  const members = await loadMembers(admin);
  const byId = new Map(members.map((m) => [m.id, m]));
  const byNorm = new Map(members.map((m) => [m.norm, m]));

  const result = { ...patch } as Record<string, string | null | undefined>;

  // NAT-47 — rewrite Monday.com-shaped names to canonical before resolving.
  for (const role of TEAM_ASSIGNEE_ROLES) {
    const nameField = role;
    const raw = result[nameField];
    if (typeof raw === 'string' && raw.trim()) {
      result[nameField] = canonicaliseAssigneeName(raw);
    }
  }

  for (const role of TEAM_ASSIGNEE_ROLES) {
    const nameField = role;
    const idField = `${role}_id`;
    const patchedName = result[nameField];
    const patchedId = result[idField];

    // Explicit clear — caller wants both sides empty.
    if (patchedName === null || patchedName === '') {
      result[nameField] = null;
      if (patchedId === undefined) result[idField] = null;
    }
    if (patchedId === null) {
      result[idField] = null;
      if (patchedName === undefined) result[nameField] = null;
    }

    // Only name was provided → resolve id.
    if (
      patchedName !== undefined &&
      patchedName !== null &&
      patchedName !== '' &&
      patchedId === undefined
    ) {
      const match = byNorm.get(normalise(patchedName));
      if (match) result[idField] = match.id;
    }

    // Only id was provided → mirror name.
    if (
      patchedId !== undefined &&
      patchedId !== null &&
      (patchedName === undefined || patchedName === '')
    ) {
      const match = byId.get(patchedId);
      if (match) result[nameField] = match.full_name;
    }
  }

  return result as T;
}
