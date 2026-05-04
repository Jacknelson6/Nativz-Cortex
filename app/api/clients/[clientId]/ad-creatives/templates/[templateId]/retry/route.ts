import { NextResponse, after } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { extractTemplateSchema } from '@/lib/ad-creatives/extract-template-schema';

export const dynamic = 'force-dynamic';

/**
 * POST /api/clients/[clientId]/ad-creatives/templates/[templateId]/retry
 *
 * Re-runs the vision pass on a template that previously hit
 * extraction_status='failed'. Flips the row back to 'pending' and
 * fires the worker via after() so the response returns instantly and
 * the gallery's polling loop picks it up. Same pattern as the upload
 * route's tail end, just without the file write.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ clientId: string; templateId: string }> },
) {
  const { clientId, templateId } = await ctx.params;
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('ad_prompt_templates')
    .select('id, reference_image_url')
    .eq('id', templateId)
    .eq('client_id', clientId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }
  if (!existing.reference_image_url) {
    return NextResponse.json(
      { error: 'Template has no reference image to analyze' },
      { status: 400 },
    );
  }

  const { error: updateError } = await admin
    .from('ad_prompt_templates')
    .update({
      extraction_status: 'pending',
      extraction_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', templateId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  after(async () => {
    await extractTemplateSchema(templateId);
  });

  return NextResponse.json({ status: 'pending' });
}

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
