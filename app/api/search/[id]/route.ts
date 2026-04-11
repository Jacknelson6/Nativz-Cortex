import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logActivity } from '@/lib/activity';
import { assertUserCanAccessTopicSearch } from '@/lib/api/topic-search-access';

const renameSearchBodySchema = z.object({
  query: z.string().trim().min(1, 'Topic name is required').max(500),
});

const attachClientBodySchema = z.object({
  client_id: z.string().uuid('client_id must be a UUID'),
});

/**
 * GET /api/search/[id]
 *
 * Fetch a single topic search record by ID including all results, metrics, and SERP data.
 *
 * @auth Required (any authenticated user)
 * @param id - Topic search UUID
 * @returns {TopicSearch} Full search record
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
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

    return NextResponse.json(access.search);
  } catch (error) {
    console.error('GET /api/search/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/search/[id]
 *
 * - **Rename:** `{ query: string }` — update the topic search title (1–500 chars). Admin only.
 * - **Approve / reject:** `{ action: 'approve' | 'reject' }` — portal visibility for the report.
 *
 * Do not send `query` and `action` in the same request.
 *
 * @auth Required (admin)
 * @param id - Topic search UUID
 * @returns Rename: `{ success: true, query }` · Approve/reject: `{ success: true, action }`
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check user is admin
    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const hasQuery = typeof body.query === 'string';
    const hasClientId = typeof body.client_id === 'string';
    const action = body.action;
    const hasAction = action === 'approve' || action === 'reject';

    const branchCount = [hasQuery, hasAction, hasClientId].filter(Boolean).length;
    if (branchCount > 1) {
      return NextResponse.json(
        { error: 'Send only one of query, action, or client_id' },
        { status: 400 },
      );
    }

    if (hasClientId) {
      const parsed = attachClientBodySchema.safeParse(body);
      if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message ?? 'Invalid client_id';
        return NextResponse.json({ error: msg }, { status: 400 });
      }
      const { client_id: nextClientId } = parsed.data;

      // Verify the client actually exists before pointing a search at it —
      // otherwise the topic_searches row would dangle with a ghost FK.
      const { data: clientRow, error: clientErr } = await adminClient
        .from('clients')
        .select('id')
        .eq('id', nextClientId)
        .maybeSingle();
      if (clientErr || !clientRow) {
        return NextResponse.json({ error: 'Client not found' }, { status: 404 });
      }

      const { error: updateError } = await adminClient
        .from('topic_searches')
        .update({ client_id: nextClientId })
        .eq('id', id);
      if (updateError) {
        console.error('Error attaching search to client:', updateError);
        return NextResponse.json({ error: 'Failed to attach search to client' }, { status: 500 });
      }

      logActivity(user.id, 'search_attached_to_client', 'search', id, {
        client_id: nextClientId,
      }).catch(() => {});

      return NextResponse.json({ success: true, client_id: nextClientId });
    }

    if (hasQuery) {
      const parsed = renameSearchBodySchema.safeParse(body);
      if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message ?? 'Invalid topic name';
        return NextResponse.json({ error: msg }, { status: 400 });
      }
      const { query: nextQuery } = parsed.data;

      const { data: existing, error: fetchErr } = await adminClient
        .from('topic_searches')
        .select('id, query')
        .eq('id', id)
        .single();

      if (fetchErr || !existing) {
        return NextResponse.json({ error: 'Search not found' }, { status: 404 });
      }

      if (existing.query === nextQuery) {
        return NextResponse.json({ success: true, query: nextQuery });
      }

      const { error: updateError } = await adminClient
        .from('topic_searches')
        .update({ query: nextQuery })
        .eq('id', id);

      if (updateError) {
        console.error('Error renaming search:', updateError);
        return NextResponse.json({ error: 'Failed to update topic name' }, { status: 500 });
      }

      logActivity(user.id, 'search_renamed', 'search', id, {
        previous_query: existing.query,
        query: nextQuery,
      }).catch(() => {});

      return NextResponse.json({ success: true, query: nextQuery });
    }

    if (action === 'approve') {
      const { error: updateError } = await adminClient
        .from('topic_searches')
        .update({
          approved_at: new Date().toISOString(),
          approved_by: user.id,
        })
        .eq('id', id);

      if (updateError) {
        console.error('Error approving search:', updateError);
        return NextResponse.json({ error: 'Failed to approve search' }, { status: 500 });
      }

      logActivity(user.id, 'report_approved', 'search', id).catch(() => {});

      return NextResponse.json({ success: true, action: 'approved' });
    }

    if (action === 'reject') {
      const { error: updateError } = await adminClient
        .from('topic_searches')
        .update({
          approved_at: null,
          approved_by: null,
        })
        .eq('id', id);

      if (updateError) {
        console.error('Error rejecting search:', updateError);
        return NextResponse.json({ error: 'Failed to reject search' }, { status: 500 });
      }

      return NextResponse.json({ success: true, action: 'rejected' });
    }

    return NextResponse.json(
      { error: 'Invalid body. Send { query: string } to rename, or { action: "approve" | "reject" }.' },
      { status: 400 },
    );
  } catch (error) {
    console.error('PATCH /api/search/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Topic searches admins may delete (includes stuck in-flight rows; completed stays protected). */
const DELETABLE_TOPIC_SEARCH_STATUSES = new Set([
  'failed',
  'pending_subtopics',
  'pending',
  'processing',
  'completed',
]);

/**
 * DELETE /api/search/[id]
 *
 * Permanently delete a topic search record. Allowed when the search is **failed**, stuck in
 * **pending_subtopics**, stuck **pending** / **processing**, or otherwise safe to remove. **Completed**
 * rows stay protected.
 *
 * @auth Required (admin)
 * @param id - Topic search UUID
 * @returns {{ success: true }}
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    // Only allow deleting non-completed searches (see DELETABLE_TOPIC_SEARCH_STATUSES)
    const { data: search } = await adminClient
      .from('topic_searches')
      .select('status')
      .eq('id', id)
      .single();

    if (!search) {
      return NextResponse.json({ error: 'Search not found' }, { status: 404 });
    }

    if (!DELETABLE_TOPIC_SEARCH_STATUSES.has(search.status)) {
      return NextResponse.json(
        {
          error:
            'Completed searches cannot be deleted. Remove failed, stuck, or in-progress searches from history instead.',
        },
        { status: 400 },
      );
    }

    const { error: deleteError } = await adminClient
      .from('topic_searches')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting search:', deleteError);
      return NextResponse.json({ error: 'Failed to delete search' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/search/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
