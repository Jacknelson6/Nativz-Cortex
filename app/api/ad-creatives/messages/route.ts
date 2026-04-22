import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Read the persisted chat history for a client's Ad Generator. The UI
 * fetches this on mount so refreshing the page doesn't lose the current
 * session's turns.
 *
 * Limit capped at 200 — the chat is meant to be a recent-turns scroll,
 * not a full audit log. Batches remain queryable via /api/ad-creatives/concepts.
 */
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isAdmin =
    me?.is_super_admin === true ||
    me?.role === 'admin' ||
    me?.role === 'super_admin';
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const clientId = req.nextUrl.searchParams.get('clientId');
  if (!clientId) {
    return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
  }

  // Fetch DESC so we can paginate later, but return ASC to the client so
  // the UI can render top-to-bottom without re-sorting.
  const { data, error } = await admin
    .from('ad_generator_messages')
    .select('id, role, content, command, metadata, batch_id, created_at, author_user_id')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    messages: (data ?? []).slice().reverse(),
  });
}
