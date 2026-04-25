import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/admin/proposals/drafts/[id]/upload-image — accepts a single
 * image file (multipart form, field name 'file'), stores it in the
 * 'proposal-draft-images' bucket under <draft_id>/<uuid>-<filename>,
 * and returns the public URL. The chat then calls /blocks with kind=
 * 'image' and that URL as content.
 *
 * Bucket is public-read so the preview iframe doesn't need a signed
 * URL on every render. The path is uuid-prefixed so URL guessing is
 * impractical.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: draftId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  if (me?.role !== 'admin' && !me?.is_super_admin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'file missing' }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'file too large (10 MB max)' }, { status: 413 });
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'only images allowed' }, { status: 415 });
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 100);
  const path = `${draftId}/${randomUUID()}-${safeName}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await admin.storage
    .from('proposal-draft-images')
    .upload(path, buf, {
      contentType: file.type,
      upsert: false,
    });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data: pub } = admin.storage.from('proposal-draft-images').getPublicUrl(path);
  return NextResponse.json({ ok: true, url: pub.publicUrl, path });
}
