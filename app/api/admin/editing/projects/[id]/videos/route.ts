import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { getMux } from '@/lib/mux/client';
import {
  buildEditingStoragePath,
  createEditingUploadUrl,
  getEditingPublicUrl,
} from '@/lib/editing/storage';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/editing/projects/:id/videos
 *
 * Inserts a placeholder `editing_project_videos` row and mints an upload
 * URL the browser PUTs file bytes against. Branches on MIME type:
 *
 *   - Videos → Mux direct-upload (bytes go straight to Mux, webhook
 *     reconciles `mux_asset_id`/`mux_playback_id` later). Bypasses
 *     Vercel's 4.5MB body limit and gives us HLS playback + per-asset
 *     MP4 renditions.
 *
 *   - Images (static post drops, carousel slides) → Supabase Storage
 *     signed-upload URL against the `editing-media` bucket. No Mux
 *     pipeline needed — the public URL is directly renderable. Row is
 *     stamped with `storage_path` + `public_url` + `mux_status='ready'`
 *     so the existing video UI treats it as immediately playable.
 *
 * On retry / re-upload the client sends `replace_video_id` to keep the
 * slot/position but bump `version`. Original row is left intact for
 * history.
 */

const CreateVideoBody = z.object({
  filename: z.string().min(1).max(300),
  mime_type: z.string().min(1).max(100),
  size_bytes: z.number().int().nonnegative(),
  position: z.number().int().nonnegative().default(0),
  replace_video_id: z.string().uuid().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = CreateVideoBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request', detail: parsed.error.message }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: project } = await admin
    .from('editing_projects')
    .select('id')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: 'project_not_found' }, { status: 404 });

  let version = 1;
  let position = parsed.data.position;
  let isRevision = false;
  if (parsed.data.replace_video_id) {
    const { data: prev } = await admin
      .from('editing_project_videos')
      .select('version, position')
      .eq('id', parsed.data.replace_video_id)
      .maybeSingle();
    if (prev) {
      version = prev.version + 1;
      position = prev.position;
      isRevision = true;
    }
  } else {
    // Bulk uploads from the editing dialog all post `position: 0` because
    // the client doesn't know the project's current slot count. The share
    // GET dedupes "latest cut per position," so without per-row positions
    // every upload collapses into a single tile. Assign the next slot.
    const { data: maxRow } = await admin
      .from('editing_project_videos')
      .select('position')
      .eq('project_id', projectId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    position = (maxRow?.position ?? -1) + 1;
  }

  const isImage = parsed.data.mime_type.startsWith('image/');

  if (isImage) {
    // Image branch: insert row, mint signed Supabase Storage upload URL,
    // patch row with storage_path + public_url. The browser PUTs bytes
    // straight to Storage; no Mux pipeline involved.
    const { data: row, error: insertErr } = await admin
      .from('editing_project_videos')
      .insert({
        project_id: projectId,
        filename: parsed.data.filename,
        mime_type: parsed.data.mime_type,
        size_bytes: parsed.data.size_bytes,
        position,
        version,
        uploaded_by: user.id,
        mux_status: 'ready',
      })
      .select('id')
      .single();
    if (insertErr || !row) {
      return NextResponse.json(
        { error: 'insert_failed', detail: insertErr?.message },
        { status: 500 },
      );
    }

    const storagePath = buildEditingStoragePath({
      projectId,
      videoId: row.id,
      filename: parsed.data.filename,
    });

    let signed;
    try {
      signed = await createEditingUploadUrl(admin, storagePath);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'sign_failed' },
        { status: 502 },
      );
    }

    const publicUrl = getEditingPublicUrl(admin, storagePath);

    const { error: updateErr } = await admin
      .from('editing_project_videos')
      .update({ storage_path: storagePath, public_url: publicUrl })
      .eq('id', row.id);
    if (updateErr) {
      return NextResponse.json(
        { error: 'update_failed', detail: updateErr.message },
        { status: 500 },
      );
    }

    await admin
      .from('editing_projects')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', projectId);

    if (isRevision) {
      await recordVideoRevisedAuditRow(admin, {
        projectId,
        videoId: row.id,
        editorUserId: user.id,
      });
    }

    return NextResponse.json({
      kind: 'image',
      video_id: row.id,
      upload_url: signed.signedUrl,
    });
  }

  // Video branch: Mux direct upload. CORS origin must match the browser's
  // Origin header on the PUT preflight; prefer the inbound Origin, fall
  // back to NEXT_PUBLIC_APP_URL, then the request URL's origin.
  const headerOrigin = req.headers.get('origin');
  const corsOrigin =
    headerOrigin || process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;

  let upload;
  try {
    const mux = getMux();
    upload = await mux.video.uploads.create({
      cors_origin: corsOrigin,
      new_asset_settings: {
        playback_policies: ['public'],
        video_quality: 'basic',
        // Capped 1080p MP4 rendition matches the SMM flow. Keeps the
        // door open for an editing-side download/export of the cut.
        mp4_support: 'capped-1080p',
      },
    });
  } catch (err) {
    console.error(`Mux upload mint failed (cors_origin=${corsOrigin}, project=${projectId}):`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not start upload' },
      { status: 502 },
    );
  }

  const { data: row, error } = await admin
    .from('editing_project_videos')
    .insert({
      project_id: projectId,
      filename: parsed.data.filename,
      mime_type: parsed.data.mime_type,
      size_bytes: parsed.data.size_bytes,
      position,
      version,
      uploaded_by: user.id,
      mux_upload_id: upload.id,
      mux_status: 'uploading',
    })
    .select('id')
    .single();
  if (error || !row) {
    return NextResponse.json({ error: 'insert_failed', detail: error?.message }, { status: 500 });
  }

  // Bump updated_at so the editing board re-sorts.
  await admin
    .from('editing_projects')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', projectId);

  if (isRevision) {
    await recordVideoRevisedAuditRow(admin, {
      projectId,
      videoId: row.id,
      editorUserId: user.id,
    });
  }

  return NextResponse.json({
    kind: 'video',
    video_id: row.id,
    upload_id: upload.id,
    upload_url: upload.url,
  });
}

