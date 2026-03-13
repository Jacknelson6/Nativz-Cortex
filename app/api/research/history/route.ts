import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { fetchHistory, type HistoryItemType } from '@/lib/research/history';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const limit = Math.min(Number(searchParams.get('limit') ?? 20), 50);
    const type = (searchParams.get('type') as HistoryItemType) || null;
    const clientId = searchParams.get('client_id') || null;
    const cursor = searchParams.get('cursor') || null;

    const items = await fetchHistory({ limit, type, clientId, cursor });

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}
