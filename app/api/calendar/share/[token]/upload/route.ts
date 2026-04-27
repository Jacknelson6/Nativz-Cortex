import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';

const BUCKET = 'share-comment-attachments';
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED_PREFIXES = ['image/', 'video/', 'application/pdf'];

interface ShareLinkRow {
  drop_id: string;
  expires_at: string;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const admin = createAdminClient();

  const { data: link } = await admin
    .from('content_drop_share_links')
    .select('drop_id, expires_at')
    .eq('token', token)
    .single<ShareLinkRow>();
  if (!link) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'link expired' }, { status: 410 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file missing' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'file too large (max 25MB)' }, { status: 413 });
  }
  const mime = file.type || 'application/octet-stream';
  if (!ALLOWED_PREFIXES.some((p) => mime.startsWith(p) || mime === p)) {
    return NextResponse.json({ error: 'unsupported file type' }, { status: 415 });
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'upload';
  const path = `${link.drop_id}/${randomUUID()}/${safeName}`;
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
