import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { listNanoBananaCatalog } from '@/lib/ad-creatives/nano-banana/catalog';

/**
 * GET /api/ad-creatives/global-templates
 *
 * Nano Banana catalog (admin picker). Authenticated users only.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const templates = listNanoBananaCatalog().map((t) => ({
    slug: t.slug,
    name: t.name,
    sortOrder: t.sortOrder,
    nanoType: t.nanoType,
    previewUrl: t.previewPublicPath,
  }));

  return NextResponse.json({ templates });
}
