import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import {
  fetchItemById,
  getMondayToken,
  setLaterCalendarLink,
  setStatusScheduled,
  STATUS_EM_APPROVED,
} from '@/lib/monday/calendars-board';
import { resolveCortexClientFromMondayName } from '@/lib/monday/client-mapping';
import { listVideosInFolder } from '@/lib/calendar/drive-folder';
import { runCalendarPipeline, eachDay, pickEven } from '@/lib/calendar/run-pipeline';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Fluid Compute ceiling; bigger drops live in iter 15.2 (async).

/**
 * POST /api/admin/content-tools/quick-schedule/start
 *
 * Per-row "Schedule" action behind the Quick Schedule tab. Takes a
 * Monday Content-Calendar item id, resolves the Cortex client, walks
 * the linked edited-folder, and runs the existing calendar pipeline
 * (ingest → analyze → captions → schedule) against the brand. On
 * success the Monday row gets the share link + status=Scheduled
 * written back, mirroring `scripts/queue-from-monday.ts`.
 *
 * Iter 15.1 ships this synchronously. The browser holds the request
 * open for the duration of the pipeline (Vercel Fluid Compute caps at
 * 300s). For big drops the route returns 504 and the row stays
 * EM-Approved on Monday so a retry is safe. Iter 15.2+ moves the
 * pipeline behind a job + status poller so the UI doesn't block.
 *
 * Auth: admin only. The route bypasses RLS via the admin client to
 * write into content_drops and read every brand's saved captions.
 *
 * Request body: { itemId: string }
 *
 * Response shape (success):
 *   { dropId: string, shareUrl: string | null, scheduled: number,
 *     failed: number, mondayWriteback: 'ok' | 'skipped' | 'failed' }
 *
 * Failure modes:
 *   400 → bad body / no folder URL on Monday row
 *   401 → not signed in
 *   403 → not an admin
 *   404 → Monday item not found / not EM-Approved anymore
 *   422 → client resolution failed (no slug, inactive, no platforms…)
 *   502 → Drive list / pipeline / Monday writeback failed
 *   503 → MONDAY_API_TOKEN missing on this env
 */

