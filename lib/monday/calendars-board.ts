/**
 * Monday API helpers for the Content Calendars board (id 9232769015).
 *
 * Used by `scripts/schedule-skibell.ts` and `scripts/queue-from-monday.ts`
 * to read EM-Approved rows + write back share links and Scheduled status
 * after each calendar lands.
 */

export const BOARD_ID = 9232769015;
export const APRIL_GROUP_ID = 'group_mm1w17n6';

export const COL_EDITING_STATUS = 'status_mkm9vbtf';
export const COL_EDITED_FOLDER = 'link_mksmpf2r';
export const COL_LATER_LINK = 'link_mkt77tjt';

export const STATUS_EM_APPROVED = 'EM Approved';
export const STATUS_SCHEDULED = 'Scheduled';

export interface MondayRow {
  id: string;
  name: string;
  status: string;
  folderUrl: string | null;
  shareLink: string | null;
}

async function gql(token: string, query: string, variables?: Record<string, unknown>): Promise<unknown> {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token,
      'API-Version': '2024-01',
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: unknown; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(`Monday GraphQL: ${json.errors.map((e) => e.message).join('; ')}`);
  return json.data;
}

export function getMondayToken(): string {
  const token = process.env.MONDAY_API_TOKEN ?? process.env.MONDAY_TOKEN;
  if (!token) throw new Error('MONDAY_API_TOKEN env var is required');
  return token;
}

export async function fetchAprilRows(token: string): Promise<MondayRow[]> {
  const data = (await gql(
    token,
    `query { boards(ids:[${BOARD_ID}]){ groups(ids:["${APRIL_GROUP_ID}"]){ items_page(limit:200){ items{ id name column_values(ids:["${COL_EDITING_STATUS}","${COL_EDITED_FOLDER}","${COL_LATER_LINK}"]){ id text value } } } } } }`,
  )) as {
    boards: {
      groups: {
        items_page: {
          items: { id: string; name: string; column_values: { id: string; text: string | null; value: string | null }[] }[];
        };
      }[];
    }[];
  };
  const items = data.boards[0]?.groups[0]?.items_page.items ?? [];
  return items.map((row) => {
    const get = (id: string) => row.column_values.find((c) => c.id === id);
    const folderRaw = get(COL_EDITED_FOLDER)?.value;
    let folderUrl: string | null = null;
    if (folderRaw) {
      try {
        const parsed = JSON.parse(folderRaw) as { url?: string };
        folderUrl = parsed.url ?? null;
      } catch {
        folderUrl = null;
      }
    }
    return {
      id: row.id,
      name: row.name,
      status: get(COL_EDITING_STATUS)?.text ?? '',
      folderUrl,
      shareLink: get(COL_LATER_LINK)?.text ?? null,
    };
  });
}

export async function setLaterCalendarLink(token: string, rowId: string, shareUrl: string): Promise<void> {
  const value = JSON.stringify({ url: shareUrl, text: 'Calendar' });
  await gql(
    token,
    `mutation($itemId: ID!, $boardId: ID!, $columnId: String!, $value: JSON!) {
      change_column_value(item_id:$itemId, board_id:$boardId, column_id:$columnId, value:$value){ id }
    }`,
    { itemId: rowId, boardId: String(BOARD_ID), columnId: COL_LATER_LINK, value },
  );
}

export async function setStatusScheduled(token: string, rowId: string): Promise<void> {
  const value = JSON.stringify({ label: STATUS_SCHEDULED });
  await gql(
    token,
    `mutation($itemId: ID!, $boardId: ID!, $columnId: String!, $value: JSON!) {
      change_column_value(item_id:$itemId, board_id:$boardId, column_id:$columnId, value:$value){ id }
    }`,
    { itemId: rowId, boardId: String(BOARD_ID), columnId: COL_EDITING_STATUS, value },
  );
}

export async function findRowByName(token: string, name: string): Promise<MondayRow | null> {
  const rows = await fetchAprilRows(token);
  return rows.find((r) => r.name === name) ?? null;
}
