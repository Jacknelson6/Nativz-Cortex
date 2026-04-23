/**
 * Pull full historical analytics for every active client with social profiles.
 *
 * Why: the nightly cron only syncs the last 7 days for clients that already
 * have snapshots. Anything further back that Zernio still holds but we never
 * fetched stays missing. This script asks Zernio for a wide window (default
 * 365 days) per profile and lets the existing upsert path merge whatever
 * comes back.
 *
 * Usage:
 *   npx tsx scripts/backfill-analytics-history.ts              # 365-day lookback
 *   LOOKBACK_DAYS=180 npx tsx scripts/backfill-analytics-history.ts
 *   CLIENT_SLUG=weston-funding npx tsx scripts/backfill-analytics-history.ts
 *
 * After it finishes, re-run migration 150 (or apply it again via Supabase
 * MCP) so the newly ingested rows carry correct followers_change deltas.
 * The ingest path now computes that field on insert, but a recompute is
 * cheap and makes the column authoritative no matter what.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve(import.meta.dirname ?? __dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
  if (!process.env[key]) process.env[key] = value;
}

import { createClient } from '@supabase/supabase-js';
import { syncClientReporting } from '@/lib/reporting/sync';

const LOOKBACK_DAYS = Number(process.env.LOOKBACK_DAYS ?? 365);
const ONLY_SLUG = process.env.CLIENT_SLUG?.trim() || null;

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const today = new Date().toISOString().split('T')[0];
  const start = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  console.log(`[backfill] range ${start} → ${today} (${LOOKBACK_DAYS} days)`);

  let query = supabase
    .from('clients')
    .select('id, name, slug, social_profiles!inner(id)')
    .eq('is_active', true);

  if (ONLY_SLUG) query = query.eq('slug', ONLY_SLUG);

  const { data: clients, error } = await query;
  if (error) {
    console.error('[backfill] failed to load clients:', error);
    process.exit(1);
  }

  if (!clients?.length) {
    console.log('[backfill] no clients with social profiles matched.');
    return;
  }

  console.log(`[backfill] ${clients.length} client(s) to process.\n`);

  let synced = 0;
  let failed = 0;
  const allErrors: Array<{ client: string; error: string }> = [];

  for (const client of clients) {
    const label = `${client.name} (${client.slug})`;
    const started = Date.now();
    process.stdout.write(`[backfill] ${label} … `);
    try {
      const result = await syncClientReporting(client.id, { start, end: today });
      const ms = Date.now() - started;
      if (result.synced) {
        synced++;
        console.log(`ok (${result.platforms.length} platform(s), ${result.postsCount} posts, ${ms}ms)`);
      } else {
        failed++;
        console.log(`skipped — no platforms returned (${ms}ms)`);
      }
      for (const err of result.errors) {
        allErrors.push({ client: label, error: err });
      }
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`failed: ${msg}`);
      allErrors.push({ client: label, error: msg });
    }
  }

  console.log('');
  console.log(`[backfill] complete. synced=${synced} failed=${failed}`);

  if (allErrors.length > 0) {
    console.log(`[backfill] ${allErrors.length} error(s):`);
    for (const e of allErrors) {
      console.log(`  - ${e.client}: ${e.error}`);
    }
  }

  console.log('');
  console.log('Next step: re-apply migration 150 to recompute followers_change.');
  console.log('  supabase/migrations/150_backfill_platform_snapshot_follower_change.sql');
}

main().catch((err) => {
  console.error('[backfill] fatal:', err);
  process.exit(1);
});
