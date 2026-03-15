/**
 * GET /api/google/chat
 *
 * List Google Chat spaces for the authenticated user, or list messages in a specific space.
 * Requires Google to be connected.
 *
 * @auth Required (any authenticated user; Google must be connected)
 * @query space - If provided, list messages in this space (e.g. 'spaces/xxx'); omit to list all spaces
 * @query pageToken - Optional pagination cursor
 * @returns Space list or message list response from Google Chat API
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { listSpaces, listMessages } from '@/lib/google/chat';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const space = searchParams.get('space');
    const pageToken = searchParams.get('pageToken') ?? undefined;

    if (space) {
      const data = await listMessages(user.id, space, { pageToken });
      return NextResponse.json(data);
    }

    const data = await listSpaces(user.id, pageToken ?? undefined);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch chat data';
    console.error('GET /api/google/chat error:', err);

    if (message.includes('not connected')) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
