import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendOnboardingEmail } from '@/lib/email/resend';
import { formatCents } from '@/lib/format/money';

type AdminClient = SupabaseClient;

type InvoiceRow = {
  id: string;
  client_id: string | null;
  number: string | null;
  amount_paid_cents: number;
  amount_due_cents: number;
  currency: string;
  hosted_invoice_url: string | null;
  status: string;
};

export type LifecycleEventType =
  | 'contract.sent'
  | 'contract.signed'
  | 'contract.voided'
  | 'invoice.created'
  | 'invoice.paid'
  | 'invoice.overdue'
  | 'invoice.voided'
  | 'subscription.created'
  | 'subscription.updated'
  | 'subscription.canceled'
  | 'onboarding.advanced'
  | 'kickoff.scheduled'
  | 'kickoff.completed'
  | 'ad_spend.recorded';

export async function logLifecycleEvent(
  clientId: string,
  type: LifecycleEventType,
  title: string,
  opts: {
    description?: string;
    metadata?: Record<string, unknown>;
    stripeEventId?: string;
    actorUserId?: string;
    admin?: AdminClient;
  } = {},
): Promise<void> {
  const admin = opts.admin ?? createAdminClient();
  const { error } = await admin.from('client_lifecycle_events').insert({
    client_id: clientId,
    type,
    title,
    description: opts.description ?? null,
    metadata: opts.metadata ?? {},
    stripe_event_id: opts.stripeEventId ?? null,
    actor_user_id: opts.actorUserId ?? null,
  });
  if (error) console.error('[lifecycle] logLifecycleEvent failed:', error.message);
}

async function notifyAdmins(
  admin: AdminClient,
  type:
    | 'payment_received'
    | 'invoice_overdue'
    | 'contract_signed'
    | 'subscription_created'
    | 'subscription_canceled',
  title: string,
  message: string,
): Promise<void> {
  const { data: admins } = await admin
    .from('users')
    .select('id')
    .or('role.eq.admin,role.eq.super_admin,is_super_admin.eq.true');
  if (!admins?.length) return;
  const rows = admins.map((u) => ({
    user_id: u.id,
    type,
    title,
    message,
    read: false,
  }));
  const { error } = await admin.from('notifications').insert(rows);
  if (error) console.error('[lifecycle] notifyAdmins failed:', error.message);
}

export async function onInvoicePaid(
  invoice: InvoiceRow,
  opts: { stripeEventId?: string; admin?: AdminClient } = {},
): Promise<void> {
  const admin = opts.admin ?? createAdminClient();
  if (!invoice.client_id) return;

  const clientId = invoice.client_id;
  const { data: client } = await admin
    .from('clients')
    .select('id, name, slug, lifecycle_state')
    .eq('id', clientId)
    .maybeSingle();
  if (!client) return;

  const amount = formatCents(invoice.amount_paid_cents, invoice.currency);
  const numberTag = invoice.number ? `#${invoice.number}` : '(unnumbered)';

  await logLifecycleEvent(clientId, 'invoice.paid', `Invoice ${numberTag} paid — ${amount}`, {
    metadata: { invoice_id: invoice.id },
    stripeEventId: opts.stripeEventId,
    admin,
  });

  await notifyAdmins(
    admin,
    'payment_received',
    `${client.name}: invoice ${numberTag} paid`,
    `${amount} received.`,
  );

  const { data: contract } = await admin
    .from('client_contracts')
    .select('id, deposit_invoice_id, status')
    .eq('client_id', clientId)
    .eq('deposit_invoice_id', invoice.id)
    .maybeSingle();

  if (contract || client.lifecycle_state === 'contracted') {
    await admin.from('clients').update({ lifecycle_state: 'paid_deposit' }).eq('id', clientId);
    await logLifecycleEvent(clientId, 'onboarding.advanced', 'Deposit paid — moved to onboarding', {
      admin,
    });
  }

  await advanceFirstOnboardingPhase(clientId, admin);
  await queueKickoffEmail(clientId, client.slug, admin);
}

