/**
 * GET /api/shoots/content-calendar
 *
 * Fetches all items from the Monday.com Content Calendars board,
 * parses them into structured shoot data, and cross-references
 * client names with the Cortex DB.
 *
 * Responses are cached in-memory for 3 minutes to avoid slow
 * Monday.com API round-trips on every page load.
 */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  isMondayConfigured,
  fetchContentCalendarItems,
  parseContentCalendarItem,
} from '@/lib/monday/client';

export const maxDuration = 30;

// ---------------------------------------------------------------------------
// In-memory cache (3-minute TTL)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 3 * 60 * 1000;

let cachedData: { groups: unknown; items: unknown } | null = null;
let cachedAt = 0;

function getCached() {
  if (cachedData && Date.now() - cachedAt < CACHE_TTL_MS) return cachedData;
  return null;
}

function setCache(data: { groups: unknown; items: unknown }) {
  cachedData = data;
  cachedAt = Date.now();
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    if (!isMondayConfigured()) {
      return NextResponse.json({ error: 'Monday.com not configured' }, { status: 503 });
    }

    if (!process.env.MONDAY_CONTENT_CALENDARS_BOARD_ID) {
      return NextResponse.json(
        { error: 'MONDAY_CONTENT_CALENDARS_BOARD_ID not set' },
        { status: 503 },
      );
    }

    // Return cached data if fresh
    const cached = getCached();
    if (cached) {
      return NextResponse.json(cached);
    }

    // Fetch from Monday
    const { groups, items } = await fetchContentCalendarItems();

    // Parse items
    const parsedItems = items.map(parseContentCalendarItem);

    // Cross-reference with Cortex DB clients by name
    const { data: dbClients } = await adminClient
      .from('clients')
      .select('id, name, slug, industry, logo_url')
      .eq('is_active', true);

    const clientMap = new Map<string, { id: string; slug: string; industry: string; logoUrl: string | null }>();
    for (const c of dbClients ?? []) {
      clientMap.set(c.name.toLowerCase(), { id: c.id, slug: c.slug, industry: c.industry ?? '', logoUrl: c.logo_url ?? null });
    }

    // Enrich items with client data
    const enrichedItems = parsedItems.map((item) => {
      const match = clientMap.get(item.clientName.toLowerCase());
      return {
        ...item,
        clientId: match?.id ?? null,
        clientSlug: match?.slug ?? null,
        clientIndustry: match?.industry ?? null,
        clientLogoUrl: match?.logoUrl ?? null,
      };
    });

    const result = { groups, items: enrichedItems };
    setCache(result);

    return NextResponse.json(result);
  } catch (error) {
    console.error('GET /api/shoots/content-calendar error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch content calendar' },
      { status: 500 },
    );
  }
}
