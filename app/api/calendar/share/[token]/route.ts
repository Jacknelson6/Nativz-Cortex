import { NextResponse, after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth/permissions';
import { syncMondayApprovalForDrop } from '@/lib/monday/calendar-approval';
import { reconcileMuxRow } from '@/lib/mux/reconcile';
import { getDeliverableBalances } from '@/lib/deliverables/get-balances';
import { listConfiguredAddons } from '@/lib/deliverables/addon-skus';
import { getBrandFromAgency, AGENCY_CONFIG } from '@/lib/agency/detect';

interface ShareLinkRow {
  id: string;
  drop_id: string;
  included_post_ids: string[];
  post_review_link_map: Record<string, string>;
  expires_at: string;
  project_type: string | null;
  project_type_other: string | null;
  name: string | null;
}

type ShareProjectType = 'organic_content' | 'social_ads' | 'ctv_ads' | 'other';

function normalizeProjectType(raw: string | null | undefined): ShareProjectType {
  // Defaults to organic_content so legacy share links keep working with
  // the existing caption/hashtag/tag/schedule UI.
  if (raw === 'social_ads' || raw === 'ctv_ads' || raw === 'other') return raw;
  return 'organic_content';
}

function stripFileExtension(filename: string | null): string | null {
  // Drive filenames usually carry an extension we don't want polluting
  // the displayed title (e.g. "Hero spot v3.mp4" → "Hero spot v3"). The
  // viewer can always re-derive the extension from the underlying URL
  // when it actually needs it.
  if (!filename) return null;
  const lastDot = filename.lastIndexOf('.');
  if (lastDot <= 0) return filename;
  return filename.slice(0, lastDot);
}

interface ScheduledPostRow {
  id: string;
  client_id: string;
  caption: string;
  hashtags: string[] | null;
  scheduled_at: string | null;
  status: string;
  cover_image_url: string | null;
  late_post_id: string | null;
  tagged_people: string[] | null;
  collaborator_handles: string[] | null;
  title: string | null;
}

interface DropVideoRow {
  id: string;
  scheduled_post_id: string | null;
  drive_file_name: string | null;
  media_type: string | null;
  video_url: string | null;
  revised_video_url: string | null;
  revised_mp4_url: string | null;
  revised_video_uploaded_at: string | null;
  revised_video_notify_pending: boolean | null;
  mux_upload_id: string | null;
  mux_asset_id: string | null;
  mux_playback_id: string | null;
  mux_status: string | null;
}

interface PostAssetRow {
  id: string;
  drop_video_id: string;
  asset_url: string | null;
  thumbnail_url: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  position: number;
  status: string;
}

interface SchedulerMediaJoinRow {
  post_id: string;
  sort_order: number | null;
  scheduler_media:
    | { feed_normalized_url: string | null }
    | { feed_normalized_url: string | null }[]
    | null;
}

interface CommentAttachment {
  url: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
}

type CommentStatus =
  | 'approved'
  | 'changes_requested'
  | 'comment'
  | 'caption_edit'
  | 'tag_edit'
  | 'schedule_change'
  | 'video_revised';

interface CommentRow {
  id: string;
  review_link_id: string;
  author_name: string;
  content: string;
  status: CommentStatus;
  created_at: string;
  attachments: CommentAttachment[] | null;
  caption_before: string | null;
  caption_after: string | null;
  metadata: Record<string, unknown> | null;
  timestamp_seconds: number | null;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  try {
    return await handleShareGet(req, ctx);
  } catch (err) {
    // Unhandled exceptions used to bubble out as an empty 500 body, which
    // hit the client as "Unexpected end of JSON input" and the friendly
    // copy "This share link may have expired or been deactivated." The
    // viewer would then sit on a dead-end with no way to recover, even
    // though the link was still valid. Always return a structured JSON
    // error here so the client can surface a real message and stale links
    // can't masquerade as expired ones.
    const { token } = await ctx.params.catch(() => ({ token: 'unknown' }));
    console.error('[share-link-get] unhandled error', {
      token,
      err: err instanceof Error ? err.stack ?? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'share link load failed', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}

async function handleShareGet(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const admin = createAdminClient();
  const url = new URL(req.url);
  const viewerName = url.searchParams.get('as')?.trim().slice(0, 80) || null;
  const userAgent = req.headers.get('user-agent')?.slice(0, 500) ?? null;

  // Detect whether the viewer is a signed-in admin so the UI can expose the
  // editor-only affordances (revised-video re-upload + notify toast).
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isEditor = user ? await isAdmin(user.id) : false;

  const { data: link } = await admin
    .from('content_drop_share_links')
    .select('id, drop_id, included_post_ids, post_review_link_map, expires_at, project_type, project_type_other, name')
    .eq('token', token)
    .single<ShareLinkRow>();
  if (!link) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'link expired' }, { status: 410 });
  }

  const [{ data: drop }, { data: posts }, { data: videos }] = await Promise.all([
    admin
      .from('content_drops')
      .select('id, client_id, start_date, end_date, default_post_time')
      .eq('id', link.drop_id)
      .single(),
    admin
      .from('scheduled_posts')
      .select('id, client_id, caption, hashtags, scheduled_at, status, cover_image_url, late_post_id, tagged_people, collaborator_handles, title')
      .in('id', link.included_post_ids),
    admin
      .from('content_drop_videos')
      .select('id, scheduled_post_id, drive_file_name, media_type, video_url, revised_video_url, revised_mp4_url, revised_video_uploaded_at, revised_video_notify_pending, mux_upload_id, mux_asset_id, mux_playback_id, mux_status')
      // Scope to THIS share's drop. A scheduled post can have drop_videos
      // from a Drive ingest *and* from a synthetic calendar-share drop
      // (migration 259); without this filter they would collide in the
      // viewer maps. The share link only ever shows one drop's worth of
      // video state, so filter by drop_id alongside the post-id IN list.
      .eq('drop_id', link.drop_id)
      .in('scheduled_post_id', link.included_post_ids),
  ]);
  if (!drop) return NextResponse.json({ error: 'content calendar missing' }, { status: 404 });

  // Pull-mode self-heal: any video row mid-Mux-pipeline gets reconciled
  // against the Mux API before we build the response. This makes the share
  // page independent of webhook delivery — if the webhook landed, the
  // status is already 'ready' and reconcile is a no-op; if it didn't land
  // (misconfigured, dropped, race), we converge to truth here. Auto-poll
  // on the client side then picks up the new state within ~5s. The
  // reconciler patches the row object in place so the response reflects
  // the up-to-date status without a second DB round-trip.
  const videoRows = (videos ?? []) as DropVideoRow[];
  // Reconcile any row mid-pipeline. Two ingest paths land here:
  //   - URL-pull (lib/calendar/schedule-drop.ts) — stamps mux_asset_id at
  //     create time, no upload id.
  //   - Direct-upload (mux-finalize) — stamps mux_upload_id, asset id arrives
  //     via webhook.
  // The reconciler accepts either id, so we sweep on (upload_id OR asset_id).
  const inFlight = videoRows.filter(
    (v) =>
      (v.mux_status === 'processing' || v.mux_status === 'uploading') &&
      (v.mux_upload_id != null || v.mux_asset_id != null),
  );
  if (inFlight.length > 0) {
    try {
      const patches = await Promise.all(
        inFlight.map((row) => reconcileMuxRow(admin, row)),
      );
      inFlight.forEach((row, i) => {
        const patch = patches[i];
        if (!patch) return;
        if (patch.mux_status !== undefined) row.mux_status = patch.mux_status;
        if (patch.mux_asset_id !== undefined) row.mux_asset_id = patch.mux_asset_id;
        if (patch.mux_playback_id !== undefined) row.mux_playback_id = patch.mux_playback_id;
        if (patch.revised_video_url !== undefined) row.revised_video_url = patch.revised_video_url;
        if (patch.revised_mp4_url !== undefined) row.revised_mp4_url = patch.revised_mp4_url;
      });
    } catch (err) {
      // Mux client construction or a raw transport error would otherwise
      // 500 the entire share page even though the underlying DB rows are
      // perfectly viewable. Log + skip; the next page-view re-runs the
      // reconcile and the auto-poll on the client picks up state changes.
      console.warn('[share-link-get] mux reconcile batch failed; skipping', {
        count: inFlight.length,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Image / carousel posts store their assets in content_drop_post_assets
  // (1..N rows per post, ordered by position). Pull them for any image-type
  // drop_video rows in this share link so the viewer can render the carousel.
  const imageVideoIds = videoRows
    .filter((v) => v.media_type === 'image')
    .map((v) => v.id);
  const imagePostIds = videoRows
    .filter((v) => v.media_type === 'image' && v.scheduled_post_id)
    .map((v) => v.scheduled_post_id as string);
  // Pull assets + scheduler_media in parallel. scheduler_media holds the
  // `feed_normalized_url` cache (4:5 center-cropped JPEG, ~200KB) we render
  // when source images are out of Instagram's [0.8, 1.91] feed range. We
  // prefer that URL on the share viewer so:
  //   1. The customer sees exactly what will publish to IG (no drift between
  //      approval surface and posted output).
  //   2. Supabase's image-transform endpoint stops 400'ing on the original
  //      28MB PNGs (the size limit only bites originals, not the cropped
  //      JPEGs).
  // Aligned by sort_order ↔ position — both 0-indexed against the same
  // logical asset list.
  const [{ data: assetRows }, { data: schedulerMediaRows }] = await Promise.all([
    imageVideoIds.length
      ? admin
          .from('content_drop_post_assets')
          .select('id, drop_video_id, asset_url, thumbnail_url, mime_type, width, height, position, status')
          .in('drop_video_id', imageVideoIds)
          .order('position', { ascending: true })
      : Promise.resolve({ data: [] as PostAssetRow[] }),
    imagePostIds.length
      ? admin
          .from('scheduled_post_media')
          .select('post_id, sort_order, scheduler_media:media_id (feed_normalized_url)')
          .in('post_id', imagePostIds)
      : Promise.resolve({ data: [] as SchedulerMediaJoinRow[] }),
  ]);
  const assetsByVideo: Record<string, PostAssetRow[]> = {};
  for (const a of (assetRows ?? []) as PostAssetRow[]) {
    (assetsByVideo[a.drop_video_id] ||= []).push(a);
  }
  // Map: postId -> position -> normalized URL. Substituted at payload-build
  // time below.
  const normalizedByPostPos: Record<string, Record<number, string>> = {};
  for (const r of (schedulerMediaRows ?? []) as SchedulerMediaJoinRow[]) {
    const sm = Array.isArray(r.scheduler_media) ? r.scheduler_media[0] : r.scheduler_media;
    if (!sm?.feed_normalized_url || r.sort_order == null) continue;
    (normalizedByPostPos[r.post_id] ||= {})[r.sort_order] = sm.feed_normalized_url;
  }

  const videoByPost: Record<string, string> = {};
  const filenameByPost: Record<string, string> = {};
  const mediaTypeByPost: Record<string, 'video' | 'image'> = {};
  const assetsByPost: Record<string, PostAssetRow[]> = {};
  const revisionByPost: Record<
    string,
    {
      revised_video_url: string | null;
      revised_video_uploaded_at: string | null;
      revised_video_notify_pending: boolean;
      mux_playback_id: string | null;
      mux_status: string | null;
    }
  > = {};
  for (const v of videoRows) {
    if (!v.scheduled_post_id) continue;
    const url = v.revised_video_url ?? v.video_url;
    if (url) videoByPost[v.scheduled_post_id] = url;
    if (v.drive_file_name) filenameByPost[v.scheduled_post_id] = v.drive_file_name;
    mediaTypeByPost[v.scheduled_post_id] = v.media_type === 'image' ? 'image' : 'video';
    if (v.media_type === 'image') {
      assetsByPost[v.scheduled_post_id] = assetsByVideo[v.id] ?? [];
    }
    revisionByPost[v.scheduled_post_id] = {
      revised_video_url: v.revised_video_url,
      revised_video_uploaded_at: v.revised_video_uploaded_at,
      revised_video_notify_pending: !!v.revised_video_notify_pending,
      mux_playback_id: v.mux_playback_id,
      mux_status: v.mux_status,
    };
  }

  // Phase D added per-client deliverable balances + agency add-on context to
  // the share payload. Both are enrichments — the BalancePill and pre-approval
  // modal degrade gracefully without them — so a deliverable_types fetch
  // failure or stale balances row should never blank out the entire share
  // page (which is what was happening when this route 500'd with an empty
  // body). Settle the balance fetch independently and fall back to an empty
  // array on failure; log the underlying error so we can fix the root cause.
  const [{ data: client }, balancesResult] = await Promise.all([
    admin
      .from('clients')
      .select('name, agency')
      .eq('id', drop.client_id)
      .single<{ name: string | null; agency: string | null }>(),
    getDeliverableBalances(admin, drop.client_id).catch((err: unknown) => {
      console.warn('[share-link-get] balances fetch failed; degrading to empty', {
        clientId: drop.client_id,
        err: err instanceof Error ? err.message : String(err),
      });
      return [] as Awaited<ReturnType<typeof getDeliverableBalances>>;
    }),
  ]);
  const balances = balancesResult;

  const agencyBrand = getBrandFromAgency(client?.agency ?? null);
  const addons = listConfiguredAddons(agencyBrand);
  const supportEmail = AGENCY_CONFIG[agencyBrand].supportEmail;

  const reviewLinkIds = Object.values(link.post_review_link_map ?? {});
  const { data: comments } = reviewLinkIds.length
    ? await admin
        .from('post_review_comments')
        .select('id, review_link_id, author_name, content, status, created_at, attachments, caption_before, caption_after, metadata, timestamp_seconds')
        .in('review_link_id', reviewLinkIds)
        .order('created_at', { ascending: true })
    : { data: [] as CommentRow[] };

  const commentsByPost: Record<string, CommentRow[]> = {};
  const reviewLinkToPostId: Record<string, string> = {};
  for (const [postId, reviewId] of Object.entries(link.post_review_link_map ?? {})) {
    reviewLinkToPostId[reviewId] = postId;
  }
  for (const c of (comments ?? []) as CommentRow[]) {
    const postId = reviewLinkToPostId[c.review_link_id];
    if (!postId) continue;
    (commentsByPost[postId] ||= []).push(c);
  }

  // Log the open — both the rolling pointer and an immutable history row.
  // Fire-and-forget; failures here must not block the viewer's response.
  void admin
    .from('content_drop_share_links')
    .update({ last_viewed_at: new Date().toISOString() })
    .eq('id', link.id);
  void admin
    .from('content_drop_share_link_views')
    .insert({
      share_link_id: link.id,
      viewer_name: viewerName,
      user_agent: userAgent,
    });

  // Self-heal the Monday "Client Approval" mirror on every page open. The
  // primary write happens in the comment POST/DELETE handlers, but if that
  // `after()` block ever gets cut short (Vercel function timeout, Monday
  // API hiccup, etc.) the column drifts out of sync. Re-running the
  // computed-state push on each share-link view makes the sync self-healing
  // — every reviewer or editor who opens the link drags Monday back into
  // truth. Idempotent (setting a column to its current label is a no-op),
  // so the cost is bounded to one Monday call per page view at worst.
  after(async () => {
    try {
      await syncMondayApprovalForDrop(admin, link.drop_id);
    } catch (err) {
      console.error('Monday calendar approval self-heal sync failed:', err);
    }
  });

  const projectType = normalizeProjectType(link.project_type);

  return NextResponse.json({
    clientId: drop.client_id,
    clientName: client?.name ?? 'Brand',
    isEditor,
    projectType,
    projectTypeOther: link.project_type_other,
    // Per-type deliverable balances. Empty array when the client has no
    // active types yet (rare, brand-new client pre-cron); the pill hides
    // itself when no rows are present.
    balances,
    // `addons` + `supportEmail` are no longer rendered on the share page
    // (the over-scope PreApprovalModal was removed — clients should never
    // see internal capacity limits). Kept on the response for now to stay
    // backwards-compatible with any cached client bundles in flight.
    addons,
    supportEmail,
    drop: {
      id: drop.id,
      start_date: drop.start_date,
      end_date: drop.end_date,
      default_post_time: drop.default_post_time,
    },
    posts: ((posts ?? []) as ScheduledPostRow[]).map((p) => {
      const rev = revisionByPost[p.id];
      const filename = filenameByPost[p.id] ?? null;
      const mediaType = mediaTypeByPost[p.id] ?? 'video';
      const normalizedForPost = normalizedByPostPos[p.id] ?? {};
      const assets = (assetsByPost[p.id] ?? []).map((a) => {
        const normalizedUrl = normalizedForPost[a.position];
        return {
          id: a.id,
          // Prefer the cached 4:5 cropped render when present so the share
          // viewer shows exactly what publishes to Instagram. Falls back to
          // the original asset_url for in-range images that don't need
          // normalization.
          url: normalizedUrl ?? a.asset_url,
          thumbnail_url: a.thumbnail_url,
          mime_type: normalizedUrl ? 'image/jpeg' : a.mime_type,
          width: normalizedUrl ? 1080 : a.width,
          height: normalizedUrl ? 1350 : a.height,
          position: a.position,
          status: a.status,
        };
      });
      return {
        id: p.id,
        caption: p.caption,
        hashtags: p.hashtags ?? [],
        scheduled_at: p.scheduled_at,
        status: p.status,
        cover_image_url: p.cover_image_url,
        video_url: videoByPost[p.id] ?? null,
        media_type: mediaType,
        assets,
        tagged_people: p.tagged_people ?? [],
        collaborator_handles: p.collaborator_handles ?? [],
        // For ad-type / "other" projects, the viewer surfaces a per-creative
        // title. We store the explicit title on scheduled_posts and fall
        // back to the underlying upload's filename so the viewer always has
        // something to show without admins needing to type one out first.
        title: p.title,
        filename_fallback: stripFileExtension(filename),
        revised_video_url: rev?.revised_video_url ?? null,
        revised_video_uploaded_at: rev?.revised_video_uploaded_at ?? null,
        revised_video_notify_pending: rev?.revised_video_notify_pending ?? false,
        mux_playback_id: rev?.mux_playback_id ?? null,
        mux_status: rev?.mux_status ?? null,
        comments: (commentsByPost[p.id] ?? []).map((c) => ({
          id: c.id,
          review_link_id: c.review_link_id,
          author_name: c.author_name,
          content: c.content,
          status: c.status,
          created_at: c.created_at,
          attachments: c.attachments ?? [],
          caption_before: c.caption_before,
          caption_after: c.caption_after,
          metadata: c.metadata ?? {},
          timestamp_seconds: c.timestamp_seconds,
        })),
      };
    }),
    expiresAt: link.expires_at,
  });
}
