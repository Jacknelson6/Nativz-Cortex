/**
 * EcoView: delete all global (Nano Banana) ad creatives, then queue a fresh Meta mix batch.
 *
 * Prerequisites:
 *   - Brand DNA ready for the client (`brand_guideline` row). Run Admin → Brand DNA from the live site URL first.
 *   - If `clients.website_url` should match production, set it in Admin; if the URL changed, regenerate Brand DNA for that URL before running this script.
 *
 * Usage:
 *   npx tsx scripts/ecoview-regenerate-nano-ads.ts
 *   NANO_META_AD_COUNT=50 NANO_META_DRY_RUN=1 npx tsx scripts/ecoview-regenerate-nano-ads.ts   # no DB writes
 *   ECOVIEW_DELETE_ONLY=1 npx tsx scripts/ecoview-regenerate-nano-ads.ts   # delete global ads only, no new batch
 *   ECOVIEW_DOWNLOAD_DESKTOP=0 …   # skip saving PNGs to ~/Desktop after generation (default: download runs)
 *   DOWNLOAD_OUT_DIR=~/Desktop/my-folder …   # override output folder
 *
 * Same env as `scripts/queue-nano-meta-batch.ts` for batch sizing and copy defaults.
 */
import { loadEnvLocal } from './load-env-local';
import {
  downloadClientAdCreativesToFolder,
  expandHomeDir,
} from './download-client-ad-creatives-core';
import { createAdminClient } from '@/lib/supabase/admin';
import { runGenerationBatch } from '@/lib/ad-creatives/orchestrate-batch';
import { buildNanoMetaBatchPayload } from '@/lib/ad-creatives/nano-meta-cli';
import { deleteGlobalNanoAdCreativesForClient } from '@/lib/ad-creatives/delete-global-nano-creatives';
import { getBrandContext } from '@/lib/knowledge/brand-context';
import { assertBrandDnaGuidelineForAdGeneration } from '@/lib/ad-creatives/require-brand-dna-for-generation';
import { normalizeWebsiteUrl } from '@/lib/utils/normalize-website-url';

const DEFAULT_ECOVIEW_CLIENT_ID = '724c4a91-915f-4a81-bca2-64219f66e87c';

async function main(): Promise<void> {
  loadEnvLocal();

  const dryRun =
    process.env.NANO_META_DRY_RUN === '1' ||
    process.argv.includes('--dry-run');
  const deleteOnly = process.env.ECOVIEW_DELETE_ONLY === '1';

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

  const admin = createAdminClient();

  const { data: crow, error: crowErr } = await admin
    .from('clients')
    .select('id, name, website_url')
    .eq('id', clientId)
    .single();

  if (crowErr || !crow) {
    console.error('[ecoview-regenerate] client not found:', crowErr?.message ?? clientId);
    process.exit(1);
  }

  console.log('[ecoview-regenerate] client:', crow.name ?? crow.id);

  const brandContext = await getBrandContext(clientId, { bypassCache: true });
  assertBrandDnaGuidelineForAdGeneration(brandContext);
  console.log('[ecoview-regenerate] Brand DNA guideline OK.');

  const dbUrl = crow.website_url ? normalizeWebsiteUrl(crow.website_url) : '';
  const cfgUrl = normalizeWebsiteUrl(brandUrl);
  if (dbUrl && cfgUrl && dbUrl !== cfgUrl) {
    console.warn(
      '[ecoview-regenerate] WARNING: client website_url (%s) differs from NANO_META_BRAND_URL (%s). ' +
        'Update the client URL in Admin and refresh Brand DNA for the correct site before relying on prompts.',
      dbUrl,
      cfgUrl,
    );
  }

  if (dryRun) {
    const { count } = await admin
      .from('ad_creatives')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('template_source', 'global');
    console.log('[ecoview-regenerate] dry run — would delete %s global (Nano) creatives', String(count ?? 0));
    console.log(
      '[ecoview-regenerate] dry run — would queue batch brandUrl=%s ads=%s',
      brandUrl,
      process.env.NANO_META_AD_COUNT ?? '50',
    );
    return;
  }

  const del = await deleteGlobalNanoAdCreativesForClient(admin, clientId);
  console.log('[ecoview-regenerate] deleted global Nano creatives:', del.deletedCount);

  if (deleteOnly) {
    console.log('[ecoview-regenerate] ECOVIEW_DELETE_ONLY=1 — skipping new batch.');
    return;
  }

  const placeholderBrandColors = brandContext.fromGuideline
    ? brandContext.visualIdentity.colors
        .map((c) => c.hex)
        .filter((h) => typeof h === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(h))
        .slice(0, 4)
    : undefined;

  const { config, placeholderConfig, resolvedAdCount } = buildNanoMetaBatchPayload({
    adCount: Number(process.env.NANO_META_AD_COUNT ?? '50'),
    brandUrl,
    productService,
    offer,
    batchCta: process.env.NANO_META_BATCH_CTA?.trim(),
    placeholderBrandColors,
  });

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
    console.error('[ecoview-regenerate] batch insert failed:', batchErr?.message);
    process.exit(1);
  }

  console.log('[ecoview-regenerate] batch', batch.id, '— running generation (long-running)…');
  await runGenerationBatch(batch.id);
  console.log('[ecoview-regenerate] done:', batch.id);

  if (process.env.ECOVIEW_DOWNLOAD_DESKTOP === '0') {
    console.log('[ecoview-regenerate] ECOVIEW_DOWNLOAD_DESKTOP=0 — skipping Desktop download.');
    return;
  }

  const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(/:/g, '-');
  const outDir = expandHomeDir(
    process.env.DOWNLOAD_OUT_DIR?.trim() || `~/Desktop/EcoView-ad-creatives-${stamp}`,
  );
  console.log('[ecoview-regenerate] downloading creatives to', outDir, '…');
  const { ok, total, clientName } = await downloadClientAdCreativesToFolder(admin, clientId, outDir);
  if (total === 0) {
    console.log('[ecoview-regenerate] download: no ad_creatives rows (check batch status / failures).');
  } else {
    console.log(
      `[ecoview-regenerate] download: ${ok}/${total} file(s) for ${clientName ?? clientId} → ${outDir}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
