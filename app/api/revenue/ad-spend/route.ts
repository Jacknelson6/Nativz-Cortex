import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/revenue/auth';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  client_id: z.string().uuid(),
  platform: z.enum(['meta', 'google', 'tiktok', 'youtube', 'other']),
  campaign_label: z.string().optional().nullable(),
  period_month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  spend_cents: z.number().int().min(0),
  notes: z.string().optional().nullable(),
});

const querySchema = z.object({
  client_id: z.string().uuid().optional(),
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin } = auth;

  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
  const { client_id, month, limit } = parsed.data;

  let q = admin
    .from('client_ad_spend')
    .select('id, client_id, platform, campaign_label, period_month, spend_cents, source, notes, updated_at, clients(name, slug)')
    .order('period_month', { ascending: false })
    .order('spend_cents', { ascending: false })
    .limit(limit);
  if (client_id) q = q.eq('client_id', client_id);
  if (month) q = q.eq('period_month', month);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin, userId } = auth;

  const raw = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { error } = await admin.from('client_ad_spend').upsert(
    {
      ...parsed.data,
      source: 'manual',
      created_by: userId,
    },
    { onConflict: 'client_id,platform,campaign_label,period_month' },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

const updateSchema = createSchema.partial().extend({ id: z.string().uuid() });

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin } = auth;

  const raw = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { id, ...patch } = parsed.data;

  const { error } = await admin.from('client_ad_spend').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

const deleteSchema = z.object({ id: z.string().uuid() });

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin } = auth;

  const raw = await req.json().catch(() => null);
  const parsed = deleteSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const { error } = await admin.from('client_ad_spend').delete().eq('id', parsed.data.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
