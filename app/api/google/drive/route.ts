/**
 * GET /api/google/drive?folderId=...&q=...&pageToken=...
 *
 * List files from Google Drive.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { listFiles } from '@/lib/google/drive';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const folderId = searchParams.get('folderId') ?? undefined;
    const query = searchParams.get('q') ?? undefined;
    const pageToken = searchParams.get('pageToken') ?? undefined;
    const pageSize = searchParams.get('pageSize') ? Number(searchParams.get('pageSize')) : undefined;

    const data = await listFiles(user.id, { folderId, query, pageToken, pageSize });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list files';
    console.error('GET /api/google/drive error:', err);

    if (message.includes('not connected')) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
