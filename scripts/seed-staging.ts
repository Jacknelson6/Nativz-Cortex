#!/usr/bin/env tsx
/**
 * Seed script for local QA + staging.
 *
 *   npx dotenv -e .env.local -- tsx scripts/seed-staging.ts
 *
 * Creates three fixture clients, one contact each, and one proposal per
 * status state. Idempotent — re-running reseeds without duplication.
 *
 * Does NOT touch live Stripe. If STRIPE_SECRET_KEY starts with `sk_test_`,
 * the script will also seed fake Stripe customers; otherwise it skips
 * Stripe and just populates the Cortex side.
 *
 * Fixture emails use gmail plus-addressing so a single real inbox can
 * receive them during QA. Override with SEED_EMAIL_PREFIX if needed.
 */

import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: resolve(process.cwd(), '.env.local') });

const SEED_EMAIL = process.env.SEED_EMAIL_PREFIX ?? 'qa';

const FIXTURE_CLIENTS = [
  { id: '00000000-0000-4000-a000-000000000001', slug: 'fixture-a', name: 'Fixture A (active)' },
  { id: '00000000-0000-4000-a000-000000000002', slug: 'fixture-b', name: 'Fixture B (prospect)' },
  { id: '00000000-0000-4000-a000-000000000003', slug: 'fixture-c', name: 'Fixture C (churned)' },
];

const FIXTURE_ORG_ID = '00000000-0000-4000-b000-000000000001';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('[seed] ensuring fixture organization…');
  await supabase.from('organizations').upsert(
    { id: FIXTURE_ORG_ID, name: 'Fixture org', slug: 'fixture-org', type: 'client' },
    { onConflict: 'id' },
  );

  console.log('[seed] upserting fixture clients…');
  for (const c of FIXTURE_CLIENTS) {
    await supabase.from('clients').upsert(
      {
        id: c.id,
        organization_id: FIXTURE_ORG_ID,
        slug: c.slug,
        name: c.name,
        lifecycle_state: c.slug === 'fixture-a' ? 'active' : c.slug === 'fixture-b' ? 'lead' : 'churned',
        is_active: true,
        hide_from_roster: false,
      },
      { onConflict: 'id' },
    );

    await supabase.from('contacts').upsert(
      {
        id: `${c.id.slice(0, -1)}9`,
        client_id: c.id,
        name: `QA ${c.slug}`,
        email: `${SEED_EMAIL}+${c.slug}@gmail.com`,
        is_primary: true,
      },
      { onConflict: 'id' },
    );
  }

  console.log('[seed] upserting one proposal per status…');
  const proposalStates: Array<{
    id: string;
    slug: string;
    title: string;
    status: string;
    client_id: string;
  }> = [
    {
      id: '00000000-0000-4000-c000-000000000001',
      slug: 'fixture-draft-proposal',
      title: 'Fixture: draft proposal',
      status: 'draft',
      client_id: FIXTURE_CLIENTS[0].id,
    },
    {
      id: '00000000-0000-4000-c000-000000000002',
      slug: 'fixture-sent-proposal',
      title: 'Fixture: sent proposal',
      status: 'sent',
      client_id: FIXTURE_CLIENTS[1].id,
    },
    {
      id: '00000000-0000-4000-c000-000000000003',
      slug: 'fixture-signed-proposal',
      title: 'Fixture: signed proposal',
      status: 'signed',
      client_id: FIXTURE_CLIENTS[0].id,
    },
  ];

  for (const p of proposalStates) {
    await supabase.from('proposals').upsert(
      {
        id: p.id,
        slug: p.slug,
        title: p.title,
        status: p.status,
        client_id: p.client_id,
        signer_name: 'QA Signer',
        signer_email: `${SEED_EMAIL}+${p.slug}@gmail.com`,
        body_markdown: '## Summary\n\nFixture proposal for local QA.',
        terms_markdown: '## Terms\n\nStandard month-to-month.',
        total_cents: 150000,
        deposit_cents: 50000,
        currency: 'usd',
        sent_at: p.status !== 'draft' ? new Date().toISOString() : null,
        signed_at: p.status === 'signed' ? new Date().toISOString() : null,
      },
      { onConflict: 'id' },
    );
  }

  console.log('[seed] upserting ad spend rows…');
  const now = new Date();
  for (let monthsBack = 0; monthsBack < 3; monthsBack += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
    const month = d.toISOString().slice(0, 10);
    for (const c of FIXTURE_CLIENTS) {
      await supabase.from('client_ad_spend').upsert(
        {
          client_id: c.id,
          platform: 'meta',
          campaign_label: 'Fixture retainer',
          period_month: month,
          spend_cents: 25000 + monthsBack * 5000,
          source: 'manual',
        },
        { onConflict: 'client_id,platform,campaign_label,period_month' },
      );
    }
  }

  console.log('[seed] upserting lifecycle events for the Activity tab…');
  for (const c of FIXTURE_CLIENTS) {
    await supabase.from('client_lifecycle_events').insert({
      client_id: c.id,
      type: 'contract.signed',
      title: `Fixture ${c.slug}: seed event`,
      description: 'Populated by scripts/seed-staging.ts',
    });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY ?? '';
  if (!stripeKey.startsWith('sk_test_')) {
    console.warn(
      '\n[seed] SKIPPING Stripe seed: STRIPE_SECRET_KEY is not a test key.\n' +
        '       To seed Stripe test-mode customers, set sk_test_... in .env.local and re-run.\n',
    );
  } else {
    console.log('[seed] seeding Stripe test-mode customers…');
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(stripeKey);
    for (const c of FIXTURE_CLIENTS) {
      const customer = await stripe.customers.create({
        email: `${SEED_EMAIL}+${c.slug}@gmail.com`,
        name: c.name,
        metadata: { cortex_client_id: c.id, fixture: 'true' },
      });
      await supabase.from('clients').update({ stripe_customer_id: customer.id }).eq('id', c.id);
    }
  }

  console.log('\n[seed] done.');
  console.log('       Admin:   http://localhost:3001/admin/revenue');
  console.log('       Proposal: http://localhost:3001/proposals/fixture-sent-proposal');
  console.log('       Portal:   http://localhost:3001/portal/billing (needs viewer auth)');
}

main().catch((err) => {
  console.error('[seed] FAILED:', err);
  process.exit(1);
});
