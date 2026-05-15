import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { uploadImageAsset } from '@/lib/calendar/storage-upload';
import { getShareContextOrNull, resolveBoundIdentity } from '@/lib/share/identity';
import { logShareAdminAction } from '@/lib/share/audit';

/**
 * POST   /api/calendar/share/[token]/cover/[postId]
 * DELETE /api/calendar/share/[token]/cover/[postId]
 *
 * Lets a reviewer set (or clear) a custom cover photo on a video scheduled
 * post directly from the public share link. Mirrors the unauthenticated
 * token-as-auth pattern used by `caption/route.ts`, the share link itself
 * is the credential, no Supabase user required. Author name comes from the
 * client and is stamped onto the activity-rail entry so the team can see
 * who picked the cover.
 *
 * Where the cover ends up: `scheduled_posts.cover_image_url`. The Zernio
 * publish pipeline already reads that field (lib/calendar/schedule-drop.ts
 * → publishPost → buildMediaContext at lib/posting/zernio.ts:494) and ships
 * it as the video thumbnail on Instagram / Facebook / LinkedIn. TikTok
 * ignores custom thumbnails (per the Zernio TikTok builder comment around
 * zernio.ts:733), so that leg silently falls back to TikTok's own cover , 
 * expected, not a bug.
 *
 * POST request: multipart/form-data with:
 *   - file: image/jpeg | image/png | image/webp, ≤ 8MB
 *   - authorName: string (1-80 chars), goes on the activity entry
 *
 * DELETE clears cover_image_url back to NULL. The Zernio pipeline falls
 * back to the auto-first-frame thumbnail it stamped at ingest.
 */

const ALLOWED_PREFIXES = ['image/'];
const MAX_BYTES = 8 * 1024 * 1024;

interface ShareLinkRow {
  drop_id: string;
  included_post_ids: string[];
  post_review_link_map: Record<string, string>;
  expires_at: string;
}

