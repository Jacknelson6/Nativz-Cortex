import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth/permissions';
import {
  fetchApprovedItems,
  getMondayToken,
} from '@/lib/monday/calendars-board';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/content-tools/quick-schedule
 *
 * Returns the EM-Approved queue from the Monday Content Calendars
 * board. Powers the Quick Schedule tab's "editor-approved queue" panel.
 *
 * Iter 14.4 ships the read side: pull rows, surface name + group +
 * approval timestamp + edited-folder link. The actual one-click
 * scheduler (thumbnail extract, transcribe, caption pre-fill, Zernio
 * push) lands in iter 14.5 once the per-row "Schedule" CTA is wired to
 * a fan-out endpoint.
 *
 * Auth: admin-only. The board contains every brand's content pipeline
 * data and isn't safe to expose to portal users (or even non-admin
 * team members).
 *
 * Failure modes:
 *  - MONDAY_API_TOKEN missing → 503 with `code: monday_unconfigured` so
 *    the tab can render its "coming online" placeholder instead of a
 *    generic toast. Keeps the tab honest about deploy state.
 *  - Monday upstream error → 502 with the upstream message in detail.
 */

interface ApprovedItemDTO {
  itemId: string;
  itemName: string;
  groupName: string;
  approvedAt: string | null;
  folderUrl: string | null;
  shareLink: string | null;
  status: string;
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  let token: string;
  try {
    token = getMondayToken();
  } catch {
    return NextResponse.json(
      { error: 'monday_unconfigured', detail: 'MONDAY_API_TOKEN not set' },
      { status: 503 },
    );
  }

  try {
    const rows = await fetchApprovedItems(token);
    const items: ApprovedItemDTO[] = rows.map((r) => ({
      itemId: r.itemId,
      itemName: r.itemName,
      groupName: r.groupName,
      approvedAt: r.updatedAt,
      folderUrl: r.folderUrl,
      shareLink: r.shareLink,
      status: r.status,
    }));
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json(
      {
        error: 'monday_upstream',
        detail: err instanceof Error ? err.message : 'monday fetch failed',
      },
      { status: 502 },
    );
  }
}
