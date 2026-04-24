import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/revenue/auth';
import { syncMetaAdSpendForClient } from '@/lib/meta-ads/spend-sync';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  meta_ad_account_id: z.string().regex(/^(act_)?\d+$/).nullable(),
  sync_now: z.boolean().optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin } = auth;

  const { id } = await ctx.params;
  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const normalizedId = parsed.data.meta_ad_account_id?.replace(/^act_/, '') ?? null;

  const { error } = await admin
    .from('clients')
    .update({ meta_ad_account_id: normalizedId })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (parsed.data.sync_now && normalizedId) {
    const result = await syncMetaAdSpendForClient(id, admin);
    return NextResponse.json({ ok: true, sync: result });
  }
  return NextResponse.json({ ok: true });
}
