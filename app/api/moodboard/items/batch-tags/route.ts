import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const schema = z.object({
  item_ids: z.array(z.string().uuid()).min(1).max(200),
});

/**
 * POST /api/moodboard/items/batch-tags
 *
 * Fetch all tags for a batch of moodboard items in a single query. Returns a
 * map of item_id → MoodboardTag[]. Useful for efficiently loading tag state
 * for a full board without N+1 queries.
 *
 * @auth Required (admin)
 * @body item_ids - Array of 1–200 moodboard item UUIDs
 * @returns {Record<string, MoodboardTag[]>} Map of item UUID to tag array
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const { data, error } = await adminClient
      .from('moodboard_item_tags')
      .select('item_id, tag_id, moodboard_tags(*)')
      .in('item_id', parsed.data.item_ids);

    if (error) {
      console.error('Error fetching batch tags:', error);
      return NextResponse.json({ error: 'Failed to fetch tags' }, { status: 500 });
    }

    // Group tags by item_id
    const result: Record<string, unknown[]> = {};
    for (const row of data ?? []) {
      const tag = (row as Record<string, unknown>).moodboard_tags;
      if (!tag) continue;
      const itemId = row.item_id;
      if (!result[itemId]) result[itemId] = [];
      result[itemId].push(tag);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('POST /api/moodboard/items/batch-tags error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
