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

// ---------------------------------------------------------------------------
// Fetch items from the Content Calendars board (shoots)
// ---------------------------------------------------------------------------

const CONTENT_CALENDARS_BOARD_ID = process.env.MONDAY_CONTENT_CALENDARS_BOARD_ID || '';

export interface MondayGroup {
  id: string;
  title: string;
}

export interface MondayContentCalendarItem {
  id: string;
  name: string;
  group: { id: string; title: string };
  column_values: MondayColumnValue[];
}

export interface ParsedShootItem {
  mondayItemId: string;
  clientName: string;
  abbreviation: string; // extracted from parenthetical in item name, e.g. "ASAB"
  groupTitle: string; // e.g. "February 2026"
  date: string | null; // ISO date string from Shoot Date column
  rawsStatus: string; // RAWs column: "Uploaded", "No shoot", etc.
  editingStatus: string; // Editing Status column
  assignmentStatus: string; // Assignment Status column
  clientApproval: string; // Client Approval column
  agency: string; // Agency column
  boostingStatus: string; // Boosting Status column
  notes: string; // Notes long text
  rawsFolderUrl: string; // RAWs Folder link
  editedVideosFolderUrl: string; // Edited Videos Folder link
  laterCalendarUrl: string; // Later Calendar View link
  columns: Record<string, string>; // all raw column values
}

export async function fetchContentCalendarItems(): Promise<{
  groups: MondayGroup[];
  items: MondayContentCalendarItem[];
}> {
  if (!CONTENT_CALENDARS_BOARD_ID) {
    throw new Error('MONDAY_CONTENT_CALENDARS_BOARD_ID not set');
  }

  const data = await mondayQuery<{
    boards: Array<{
      groups: MondayGroup[];
      items_page: { items: MondayContentCalendarItem[] };
    }>;
  }>(`
    query {
      boards(ids: [${CONTENT_CALENDARS_BOARD_ID}]) {
        groups {
          id
          title
        }
        items_page(limit: 200) {
          items {
            id
            name
            group {
              id
              title
            }
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

  const board = data.boards[0];
  return {
    groups: board?.groups ?? [],
    items: board?.items_page.items ?? [],
  };
}

// ---------------------------------------------------------------------------
// Content Calendars board column IDs (discovered from board 9232769015)
// ---------------------------------------------------------------------------

const CC_COLS = {
  shootDate: 'date_mkrv3eyh',           // Shoot Date (date)
  raws: 'color_mkr74mgy',               // RAWs (status: Uploaded / No shoot)
  clientApproval: 'color_mksd61fs',      // Client Approval (status)
  editingStatus: 'status_mkm9vbtf',     // Editing Status (status)
  assignmentStatus: 'color_mkrv2m31',   // Assignment Status (status)
  agency: 'color_mkrw743r',             // Agency (status)
  notes: 'long_text_mktrkpfp',          // Notes (long_text)
  editedVideosFolder: 'link_mksmpf2r',  // Edited Videos Folder (link)
  rawsFolder: 'link_mksmzpn8',          // RAWs Folder (link)
  laterCalendarView: 'link_mkt77tjt',   // Later Calendar View Link (link)
  boostingStatus: 'color_mkvkfw5',      // Boosting Status (status)
} as const;

/**
 * Parse a Content Calendar item into a structured shoot item.
 * Uses hardcoded column IDs from the Monday.com Content Calendars board.
 */
export function parseContentCalendarItem(item: MondayContentCalendarItem): ParsedShootItem {
  const cols = Object.fromEntries(
    item.column_values.map((c) => [c.id, c.text]),
  );

  // Extract abbreviation from item name — e.g. "All Shutters and Blinds (ASAB)" → "ASAB"
  const abbrMatch = item.name.match(/\(([^)]+)\)\s*$/);
  const abbreviation = abbrMatch ? abbrMatch[1] : '';
  const clientName = item.name.replace(/\s*\([^)]+\)\s*$/, '').trim();

  // Parse shoot date
  let date: string | null = null;
  const dateCol = item.column_values.find((c) => c.id === CC_COLS.shootDate);
  if (dateCol?.value) {
    try {
      const parsed = JSON.parse(dateCol.value);
      date = parsed.date || null;
    } catch {
      date = dateCol.text || null;
    }
  }

  // Parse link columns — Monday stores links as JSON: {"url":"...","text":"..."}
  function extractLink(colId: string): string {
    const col = item.column_values.find((c) => c.id === colId);
    if (!col?.value) return '';
    try {
      const parsed = JSON.parse(col.value);
      return parsed.url || col.text || '';
    } catch {
      return col.text || '';
    }
  }

  return {
    mondayItemId: item.id,
    clientName,
    abbreviation,
    groupTitle: item.group.title,
    date,
    rawsStatus: cols[CC_COLS.raws] || '',
    editingStatus: cols[CC_COLS.editingStatus] || '',
    assignmentStatus: cols[CC_COLS.assignmentStatus] || '',
    clientApproval: cols[CC_COLS.clientApproval] || '',
    agency: cols[CC_COLS.agency] || '',
    boostingStatus: cols[CC_COLS.boostingStatus] || '',
    notes: cols[CC_COLS.notes] || '',
    rawsFolderUrl: extractLink(CC_COLS.rawsFolder),
    editedVideosFolderUrl: extractLink(CC_COLS.editedVideosFolder),
    laterCalendarUrl: extractLink(CC_COLS.laterCalendarView),
    columns: cols,
  };
}

// ---------------------------------------------------------------------------
// Parse client items
// ---------------------------------------------------------------------------

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
