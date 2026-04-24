import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/revenue/auth';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  name: z.string().min(1).max(200),
  quantity: z.string().max(100).nullable().optional(),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; pkgId: string }> },
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin } = auth;

  const { pkgId } = await ctx.params;
  const raw = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { count } = await admin
    .from('proposal_deliverables')
    .select('id', { count: 'exact', head: true })
    .eq('package_id', pkgId);

  const { data, error } = await admin
    .from('proposal_deliverables')
    .insert({
      package_id: pkgId,
      name: parsed.data.name,
      quantity: parsed.data.quantity ?? null,
      sort_order: count ?? 0,
    })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
