import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runTikTokShopSearch } from '@/lib/tiktok-shop/run-search';
import { rateLimitByUser } from '@/lib/security/rate-limit';

export const maxDuration = 300;

const ADMIN_ROLES = ['admin', 'super_admin'];

const SearchSchema = z.object({
  query: z.string().trim().min(2, 'Query is required'),
  maxProducts: z.number().int().min(1).max(10).optional(),
  maxAffiliatesPerProduct: z.number().int().min(1).max(100).optional(),
  minFollowers: z.number().int().min(0).optional(),
  marketCountryCode: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}$/, 'Country code must be ISO 3166-1 alpha-2')
    .optional(),
  clientId: z.string().uuid().nullable().optional(),
});

/**
 * POST /api/insights/search
 *
 * Kick off a TikTok Shop category search. Creates a row, returns the
 * jobId immediately, and runs the pipeline in the background via Next's
 * after() so the client can poll /api/insights/search/[jobId] for
 * status + results.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: userData } = await admin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    if (!userData || !ADMIN_ROLES.includes(userData.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Each search spawns 2 Apify runs and ~$0.20 in spend — throttle so
    // nobody can accidentally chain dozens of searches in a minute.
    const rl = rateLimitByUser(user.id, '/api/insights/search', 'ai');
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded — try again in a minute.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
          },
        },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = SearchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid body' },
        { status: 400 },
      );
    }

    const {
      query,
      maxProducts,
      maxAffiliatesPerProduct,
      minFollowers,
      marketCountryCode,
      clientId,
    } = parsed.data;

    // If a clientId was provided, confirm it exists and the caller's
    // attach is valid.
    if (clientId) {
      const { data: client } = await admin
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .maybeSingle();
      if (!client) {
        return NextResponse.json({ error: 'Client not found' }, { status: 400 });
      }
    }

    const { data: searchRow, error: insertError } = await admin
      .from('tiktok_shop_searches')
      .insert({
        query,
        status: 'queued',
        max_products: maxProducts ?? 10,
        max_affiliates_per_product: maxAffiliatesPerProduct ?? 20,
        min_followers: minFollowers ?? null,
        market_country_code: marketCountryCode ?? 'US',
        client_id: clientId ?? null,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (insertError || !searchRow) {
      console.error('[insights/search] insert failed:', insertError);
      return NextResponse.json({ error: 'Failed to create search' }, { status: 500 });
    }

    // Kick off the pipeline in the background. The route returns immediately
    // with the jobId; clients poll /api/insights/search/[jobId].
    after(async () => {
      try {
        await runTikTokShopSearch(searchRow.id, query, {
          maxProducts,
          maxAffiliatesPerProduct,
          minFollowers,
          marketCountryCode,
          clientId,
        });
      } catch (e) {
        console.error(`[insights/search] after() crashed for ${searchRow.id}:`, e);
      }
    });

    return NextResponse.json({ jobId: searchRow.id, status: 'queued' });
  } catch (error) {
    console.error('POST /api/insights/search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/insights/search
 *
 * List recent TikTok Shop searches (global, newest first). Used by the
 * search page to show "Recent searches".
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: userData } = await admin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    if (!userData || !ADMIN_ROLES.includes(userData.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const limit = Math.min(50, Math.max(1, Number(new URL(request.url).searchParams.get('limit') ?? '20')));

    const { data: searches } = await admin
      .from('tiktok_shop_searches')
      .select('id, query, status, products_found, creators_found, creators_enriched, client_id, created_by, created_at, completed_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    return NextResponse.json({ searches: searches ?? [] });
  } catch (error) {
    console.error('GET /api/insights/search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
