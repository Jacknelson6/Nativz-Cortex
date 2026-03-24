import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { extractVideoCandidatesFromSearch } from '@/lib/ideation/extract-video-candidates';
import { processVideoItem } from '@/lib/moodboard/process-video';
import type { TopicSearch } from '@/lib/types/search';

export const maxDuration = 60;

const bodySchema = z.object({
  search_id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
});

const MAX_ITEMS = 20;
const AUTO_PROCESS_COUNT = 6;

/**
 * POST /api/analysis/boards/from-topic-search
 *
 * Create a moodboard from high-engagement video URLs found in a completed topic search,
 * link the board via source_topic_search_id, optionally kick off video processing in the background.
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

    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { search_id, name } = parsed.data;

    const { data: search, error: searchError } = await adminClient
      .from('topic_searches')
      .select('*')
      .eq('id', search_id)
      .single();

    if (searchError || !search) {
      return NextResponse.json({ error: 'Search not found' }, { status: 404 });
    }

    if (search.status !== 'completed') {
      return NextResponse.json({ error: 'Search is not completed yet' }, { status: 400 });
    }

    const candidates = extractVideoCandidatesFromSearch(search as TopicSearch);
    if (candidates.length === 0) {
      return NextResponse.json(
        { error: 'No video URLs found in this search. Try a multi-platform research run with TikTok or YouTube.' },
        { status: 400 },
      );
    }

    const boardName =
      name?.trim() ||
      `Inspiration — ${(search.query as string).slice(0, 80)}${(search.query as string).length > 80 ? '…' : ''}`;

    const { data: board, error: boardErr } = await adminClient
      .from('moodboard_boards')
      .insert({
        name: boardName,
        description: `Auto-built from topic search. Query: ${search.query as string}`,
        client_id: search.client_id as string | null,
        created_by: user.id,
        source_topic_search_id: search_id,
      })
      .select('id')
      .single();

    if (boardErr || !board) {
      console.error('from-topic-search board insert:', boardErr);
      return NextResponse.json({ error: 'Failed to create board' }, { status: 500 });
    }

    const slice = candidates.slice(0, MAX_ITEMS);
    const itemIds: string[] = [];

    for (let i = 0; i < slice.length; i++) {
      const c = slice[i];
      const platform =
        c.platform === 'youtube' || c.platform === 'tiktok' || c.platform === 'instagram'
          ? c.platform
          : null;

      const { data: item, error: itemErr } = await adminClient
        .from('moodboard_items')
        .insert({
          board_id: board.id,
          url: c.url,
          type: 'video',
          title: c.title.slice(0, 500),
          thumbnail_url: null,
          platform,
          author_name: null,
          author_handle: null,
          stats: c.stats,
          status: 'pending',
          position_x: (i % 4) * 280,
          position_y: Math.floor(i / 4) * 340,
          width: platform === 'tiktok' || platform === 'instagram' ? 240 : 320,
          created_by: user.id,
        })
        .select('id')
        .single();

      if (!itemErr && item?.id) itemIds.push(item.id);
      else if (itemErr) console.error('from-topic-search item insert:', itemErr);
    }

    await adminClient
      .from('moodboard_boards')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', board.id);

    const toProcess = itemIds.slice(0, AUTO_PROCESS_COUNT);
    if (toProcess.length > 0) {
      after(async () => {
        for (const id of toProcess) {
          try {
            await processVideoItem(id);
          } catch (e) {
            console.error(`processVideoItem ${id}:`, e);
          }
        }
      });
    }

    return NextResponse.json(
      {
        board_id: board.id,
        items_created: itemIds.length,
        auto_processing: toProcess.length,
      },
      { status: 201 },
    );
  } catch (e) {
    console.error('POST from-topic-search:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
