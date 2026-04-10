import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/nerd/conversations
 *
 * Lists this user's Nerd conversations, newest first. Optional
 * ?clientId= filter scopes the list to conversations tagged with that
 * client — used by the Strategy Lab conversation picker so the header
 * dropdown only shows threads started for the currently-open client.
 *
 * The client_id column lives on nerd_conversations as of migration 096.
 * If that migration hasn't run yet the filter is silently dropped so
 * the endpoint still returns the unfiltered list (admin Nerd sidebar
 * behaviour) rather than erroring.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clientId = request.nextUrl.searchParams.get('clientId');
    const admin = createAdminClient();

    // Always request client_id in the select so the UI can tell tagged
    // conversations from untagged ones. If the column doesn't exist yet
    // (pre-migration) the whole query errors — we catch and retry without it.
    let data: Array<{
      id: string;
      title: string;
      created_at: string;
      updated_at: string;
      client_id: string | null;
    }> | null = null;

    const filtered = admin
      .from('nerd_conversations')
      .select('id, title, created_at, updated_at, client_id')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(50);

    const firstAttempt = clientId
      ? await filtered.eq('client_id', clientId)
      : await filtered;

    if (firstAttempt.error) {
      // Retry without client_id — handles the brief pre-migration window.
      const retry = await admin
        .from('nerd_conversations')
        .select('id, title, created_at, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(50);
      if (retry.error) {
        console.error('GET /api/nerd/conversations error:', retry.error);
        return NextResponse.json({ error: 'Failed to load conversations' }, { status: 500 });
      }
      data = (retry.data ?? []).map((c) => ({ ...c, client_id: null }));
    } else {
      data = firstAttempt.data ?? [];
    }

    return NextResponse.json({ conversations: data });
  } catch (error) {
    console.error('GET /api/nerd/conversations error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('nerd_conversations')
      .insert({ user_id: user.id, title: 'New conversation' })
      .select()
      .single();

    if (error) {
      console.error('POST /api/nerd/conversations error:', error);
      return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('POST /api/nerd/conversations error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
