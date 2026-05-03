/**
 * Probe the /deliverables page data path. Re-runs the same six parallel
 * helpers the page does so a runtime exception surfaces in the terminal
 * (the production error boundary swallows the trace).
 *
 * Usage: npx tsx scripts/probe-deliverables-page.ts [client-id]
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

async function main() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const clientId =
    process.argv[2] ??
    (await admin.from('clients').select('id, slug').limit(5).then((r) => r.data?.[0]?.id));
  if (!clientId) throw new Error('No client id provided and no clients found');

  console.log('[probe] clientId:', clientId);

  const { getDeliverableBalances } = await import('../lib/deliverables/get-balances');
  const { getRecentDeliverableActivity } = await import('../lib/deliverables/get-recent-activity');
  const { getDeliverablePipeline } = await import('../lib/deliverables/get-pipeline');
  const { getActiveTier } = await import('../lib/deliverables/get-active-tier');
  const { inferScopeTier } = await import('../lib/deliverables/scope');
  const { getBrandFromAgency } = await import('../lib/agency/detect');
  const { listConfiguredAddons } = await import('../lib/deliverables/addon-skus');

  const tasks: Array<[string, () => Promise<unknown>]> = [
    ['getDeliverableBalances', () => getDeliverableBalances(admin as any, clientId)],
    [
      'getRecentDeliverableActivity',
      () => getRecentDeliverableActivity(admin as any, clientId, { limit: 30 }),
    ],
    ['getDeliverablePipeline', () => getDeliverablePipeline(admin as any, clientId)],
    [
      'credit_transactions',
      () =>
        admin
          .from('credit_transactions')
          .select(
            'id, client_id, deliverable_type_id, kind, delta, charge_unit_kind, charge_unit_id, scheduled_post_id, refund_for_id, share_link_id, reviewer_email, stripe_payment_intent, actor_user_id, note, idempotency_key, created_at',
          )
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(50),
    ],
    [
      'clients.agency',
      () => admin.from('clients').select('agency').eq('id', clientId).maybeSingle(),
    ],
    ['getActiveTier', () => getActiveTier(admin as any, clientId)],
  ];

  for (const [label, run] of tasks) {
    try {
      const start = Date.now();
      const result = await run();
      const ms = Date.now() - start;
      const summary = (() => {
        if (result == null) return 'null';
        if (Array.isArray(result)) return `array(${result.length})`;
        if (typeof result === 'object') {
          const r = result as { data?: unknown; error?: unknown };
          if (r.error)
            return `error: ${typeof r.error === 'object' ? JSON.stringify(r.error) : r.error}`;
          if (r.data !== undefined)
            return Array.isArray(r.data)
              ? `data[${r.data.length}]`
              : `data: ${JSON.stringify(r.data).slice(0, 120)}`;
          return JSON.stringify(result).slice(0, 200);
        }
        return String(result);
      })();
      console.log(`[probe] ✓ ${label} (${ms}ms) → ${summary}`);
    } catch (err) {
      console.error(`[probe] ✗ ${label}`);
      console.error(err);
    }
  }

  // Also exercise inferScopeTier + listConfiguredAddons with the balances result
  try {
    const balances = await getDeliverableBalances(admin as any, clientId);
    const tier = inferScopeTier(balances);
    console.log(`[probe] ✓ inferScopeTier → ${tier.label}`);
    const { data: clientRow } = await admin
      .from('clients')
      .select('agency')
      .eq('id', clientId)
      .maybeSingle<{ agency: string | null }>();
    const agency = getBrandFromAgency(clientRow?.agency ?? null);
    console.log(`[probe] ✓ getBrandFromAgency(${clientRow?.agency}) → ${agency}`);
    const addons = listConfiguredAddons(agency);
    console.log(`[probe] ✓ listConfiguredAddons(${agency}) → ${addons.length} addons`);
  } catch (err) {
    console.error('[probe] ✗ scope/agency/addons synth');
    console.error(err);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
