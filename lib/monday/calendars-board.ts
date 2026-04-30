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
    const parseLinkValue = (raw: string | null | undefined): string | null => {
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as { url?: string };
        return parsed.url ?? null;
      } catch {
        return null;
      }
    };
    return {
      id: row.id,
      name: row.name,
      status: get(COL_EDITING_STATUS)?.text ?? '',
      folderUrl: parseLinkValue(get(COL_EDITED_FOLDER)?.value),
      shareLink: parseLinkValue(get(COL_LATER_LINK)?.value),
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

export interface MondayApprovedItem {
  itemId: string;
  itemName: string;
  groupName: string;
  status: string;
  folderUrl: string | null;
  shareLink: string | null;
  /** Monday doesn't expose status-change timestamps without an activity-
   *  log query, so we fall back to the row's `updated_at` here. Close
   *  enough for "how stale is this approval" sorting. */
  updatedAt: string | null;
}

/** Pull every item across every group on the Content Calendars board
 *  and surface the ones flagged `EM Approved` (or any caller-specified
 *  set of labels). One query, not a per-group fan-out, so the Quick
 *  Schedule tab stays under the route's 5s budget on a board with 10+
 *  monthly groups. Order: most-recently-updated first. */
export async function fetchApprovedItems(
  token: string,
  approvedLabels: readonly string[] = [STATUS_EM_APPROVED],
): Promise<MondayApprovedItem[]> {
  const data = (await gql(
    token,
    `query {
      boards(ids:[${BOARD_ID}]){
        groups{
          id
          title
          items_page(limit:200){
            items{
              id
              name
              updated_at
              column_values(ids:["${COL_EDITING_STATUS}","${COL_EDITED_FOLDER}","${COL_LATER_LINK}"]){
                id text value
              }
            }
          }
        }
      }
    }`,
  )) as {
    boards: {
      groups: {
        id: string;
        title: string;
        items_page: {
          items: {
            id: string;
            name: string;
            updated_at: string | null;
            column_values: { id: string; text: string | null; value: string | null }[];
          }[];
        };
      }[];
    }[];
  };

  const groups = data.boards[0]?.groups ?? [];
  const out: MondayApprovedItem[] = [];

  for (const group of groups) {
    for (const row of group.items_page.items) {
      const get = (id: string) => row.column_values.find((c) => c.id === id);
      const status = get(COL_EDITING_STATUS)?.text ?? '';
      if (!approvedLabels.includes(status)) continue;

      const parseLinkValue = (raw: string | null | undefined): string | null => {
        if (!raw) return null;
        try {
          const parsed = JSON.parse(raw) as { url?: string };
          return parsed.url ?? null;
        } catch {
          return null;
        }
      };

      out.push({
        itemId: row.id,
        itemName: row.name,
        groupName: group.title,
        status,
        folderUrl: parseLinkValue(get(COL_EDITED_FOLDER)?.value),
        shareLink: parseLinkValue(get(COL_LATER_LINK)?.value),
        updatedAt: row.updated_at,
      });
    }
  }

  out.sort((a, b) => {
    if (!a.updatedAt && !b.updatedAt) return 0;
    if (!a.updatedAt) return 1;
    if (!b.updatedAt) return -1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  return out;
}
