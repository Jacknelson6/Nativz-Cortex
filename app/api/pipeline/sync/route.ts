import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const MONDAY_API = 'https://api.monday.com/v2';
const MONDAY_BOARD_ID = '9232769015';

// Column ID → field mapping from the Monday.com board
const STATUS_LABELS: Record<string, Record<string, string>> = {
  assignment_status: {
    'Assigned': 'assigned',
    'Can assign': 'can_assign',
    'Need shoot': 'need_shoot',
  },
  raws_status: {
    'Waiting on shoot': 'waiting_on_shoot',
    'Uploaded / No shoot': 'uploaded',
    'Need to schedule': 'need_to_schedule',
  },
  editing_status: {
    'Not started': 'not_started',
    'Editing': 'editing',
    'Edited': 'edited',
    'EM Approved': 'em_approved',
    'Revising': 'revising',
    'Blocked': 'blocked',
    'Scheduled': 'scheduled',
    'Done': 'done',
  },
  client_approval_status: {
    'Not sent': 'not_sent',
    'Waiting on approval': 'waiting_on_approval',
    'Client approved': 'client_approved',
    'Needs revision': 'needs_revision',
    'Revised': 'revised',
    'Sent to Paid Media': 'sent_to_paid_media',
  },
  boosting_status: {
    'Not boosting': 'not_boosting',
    'Working on it': 'working_on_it',
    'Done': 'done',
  },
};

function mapStatus(field: string, mondayText: string | null): string | null {
  if (!mondayText) return null;
  return STATUS_LABELS[field]?.[mondayText] ?? null;
}

/** Parse month label like "March 2026" into a date "2026-03-01" */
function parseMonthLabel(label: string): string | null {
  const months: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  };

  const parts = label.toLowerCase().trim().split(/\s+/);
  const monthName = parts[0];
  const year = parts[1] ? parseInt(parts[1]) : new Date().getFullYear();
  const monthNum = months[monthName];
  if (!monthNum) return null;
  return `${year}-${String(monthNum).padStart(2, '0')}-01`;
}

// POST: Sync from Monday.com
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const apiToken = body.api_token;
    if (!apiToken) {
      return NextResponse.json({ error: 'api_token is required' }, { status: 400 });
    }

    // Optional: sync only specific group/month
    const targetGroupId = body.group_id as string | undefined;

    // Fetch all groups and their items from Monday.com
    const groupsQuery = targetGroupId
      ? `groups(ids: ["${targetGroupId}"]) {`
      : 'groups {';

    const query = `{
      boards(ids: [${MONDAY_BOARD_ID}]) {
        ${groupsQuery}
          id title
          items_page(limit: 100) {
            items {
              id name
              column_values(ids: [
                "color_mkrv2m31", "status_mkm9vbtf", "color_mkr74mgy",
                "color_mksd61fs", "color_mkvkfw5", "color_mkrw743r",
                "date_mkrv3eyh", "date_mksfvwn4", "date_mksfd4dt",
                "date_mksf88m7", "date_mksfprrr",
                "multiple_person_mkrh4gj9", "multiple_person_mkr7atm4",
                "multiple_person_mkrvbbq9", "multiple_person_mkrvyzkh",
                "multiple_person_mkrvxnv7",
                "link_mksmpf2r", "link_mksmzpn8", "link_mkt77tjt",
                "long_text_mktrkpfp"
              ]) { id text }
            }
          }
        }
      }
    }`;

    const res = await fetch(MONDAY_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiToken,
      },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Monday.com API error: ${res.status}` }, { status: 502 });
    }

    const mondayData = await res.json();
    if (mondayData.errors) {
      return NextResponse.json({ error: mondayData.errors[0]?.message ?? 'Monday.com query error' }, { status: 502 });
    }

    const groups = mondayData.data?.boards?.[0]?.groups ?? [];
    const adminClient = createAdminClient();

    // Try to match clients by name
    const { data: clients } = await adminClient.from('clients').select('id, name');
    const clientMap = new Map<string, string>();
    (clients ?? []).forEach(c => {
      clientMap.set(c.name.toLowerCase(), c.id);
      // Also match without parenthetical abbreviation
      const baseName = c.name.replace(/\s*\(.*?\)\s*$/, '').toLowerCase();
      clientMap.set(baseName, c.id);
    });

    let synced = 0;
    let skipped = 0;

    for (const group of groups) {
      const monthDate = parseMonthLabel(group.title);
      if (!monthDate) { skipped++; continue; }

      for (const item of group.items_page?.items ?? []) {
        const cols: Record<string, string | null> = {};
        for (const cv of item.column_values ?? []) {
          cols[cv.id] = cv.text || null;
        }

        // Try to match client
        const baseName = item.name.replace(/\s*\(.*?\)\s*$/, '').toLowerCase();
        const clientId = clientMap.get(baseName) ?? clientMap.get(item.name.toLowerCase()) ?? null;

        const row = {
          monday_item_id: item.id,
          client_id: clientId,
          client_name: item.name,
          month_label: group.title,
          month_date: monthDate,
          agency: cols['color_mkrw743r'] ?? null,
          strategist: cols['multiple_person_mkrh4gj9'] ?? null,
          videographer: cols['multiple_person_mkr7atm4'] ?? null,
          editing_manager: cols['multiple_person_mkrvbbq9'] ?? null,
          editor: cols['multiple_person_mkrvyzkh'] ?? null,
          smm: cols['multiple_person_mkrvxnv7'] ?? null,
          assignment_status: mapStatus('assignment_status', cols['color_mkrv2m31']) ?? 'can_assign',
          raws_status: mapStatus('raws_status', cols['color_mkr74mgy']) ?? 'need_to_schedule',
          editing_status: mapStatus('editing_status', cols['status_mkm9vbtf']) ?? 'not_started',
          client_approval_status: mapStatus('client_approval_status', cols['color_mksd61fs']) ?? 'not_sent',
          boosting_status: mapStatus('boosting_status', cols['color_mkvkfw5']) ?? 'not_boosting',
          shoot_date: cols['date_mkrv3eyh'] || null,
          strategy_due_date: cols['date_mksfvwn4'] || null,
          raws_due_date: cols['date_mksfd4dt'] || null,
          smm_due_date: cols['date_mksf88m7'] || null,
          calendar_sent_date: cols['date_mksfprrr'] || null,
          edited_videos_folder_url: cols['link_mksmpf2r'] || null,
          raws_folder_url: cols['link_mksmzpn8'] || null,
          later_calendar_link: cols['link_mkt77tjt'] || null,
          notes: cols['long_text_mktrkpfp'] || null,
          updated_at: new Date().toISOString(),
        };

        // Upsert by monday_item_id
        const { error: upsertError } = await adminClient
          .from('content_pipeline')
          .upsert(row, { onConflict: 'monday_item_id' });

        if (upsertError) {
          console.error('Pipeline upsert error:', upsertError, row);
          skipped++;
        } else {
          synced++;
        }
      }
    }

    return NextResponse.json({ success: true, synced, skipped });
  } catch (error) {
    console.error('POST /api/pipeline/sync error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
