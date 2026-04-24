import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireAdmin } from '@/lib/revenue/auth';

async function isProposalEditable(admin: SupabaseClient, pkgId: string): Promise<boolean> {
  const { data } = await admin
    .from('proposal_packages')
    .select('proposals(status)')
    .eq('id', pkgId)
    .maybeSingle();
  const status = (data?.proposals as { status?: string } | null)?.status;
  return status === 'draft';
}

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  quantity: z.string().max(100).nullable().optional(),
  sort_order: z.number().int().nonnegative().optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ pkgId: string; delId: string }> },
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin } = auth;
  const { pkgId, delId } = await ctx.params;

  const raw = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  if (!(await isProposalEditable(admin, pkgId))) {
    return NextResponse.json({ error: 'Proposal is locked (not in draft).' }, { status: 409 });
  }

  const { error } = await admin
    .from('proposal_deliverables')
    .update(parsed.data)
    .eq('id', delId)
    .eq('package_id', pkgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ pkgId: string; delId: string }> },
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin } = auth;
  const { pkgId, delId } = await ctx.params;

  if (!(await isProposalEditable(admin, pkgId))) {
    return NextResponse.json({ error: 'Proposal is locked (not in draft).' }, { status: 409 });
  }

  const { error } = await admin
    .from('proposal_deliverables')
    .delete()
    .eq('id', delId)
    .eq('package_id', pkgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
