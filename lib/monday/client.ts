/**
 * Monday.com GraphQL API client.
 *
 * Required env var: MONDAY_API_TOKEN
 */

const MONDAY_API_URL = 'https://api.monday.com/v2';

function getToken(): string {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) throw new Error('MONDAY_API_TOKEN not set');
  return token;
}

export function isMondayConfigured(): boolean {
  return !!process.env.MONDAY_API_TOKEN;
}

export async function mondayQuery<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const token = getToken();

  const res = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Monday.com API error: ${res.status}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`Monday.com GraphQL error: ${JSON.stringify(json.errors)}`);
  }

  return json.data as T;
}

// ---------------------------------------------------------------------------
// Board & item types
// ---------------------------------------------------------------------------

export interface MondayColumnValue {
  id: string;
  text: string;
  value: string | null;
}

export interface MondayItem {
  id: string;
  name: string;
  column_values: MondayColumnValue[];
}

// ---------------------------------------------------------------------------
// Fetch clients from the Clients board
// ---------------------------------------------------------------------------

const CLIENTS_BOARD_ID = process.env.MONDAY_CLIENTS_BOARD_ID || '9432491336';

export async function fetchMondayClients(): Promise<MondayItem[]> {
  const data = await mondayQuery<{
    boards: Array<{ items_page: { items: MondayItem[] } }>;
  }>(`
    query {
      boards(ids: [${CLIENTS_BOARD_ID}]) {
        items_page(limit: 100) {
          items {
            id
            name
            column_values {
              id
              text
              value
            }
          }
        }
      }
    }
  `);

  return data.boards[0]?.items_page.items || [];
}

// ---------------------------------------------------------------------------
// Create a new client item on the Monday.com board
// ---------------------------------------------------------------------------

export async function createMondayItem(
  clientName: string,
  columnValues?: Record<string, unknown>,
): Promise<{ id: string } | null> {
  if (!isMondayConfigured()) return null;

  try {
    const values = columnValues ? JSON.stringify(JSON.stringify(columnValues)) : '"{}"';

    const data = await mondayQuery<{
      create_item: { id: string };
    }>(`
      mutation {
        create_item(
          board_id: ${CLIENTS_BOARD_ID},
          item_name: "${clientName.replace(/"/g, '\\"')}",
          column_values: ${values}
        ) {
          id
        }
      }
    `);

    return { id: data.create_item.id };
  } catch (error) {
    console.error('Monday.com createMondayItem failed:', error);
    return null;
  }
}

/**
 * Parse a Monday.com client item into structured data.
 */
export function parseMondayClient(item: MondayItem) {
  const cols = Object.fromEntries(
    item.column_values.map((c) => [c.id, c.text]),
  );

  // Column IDs from the Clients board
  // text_mkt467rn = Abbreviation
  // color_mktsd6y7 = SMM (status: Yes/No)
  // color_mkwz9cwd = Paid Media (status: Yes/No)
  // color_mkrw743r = Agency (status: Nativz/etc)
  // color_mktsmz4y = Affiliates (status: Yes/No)
  // color_mkwqhwx  = Editing (status: Yes/No)
  // long_text_mkxm4whr = POC 1 (format: "Name <email>, Name <email>")
  // text_mkxdhc5p = Space ID

  const services: string[] = [];
  const isYes = (v: string) => v && v !== 'No' && v !== '' && v !== 'null';
  if (isYes(cols.color_mktsd6y7)) services.push('SMM');
  if (isYes(cols.color_mkwz9cwd)) services.push('Paid Media');
  if (isYes(cols.color_mktsmz4y)) services.push('Affiliates');
  if (isYes(cols.color_mkwqhwx)) services.push('Editing');

  // Agency column stores the agency name (e.g. "Nativz")
  const agency = isYes(cols.color_mkrw743r) ? cols.color_mkrw743r : '';

  // Parse POC from long text: "Name <email>, Name <email>"
  const pocRaw = cols.long_text_mkxm4whr || '';
  const contacts: Array<{ name: string; email: string }> = [];
  const pocMatches = pocRaw.matchAll(/([^<,]+?)\s*<([^>]+)>/g);
  for (const m of pocMatches) {
    contacts.push({ name: m[1].trim(), email: m[2].trim() });
  }

  return {
    mondayId: item.id,
    name: item.name,
    abbreviation: cols.text_mkt467rn || '',
    agency,
    services,
    contacts,
    spaceId: cols.text_mkxdhc5p || '',
  };
}
