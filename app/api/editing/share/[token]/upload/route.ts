import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/editing/share/:token/upload
 *
 * Reviewer-side attachment upload for the editing-project public review
 * page. Mirrors the calendar `upload` route exactly - same bucket
 * (`share-comment-attachments`, provisioned in migration 182), same
 * 25MB cap, same allowed mime prefixes - but resolves the project id
 * from `editing_project_share_links` so the storage path namespaces
 * by project, not by drop.
 *
 * Auth: anyone with the share token can upload. Bucket is public-read
 * by RLS, but the path is randomised under a UUID so guessing one is
 * effectively impossible.
 */

const BUCKET = 'share-comment-attachments';
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED_PREFIXES = ['image/', 'video/', 'application/pdf'];

interface ShareLinkRow {
  project_id: string;
  expires_at: string;
  archived_at: string | null;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const admin = createAdminClient();

  const { data: link } = await admin
    .from('editing_project_share_links')
    .select('project_id, expires_at, archived_at')
    .eq('token', token)
    .maybeSingle<ShareLinkRow>();
  if (!link) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (link.archived_at) {
    return NextResponse.json({ error: 'revoked' }, { status: 410 });
  }
  if (new Date(link.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'expired' }, { status: 410 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file missing' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'file too large (max 25MB)' },
      { status: 413 },
    );
  }
  const mime = file.type || 'application/octet-stream';
  if (!ALLOWED_PREFIXES.some((p) => mime.startsWith(p) || mime === p)) {
    return NextResponse.json(
      { error: 'unsupported file type' },
      { status: 415 },
    );
  }

  const safeName =
    file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'upload';
  // Keying by project_id keeps editing-project attachments separate
  // from social-drop attachments inside the shared bucket.
  const path = `editing/${link.project_id}/${randomUUID()}/${safeName}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(path, buf, { contentType: mime, upsert: false });
  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({
    url: pub.publicUrl,
    filename: safeName,
    mime_type: mime,
    size_bytes: file.size,
  });
}
