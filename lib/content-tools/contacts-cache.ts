/**
 * Shared module-level cache for brand POC contacts, used by both the
 * calendar-link detail modal and the editing-project detail modal AND
 * prefetched on row hover in the unified review table.
 *
 * Brand profile is the source of truth, so recipients for a given brand
 * almost never change between modal opens. Without this, every row
 * click re-hits `/api/calendar/review/contacts` and spinner-flashes for
 * ~250ms — Jack flagged this as "shouldn't have to reload every time."
 *
 * Strategy:
 *   - getCachedContacts(clientId): instant read for synchronous render
 *   - fetchContacts(clientId): network read + cache write, also dedupes
 *     concurrent in-flight fetches so prefetch-on-hover + open-modal
 *     don't fire two parallel requests for the same brand
 *   - prefetchContacts(clientId): fire-and-forget helper for hover
 */

export interface ContactRow {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
}

const CACHE = new Map<string, ContactRow[]>();
const INFLIGHT = new Map<string, Promise<ContactRow[]>>();

export function getCachedContacts(clientId: string): ContactRow[] | null {
  return CACHE.get(clientId) ?? null;
}

export async function fetchContacts(clientId: string): Promise<ContactRow[]> {
  const existing = INFLIGHT.get(clientId);
  if (existing) return existing;
  const p = fetch(
    `/api/calendar/review/contacts?clientId=${encodeURIComponent(clientId)}`,
    { cache: 'no-store' },
  )
    .then(async (res) => {
      if (!res.ok) throw new Error('failed');
      const body = (await res.json()) as { contacts: ContactRow[] };
      const next = body.contacts ?? [];
      CACHE.set(clientId, next);
      return next;
    })
    .finally(() => {
      INFLIGHT.delete(clientId);
    });
  INFLIGHT.set(clientId, p);
  return p;
}

/**
 * Fire-and-forget warm-up for hover handlers. Swallows errors silently —
 * the modal will retry on open and surface any real failure there.
 */
export function prefetchContacts(clientId: string | null | undefined): void {
  if (!clientId) return;
  if (CACHE.has(clientId)) return;
  if (INFLIGHT.has(clientId)) return;
  void fetchContacts(clientId).catch(() => {});
}
