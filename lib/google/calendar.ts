/**
 * Shoot event identification and client matching logic.
 * Calendar event fetching is handled by Nango (see lib/nango/client.ts).
 */

export interface ParsedShootEvent {
  googleEventId: string;
  title: string;
  shootDate: string;
  location: string | null;
  notes: string | null;
}

// Keywords that indicate a shoot event
const SHOOT_KEYWORDS = [
  'shoot', 'filming', 'film', 'production', 'video shoot', 'photo shoot',
  'content day', 'content shoot', 'on location', 'set day', 'camera',
  'b-roll', 'broll', 'interview', 'recording', 'rec day',
];

/**
 * Identify which calendar events are likely shoot events.
 * Uses keyword matching on title, description, and location.
 */
export function identifyShootEvents(events: Array<{
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  status: string;
}>): ParsedShootEvent[] {
  const shoots: ParsedShootEvent[] = [];

  for (const event of events) {
    const searchText = [
      event.summary,
      event.description,
      event.location,
    ].filter(Boolean).join(' ').toLowerCase();

    const isShoot = SHOOT_KEYWORDS.some((kw) => searchText.includes(kw));

    if (isShoot) {
      shoots.push({
        googleEventId: event.id,
        title: event.summary,
        shootDate: event.start.dateTime || event.start.date || '',
        location: event.location || null,
        notes: event.description || null,
      });
    }
  }

  return shoots;
}

/**
 * Try to match a shoot event to a client based on the event title/description.
 * Returns the matching client_id or null.
 */
export function matchShootToClient(
  event: ParsedShootEvent,
  clients: Array<{ id: string; name: string; slug: string }>,
): string | null {
  const searchText = [event.title, event.notes].filter(Boolean).join(' ').toLowerCase();

  for (const client of clients) {
    // Match by client name (case-insensitive, partial match)
    if (searchText.includes(client.name.toLowerCase())) {
      return client.id;
    }
    // Match by slug
    if (searchText.includes(client.slug)) {
      return client.id;
    }
  }

  return null;
}
