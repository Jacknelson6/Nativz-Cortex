/**
 * Which `clients` rows participate in Fyxer/Gmail subject → client auto-match.
 *
 * Nativz-agency clients are excluded until that roster is ready to be included.
 * Set `FYXER_INCLUDE_NATIVZ_CLIENTS=true` to match against all active clients.
 */

export function includeNativzClientsInFyxerMatch(): boolean {
  const v = process.env.FYXER_INCLUDE_NATIVZ_CLIENTS?.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

/**
 * @param agency - `clients.agency` (e.g. Monday “Agency” column: Nativz, AC, …)
 */
export function isAgencyEligibleForFyxerClientMatch(agency: string | null | undefined): boolean {
  if (includeNativzClientsInFyxerMatch()) return true;
  const a = (agency ?? '').trim().toLowerCase();
  if (!a) return true;
  return !a.includes('nativz');
}

export function filterClientsForFyxerMatching<T extends { agency?: string | null }>(
  rows: T[],
): T[] {
  if (includeNativzClientsInFyxerMatch()) return rows;
  return rows.filter((c) => isAgencyEligibleForFyxerClientMatch(c.agency));
}
