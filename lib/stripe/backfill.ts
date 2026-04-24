import { getStripe } from './client';
import { upsertCustomerFromStripe } from './customers';
import { upsertInvoiceFromStripe } from './invoices';
import { upsertSubscriptionFromStripe } from './subscriptions';
import { upsertChargeFromStripe } from './charges';
import { upsertRefundFromStripe } from './refunds';
import { createAdminClient } from '@/lib/supabase/admin';

type Progress = {
  customers: number;
  invoices: number;
  subscriptions: number;
  charges: number;
  refunds: number;
};

export async function fullSync(opts: { dryRun?: boolean; log?: (msg: string) => void } = {}): Promise<Progress> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const stripe = getStripe();
  const admin = createAdminClient();
  const progress: Progress = { customers: 0, invoices: 0, subscriptions: 0, charges: 0, refunds: 0 };

  log('Syncing customers…');
  for await (const customer of stripe.customers.list({ limit: 100 })) {
    if (!opts.dryRun) await upsertCustomerFromStripe(customer, admin);
    progress.customers += 1;
    if (progress.customers % 100 === 0) log(`  …${progress.customers} customers`);
  }
  log(`  ${progress.customers} customers done.`);

  log('Syncing subscriptions…');
  for await (const sub of stripe.subscriptions.list({ limit: 100, status: 'all' })) {
    if (!opts.dryRun) await upsertSubscriptionFromStripe(sub, admin);
    progress.subscriptions += 1;
    if (progress.subscriptions % 100 === 0) log(`  …${progress.subscriptions} subs`);
  }
  log(`  ${progress.subscriptions} subscriptions done.`);

  log('Syncing invoices…');
  for await (const invoice of stripe.invoices.list({ limit: 100 })) {
    if (!opts.dryRun) await upsertInvoiceFromStripe(invoice, admin);
    progress.invoices += 1;
    if (progress.invoices % 100 === 0) log(`  …${progress.invoices} invoices`);
  }
  log(`  ${progress.invoices} invoices done.`);

  log('Syncing charges…');
  for await (const charge of stripe.charges.list({ limit: 100 })) {
    if (!opts.dryRun) await upsertChargeFromStripe(charge, admin);
    progress.charges += 1;
    if (progress.charges % 100 === 0) log(`  …${progress.charges} charges`);
  }
  log(`  ${progress.charges} charges done.`);

  log('Syncing refunds…');
  for await (const refund of stripe.refunds.list({ limit: 100 })) {
    if (!opts.dryRun) await upsertRefundFromStripe(refund, admin);
    progress.refunds += 1;
    if (progress.refunds % 100 === 0) log(`  …${progress.refunds} refunds`);
  }
  log(`  ${progress.refunds} refunds done.`);

  return progress;
}

export async function syncRecent(sinceSeconds = 48 * 60 * 60): Promise<Progress> {
  const stripe = getStripe();
  const admin = createAdminClient();
  const created = { gte: Math.floor(Date.now() / 1000) - sinceSeconds };
  const progress: Progress = { customers: 0, invoices: 0, subscriptions: 0, charges: 0, refunds: 0 };

  for await (const c of stripe.customers.list({ limit: 100, created })) {
    await upsertCustomerFromStripe(c, admin);
    progress.customers += 1;
  }
  for await (const s of stripe.subscriptions.list({ limit: 100, status: 'all', created })) {
    await upsertSubscriptionFromStripe(s, admin);
    progress.subscriptions += 1;
  }
  for await (const i of stripe.invoices.list({ limit: 100, created })) {
    await upsertInvoiceFromStripe(i, admin);
    progress.invoices += 1;
  }
  for await (const ch of stripe.charges.list({ limit: 100, created })) {
    await upsertChargeFromStripe(ch, admin);
    progress.charges += 1;
  }
  for await (const r of stripe.refunds.list({ limit: 100, created })) {
    await upsertRefundFromStripe(r, admin);
    progress.refunds += 1;
  }

  return progress;
}
