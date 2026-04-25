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

  const { data: existing } = await admin
    .from('proposals')
    .select('status')
    .eq('id', id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!['draft'].includes(existing.status)) {
    return NextResponse.json(
      { error: `Cannot edit a proposal in status '${existing.status}'` },
      { status: 409 },
    );
  }

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

/**
 * Delete a proposal. Allowed for any status EXCEPT `paid` — paid proposals
 * have money tied to them and need to stay in the audit trail. Admins
 * wanting to clean up a paid record should use Stripe + a dedicated
 * accounting flow, not this endpoint.
 *
 * Cleans up downstream: signed/executed PDFs in Storage, proposal_events,
 * and the proposal row itself. The cascade on proposal_events FK already
 * handles event cleanup; we just blast the storage objects manually.
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin } = auth;

  const { id } = await ctx.params;

  const { data: proposal } = await admin
    .from('proposals')
    .select('status, signed_pdf_path, counter_signed_pdf_path')
    .eq('id', id)
    .maybeSingle();
  if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (proposal.status === 'paid') {
    return NextResponse.json(
      { error: 'Cannot delete a paid proposal. Refund + cancel in Stripe first.' },
      { status: 409 },
    );
  }

  // Best-effort PDF cleanup. We don't fail the delete if storage removal
  // hiccups — the row is the source of truth and orphan PDFs are harmless.
  const pathsToRemove = [proposal.signed_pdf_path, proposal.counter_signed_pdf_path].filter(
    (p): p is string => Boolean(p),
  );
  if (pathsToRemove.length > 0) {
    await admin.storage
      .from('proposal-pdfs')
      .remove(pathsToRemove)
      .catch((err) => console.warn('[proposals:delete] storage remove failed', err));
  }

  const { error } = await admin.from('proposals').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
