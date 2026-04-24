import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/revenue/auth';
import { dollarsToCents } from '@/lib/format/money';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  client_id: z.string().uuid().nullable().optional(),
  signer_name: z.string().max(200).nullable().optional(),
  signer_email: z.string().email().nullable().optional(),
  signer_title: z.string().max(200).nullable().optional(),
  body_markdown: z.string().optional(),
  scope_statement: z.string().nullable().optional(),
  terms_markdown: z.string().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  total_dollars: z.union([z.number(), z.string()]).nullable().optional(),
  deposit_dollars: z.union([z.number(), z.string()]).nullable().optional(),
  currency: z.string().length(3).optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin } = auth;

  const { id } = await ctx.params;
  const raw = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.client_id !== undefined) patch.client_id = parsed.data.client_id;
  if (parsed.data.signer_name !== undefined) patch.signer_name = parsed.data.signer_name;
  if (parsed.data.signer_email !== undefined) patch.signer_email = parsed.data.signer_email;
  if (parsed.data.signer_title !== undefined) patch.signer_title = parsed.data.signer_title;
  if (parsed.data.body_markdown !== undefined) patch.body_markdown = parsed.data.body_markdown;
  if (parsed.data.scope_statement !== undefined) patch.scope_statement = parsed.data.scope_statement;
  if (parsed.data.terms_markdown !== undefined) patch.terms_markdown = parsed.data.terms_markdown;
  if (parsed.data.expires_at !== undefined) patch.expires_at = parsed.data.expires_at;
  if (parsed.data.currency !== undefined) patch.currency = parsed.data.currency;
  if (parsed.data.total_dollars !== undefined) {
    patch.total_cents =
      parsed.data.total_dollars === null ? null : dollarsToCents(parsed.data.total_dollars as number);
  }
  if (parsed.data.deposit_dollars !== undefined) {
    patch.deposit_cents =
      parsed.data.deposit_dollars === null
        ? null
        : dollarsToCents(parsed.data.deposit_dollars as number);
  }

  const { error } = await admin.from('proposals').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin } = auth;

  const { id } = await ctx.params;

  const { data: proposal } = await admin
    .from('proposals')
    .select('status')
    .eq('id', id)
    .maybeSingle();
  if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (proposal.status !== 'draft' && proposal.status !== 'canceled') {
    return NextResponse.json({ error: 'Can only delete draft or canceled proposals' }, { status: 400 });
  }

  const { error } = await admin.from('proposals').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
