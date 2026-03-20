import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { crawlSite } from '@/lib/ad-creatives/crawl-site';

export const maxDuration = 300;

const bodySchema = z.object({
  url: z.string().url(),
  clientId: z.string().uuid().optional(),
});

/**
 * POST /api/ad-creatives/crawl-brand
 *
 * Full-site crawl. If clientId has cached brand context in knowledge, returns
 * it immediately. Otherwise kicks off an async crawl via after() and the UI
 * polls GET for completion.
 */
export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { url, clientId } = parsed.data;
  const admin = createAdminClient();

  // Check cache if clientId provided
  if (clientId) {
    const { data: existing } = await admin
      .from('client_knowledge_entries')
      .select('id, metadata')
      .eq('client_id', clientId)
      .eq('type', 'brand_profile')
      .not('metadata->ad_creative_context', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.metadata) {
      const ctx = (existing.metadata as Record<string, unknown>).ad_creative_context as Record<string, unknown> | undefined;
      if (ctx) {
        return NextResponse.json({
          status: 'cached',
          brand: ctx.brand ?? null,
          products: ctx.products ?? [],
          mediaUrls: ctx.mediaUrls ?? [],
        });
      }
    }
  }

  // Kick off async crawl
  after(async () => {
    try {
      const result = await crawlSite(url);

      if (clientId) {
        // Persist to knowledge
        await admin.from('client_knowledge_entries').insert({
          client_id: clientId,
          type: 'brand_profile',
          title: `Ad creative brand context — ${result.brand.name}`,
          content: `Brand context for ad generation. ${result.pagesCrawled} pages crawled. ${result.products.length} products found.`,
          source_url: url,
          metadata: {
            ad_creative_context: {
              brand: result.brand,
              products: result.products,
              mediaUrls: result.mediaUrls,
              pagesCrawled: result.pagesCrawled,
              crawledAt: new Date().toISOString(),
            },
          },
        });
      }
    } catch (err) {
      console.error('[crawl-brand] background crawl failed:', err);
    }
  });

  return NextResponse.json({ status: 'crawling' });
}

/**
 * GET /api/ad-creatives/crawl-brand?clientId=X
 *
 * Poll for crawl completion by checking if knowledge entry exists.
 */
export async function GET(req: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('clientId');
  if (!clientId) {
    return NextResponse.json({ error: 'clientId required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('client_knowledge_entries')
    .select('id, metadata')
    .eq('client_id', clientId)
    .eq('type', 'brand_profile')
    .not('metadata->ad_creative_context', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.metadata) {
    const ctx = (existing.metadata as Record<string, unknown>).ad_creative_context as Record<string, unknown> | undefined;
    if (ctx) {
      return NextResponse.json({
        status: 'ready',
        brand: ctx.brand ?? null,
        products: ctx.products ?? [],
        mediaUrls: ctx.mediaUrls ?? [],
      });
    }
  }

  return NextResponse.json({ status: 'crawling' });
}
