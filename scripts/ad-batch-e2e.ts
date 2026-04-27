/**
 * Ad-generator end-to-end smoke test (no HTTP).
 *
 * Calls `runAdGenerator` directly against a real client + real OpenAI key,
 * streaming events to stdout, then checks `api_usage_logs` for the
 * `ad_image_generation` rows that fired during the run.
 *
 *   npx tsx scripts/ad-batch-e2e.ts
 *
 * Env overrides:
 *   E2E_AD_CLIENT_ID  default Goldback (densest brand profile)
 *   E2E_AD_USER_EMAIL default jack@nativz.io
 *   E2E_AD_PROMPT     default "Create 2 ads for a high-trust audience..."
 *   E2E_AD_COUNT      default 2
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createAdminClient } from '@/lib/supabase/admin';
import { generateReferenceDrivenAdBatch } from '@/lib/ad-creatives/monthly-gift-ads';

const CLIENT_ID = process.env.E2E_AD_CLIENT_ID ?? '202f21a8-e572-4208-816b-63f20e213c96'; // Goldback
const USER_EMAIL = (process.env.E2E_AD_USER_EMAIL ?? 'jack@nativz.io').toLowerCase();
const PROMPT =
  process.env.E2E_AD_PROMPT ??
  'Create direct-response ads aimed at hard-asset investors who already understand sound money. Lead with proof, not slogans.';
const COUNT = Math.max(1, Math.min(5, Number(process.env.E2E_AD_COUNT ?? '2')));

function step(label: string) {
  console.log(`\n── ${label} ──`);
}

async function main() {
  const admin = createAdminClient();
  const startedAt = new Date().toISOString();

  step('Resolve user + client');
  const { data: userRow } = await admin
    .from('users')
    .select('id, email')
    .ilike('email', USER_EMAIL)
    .single<{ id: string; email: string }>();
  if (!userRow) throw new Error(`User not found: ${USER_EMAIL}`);
  const { data: clientRow } = await admin
    .from('clients')
    .select('id, name')
    .eq('id', CLIENT_ID)
    .single<{ id: string; name: string }>();
  if (!clientRow) throw new Error(`Client not found: ${CLIENT_ID}`);
  console.log(`  user    ${userRow.email}`);
  console.log(`  client  ${clientRow.name} (${clientRow.id})`);
  console.log(`  count   ${COUNT}`);
  console.log(`  prompt  ${PROMPT}`);

  step('Run ad generator (legacy deterministic path)');
  const t0 = Date.now();
  const result = await generateReferenceDrivenAdBatch({
    clientId: clientRow.id,
    prompt: PROMPT,
    count: COUNT,
    userId: userRow.id,
    userEmail: userRow.email,
    renderImages: true,
  });
  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);

  step('Result');
  console.log(`  status         ${result.status}`);
  console.log(`  concepts       ${result.concepts.length}`);
  console.log(`  referenceAds   ${result.referenceAds.length}`);
  console.log(`  batchId        ${result.batchId}`);
  console.log(`  elapsed        ${elapsedSec}s`);
  for (const c of result.concepts) {
    const rendered = c.image_storage_path ? '✓' : '✗';
    console.log(`    ${rendered} [${c.slug}] ${c.headline} — ${c.image_storage_path ?? '(no image)'}`);
  }

  step('Usage rows (api_usage_logs)');
  await new Promise((r) => setTimeout(r, 1500)); // give after()/fire-and-forget a beat
  const { data: usageRows } = await admin
    .from('api_usage_logs')
    .select('service, model, feature, cost_usd, total_tokens, metadata, created_at')
    .gte('created_at', startedAt)
    .eq('feature', 'ad_image_generation')
    .order('created_at', { ascending: true });
  const rows = usageRows ?? [];
  if (rows.length === 0) {
    console.log('  ⚠ NO ad_image_generation rows found — usage tracking is broken');
  } else {
    let totalCost = 0;
    for (const r of rows) {
      const cost = Number(r.cost_usd) || 0;
      totalCost += cost;
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const status = meta.status === 'failed' ? 'FAIL' : 'ok  ';
      const cb = (meta.cost_basis as string | undefined) ?? '—';
      console.log(`  ${status}  ${r.model}  $${cost.toFixed(4)}  basis=${cb}  concept=${(meta.concept_id as string | undefined)?.slice(0, 8) ?? '—'}`);
    }
    console.log(`\n  Σ rows=${rows.length}  Σ cost=$${totalCost.toFixed(4)}`);
  }

  step('Done');
  console.log(`  Open in admin: http://localhost:3001/admin/ads/${clientRow.id}`);
}

main().catch((err) => {
  console.error('\n✗ Ad batch E2E crashed:', err);
  process.exit(1);
});
