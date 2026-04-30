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
 * Per-row "Schedule" action behind the Quick Schedule tab. Dispatches
 * on `source` so the same endpoint handles both pipelines:
 *
 *   source: 'monday'    -> Monday Content-Calendar item (legacy path).
 *                          Resolves brand by item name, walks the linked
 *                          Drive folder, runs the calendar pipeline,
 *                          writes the share link + status=Scheduled
 *                          back to Monday on success.
 *
 *   source: 'internal'  -> editing_projects row (Cortex-native path).
 *                          Brand is already known via project.client_id.
 *                          Requires the project to have a
 *                          drive_folder_url set (so we can pick up the
 *                          editor's master cuts). Marks the project
 *                          status=scheduled + stamps the drop_id link
 *                          on success. No Monday writeback.
 *
 * Iter 15.1 ships this synchronously; the browser holds the request
 * open for the duration of the pipeline (Vercel Fluid Compute caps at
 * 300s). For big drops the route returns 504 and the source row stays
 * approved / EM-Approved so a retry is safe. Iter 15.2+ moves the
 * pipeline behind a job + status poller so the UI doesn't block.
 *
 * Auth: admin only. The route bypasses RLS via the admin client to
 * write into content_drops and read every brand's saved captions.
 *
 * Request body:
 *   { source: 'monday' | 'internal', id: string }
 *   (legacy `{ itemId }` is still accepted and treated as Monday)
 *
 * Response shape (success):
 *   { dropId: string, shareUrl: string | null, scheduled: number,
 *     failed: number, mondayWriteback: 'ok' | 'skipped' | 'failed',
 *     mondayDetail: string | null, clientName: string }
 *
 * Failure modes:
 *   400 → bad body / no folder URL on source row
 *   401 → not signed in
 *   403 → not an admin
 *   404 → source row not found / not approved anymore
 *   422 → client resolution failed (no slug, inactive, no platforms…)
 *   502 → Drive list / pipeline / Monday writeback failed
 *   503 → MONDAY_API_TOKEN missing on this env (Monday source only)
 */

const StartSchema = z
  .object({
    source: z.enum(['monday', 'internal']).optional(),
    id: z.string().min(1).optional(),
    /** Legacy. Older clients only know about Monday. */
    itemId: z.string().min(1).optional(),
    /** Optional override window. Defaults to "next 30 days starting
     *  tomorrow" so the admin doesn't need to think about dates for the
     *  fast path. Iter 15.2 surfaces a date picker in the UI. */
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    postTimeCt: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  })
  .refine((v) => v.id || v.itemId, {
    message: 'id (or legacy itemId) is required',
  });

function plus(days: number, base = new Date()): string {
  const d = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

interface ResolvedSource {
  label: string;
  folderUrl: string;
  clientId: string;
  clientName: string;
  clientAgency: string | null;
  platforms: import('@/lib/posting').SocialPlatform[];
  /** Set on Monday source only; used for status writeback. */
  mondayItemId: string | null;
  /** Set on internal source only; used to mark project as scheduled. */
  editingProjectId: string | null;
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

  // Normalise legacy `itemId` payloads into the new shape so the rest
  // of the route only thinks in terms of {source, id}.
  const source: 'monday' | 'internal' =
    parsed.data.source ?? (parsed.data.id ? 'monday' : 'monday');
  const id = parsed.data.id ?? parsed.data.itemId!;

  const admin = createAdminClient();

  // 1. Make sure we have a Cortex user record for the admin (used as
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

  // 2. Resolve the source-specific row into a unified `ResolvedSource`
  //    so the pipeline call below doesn't care which queue we came
  //    from. Each branch handles its own auth + freshness checks.
  let resolved: ResolvedSource;
  let mondayToken: string | null = null;
  if (source === 'monday') {
    try {
      mondayToken = getMondayToken();
    } catch {
      return NextResponse.json(
        { error: 'monday_unconfigured', detail: 'MONDAY_API_TOKEN not set' },
        { status: 503 },
      );
    }
    const monday = await resolveMondaySource(admin, mondayToken, id);
    if ('error' in monday) return monday.error;
    resolved = monday.value;
  } else {
    const internal = await resolveInternalSource(admin, id);
    if ('error' in internal) return internal.error;
    resolved = internal.value;
  }

  // 3. List the Drive folder so we know how many videos we're scheduling
  //    BEFORE we cut the content_drops row. Empty folder = explicit error,
  //    not a 0-video drop.
  let videos;
  try {
    const list = await listVideosInFolder(cortexUser.id, resolved.folderUrl);
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
        detail: `Drive folder for "${resolved.label}" has no usable videos.`,
      },
      { status: 422 },
    );
  }

  // 4. Default schedule window: tomorrow → +30 days, 12:00 CT.
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

  const brand = getBrandFromAgency(resolved.clientAgency);
  const appUrl = getCortexAppUrl(brand);

  // 5. Run the pipeline. mintShareLink=true + draftMode=true matches the
  //    bulk queue-from-monday behavior: every approved row gets a
  //    public review link, posts stay drafts until the client approves.
  const result = await runCalendarPipeline(admin, {
    label: `${resolved.clientName} (Quick Schedule, ${source} ${id})`,
    folderUrl: resolved.folderUrl,
    videos,
    perVideoDates,
    defaultPostTimeCt: postTimeCt,
    startDate,
    endDate,
    platforms: resolved.platforms,
    mintShareLink: true,
    draftMode: true,
    appUrl,
    clientId: resolved.clientId,
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

  // 6. Source-specific writeback. Failure here doesn't fail the whole
  //    call (the drop already landed) but we surface it so the UI can
  //    show an inline warning + retry button.
  let mondayWriteback: 'ok' | 'skipped' | 'failed' = 'skipped';
  let mondayDetail: string | null = null;
  if (source === 'monday' && result.shareUrl && resolved.mondayItemId && mondayToken) {
    try {
      await setLaterCalendarLink(mondayToken, resolved.mondayItemId, result.shareUrl);
      await setStatusScheduled(mondayToken, resolved.mondayItemId);
      mondayWriteback = 'ok';
    } catch (err) {
      mondayWriteback = 'failed';
      mondayDetail = err instanceof Error ? err.message : 'monday writeback failed';
    }
  }
  if (source === 'internal' && resolved.editingProjectId && result.dropId) {
    // No Monday board to update; we just stamp the project so it
    // disappears from the Quick Schedule queue and shows up under
    // "Scheduled" in the editing kanban.
    await admin
      .from('editing_projects')
      .update({
        status: 'scheduled',
        scheduled_at: new Date().toISOString(),
        drop_id: result.dropId,
      })
      .eq('id', resolved.editingProjectId);
  }

  return NextResponse.json({
    dropId: result.dropId ?? null,
    shareUrl: result.shareUrl ?? null,
    scheduled: result.scheduled,
    failed: result.failed,
    mondayWriteback,
    mondayDetail,
    clientName: resolved.clientName,
  });
}

/* -------------------------------------------------------------------------
 * Source resolvers
 * ----------------------------------------------------------------------- */

type SourceResolution =
  | { value: ResolvedSource }
  | { error: NextResponse };

async function resolveMondaySource(
  admin: ReturnType<typeof createAdminClient>,
  token: string,
  itemId: string,
): Promise<SourceResolution> {
  let row;
  try {
    row = await fetchItemById(token, itemId);
  } catch (err) {
    return {
      error: NextResponse.json(
        {
          error: 'monday_upstream',
          detail: err instanceof Error ? err.message : 'monday fetch failed',
        },
        { status: 502 },
      ),
    };
  }
  if (!row) {
    return {
      error: NextResponse.json(
        { error: 'monday_item_missing', detail: `Item ${itemId} not on the board` },
        { status: 404 },
      ),
    };
  }
  if (row.status !== STATUS_EM_APPROVED) {
    return {
      error: NextResponse.json(
        {
          error: 'not_em_approved',
          detail: `Row "${row.itemName}" is "${row.status || 'no status'}", not "${STATUS_EM_APPROVED}". Refresh the queue.`,
        },
        { status: 404 },
      ),
    };
  }
  if (!row.folderUrl) {
    return {
      error: NextResponse.json(
        {
          error: 'no_folder_url',
          detail: `Row "${row.itemName}" doesn't have an Edited Videos Folder link set on Monday.`,
        },
        { status: 400 },
      ),
    };
  }

  const resolved = await resolveCortexClientFromMondayName(admin, row.itemName);
  if (!resolved.ok) {
    return {
      error: NextResponse.json(
        { error: resolved.error.code, detail: resolved.error.detail },
        { status: 422 },
      ),
    };
  }

  return {
    value: {
      label: row.itemName,
      folderUrl: row.folderUrl,
      clientId: resolved.client.clientId,
      clientName: resolved.client.clientName,
      clientAgency: resolved.client.agency ?? null,
      platforms: resolved.client.platforms,
      mondayItemId: row.itemId,
      editingProjectId: null,
    },
  };
}

async function resolveInternalSource(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string,
): Promise<SourceResolution> {
  const { data: project, error } = await admin
    .from('editing_projects')
    .select(
      `id, name, status, drive_folder_url, client_id,
       client:clients!editing_projects_client_id_fkey(id, name, agency, social_profiles(platform))`,
    )
    .eq('id', projectId)
    .maybeSingle<{
      id: string;
      name: string;
      status: string;
      drive_folder_url: string | null;
      client_id: string;
      client: {
        id: string;
        name: string;
        agency: string | null;
        social_profiles: { platform: string }[];
      } | null;
    }>();
  if (error) {
    return {
      error: NextResponse.json(
        { error: 'db_error', detail: error.message },
        { status: 502 },
      ),
    };
  }
  if (!project) {
    return {
      error: NextResponse.json(
        { error: 'project_missing', detail: `Editing project ${projectId} not found.` },
        { status: 404 },
      ),
    };
  }
  if (project.status !== 'approved') {
    return {
      error: NextResponse.json(
        {
          error: 'not_approved',
          detail: `Project "${project.name}" is "${project.status}", not "approved". Refresh the queue.`,
        },
        { status: 404 },
      ),
    };
  }
  if (!project.drive_folder_url) {
    return {
      error: NextResponse.json(
        {
          error: 'no_folder_url',
          detail: `Project "${project.name}" doesn't have a Drive folder URL set. Open the project to add one before scheduling.`,
        },
        { status: 400 },
      ),
    };
  }
  if (!project.client) {
    return {
      error: NextResponse.json(
        {
          error: 'no_client',
          detail: `Project "${project.name}" has no client record.`,
        },
        { status: 422 },
      ),
    };
  }

  const platforms = (project.client.social_profiles ?? [])
    .map((p) => p.platform)
    .filter((p): p is import('@/lib/posting').SocialPlatform =>
      typeof p === 'string' && p.length > 0,
    );
  if (platforms.length === 0) {
    return {
      error: NextResponse.json(
        {
          error: 'no_platforms',
          detail: `Brand "${project.client.name}" has no connected social platforms. Connect at least one before scheduling.`,
        },
        { status: 422 },
      ),
    };
  }

  return {
    value: {
      label: project.name,
      folderUrl: project.drive_folder_url,
      clientId: project.client_id,
      clientName: project.client.name,
      clientAgency: project.client.agency,
      platforms,
      mondayItemId: null,
      editingProjectId: project.id,
    },
  };
}
