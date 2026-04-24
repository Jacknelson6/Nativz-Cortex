import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/revenue/auth';
import { sendOnboardingEmail } from '@/lib/email/resend';
import { formatCents } from '@/lib/format/money';
import { logLifecycleEvent } from '@/lib/lifecycle/state-machine';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin, userId } = auth;

  const { id } = await ctx.params;

  const { data: invoice, error: invErr } = await admin
    .from('stripe_invoices')
    .select('id, number, client_id, amount_remaining_cents, currency, hosted_invoice_url, status, due_date, clients(name, slug)')
    .eq('id', id)
    .maybeSingle();
  if (invErr || !invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  if (invoice.status !== 'open') return NextResponse.json({ error: 'Invoice is not open' }, { status: 400 });
  if (!invoice.client_id) return NextResponse.json({ error: 'Invoice has no linked client' }, { status: 400 });
  if (!invoice.hosted_invoice_url) {
    return NextResponse.json({ error: 'No hosted invoice URL to link to' }, { status: 400 });
  }

  const { data: contact } = await admin
    .from('contacts')
    .select('email, name')
    .eq('client_id', invoice.client_id)
    .eq('is_primary', true)
    .maybeSingle();
  if (!contact?.email) return NextResponse.json({ error: 'No primary contact email' }, { status: 400 });

  const firstName = (contact.name ?? '').split(' ')[0] || 'there';
  const amount = formatCents(invoice.amount_remaining_cents, invoice.currency);
  const due = invoice.due_date
    ? new Date(invoice.due_date).toLocaleDateString('en-US', { dateStyle: 'long' })
    : null;

  const html = `
    <p>Hi ${firstName},</p>
    <p>Quick reminder — invoice ${invoice.number ? `<strong>#${invoice.number}</strong>` : ''}
    for <strong>${amount}</strong> is still open${due ? ` (due ${due})` : ''}.</p>
    <p><a href="${invoice.hosted_invoice_url}">View and pay invoice →</a></p>
    <p>Let us know if anything's off.</p>
    <p>— Nativz</p>
  `.trim();

  const result = await sendOnboardingEmail({
    to: contact.email,
    subject: `Reminder: invoice ${invoice.number ?? ''} — ${amount}`,
    html,
  });

  await logLifecycleEvent(invoice.client_id, 'invoice.overdue', 'Payment reminder sent', {
    description: result.ok ? undefined : `send failed: ${result.error}`,
    metadata: { invoice_id: invoice.id, to: contact.email },
    actorUserId: userId,
    admin,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
