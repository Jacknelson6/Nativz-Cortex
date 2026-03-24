/**
 * CLI: queue and run a Nano Banana “Meta performance mix” batch (same pipeline as in-app generate).
 *
 * Brand DNA (`brand_guideline`) is required — same as `POST .../ad-creatives/generate` and `runGenerationBatch`.
 *
 * EcoView shortcut (50 ads, ecoviewdfw.com on the batch record):
 *   npm run ads:ecoview:50
 *
 * Generic:
 *   NANO_META_DRY_RUN=1 npx tsx scripts/queue-nano-meta-batch.ts
 *   npx tsx scripts/queue-nano-meta-batch.ts
 *
 * Env:
 *   NANO_META_CLIENT_ID — Cortex `clients.id` (defaults to EcoView id from import-historical-meetings; verify in Supabase)
 *   NANO_META_AD_COUNT — default 50
 *   NANO_META_BRAND_URL — default https://www.ecoviewdfw.com/
 *   NANO_META_PRODUCT_SERVICE — optional override
 *   NANO_META_OFFER — optional (default mentions financing; keep factual)
 *   NANO_META_DRY_RUN=1 — print config and exit
 *
 * Requires `.env.local`: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, plus the same AI keys as `npm run dev`.
 */
import { loadEnvLocal } from './load-env-local';
import { createAdminClient } from '@/lib/supabase/admin';
import { runGenerationBatch } from '@/lib/ad-creatives/orchestrate-batch';
import { buildNanoMetaBatchPayload } from '@/lib/ad-creatives/nano-meta-cli';
import { getBrandContext } from '@/lib/knowledge/brand-context';
import { assertBrandDnaGuidelineForAdGeneration } from '@/lib/ad-creatives/require-brand-dna-for-generation';

/** From `scripts/import-historical-meetings.ts` — confirm this uuid exists in your `clients` table. */
const DEFAULT_ECOVIEW_CLIENT_ID = '724c4a91-915f-4a81-bca2-64219f66e87c';

async function main(): Promise<void> {
  loadEnvLocal();

  const dryRun =
    process.env.NANO_META_DRY_RUN === '1' ||
    process.argv.includes('--dry-run');

  const clientId =
    process.env.NANO_META_CLIENT_ID?.trim() ||
    process.env.ECOVIEW_CLIENT_ID?.trim() ||
    DEFAULT_ECOVIEW_CLIENT_ID;

  const brandUrl = process.env.NANO_META_BRAND_URL?.trim() || 'https://www.ecoviewdfw.com/';
  const productService =
    process.env.NANO_META_PRODUCT_SERVICE?.trim() ||
    'EcoView Windows & Doors — custom energy-efficient window and door replacement for Texas homeowners (Dallas–Fort Worth, Austin, Waco, Temple). Local family business, expert installation, strong warranties.';
  const offer =
    process.env.NANO_META_OFFER?.trim() ||
    'Limited-time offers may include promotional financing — see site or consultant for current terms.';

  let placeholderBrandColors: string[] | undefined;
  try {
    const brandContext = await getBrandContext(clientId, { bypassCache: true });
    if (!dryRun) assertBrandDnaGuidelineForAdGeneration(brandContext);
    if (brandContext.fromGuideline) {
      placeholderBrandColors = brandContext.visualIdentity.colors
        .map((c) => c.hex)
        .filter((h) => typeof h === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(h))
        .slice(0, 4);
    }
  } catch (e) {
    if (!dryRun) throw e;
    console.warn('[queue-nano-meta-batch] dry run — could not load brand context:', e);
  }

  const { config, placeholderConfig, resolvedAdCount } = buildNanoMetaBatchPayload({
    adCount: Number(process.env.NANO_META_AD_COUNT ?? '50'),
    brandUrl,
    productService,
    offer,
    batchCta: process.env.NANO_META_BATCH_CTA?.trim(),
    placeholderBrandColors,
  });

  console.log('[queue-nano-meta-batch] clientId=%s ads=%d brandUrl=%s', clientId, resolvedAdCount, brandUrl);
  if (dryRun) {
    console.log('[queue-nano-meta-batch] dry run — config:', JSON.stringify(config, null, 2));
    console.log('[queue-nano-meta-batch] dry run — placeholder_config:', JSON.stringify(placeholderConfig, null, 2));
    return;
  }

  const admin = createAdminClient();

  const { data: client, error: clientErr } = await admin.from('clients').select('id, name').eq('id', clientId).single();
  if (clientErr || !client) {
    console.error('[queue-nano-meta-batch] client not found:', clientErr?.message ?? clientId);
    process.exit(1);
  }
  console.log('[queue-nano-meta-batch] client:', client.name ?? client.id);
  console.log('[queue-nano-meta-batch] Brand DNA guideline OK — proceeding.');

  const { data: batch, error: batchErr } = await admin
    .from('ad_generation_batches')
    .insert({
      client_id: clientId,
      status: 'queued',
      config: config as unknown as Record<string, unknown>,
      total_count: resolvedAdCount,
      completed_count: 0,
      failed_count: 0,
      created_by: null,
      placeholder_config: placeholderConfig as unknown as Record<string, unknown>,
    })
    .select('id')
    .single();

  if (batchErr || !batch) {
    console.error('[queue-nano-meta-batch] insert failed:', batchErr?.message);
    process.exit(1);
  }

  console.log('[queue-nano-meta-batch] batch id:', batch.id, '— starting runGenerationBatch (this may take a long time)…');
  await runGenerationBatch(batch.id);
  console.log('[queue-nano-meta-batch] finished batch', batch.id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
