import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/revenue/auth';
import { dollarsToCents } from '@/lib/format/money';
import { recomputeProposalTotals } from '../route';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  tier: z.string().max(100).nullable().optional(),
  monthly_dollars: z.union([z.number(), z.string()]).nullable().optional(),
  annual_dollars: z.union([z.number(), z.string()]).nullable().optional(),
  setup_dollars: z.union([z.number(), z.string()]).nullable().optional(),
  sort_order: z.number().int().nonnegative().optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; pkgId: string }> },
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin } = auth;

  const { id: proposalId, pkgId } = await ctx.params;
  const raw = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.description !== undefined) patch.description = parsed.data.description;
  if (parsed.data.tier !== undefined) patch.tier = parsed.data.tier;
  if (parsed.data.sort_order !== undefined) patch.sort_order = parsed.data.sort_order;
  for (const [k, destKey] of [
    ['monthly_dollars', 'monthly_cents'],
    ['annual_dollars', 'annual_cents'],
    ['setup_dollars', 'setup_cents'],
  ] as const) {
    if ((parsed.data as Record<string, unknown>)[k] === undefined) continue;
    const v = (parsed.data as Record<string, number | string | null>)[k];
    patch[destKey] = v === null ? null : dollarsToCents(v as number);
  }

  const { error } = await admin
    .from('proposal_packages')
    .update(patch)
    .eq('id', pkgId)
    .eq('proposal_id', proposalId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await recomputeProposalTotals(admin, proposalId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; pkgId: string }> },
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin } = auth;

  const { id: proposalId, pkgId } = await ctx.params;
  const { error } = await admin
    .from('proposal_packages')
    .delete()
    .eq('id', pkgId)
    .eq('proposal_id', proposalId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await recomputeProposalTotals(admin, proposalId);
  return NextResponse.json({ ok: true });
}
