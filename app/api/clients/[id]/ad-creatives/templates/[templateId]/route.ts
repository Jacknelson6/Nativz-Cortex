import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Delete a single ad prompt template (the image-to-JSON extraction).
 * Removes the storage object if it's in the `ad-creatives` bucket, then
 * the row. Storage removal is best-effort — we still want the row gone
 * even if the file was already pruned.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; templateId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isAdmin =
    me?.is_super_admin === true ||
    me?.role === 'admin' ||
    me?.role === 'super_admin';
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: clientId, templateId } = await params;

  const { data: template } = await admin
    .from('ad_prompt_templates')
    .select('id, reference_image_url')
    .eq('id', templateId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Best-effort: strip the storage path out of the public URL and remove
  // the file. Only attempts if the URL looks like our ad-creatives bucket.
  const url = template.reference_image_url as string | null;
  if (url) {
    const marker = '/ad-creatives/';
    const idx = url.indexOf(marker);
    if (idx >= 0) {
      const key = url.slice(idx + marker.length);
      await admin.storage.from('ad-creatives').remove([key]);
    }
  }

  const { error } = await admin
    .from('ad_prompt_templates')
    .delete()
    .eq('id', templateId)
    .eq('client_id', clientId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
