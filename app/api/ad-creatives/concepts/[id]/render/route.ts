import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateGeminiImage } from '@/lib/ad-creatives-v2/scenes/gemini-generate';

// Gemini image gen can take 20-40s per concept — stay on the 300s ceiling
// so one render doesn't trip Vercel's default timeout.
export const maxDuration = 300;

/**
 * Render the image for an ad concept. Takes the concept's stored
 * `image_prompt`, fires Gemini image gen, uploads the result to the
 * existing `ad-creatives` bucket, and writes the storage path back to
 * the concept row. Overwrites any prior render — admins can re-render
 * freely; there's no "history" of prior versions yet (could add if we
 * need it).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

  const { id } = await params;
  const { data: concept } = await admin
    .from('ad_concepts')
    .select('id, client_id, image_prompt, image_storage_path')
    .eq('id', id)
    .maybeSingle();
  if (!concept) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!concept.image_prompt) {
    return NextResponse.json({ error: 'Concept has no image prompt' }, { status: 400 });
  }

  let buf: Buffer;
  try {
    buf = await generateGeminiImage(concept.image_prompt);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Image generation failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Overwrite prior render if one exists so we don't leak storage on
  // repeat clicks. Best-effort — if the prior object already vanished,
  // we still upload the new one.
  if (concept.image_storage_path) {
    await admin.storage.from('ad-creatives').remove([concept.image_storage_path]);
  }

  const storagePath = `${concept.client_id}/concepts/${id}/${randomUUID()}.png`;
  const { error: uploadErr } = await admin.storage
    .from('ad-creatives')
    .upload(storagePath, buf, {
      contentType: 'image/png',
      upsert: false,
    });
  if (uploadErr) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadErr.message}` },
      { status: 500 },
    );
  }

  const { data: updated, error: updateErr } = await admin
    .from('ad_concepts')
    .update({ image_storage_path: storagePath })
    .eq('id', id)
    .select(
      'id, slug, template_name, template_id, headline, body_copy, visual_description, source_grounding, image_prompt, image_storage_path, status, position, notes, created_at, updated_at',
    )
    .single();
  if (updateErr || !updated) {
    await admin.storage.from('ad-creatives').remove([storagePath]);
    return NextResponse.json(
      { error: `Update failed: ${updateErr?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ concept: updated });
}
