/**
 * POST /api/search/[id]/notify
 *
 * Register for email notification when a search completes.
 * Sets created_by on the search so the process route knows who to email.
 *
 * @auth Required
 * @param id - Search UUID
 * @returns {{ success: true }}
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertUserCanAccessTopicSearch } from '@/lib/api/topic-search-access';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const access = await assertUserCanAccessTopicSearch(adminClient, user.id, id);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status === 404 ? 404 : 403 },
      );
    }

    await adminClient
      .from('topic_searches')
      .update({ created_by: user.id })
      .eq('id', id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/search/[id]/notify error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
