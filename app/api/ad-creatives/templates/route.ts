import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AD_VERTICALS, AD_CATEGORIES } from '@/lib/ad-creatives/types';

const querySchema = z.object({
  vertical: z.enum(AD_VERTICALS).optional(),
  ad_category: z.enum(AD_CATEGORIES).optional(),
  format: z.string().optional(),
  is_favorite: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

/**
 * GET /api/ad-creatives/templates
 *
 * List Kandy templates with filtering and pagination.
 *
 * @auth Required
 * @query vertical - Filter by ad vertical
 * @query ad_category - Filter by ad category
 * @query format - Filter by format string
 * @query is_favorite - Filter favorites only
 * @query page - Page number (default 1)
 * @query limit - Items per page (default 24, max 100)
 * @returns {{ templates: KandyTemplate[], total: number, page: number, limit: number }}
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = querySchema.safeParse(searchParams);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query parameters', details: parsed.error.flatten() }, { status: 400 });
    }

    const { vertical, ad_category, format, is_favorite, page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    const admin = createAdminClient();

    let query = admin
      .from('kandy_templates')
      .select('*', { count: 'exact' })
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (vertical) query = query.eq('vertical', vertical);
    if (ad_category) query = query.eq('ad_category', ad_category);
    if (format) query = query.eq('format', format);
    if (is_favorite !== undefined) query = query.eq('is_favorite', is_favorite === 'true');

    const { data: templates, count, error } = await query;

    if (error) {
      console.error('GET /api/ad-creatives/templates error:', error);
      return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
    }

    return NextResponse.json({
      templates: templates ?? [],
      total: count ?? 0,
      page,
      limit,
    });
  } catch (error) {
    console.error('GET /api/ad-creatives/templates error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
