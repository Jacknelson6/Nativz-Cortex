import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const BUCKET = 'ad-template-references';

const TEMPLATE_SELECT =
  'id, client_id, name, reference_image_url, prompt_schema, aspect_ratio, ad_category, tags, extraction_status, extraction_error, created_at, updated_at';

/**
 * GET /api/clients/[clientId]/ad-creatives/templates/[templateId]
 *
 * Single-template fetch. Useful when the gallery polling loop wants
 * to refresh just one card after a retry instead of re-listing the
 * whole library.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ clientId: string; templateId: string }> },
) {
  const { clientId, templateId } = await ctx.params;
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('ad_prompt_templates')
    .select(TEMPLATE_SELECT)
    .eq('id', templateId)
    .eq('client_id', clientId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }
  return NextResponse.json({ template: data });
}

/**
 * DELETE /api/clients/[clientId]/ad-creatives/templates/[templateId]
 *
 * Removes the row plus any reference image stored under
 * ad-template-references/<clientId>/<templateId>.<ext>. The list
 * route does optimistic local removal first, so this just needs to
 * win consistently and surface the error if it doesn't.
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ clientId: string; templateId: string }> },
) {
  const { clientId, templateId } = await ctx.params;
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const admin = createAdminClient();

  const { data: existing, error: loadError } = await admin
    .from('ad_prompt_templates')
    .select('id, reference_image_url')
    .eq('id', templateId)
    .eq('client_id', clientId)
    .maybeSingle();

  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  const { error: deleteError } = await admin
    .from('ad_prompt_templates')
    .delete()
    .eq('id', templateId)
    .eq('client_id', clientId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  // Best-effort storage cleanup. Path shape is fixed by the upload
  // route, so reconstructing it from the stored URL is safe.
  const storagePath = storagePathFromUrl(existing.reference_image_url, clientId, templateId);
  if (storagePath) {
    await admin.storage.from(BUCKET).remove([storagePath]);
  }

  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requireAdmin(): Promise<
  { error: NextResponse; userId?: undefined } | { error: null; userId: string }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const admin = createAdminClient();
  const { data } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const ok =
    data?.is_super_admin === true ||
    data?.role === 'admin' ||
    data?.role === 'super_admin';
  if (!ok) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { error: null, userId: user.id };
}

function storagePathFromUrl(
  url: string | null,
  clientId: string,
  templateId: string,
): string | null {
  if (!url) return null;
  // Extract the extension from the public URL so we remove the actual
  // file. Falls back to no-op if the URL shape is unexpected.
  const match = url.match(/\/([^/]+\.[a-z0-9]{1,8})(?:\?|$)/i);
  if (!match) return null;
  const filename = match[1];
  const ext = filename.slice(filename.lastIndexOf('.'));
  return `${clientId}/${templateId}${ext}`;
}
