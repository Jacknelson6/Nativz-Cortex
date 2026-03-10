import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateApiKey } from '@/lib/api-keys/validate';
import { createAdminClient } from '@/lib/supabase/admin';

const searchSchema = z.object({
  client_id: z.string().uuid(),
  query: z.string().min(1),
  search_mode: z.enum(['quick', 'deep']).optional().default('quick'),
});

export async function POST(request: NextRequest) {
  const auth = await validateApiKey(request);
  if ('error' in auth) return auth.error;

  const body = await request.json();
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
