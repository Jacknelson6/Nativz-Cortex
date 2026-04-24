import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/revenue/auth';
import { recomputeClientMrr } from '@/lib/stripe/subscriptions';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  stripe_customer_id: z.string().regex(/^cus_[A-Za-z0-9]+$/).nullable(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin } = auth;

  const { id } = await ctx.params;
  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { stripe_customer_id } = parsed.data;

  const { error: clientErr } = await admin
    .from('clients')
    .update({ stripe_customer_id })
    .eq('id', id);
  if (clientErr) return NextResponse.json({ error: clientErr.message }, { status: 500 });

  if (stripe_customer_id) {
    await admin
      .from('stripe_customers')
      .update({ client_id: id })
      .eq('id', stripe_customer_id);

    await admin
      .from('stripe_invoices')
      .update({ client_id: id })
      .eq('customer_id', stripe_customer_id);

    await admin
      .from('stripe_subscriptions')
      .update({ client_id: id })
      .eq('customer_id', stripe_customer_id);

    await admin
      .from('stripe_charges')
      .update({ client_id: id })
      .eq('customer_id', stripe_customer_id);

    await recomputeClientMrr(id, admin);
  }

  return NextResponse.json({ ok: true });
}
