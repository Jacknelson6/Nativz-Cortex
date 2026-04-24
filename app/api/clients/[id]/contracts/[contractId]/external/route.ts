import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/revenue/auth';
import { logLifecycleEvent } from '@/lib/lifecycle/state-machine';
import { dollarsToCents } from '@/lib/format/money';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  external_provider: z.enum(['contractkit', 'pandadoc', 'manual']).nullable().optional(),
  external_id: z.string().max(200).nullable().optional(),
  external_url: z.string().url().nullable().optional(),
  sent_at: z.string().datetime().nullable().optional(),
  signed_at: z.string().datetime().nullable().optional(),
  deposit_invoice_id: z.string().regex(/^in_[A-Za-z0-9]+$/).nullable().optional(),
  total_dollars: z.union([z.number(), z.string()]).optional(),
  deposit_dollars: z.union([z.number(), z.string()]).optional(),
  mark: z.enum(['sent', 'signed']).optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; contractId: string }> },
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin, userId } = auth;

  const { id: clientId, contractId } = await ctx.params;

  const { data: contract } = await admin
    .from('client_contracts')
    .select('id, client_id, status')
    .eq('id', contractId)
    .maybeSingle();
  if (!contract || contract.client_id !== clientId) {
    return NextResponse.json({ error: 'Contract not found for this client' }, { status: 404 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (parsed.data.external_provider !== undefined) patch.external_provider = parsed.data.external_provider;
  if (parsed.data.external_id !== undefined) patch.external_id = parsed.data.external_id;
  if (parsed.data.external_url !== undefined) patch.external_url = parsed.data.external_url;
  if (parsed.data.sent_at !== undefined) patch.sent_at = parsed.data.sent_at;
  if (parsed.data.signed_at !== undefined) patch.signed_at = parsed.data.signed_at;
  if (parsed.data.deposit_invoice_id !== undefined) patch.deposit_invoice_id = parsed.data.deposit_invoice_id;
  if (parsed.data.total_dollars !== undefined) patch.total_cents = dollarsToCents(parsed.data.total_dollars as number);
  if (parsed.data.deposit_dollars !== undefined) patch.deposit_cents = dollarsToCents(parsed.data.deposit_dollars as number);

  if (parsed.data.mark === 'sent') {
    patch.sent_at = new Date().toISOString();
  }
  if (parsed.data.mark === 'signed') {
    patch.signed_at = new Date().toISOString();
    patch.status = 'active';
  }

  const { error } = await admin.from('client_contracts').update(patch).eq('id', contractId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (parsed.data.mark === 'signed') {
    await admin
      .from('clients')
      .update({ lifecycle_state: 'contracted' })
      .eq('id', clientId)
      .eq('lifecycle_state', 'lead');
    await logLifecycleEvent(clientId, 'contract.signed', 'Contract marked as signed', {
      metadata: { contract_id: contractId },
      actorUserId: userId,
      admin,
    });
  } else if (parsed.data.mark === 'sent') {
    await logLifecycleEvent(clientId, 'contract.sent', 'Contract marked as sent', {
      metadata: { contract_id: contractId },
      actorUserId: userId,
      admin,
    });
  }

  return NextResponse.json({ ok: true });
}
