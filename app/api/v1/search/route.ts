import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateApiKey } from '@/lib/api-keys/validate';
import { createAdminClient } from '@/lib/supabase/admin';

const searchSchema = z.object({
  client_id: z.string().uuid(),
  query: z.string().min(1),
  search_mode: z.enum(['quick', 'deep']).optional().default('quick'),
});

/**
 * GET /api/v1/search
 *
 * Not implemented — use POST to trigger a search.
 *
 * @returns 405 Method Not Allowed
 */
export async function GET() {
  return NextResponse.json({ error: 'Use POST to trigger a search' }, { status: 405 });
}

/**
 * POST /api/v1/search
 *
 * Create a topic search record for a client in 'pending' status. The actual
 * search processing is handled asynchronously by the background worker.
 *
 * @auth API key (Bearer token via Authorization header)
 * @body client_id - Client UUID (required)
 * @body query - Search query string (required)
 * @body search_mode - 'quick' | 'deep' (default 'quick')
 * @returns {{ search: { id, query, status, search_mode, created_at } }}
 */
export async function POST(request: NextRequest) {
  const auth = await validateApiKey(request);
  if ('error' in auth) return auth.error;

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const parsed = searchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Create the search record
  const { data: search, error } = await admin
    .from('topic_searches')
    .insert({
      client_id: parsed.data.client_id,
      query: parsed.data.query,
      search_mode: parsed.data.search_mode,
      status: 'pending',
      created_by: auth.ctx.userId,
    })
    .select('id, query, status, search_mode, created_at')
    .single();

  if (error || !search) {
    return NextResponse.json({ error: 'Failed to create search' }, { status: 500 });
  }

  return NextResponse.json({ search }, { status: 201 });
}