async function advanceFirstOnboardingPhase(clientId: string, admin: AdminClient): Promise<void> {
  const { data: tracker } = await admin
    .from('onboarding_trackers')
    .select('id, status')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .order('started_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!tracker) return;

  const { data: firstPhase } = await admin
    .from('onboarding_phases')
    .select('id, status, sort_order')
    .eq('tracker_id', tracker.id)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!firstPhase) return;

  if (firstPhase.status === 'not_started') {
    await admin
      .from('onboarding_phases')
      .update({ status: 'in_progress' })
      .eq('id', firstPhase.id);
    await logLifecycleEvent(clientId, 'onboarding.advanced', 'Onboarding phase 1 started', {
      metadata: { tracker_id: tracker.id, phase_id: firstPhase.id },
      admin,
    });
  }
}

async function queueKickoffEmail(
  clientId: string,
  clientSlug: string,
  admin: AdminClient,
): Promise<void> {
  const { data: contact } = await admin
    .from('contacts')
    .select('email, name')
    .eq('client_id', clientId)
    .eq('is_primary', true)
    .maybeSingle();
  if (!contact?.email) return;

  const { data: template } = await admin
    .from('onboarding_email_templates')
    .select('subject, body')
    .eq('name', 'kickoff_invitation')
    .maybeSingle();
  if (!template) return;

  const { data: client } = await admin
    .from('clients')
    .select('name')
    .eq('id', clientId)
    .maybeSingle();

  const firstName = (contact.name ?? '').split(' ')[0] || 'there';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cortex.nativz.io';
  const kickoffUrl = `${appUrl}/admin/clients/${clientSlug}/onboarding`;

  const body = (template.body as string)
    .replaceAll('{{contact_first_name}}', firstName)
    .replaceAll('{{client_name}}', client?.name ?? 'your brand')
    .replaceAll('{{kickoff_url}}', kickoffUrl);

  const result = await sendOnboardingEmail({
    to: contact.email,
    subject: template.subject as string,
    html: body,
    agency: 'nativz',
  });

  await logLifecycleEvent(clientId, 'kickoff.scheduled', 'Kickoff email sent to client', {
    description: result.ok ? undefined : `send failed: ${result.error}`,
    metadata: { to: contact.email, resend_id: result.ok ? result.id : null },
    admin,
  });
}

export async function onInvoiceOverdue(
  invoice: InvoiceRow,
  admin: AdminClient = createAdminClient(),
): Promise<void> {
  if (!invoice.client_id) return;
  const { data: client } = await admin
    .from('clients')
    .select('name')
    .eq('id', invoice.client_id)
    .maybeSingle();
  if (!client) return;
  const amount = formatCents(invoice.amount_due_cents, invoice.currency);

  await logLifecycleEvent(
    invoice.client_id,
    'invoice.overdue',
    `Invoice ${invoice.number ?? ''} is overdue`,
    { metadata: { invoice_id: invoice.id }, admin },
  );

  await notifyAdmins(
    admin,
    'invoice_overdue',
    `${client.name}: invoice overdue`,
    `${amount} overdue — follow up.`,
  );
}

export async function onSubscriptionCreated(
  subId: string,
  clientId: string | null,
  admin: AdminClient = createAdminClient(),
): Promise<void> {
  if (!clientId) return;
  await logLifecycleEvent(clientId, 'subscription.created', 'Subscription started', {
    metadata: { subscription_id: subId },
    admin,
  });
  await notifyAdmins(admin, 'subscription_created', 'New subscription started', `Sub ${subId}`);
}

export async function onSubscriptionCanceled(
  subId: string,
  clientId: string | null,
  admin: AdminClient = createAdminClient(),
): Promise<void> {
  if (!clientId) return;
  await logLifecycleEvent(clientId, 'subscription.canceled', 'Subscription canceled', {
    metadata: { subscription_id: subId },
    admin,
  });
  await notifyAdmins(admin, 'subscription_canceled', 'Subscription canceled', `Sub ${subId}`);
}

