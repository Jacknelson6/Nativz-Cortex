import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/revenue/auth';
import { dollarsToCents } from '@/lib/format/money';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  tier: z.string().max(100).nullable().optional(),
  monthly_dollars: z.union([z.number(), z.string()]).optional(),
  annual_dollars: z.union([z.number(), z.string()]).optional(),
  setup_dollars: z.union([z.number(), z.string()]).optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin } = auth;

  const { id: proposalId } = await ctx.params;
  const raw = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { count } = await admin
    .from('proposal_packages')
    .select('id', { count: 'exact', head: true })
    .eq('proposal_id', proposalId);
  const nextOrder = count ?? 0;

  const row = {
    proposal_id: proposalId,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    tier: parsed.data.tier ?? null,
    monthly_cents: parsed.data.monthly_dollars !== undefined ? dollarsToCents(parsed.data.monthly_dollars as number) : null,
    annual_cents: parsed.data.annual_dollars !== undefined ? dollarsToCents(parsed.data.annual_dollars as number) : null,
    setup_cents: parsed.data.setup_dollars !== undefined ? dollarsToCents(parsed.data.setup_dollars as number) : null,
    sort_order: nextOrder,
  };

  const { data, error } = await admin.from('proposal_packages').insert(row).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await recomputeProposalTotals(admin, proposalId);
  return NextResponse.json({ id: data.id });
}

export async function recomputeProposalTotals(
  admin: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>,
  proposalId: string,
): Promise<void> {
  const { data: pkgs } = await admin
    .from('proposal_packages')
    .select('monthly_cents, annual_cents, setup_cents')
    .eq('proposal_id', proposalId);

  let total = 0;
  for (const p of pkgs ?? []) {
    total += (p.setup_cents ?? 0) + (p.monthly_cents ?? 0);
  }
  await admin.from('proposals').update({ total_cents: total }).eq('id', proposalId);
}
