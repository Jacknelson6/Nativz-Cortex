import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  extractCountryFromLibraryUrl,
  extractPageIdFromLibraryUrl,
} from '@/lib/meta-ads/apify-meta-ads-scrape';

export const maxDuration = 30;

const AddSchema = z.object({
  client_id: z.string().uuid(),
  library_url: z
    .string()
    .url()
    .refine((u) => {
      try {
        const parsed = new URL(u);
        return (
          parsed.hostname.endsWith('facebook.com') &&
          parsed.pathname.includes('/ads/library')
        );
      } catch {
        return false;
      }
    }, 'library_url must be a Meta Ad Library URL'),
  page_name: z.string().max(200).optional(),
});

async function requireAdmin(userId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from('users').select('role').eq('id', userId).single();
  return data?.role === 'admin' || data?.role === 'super_admin';
}

/**
 * GET /api/meta-ad-tracker/pages?client_id=… — list tracked pages + recent
 * creatives (most-recent-first, capped at 6 per page).
 *
 * @auth Required (admin)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const clientId = new URL(request.url).searchParams.get('client_id');
    if (!clientId) {
      return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
    }

    if (!(await requireAdmin(user.id))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: pages } = await admin
      .from('meta_ad_tracked_pages')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    const ids = (pages ?? []).map((p) => p.id);
    const { data: creatives } = ids.length
      ? await admin
          .from('meta_ad_creatives')
          .select('*')
          .in('tracked_page_id', ids)
          .order('last_seen_at', { ascending: false })
      : { data: [] };

    type Creative = NonNullable<typeof creatives>[number];
    const byPage: Record<string, Creative[]> = {};
    for (const c of creatives ?? []) {
      (byPage[c.tracked_page_id] ??= []).push(c);
    }

    const enriched = (pages ?? []).map((p) => ({
      ...p,
      creative_count: byPage[p.id]?.length ?? 0,
      recent_creatives: (byPage[p.id] ?? []).slice(0, 6),
    }));

    return NextResponse.json({ pages: enriched });
  } catch (error) {
    console.error('GET /api/meta-ad-tracker/pages error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/meta-ad-tracker/pages — add a new tracked page.
 *
 * @auth Required (admin)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = AddSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    if (!(await requireAdmin(user.id))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('meta_ad_tracked_pages')
      .insert({
        client_id: parsed.data.client_id,
        page_id: extractPageIdFromLibraryUrl(parsed.data.library_url),
        page_name: parsed.data.page_name ?? null,
        library_url: parsed.data.library_url,
        country: extractCountryFromLibraryUrl(parsed.data.library_url),
        added_by: user.id,
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'This library URL is already tracked for this client' },
          { status: 409 },
        );
      }
      console.error('meta_ad_tracked_pages insert error:', error);
      return NextResponse.json({ error: 'Failed to add page' }, { status: 500 });
    }

    return NextResponse.json({ page: data }, { status: 201 });
  } catch (error) {
    console.error('POST /api/meta-ad-tracker/pages error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/meta-ad-tracker/pages?id=… — remove tracked page (cascades to creatives).
 *
 * @auth Required (admin)
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    if (!(await requireAdmin(user.id))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const admin = createAdminClient();
    const { error } = await admin.from('meta_ad_tracked_pages').delete().eq('id', id);
    if (error) {
      console.error('meta_ad_tracked_pages delete error:', error);
      return NextResponse.json({ error: 'Failed to delete page' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/meta-ad-tracker/pages error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