const StartSchema = z.object({
  itemId: z.string().min(1),
  /** Optional override window. Defaults to "next 30 days starting
   *  tomorrow" so the admin doesn't need to think about dates for the
   *  fast path. Iter 15.2 surfaces a date picker in the UI. */
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  postTimeCt: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

function plus(days: number, base = new Date()): string {
  const d = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = StartSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', detail: parsed.error.message },
      { status: 400 },
    );
  }
  const { itemId } = parsed.data;

  let token: string;
  try {
    token = getMondayToken();
  } catch {
    return NextResponse.json(
      { error: 'monday_unconfigured', detail: 'MONDAY_API_TOKEN not set' },
      { status: 503 },
    );
  }

  const admin = createAdminClient();

  // 1. Pull the row off Monday so we have a fresh folder URL + status
  //    snapshot. We don't trust whatever the queue UI sent; the row may
  //    have been edited or unflagged in the seconds between page render
  //    and click.
  let row;
  try {
    row = await fetchItemById(token, itemId);
  } catch (err) {
    return NextResponse.json(
      {
        error: 'monday_upstream',
        detail: err instanceof Error ? err.message : 'monday fetch failed',
      },
      { status: 502 },
    );
  }
  if (!row) {
    return NextResponse.json(
      { error: 'monday_item_missing', detail: `Item ${itemId} not on the board` },
      { status: 404 },
    );
  }
  if (row.status !== STATUS_EM_APPROVED) {
    return NextResponse.json(
      {
        error: 'not_em_approved',
        detail: `Row "${row.itemName}" is "${row.status || 'no status'}", not "${STATUS_EM_APPROVED}". Refresh the queue.`,
      },
      { status: 404 },
    );
  }
  if (!row.folderUrl) {
    return NextResponse.json(
      {
        error: 'no_folder_url',
        detail: `Row "${row.itemName}" doesn't have an Edited Videos Folder link set on Monday.`,
      },
      { status: 400 },
    );
  }

  // 2. Resolve the Cortex client + connected platforms by Monday name.
  const resolved = await resolveCortexClientFromMondayName(admin, row.itemName);
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error.code, detail: resolved.error.detail },
      { status: 422 },
    );
  }
  const client = resolved.client;

  // 3. Make sure we have a Cortex user record for the admin (used as
  //    `created_by` on content_drops + as the impersonation identity for
  //    Drive). The auth user id is canonical; email is just for log lines.
  const { data: cortexUser } = await admin
    .from('users')
    .select('id, email')
    .eq('id', user.id)
    .maybeSingle<{ id: string; email: string }>();
  if (!cortexUser) {
    return NextResponse.json(
      { error: 'no_cortex_user', detail: 'Authenticated admin has no users row.' },
      { status: 422 },
    );
  }

  // 4. List the Drive folder so we know how many videos we're scheduling
  //    BEFORE we cut the content_drops row. Empty folder = explicit error,
  //    not a 0-video drop.
  let videos;
  try {
    const list = await listVideosInFolder(cortexUser.id, row.folderUrl);
    videos = list.videos
      .filter((v) => v.size > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    return NextResponse.json(
      {
        error: 'drive_list_failed',
        detail: err instanceof Error ? err.message : 'drive list failed',
      },
      { status: 502 },
    );
  }
  if (videos.length === 0) {
    return NextResponse.json(
      {
        error: 'empty_folder',
        detail: `Drive folder for "${row.itemName}" has no usable videos.`,
      },
      { status: 422 },
    );
  }

  // 5. Default schedule window: tomorrow → +30 days, 12:00 CT. The script
  //    versions hard-code calendar months; for a per-row Quick Schedule
  //    the admin almost always wants "spread these over the next month".
  const startDate = parsed.data.startDate ?? plus(1);
  const endDate = parsed.data.endDate ?? plus(30);
  const postTimeCt = parsed.data.postTimeCt ?? '12:00';
  const days = eachDay(startDate, endDate);
  if (days.length < videos.length) {
    return NextResponse.json(
      {
        error: 'window_too_short',
        detail: `Window ${startDate}..${endDate} only has ${days.length} days but folder has ${videos.length} videos.`,
      },
      { status: 400 },
    );
  }
  const perVideoDates = pickEven(days, videos.length);

  const brand = getBrandFromAgency(client.agency);
  const appUrl = getCortexAppUrl(brand);

  // 6. Run the pipeline. mintShareLink=true + draftMode=true matches the
  //    bulk queue-from-monday behavior: every EM-Approved row gets a
  //    public review link, posts stay drafts until the client approves.
  const result = await runCalendarPipeline(admin, {
    label: `${client.clientName} (Quick Schedule, item ${row.itemId})`,
    folderUrl: row.folderUrl,
    videos,
    perVideoDates,
    defaultPostTimeCt: postTimeCt,
    startDate,
    endDate,
    platforms: client.platforms,
    mintShareLink: true,
    draftMode: true,
    appUrl,
    clientId: client.clientId,
    userId: cortexUser.id,
    userEmail: cortexUser.email,
  });

  if (result.error) {
    return NextResponse.json(
      {
        error: 'pipeline_failed',
        detail: result.error,
        dropId: result.dropId ?? null,
        shareUrl: result.shareUrl ?? null,
      },
      { status: 502 },
    );
  }

  // 7. Monday writeback. Failure here doesn't fail the whole call (the
  //    drop already landed), but we surface it so the UI can show an
  //    inline warning + retry button. The Monday row stays EM-Approved
  //    in that case, which is safe: a retry just no-ops on duplicate
  //    drops because content_drops is keyed by drive_folder_id.
  let mondayWriteback: 'ok' | 'skipped' | 'failed' = 'skipped';
  let mondayDetail: string | null = null;
  if (result.shareUrl) {
    try {
      await setLaterCalendarLink(token, row.itemId, result.shareUrl);
      await setStatusScheduled(token, row.itemId);
      mondayWriteback = 'ok';
    } catch (err) {
      mondayWriteback = 'failed';
      mondayDetail = err instanceof Error ? err.message : 'monday writeback failed';
    }
  }

  return NextResponse.json({
    dropId: result.dropId ?? null,
    shareUrl: result.shareUrl ?? null,
    scheduled: result.scheduled,
    failed: result.failed,
    mondayWriteback,
    mondayDetail,
    clientName: client.clientName,
  });
}
