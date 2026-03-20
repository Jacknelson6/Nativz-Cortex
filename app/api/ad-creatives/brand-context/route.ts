import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const bodySchema = z.object({
  clientId: z.string().uuid(),
  brand: z.object({
    name: z.string().min(1).max(200),
    logoUrl: z.string().nullable(),
    colors: z.array(z.string()).max(12),
    description: z.string().max(2000),
  }),
});

/**
 * PATCH /api/ad-creatives/brand-context
 *
 * Save edited brand context back to the client's knowledge entry.
 * Updates existing brand_profile with ad_creative_context, or creates one.
 */
export async function PATCH(req: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { clientId, brand } = parsed.data;
  const admin = createAdminClient();

  // Find existing brand_profile with ad_creative_context
  const { data: existing } = await admin
    .from('client_knowledge_entries')
    .select('id, metadata')
    .eq('client_id', clientId)
    .eq('type', 'brand_profile')
    .not('metadata->ad_creative_context', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    // Update existing entry's brand context
    const metadata = existing.metadata as Record<string, unknown>;
    const ctx = (metadata.ad_creative_context as Record<string, unknown>) ?? {};

    const updatedCtx = {
      ...ctx,
      brand: {
        name: brand.name,
        logoUrl: brand.logoUrl,
        colors: brand.colors,
        description: brand.description,
        url: (ctx.brand as Record<string, unknown> | undefined)?.url ?? '',
      },
      editedAt: new Date().toISOString(),
    };

    const { error } = await admin
      .from('client_knowledge_entries')
      .update({
        metadata: { ...metadata, ad_creative_context: updatedCtx },
      })
      .eq('id', existing.id);

    if (error) {
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    }
  } else {
    // Create new entry
    const { error } = await admin.from('client_knowledge_entries').insert({
      client_id: clientId,
      type: 'brand_profile',
      title: `Ad creative brand context — ${brand.name}`,
      content: `Manually saved brand context for ad generation.`,
      metadata: {
        ad_creative_context: {
          brand: {
            name: brand.name,
            logoUrl: brand.logoUrl,
            colors: brand.colors,
            description: brand.description,
            url: '',
          },
          products: [],
          mediaUrls: [],
          editedAt: new Date().toISOString(),
        },
      },
    });

    if (error) {
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
