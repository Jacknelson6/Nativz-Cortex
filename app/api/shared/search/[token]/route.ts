import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const adminClient = createAdminClient();

    const { data: link } = await adminClient
      .from('search_share_links')
      .select('search_id, expires_at')
      .eq('token', token)
      .single();

    if (!link) {
      return NextResponse.json({ error: 'Link not found or expired' }, { status: 404 });
    }

    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Link expired' }, { status: 410 });
    }

    const { data: search } = await adminClient
      .from('topic_searches')
      .select('id, query, status, summary, metrics, emotions, content_breakdown, trending_topics, serp_data, raw_ai_response, completed_at, created_at')
      .eq('id', link.search_id)
      .eq('status', 'completed')
      .single();

    if (!search) {
      return NextResponse.json({ error: 'Search not found' }, { status: 404 });
    }

    // Fetch client name if available
    const { data: fullSearch } = await adminClient
      .from('topic_searches')
      .select('client_id')
      .eq('id', link.search_id)
      .single();

    let clientName: string | null = null;
    if (fullSearch?.client_id) {
      const { data: client } = await adminClient
        .from('clients')
        .select('name')
        .eq('id', fullSearch.client_id)
        .single();
      clientName = client?.name || null;
    }

    return NextResponse.json({ ...search, client_name: clientName });
  } catch (error) {
    console.error('GET /api/shared/search/[token] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
