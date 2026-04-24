import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/revenue/auth';
import { sendProposal } from '@/lib/proposals/send';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin } = auth;

  const { id } = await ctx.params;
  const result = await sendProposal(id, { admin });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true, url: result.url });
}