async function loadShareLinkAndGate(
  admin: ReturnType<typeof createAdminClient>,
  token: string,
  postId: string,
): Promise<{ ok: true; link: ShareLinkRow; reviewLinkId: string } | { ok: false; res: NextResponse }> {
  const { data: link } = await admin
    .from('content_drop_share_links')
    .select('drop_id, included_post_ids, post_review_link_map, expires_at')
    .eq('token', token)
    .single<ShareLinkRow>();
  if (!link) {
    return { ok: false, res: NextResponse.json({ error: 'not found' }, { status: 404 }) };
  }
  if (new Date(link.expires_at) < new Date()) {
    return { ok: false, res: NextResponse.json({ error: 'link expired' }, { status: 410 }) };
  }
  if (!link.included_post_ids?.includes(postId)) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'post is not part of this share link' }, { status: 400 }),
    };
  }
  const reviewLinkId = link.post_review_link_map?.[postId];
  if (!reviewLinkId) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'post is not part of this share link' }, { status: 400 }),
    };
  }
  return { ok: true, link, reviewLinkId };
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string; postId: string }> },
) {
  const { token, postId } = await ctx.params;
  const admin = createAdminClient();

  const gate = await loadShareLinkAndGate(admin, token, postId);
  if (!gate.ok) return gate.res;
  const { link, reviewLinkId } = gate;

  // Multipart parse. Same shape as replace-image, single `file` field plus
  // a textual `authorName` so the activity rail names the editor.
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const authorNameRaw = form?.get('authorName');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file missing' }, { status: 400 });
  }
  const authorName = typeof authorNameRaw === 'string' ? authorNameRaw.trim() : '';
  if (!authorName || authorName.length > 80) {
    return NextResponse.json({ error: 'authorName required (1-80 chars)' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'file too large (max 8MB)' }, { status: 413 });
  }
  const mime = file.type || 'application/octet-stream';
  if (!ALLOWED_PREFIXES.some((p) => mime.startsWith(p))) {
    return NextResponse.json({ error: 'unsupported file type' }, { status: 415 });
  }

  // The post needs to be a video for a custom cover to make sense, image
  // posts already use their asset as the visible media. Guard against the
  // UI accidentally pointing at an image carousel. The canonical "is this
  // an image post?" check (mirroring lib/calendar/resolve-media.ts) is
  // `post_type in ('image','carousel')`, every other value (`video`,
  // `reel`, NULL) flows through the videoUrl branch in buildMediaContext
  // and accepts a thumbnail. Earlier this only allowed literal 'video',
  // which 400'd for 335/370 of our video rows (almost all are `reel`).
  const { data: post } = await admin
    .from('scheduled_posts')
    .select('id, post_type, cover_image_url, client_id')
    .eq('id', postId)
    .single<{ id: string; post_type: string | null; cover_image_url: string | null; client_id: string }>();
  if (!post) {
    return NextResponse.json({ error: 'post not found' }, { status: 404 });
  }
  if (post.post_type === 'image' || post.post_type === 'carousel') {
    return NextResponse.json(
      { error: 'cover photo is only supported for video posts' },
      { status: 400 },
    );
  }

  const ext = mimeToExt(mime) ?? extFromName(file.name) ?? 'jpg';
  const buffer = Buffer.from(await file.arrayBuffer());
  // Reuse the image-asset uploader but namespace the cover key off the
  // post id so it doesn't collide with any image-post asset uploads (which
  // land under `drops/<dropId>/<postId>/<assetId>.ext`). Path collisions
  // here would silently overwrite a published cover on a re-upload, the
  // assetId suffix gives us a fresh URL every time.
  const assetId = `cover-${randomUUID()}`;
  let newUrl: string;
  try {
    newUrl = await uploadImageAsset(admin, {
      dropId: link.drop_id,
      postId,
      assetId,
      buffer,
      mimeType: mime,
      ext,
    });
  } catch (err) {
    console.error('[cover] upload failed', { postId, err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'upload failed' },
      { status: 502 },
    );
  }

  const previousCover = post.cover_image_url;

  const { error: updErr } = await admin
    .from('scheduled_posts')
    .update({ cover_image_url: newUrl })
    .eq('id', postId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // Activity-rail breadcrumb. caption_before / caption_after carry the
  // before/after URL so the timeline can render a "Cover changed" diff
  // pill with thumbnails the same way it shows caption diffs.
  const { data: commentRow, error: insErr } = await admin
    .from('post_review_comments')
    .insert({
      review_link_id: reviewLinkId,
      author_name: authorName,
      content: 'Updated the cover photo',
      status: 'cover_edit',
      caption_before: previousCover,
      caption_after: newUrl,
      attachments: [],
    })
    .select(
      'id, review_link_id, author_name, content, status, created_at, attachments, caption_before, caption_after, metadata',
    )
    .single();
  if (insErr || !commentRow) {
    // Roll the cover write back? The cover update already shipped, and the
    // activity log is best-effort, leaving it stamped is the right call
    // (the cover IS the source of truth; the activity entry is a UX nicety).
    console.error('[cover] activity insert failed; cover saved anyway', insErr);
  }

  // PRD 06 audit. Cover changes are open to any share-link viewer, but
  // when an authenticated admin does it we log the action so the unified
  // review modal can render "admin replaced cover" alongside the client
  // self-serve case.
  void (async () => {
    const ctxForAudit = await getShareContextOrNull(token);
    if (!ctxForAudit) return;
    const { identity } = await resolveBoundIdentity(ctxForAudit);
    if (!identity || (identity.role !== 'admin' && identity.role !== 'super_admin')) {
      return;
    }
    await logShareAdminAction({
      shareLinkId: ctxForAudit.linkId,
      shareLinkKind: 'calendar',
      actorUserId: identity.userId,
      action: 'cover.change',
      targetKind: 'cover',
      targetId: postId,
      payload: { new_url: newUrl, previous_url: previousCover },
    });
  })();

  return NextResponse.json({
    cover_image_url: newUrl,
    comment: commentRow ?? null,
  });
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ token: string; postId: string }> },
) {
  const { token, postId } = await ctx.params;
  const admin = createAdminClient();

  const gate = await loadShareLinkAndGate(admin, token, postId);
  if (!gate.ok) return gate.res;
  const { reviewLinkId } = gate;

  // For DELETE we still want an authorName, pass via query string since
  // the body is empty per HTTP semantics. The UI sends ?authorName=... .
  const url = new URL(req.url);
  const authorName = (url.searchParams.get('authorName') ?? '').trim();
  if (!authorName || authorName.length > 80) {
    return NextResponse.json({ error: 'authorName required (1-80 chars)' }, { status: 400 });
  }

  const { data: post } = await admin
    .from('scheduled_posts')
    .select('id, cover_image_url')
    .eq('id', postId)
    .single<{ id: string; cover_image_url: string | null }>();
  if (!post) {
    return NextResponse.json({ error: 'post not found' }, { status: 404 });
  }
  if (!post.cover_image_url) {
    return NextResponse.json({ error: 'no custom cover to clear' }, { status: 400 });
  }

  const { error: updErr } = await admin
    .from('scheduled_posts')
    .update({ cover_image_url: null })
    .eq('id', postId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  const { data: commentRow } = await admin
    .from('post_review_comments')
    .insert({
      review_link_id: reviewLinkId,
      author_name: authorName,
      content: 'Reset the cover photo',
      status: 'cover_edit',
      caption_before: post.cover_image_url,
      caption_after: null,
      attachments: [],
    })
    .select(
      'id, review_link_id, author_name, content, status, created_at, attachments, caption_before, caption_after, metadata',
    )
    .single();

  void (async () => {
    const ctxForAudit = await getShareContextOrNull(token);
    if (!ctxForAudit) return;
    const { identity } = await resolveBoundIdentity(ctxForAudit);
    if (!identity || (identity.role !== 'admin' && identity.role !== 'super_admin')) {
      return;
    }
    await logShareAdminAction({
      shareLinkId: ctxForAudit.linkId,
      shareLinkKind: 'calendar',
      actorUserId: identity.userId,
      action: 'cover.reset',
      targetKind: 'cover',
      targetId: postId,
      payload: { previous_url: post.cover_image_url },
    });
  })();

  return NextResponse.json({
    cover_image_url: null,
    comment: commentRow ?? null,
  });
}

function mimeToExt(mime: string): string | null {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  return map[mime.toLowerCase()] ?? null;
}

function extFromName(name: string): string | null {
  const m = name.match(/\.([a-z0-9]{2,5})$/i);
  return m ? m[1].toLowerCase() : null;
}
