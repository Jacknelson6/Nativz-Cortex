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
  | 'onboarding.completed'
  | 'kickoff.scheduling_created'
  | 'kickoff.scheduled'
  | 'kickoff.completed'
  | 'ad_spend.recorded'
  | 'proposal.sent'
  | 'proposal.viewed'
  | 'proposal.signed'
  | 'proposal.paid'
  | 'proposal.expired';

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

// notifyAdmins moved to lib/lifecycle/notify.ts — shared with proposal sign flow.
// Re-export for existing call sites inside this module.
import { notifyAdmins as notifyAdminsShared, type NotificationType } from './notify';

async function notifyAdmins(
  admin: AdminClient,
  type: NotificationType,
  title: string,
  message: string,
): Promise<void> {
  await notifyAdminsShared(admin, type, title, { message });
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

  await queueKickoffEmail(clientId, client.slug, admin);
}

// `advanceFirstOnboardingPhase` lived here under the legacy
// onboarding_trackers + onboarding_phases world to flip phase 1 from
// not_started → in_progress on deposit paid. The unified `onboardings`
// table starts every new row in `in_progress` from creation, so there
// is nothing to advance here anymore. Removed during the onboarding
// rebuild; if a deposit-driven trigger ever needs to mutate onboarding
// state, do it against the `onboardings` row directly.

async function queueKickoffEmail(
  clientId: string,
  clientSlug: string,
  admin: AdminClient,
): Promise<void> {
  // One-shot guard — once a kickoff email has been sent for this client,
  // never send it again on a later invoice.paid. Monthly retainer clients
  // would otherwise get the "welcome, let's schedule kickoff" email every
  // billing cycle. See migration 160 for kickoff_email_sent_at column.
  const { data: client } = await admin
    .from('clients')
    .select('name, kickoff_email_sent_at')
    .eq('id', clientId)
    .maybeSingle();
  if (client?.kickoff_email_sent_at) return;

  const { data: contact } = await admin
    .from('contacts')
    .select('email, name')
    .eq('client_id', clientId)
    .eq('is_primary', true)
    .maybeSingle();
  if (!contact?.email) return;

  // Inline kickoff template. The legacy `onboarding_email_templates`
  // table is being dropped in the v2 cleanup migration; the body lives
  // here so the lifecycle webhook is self-contained and version-bumps
  // don't require an out-of-band DB seed.
  const firstName = (contact.name ?? '').split(' ')[0] || 'there';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cortex.nativz.io';
  const kickoffUrl = `${appUrl}/admin/clients/${clientSlug}/onboarding`;
  const brandName = client?.name ?? 'your brand';
  const subject = `Welcome to Nativz, ${brandName}`;
  const body = `<p>Hi ${firstName}, thanks for signing with ${brandName}. Schedule your kickoff call here: <a href="${kickoffUrl}">${kickoffUrl}</a></p>`;

  const result = await sendOnboardingEmail({
    to: contact.email,
    subject,
    html: body,
    agency: 'nativz',
  });

  if (result.ok) {
    await admin
      .from('clients')
      .update({ kickoff_email_sent_at: new Date().toISOString() })
      .eq('id', clientId);
  }

  await logLifecycleEvent(clientId, 'kickoff.scheduled', 'Kickoff email sent to client', {
    description: result.ok ? undefined : `send failed: ${result.error}`,
    metadata: { to: contact.email, resend_id: result.ok ? result.id : null },
    admin,
  });
}

export async function onInvoiceSent(
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
  const tag = invoice.number ? `#${invoice.number}` : '(unnumbered)';

  await logLifecycleEvent(invoice.client_id, 'invoice.created', `Invoice ${tag} sent — ${amount}`, {
    metadata: { invoice_id: invoice.id },
    admin,
  });
  await notifyAdmins(
    admin,
    'invoice_sent',
    `${client.name}: invoice ${tag} sent`,
    `${amount} invoiced.`,
  );
}

export async function onInvoiceDueSoon(
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
  const tag = invoice.number ? `#${invoice.number}` : '(unnumbered)';

  await logLifecycleEvent(invoice.client_id, 'invoice.created', `Invoice ${tag} due soon`, {
    description: `Reminder — ${amount} due for ${client.name}.`,
    metadata: { invoice_id: invoice.id, kind: 'due_soon' },
    admin,
  });
  await notifyAdmins(
    admin,
    'invoice_due_soon',
    `${client.name}: invoice ${tag} due soon`,
    `${amount} due — consider sending a reminder.`,
  );
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

export async function onSubscriptionPaused(
  subId: string,
  clientId: string | null,
  admin: AdminClient = createAdminClient(),
): Promise<void> {
  if (!clientId) return;
  const { data: client } = await admin
    .from('clients')
    .select('name')
    .eq('id', clientId)
    .maybeSingle();
  await logLifecycleEvent(clientId, 'subscription.updated', 'Subscription paused', {
    metadata: { subscription_id: subId, kind: 'paused' },
    admin,
  });
  await notifyAdmins(
    admin,
    'subscription_paused',
    `${client?.name ?? 'Client'}: subscription paused`,
    'Work should stop until it resumes — check with the client.',
  );
}

export async function onSubscriptionResumed(
  subId: string,
  clientId: string | null,
  admin: AdminClient = createAdminClient(),
): Promise<void> {
  if (!clientId) return;
  const { data: client } = await admin
    .from('clients')
    .select('name, lifecycle_state')
    .eq('id', clientId)
    .maybeSingle();
  await logLifecycleEvent(clientId, 'subscription.updated', 'Subscription resumed', {
    metadata: { subscription_id: subId, kind: 'resumed' },
    admin,
  });
  if (client?.lifecycle_state === 'churned') {
    await admin.from('clients').update({ lifecycle_state: 'active' }).eq('id', clientId);
  }
  await notifyAdmins(
    admin,
    'subscription_resumed',
    `${client?.name ?? 'Client'}: subscription resumed`,
    'Work can resume — pick back up where we left off.',
  );
}

export async function onSubscriptionUpdated(
  subId: string,
  clientId: string | null,
  summary: string,
  admin: AdminClient = createAdminClient(),
): Promise<void> {
  if (!clientId) return;
  const { data: client } = await admin
    .from('clients')
    .select('name')
    .eq('id', clientId)
    .maybeSingle();
  await logLifecycleEvent(clientId, 'subscription.updated', `Subscription updated: ${summary}`, {
    metadata: { subscription_id: subId },
    admin,
  });
  await notifyAdmins(
    admin,
    'subscription_updated',
    `${client?.name ?? 'Client'}: subscription updated`,
    summary,
  );
}

