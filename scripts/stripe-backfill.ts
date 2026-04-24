#!/usr/bin/env tsx
/**
 * One-shot Stripe backfill. Pulls all existing customers, subscriptions,
 * invoices, and charges into the Supabase mirror tables.
 *
 *   npx dotenv -e .env.local -- tsx scripts/stripe-backfill.ts [--dry-run]
 */

import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(process.cwd(), '.env.local') });

// Imports below must be lazy so the env is loaded before the Stripe/Supabase
// clients instantiate.
(async () => {
  const { fullSync } = await import('../lib/stripe/backfill');
  const dryRun = process.argv.includes('--dry-run');
  const start = Date.now();
  console.log(`[backfill] starting${dryRun ? ' (dry-run)' : ''}`);
  const counts = await fullSync({ dryRun });
  console.log('[backfill] done:', counts, `in ${Math.round((Date.now() - start) / 1000)}s`);
})().catch((err) => {
  console.error('[backfill] FAILED:', err);
  process.exit(1);
});
