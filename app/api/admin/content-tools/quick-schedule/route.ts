import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import {
  fetchApprovedItems,
  getMondayToken,
} from '@/lib/monday/calendars-board';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/content-tools/quick-schedule
 *
 * Returns the unified ready-to-schedule queue:
 *
 *   1. Internal `editing_projects` rows where status = 'approved' (the
 *      Cortex-native pipeline). These come back as `source: 'internal'`
 *      so the UI can route the "Schedule" CTA to the internal flow
 *      instead of the Monday writeback.
 *   2. Monday Content-Calendar rows flagged "EM Approved" (the legacy
 *      Drive-based pipeline). `source: 'monday'`.
 *
 * The two sets are merged in a single response so the editor sees one
 * board ordered by "ready since" instead of having to context-switch.
 * Either source can fail independently:
 *
 *   - Monday missing token → soft skip with `monday_status: 'unconfigured'`
 *     instead of a hard 503. The internal list is still useful even when
 *     Monday isn't wired (and on local dev it usually isn't).
 *   - Monday upstream error → soft skip with `monday_status: 'error'` and
 *     the upstream detail in `monday_error`. Internal rows still render.
 *   - DB error pulling internal projects → 500. Internal failure is
 *     critical because that's the supported path going forward.
 *
 * Auth: admin-only. The Monday board contains every brand's pipeline.
 */

interface ItemDTO {
  source: 'internal' | 'monday';
  /** Stable id within its source. For internal: editing_projects.id.
   *  For monday: itemId (the Monday item id). */
  id: string;
  name: string;
  /** Brand label - client name for internal, Monday group name for monday. */
  brand: string;
  brandLogoUrl?: string | null;
  approvedAt: string | null;
  folderUrl: string | null;
  shareLink: string | null;
  /** "approved" for internal; the literal Monday status for monday. */
  status: string;
}

interface ResponseBody {
  items: ItemDTO[];
  monday_status: 'ok' | 'unconfigured' | 'error';
  monday_error?: string;
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

  const admin = createAdminClient();
  const internalPromise = admin
    .from('editing_projects')
    .select(
      `id, name, status, approved_at, drive_folder_url,
       client:clients!editing_projects_client_id_fkey(name, logo_url)`,
    )
    .eq('status', 'approved')
    .order('approved_at', { ascending: false });

  // Monday is optional. If the token is missing, surface that distinctly
  // so the UI can show a small inline notice ("Connect Monday in env to
  // surface legacy queue") rather than a scary banner.
  let mondayToken: string | null = null;
  let mondayStatus: ResponseBody['monday_status'] = 'unconfigured';
  let mondayError: string | undefined;
  try {
    mondayToken = getMondayToken();
    mondayStatus = 'ok';
  } catch {
    mondayStatus = 'unconfigured';
  }

  const mondayPromise =
    mondayToken !== null
      ? fetchApprovedItems(mondayToken).catch((err) => {
          mondayStatus = 'error';
          mondayError = err instanceof Error ? err.message : 'monday fetch failed';
          return [] as Awaited<ReturnType<typeof fetchApprovedItems>>;
        })
      : Promise.resolve([] as Awaited<ReturnType<typeof fetchApprovedItems>>);

  const [{ data: internalRows, error: internalErr }, mondayRows] = await Promise.all([
    internalPromise,
    mondayPromise,
  ]);

  if (internalErr) {
    return NextResponse.json(
      { error: 'db_error', detail: internalErr.message },
      { status: 500 },
    );
  }

  const internalItems: ItemDTO[] = (internalRows ?? []).map((row: any) => ({
    source: 'internal',
    id: row.id,
    name: row.name,
    brand: row.client?.name ?? 'Unassigned brand',
    brandLogoUrl: row.client?.logo_url ?? null,
    approvedAt: row.approved_at,
    folderUrl: row.drive_folder_url ?? null,
    shareLink: null,
    status: row.status,
  }));

  const mondayItems: ItemDTO[] = mondayRows.map((r) => ({
    source: 'monday',
    id: r.itemId,
    name: r.itemName,
    brand: r.groupName,
    brandLogoUrl: null,
    approvedAt: r.updatedAt,
    folderUrl: r.folderUrl,
    shareLink: r.shareLink,
    status: r.status,
  }));

  // Sort by approvedAt desc, falling back to name so the order is stable
  // when timestamps are missing (rare on internal, common on legacy
  // Monday rows that pre-date the approval-stamp column).
  const items = [...internalItems, ...mondayItems].sort((a, b) => {
    if (a.approvedAt && b.approvedAt) {
      return new Date(b.approvedAt).getTime() - new Date(a.approvedAt).getTime();
    }
    if (a.approvedAt) return -1;
    if (b.approvedAt) return 1;
    return a.name.localeCompare(b.name);
  });

  const body: ResponseBody = {
    items,
    monday_status: mondayStatus,
    ...(mondayError ? { monday_error: mondayError } : {}),
  };
  return NextResponse.json(body);
}
