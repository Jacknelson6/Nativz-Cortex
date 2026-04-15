import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireBoardAccess } from '@/lib/moodboard/auth';
import { gatherQuickMetadataForItemUrl } from '@/lib/analysis/gather-quick-item-metadata';
import { ensureAnalysisBoardForTopicSearch } from '@/lib/analysis/ensure-topic-search-analysis-board';

export const maxDuration = 30;

const createItemSchema = z
  .object({
    /** Legacy: add to an existing moodboard. */
    board_id: z.string().uuid('Invalid board ID').optional(),
    /** Inline analysis from topic search results — creates or reuses a board per search. */
    topic_search_id: z.string().uuid().optional(),
    /** Required for video/image/website; omitted for text. */
    url: z.string().url('Invalid URL').optional(),
    type: z.enum(['video', 'image', 'website', 'text']),
    title: z.string().max(500).optional().nullable(),
    /** Required for text; ignored otherwise. Trimmed before insert. */
    text_content: z.string().max(20_000).optional(),
    position_x: z.number().optional().default(0),
    position_y: z.number().optional().default(0),
    width: z.number().optional(),
    height: z.number().optional(),
  })
  .refine(
    (d) =>
      (Boolean(d.board_id) && !d.topic_search_id) || (!d.board_id && Boolean(d.topic_search_id)),
    { message: 'Provide exactly one of board_id or topic_search_id', path: ['board_id'] },
  )
  .refine(
    (d) => (d.type === 'text' ? Boolean(d.text_content?.trim()) : Boolean(d.url)),
    { message: 'text_content is required for text items; url is required otherwise', path: ['type'] },
  );