/**
 * Record a `video_revised` audit-trail row on the project's most recent
 * unarchived share link. The row sits with `chat_notified_at = NULL` so
 * the `/api/cron/coalesce-review-pings` cron picks it up and bundles a
 * "📬 N revised cuts on <client>" Google Chat ping per share link after
 * the 20-min quiet window. Mirrors the calendar `/notify-revisions` team
 * ping, but driven passively off uploads instead of an explicit editor
 * "Notify client" button (editing share links don't have a batch email
 * flow; the share link itself is the surface).
 *
 * Best-effort: any failure is logged but doesn't break the upload. The
 * upload row is the source of truth; the audit row is an FYI breadcrumb.
 */
async function recordVideoRevisedAuditRow(
  admin: ReturnType<typeof createAdminClient>,
  args: { projectId: string; videoId: string; editorUserId: string },
): Promise<void> {
  try {
    const { data: shareLink } = await admin
      .from('editing_project_share_links')
      .select('id')
      .eq('project_id', args.projectId)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (!shareLink) return; // no link == no audience for the FYI

    const { data: editor } = await admin
      .from('users')
      .select('full_name, email')
      .eq('id', args.editorUserId)
      .maybeSingle<{ full_name: string | null; email: string | null }>();
    const editorName =
      editor?.full_name?.trim() ||
      editor?.email?.split('@')[0] ||
      'Editor';

    const { error: insertErr } = await admin
      .from('editing_project_review_comments')
      .insert({
        project_id: args.projectId,
        video_id: args.videoId,
        share_link_id: shareLink.id,
        author_user_id: args.editorUserId,
        author_name: editorName,
        content: 'Re-uploaded a revised cut',
        status: 'video_revised',
        attachments: [],
      });
    if (insertErr) {
      console.error('[editing-videos] video_revised audit insert failed', {
        projectId: args.projectId,
        videoId: args.videoId,
        error: insertErr,
      });
    }
  } catch (err) {
    console.error('[editing-videos] video_revised audit threw', err);
  }
}
