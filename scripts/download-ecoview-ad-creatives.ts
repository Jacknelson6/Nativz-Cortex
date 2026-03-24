/**
 * Download all ad_creatives image files for the EcoView client to a folder on your Desktop.
 *
 *   npx tsx scripts/download-ecoview-ad-creatives.ts
 *   DOWNLOAD_OUT_DIR=~/Desktop/my-folder CLIENT_ID=<uuid> npx tsx scripts/download-ecoview-ad-creatives.ts
 */
import { loadEnvLocal } from './load-env-local';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  downloadClientAdCreativesToFolder,
  expandHomeDir,
} from './download-client-ad-creatives-core';

const DEFAULT_ECOVIEW_CLIENT_ID = '724c4a91-915f-4a81-bca2-64219f66e87c';

async function main(): Promise<void> {
  loadEnvLocal();
  const clientId =
    process.env.CLIENT_ID?.trim() ||
    process.env.ECOVIEW_CLIENT_ID?.trim() ||
    process.env.NANO_META_CLIENT_ID?.trim() ||
    DEFAULT_ECOVIEW_CLIENT_ID;

  const stamp = new Date().toISOString().slice(0, 10);
  const outDir = expandHomeDir(
    process.env.DOWNLOAD_OUT_DIR?.trim() || `~/Desktop/EcoView-ad-creatives-${stamp}`,
  );

  const admin = createAdminClient();
  const { ok, total, clientName } = await downloadClientAdCreativesToFolder(admin, clientId, outDir);

  if (total === 0) {
    console.log(`[download-ecoview] No ad_creatives for ${clientName ?? clientId}`);
    return;
  }

  console.log(`[download-ecoview] client: ${clientName} (${clientId})`);
  console.log(`[download-ecoview] ${total} creative(s) → ${outDir}`);
  console.log(`[download-ecoview] done: ${ok}/${total} files in ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
