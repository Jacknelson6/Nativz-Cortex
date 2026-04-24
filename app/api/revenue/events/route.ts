import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/revenue/auth';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  client_id: z.string().uuid().optional(),
  type: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin } = auth;

  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
  const { client_id, type, limit } = parsed.data;

  let q = admin
    .from('client_lifecycle_events')
    .select('id, client_id, type, title, description, occurred_at, metadata, clients(name, slug)')
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (client_id) q = q.eq('client_id', client_id);
  if (type) q = q.eq('type', type);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data ?? [] });
}