/**
 * POST /api/analysis/items
 *
 * Add a new item to a moodboard. Fetches quick metadata (thumbnail, title, author,
 * stats) from the source platform (TikTok, YouTube, Instagram, Facebook, or generic
 * website) and saves the item immediately. Then auto-triggers background processing:
 * transcription for videos, insights extraction for websites.
 *
 * @auth Required (admin)
 * @body board_id - Board UUID (optional if topic_search_id is set)
 * @body topic_search_id - Topic search UUID — ensures a per-search analysis board (optional if board_id is set)
 * @body url - Source URL (required)
 * @body type - 'video' | 'image' | 'website' (required)
 * @body title - Optional title override
 * @body position_x - Canvas X position (default 0)
 * @body position_y - Canvas Y position (default 0)
 * @body width - Canvas width in pixels (optional)
 * @body height - Canvas height in pixels (optional)
 * @returns {MoodboardItem} Created item record
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    const body = await request.json();
    console.log('Received request:', { board_id: body.board_id, url: body.url, type: body.type });

    const parsed = createItemSchema.safeParse(body);

    if (!parsed.success) {
      console.error('Validation failed:', parsed.error.flatten().fieldErrors);
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    // Board-scoped routes delegate to requireBoardAccess (admins, personal-
    // board owners, and portal viewers on their org's client-scoped boards).
    //
    // The topic_search_id path has its own gate: the caller must either be
    // an admin OR a viewer whose org owns the search's client. We check the
    // search row here so the ensureAnalysisBoardForTopicSearch call below
    // can trust the caller has a legitimate reason to create/reuse the
    // board.
    if (parsed.data.board_id) {
      const gate = await requireBoardAccess(parsed.data.board_id, user, adminClient);
      if (!gate.ok) return gate.response;
    } else {
      const { data: userData } = await adminClient
        .from('users')
        .select('role, is_super_admin')
        .eq('id', user.id)
        .single();
      const isAdmin =
        userData?.is_super_admin === true ||
        userData?.role === 'admin' ||
        userData?.role === 'super_admin';

      if (!isAdmin) {
        if (userData?.role !== 'viewer') {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { data: search } = await adminClient
          .from('topic_searches')
          .select('client_id')
          .eq('id', parsed.data.topic_search_id as string)
          .maybeSingle();
        const searchClientId = search?.client_id as string | null;

        if (!searchClientId) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { data: access } = await adminClient
          .from('user_client_access')
          .select('client_id')
          .eq('user_id', user.id)
          .eq('client_id', searchClientId)
          .maybeSingle();

        if (!access) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
      }
    }

    let resolvedBoardId = parsed.data.board_id ?? null;
    if (parsed.data.topic_search_id) {
      const ensured = await ensureAnalysisBoardForTopicSearch(
        adminClient,
        user.id,
        parsed.data.topic_search_id,
      );
      if (!ensured.ok) {
        return NextResponse.json({ error: ensured.error }, { status: ensured.status });
      }
      resolvedBoardId = ensured.boardId;
    }

    const { data: board, error: boardError } = await adminClient
      .from('moodboard_boards')
      .select('id')
      .eq('id', resolvedBoardId as string)
      .single();

    if (boardError || !board) {
      console.error('Board not found:', boardError);
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    const url = parsed.data.url;
    const isTextItem = parsed.data.type === 'text';

    // Deduplicate (URL-typed items only). Text items are never deduped —
    // two separate text blocks on the same board are legitimate.
    if (!isTextItem && url) {
      const { data: existingItem } = await adminClient
        .from('moodboard_items')
        .select('*')
        .eq('board_id', resolvedBoardId as string)
        .eq('url', url)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingItem) {
        return NextResponse.json(existingItem, { status: 200 });
      }
    }

    let quickTitle = parsed.data.title ?? null;
    let quickThumbnail: string | null = null;
    let detectedPlatform: string | null = null;
    let authorName: string | null = null;
    let authorHandle: string | null = null;
    let stats: { views: number; likes: number; comments: number; shares: number } | null = null;
    let music: string | null = null;
    let duration: number | null = null;
    let hashtags: string[] = [];

    if (!isTextItem && url) {
      try {
        const gathered = await gatherQuickMetadataForItemUrl(url, parsed.data.type as 'video' | 'image' | 'website');
        quickTitle = quickTitle || gathered.quickTitle;
        quickThumbnail = gathered.quickThumbnail;
        detectedPlatform = gathered.detectedPlatform;
        authorName = gathered.authorName;
        authorHandle = gathered.authorHandle;
        stats = gathered.stats;
        music = gathered.music;
        duration = gathered.duration;
        hashtags = gathered.hashtags;
      } catch {
        // Metadata fetch failed — still create the item
      }
    }

    const insertData: Record<string, unknown> = {
      board_id: resolvedBoardId,
      url: isTextItem ? null : parsed.data.url,
      type: parsed.data.type,
      text_content: isTextItem ? parsed.data.text_content?.trim() ?? null : null,
      title:
        quickTitle ||
        (isTextItem
          ? 'Note'
          : parsed.data.type === 'website' && url
          ? (() => {
              try {
                return new URL(url).hostname;
              } catch {
                return 'Untitled';
              }
            })()
          : 'Untitled video'),
      thumbnail_url: quickThumbnail,
      platform: detectedPlatform,
      author_name: authorName,
      author_handle: authorHandle,
      stats,
      music,
      duration,
      hashtags,
      position_x: parsed.data.position_x,
      position_y: parsed.data.position_y,
      created_by: user.id,
      status: 'completed',
      width:
        detectedPlatform === 'tiktok' || detectedPlatform === 'instagram' || detectedPlatform === 'facebook'
          ? 240
          : 320,
    };
    if (parsed.data.width !== undefined) insertData.width = parsed.data.width;
    if (parsed.data.height !== undefined) insertData.height = parsed.data.height;

    const { data: item, error: insertError } = await adminClient.from('moodboard_items').insert(insertData).select().single();

    if (insertError) {
      console.error('Error creating item:', insertError);
      return NextResponse.json({ error: 'Failed to create item', details: insertError.message }, { status: 500 });
    }

    await adminClient
      .from('moodboard_boards')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', resolvedBoardId as string);

    if (item && !isTextItem) {
      const processType = parsed.data.type === 'website' ? 'insights' : 'transcribe';
      const processUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/analysis/items/${item.id}/${processType}`;
      fetch(processUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: request.headers.get('cookie') || '',
        },
      }).catch((err) => console.error(`Auto-process trigger (${processType}) failed:`, err));
    }

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error('POST /api/analysis/items error:', error);
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : '';
    return NextResponse.json(
      { error: 'Internal server error', details: message, stack: stack?.substring(0, 500) },
      { status: 500 },
    );
  }
}
