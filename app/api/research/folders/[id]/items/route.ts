import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchTopicSearchHistoryItemsByIds } from '@/lib/research/history';
import {
  assertUserCanAccessTopicSearch,
  filterTopicSearchIdsAccessibleToUser,
} from '@/lib/api/topic-search-access';

const postSchema = z.object({
  topic_search_id: z.string().uuid(),
});

/**
 * GET /api/research/folders/[id]/items — history items for folder (topic searches only).
 * POST /api/research/folders/[id]/items — add a topic search to the folder.
 * DELETE /api/research/folders/[id]/items?topic_search_id= — remove from folder.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: folderId } = await params;
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: folder, error: folderErr } = await supabase
      .from('topic_search_folders')
      .select('id')
      .eq('id', folderId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (folderErr || !folder) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { data: members, error: memErr } = await supabase
      .from('topic_search_folder_members')
      .select('topic_search_id')
      .eq('folder_id', folderId)
      .order('added_at', { ascending: false });

    if (memErr) {
      return NextResponse.json({ error: memErr.message }, { status: 500 });
    }

    const ids = (members ?? []).map((m) => m.topic_search_id);
    const admin = createAdminClient();
    const allowedIds = await filterTopicSearchIdsAccessibleToUser(admin, user.id, ids);
    const items = await fetchTopicSearchHistoryItemsByIds(allowedIds);
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: 'Failed to load folder items' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: folderId } = await params;
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const json = await request.json().catch(() => null);
    const parsed = postSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
    }

    const { data: folder } = await supabase
      .from('topic_search_folders')
      .select('id')
      .eq('id', folderId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!folder) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const admin = createAdminClient();
    const access = await assertUserCanAccessTopicSearch(admin, user.id, parsed.data.topic_search_id);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status === 404 ? 404 : 403 },
      );
    }

    const { error } = await supabase.from('topic_search_folder_members').insert({
      folder_id: folderId,
      topic_search_id: parsed.data.topic_search_id,
    });

    if (error && error.code !== '23505') {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to add to folder' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: folderId } = await params;
    const topicSearchId = request.nextUrl.searchParams.get('topic_search_id');
    if (!topicSearchId || !z.string().uuid().safeParse(topicSearchId).success) {
      return NextResponse.json({ error: 'topic_search_id required' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: folder } = await supabase
      .from('topic_search_folders')
      .select('id')
      .eq('id', folderId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!folder) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { error } = await supabase
      .from('topic_search_folder_members')
      .delete()
      .eq('folder_id', folderId)
      .eq('topic_search_id', topicSearchId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to remove from folder' }, { status: 500 });
  }
}
