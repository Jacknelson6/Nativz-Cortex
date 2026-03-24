/**
 * End-to-end: build 200-ad JSON → Gemini PNGs on Desktop → import into Supabase.
 *
 * Run from repo root:
 *   npx tsx scripts/pipeline-goldback-idaho-gtm-200.ts
 *
 * Requires `.env.local`:
 *   GOOGLE_AI_STUDIO_KEY
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional env:
 *   GOLDBACK_PIPELINE_ROOT — absolute folder for this run (default: ~/Desktop/Goldback-Idaho-GTM-200-run-<stamp>)
 *   GOLDBACK_SKIP_GENERATE=1 — reuse existing 200-ads.generated.json in pipeline root
 *   GOLDBACK_SKIP_GEMINI=1 — skip image gen (import only)
 *   GOLDBACK_SKIP_IMPORT=1 — skip Supabase upload
 *   GOLDBACK_CONCURRENCY — Gemini pool size (default 3, max 5)
 *   GOLDBACK_CLIENT_ID / GOLDBACK_CLIENT_SLUG — import target (see import-goldback-nano-ads-to-client.ts)
 *   GOLDBACK_BRAND_DNA_FILE — brand DNA path for Gemini
 *   GOLDBACK_PIPELINE_ZIP=1 — zip the whole run folder to Desktop when finished
 */
import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { homedir } from 'os';

import { loadEnvLocal } from './load-env-local';

const repoRoot = process.cwd();

function runStep(label: string, command: string, args: string[], extraEnv: Record<string, string>): void {
  console.log(`\n=== ${label} ===\n`);
  const r = spawnSync(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
  });
  if (r.error) {
    console.error(r.error);
    process.exit(1);
  }
  if (r.status !== 0) {
    console.error(`Step failed: ${label} (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

function desktopPath(rel: string): string {
  return resolve(homedir(), 'Desktop', rel);
}

function main(): void {
  loadEnvLocal();

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const defaultRoot = desktopPath(`Goldback-Idaho-GTM-200-run-${stamp}`);
  const pipelineRoot = (process.env.GOLDBACK_PIPELINE_ROOT?.trim() || defaultRoot).replace(/^~(?=\/)/, homedir());
  const pngDir = join(pipelineRoot, 'generated-png');
  const adsJson = join(pipelineRoot, '200-ads.generated.json');

  const skipGen = process.env.GOLDBACK_SKIP_GENERATE === '1';
  const skipGemini = process.env.GOLDBACK_SKIP_GEMINI === '1';
  const skipImport = process.env.GOLDBACK_SKIP_IMPORT === '1';
  const doZip = process.env.GOLDBACK_PIPELINE_ZIP === '1';

  mkdirSync(pipelineRoot, { recursive: true });
  mkdirSync(pngDir, { recursive: true });

  if (!skipGen) {
    runStep(
      'Generate 200-ad JSON + overrides',
      'npx',
      ['tsx', 'scripts/generate-goldback-idaho-gtm-200.ts'],
      { GOLDBACK_IDGT_OUT_DIR: pipelineRoot },
    );
  } else if (!existsSync(adsJson)) {
    console.error(`GOLDBACK_SKIP_GENERATE=1 but missing ${adsJson}`);
    process.exit(1);
  }

  if (!existsSync(adsJson)) {
    console.error(`Missing ads JSON: ${adsJson}`);
    process.exit(1);
  }

  if (!skipGemini) {
    if (!process.env.GOOGLE_AI_STUDIO_KEY?.trim()) {
      console.error('Missing GOOGLE_AI_STUDIO_KEY in .env.local (required for Gemini).');
      process.exit(1);
    }
    runStep(
      'Gemini: render 200 PNGs to Desktop',
      'npx',
      ['tsx', 'scripts/nano-banana-goldback-gemini-batch.ts'],
      {
        GOLDBACK_ADS_JSON: adsJson,
        GOLDBACK_OUT_DIR: pngDir,
      },
    );
  }

  if (!skipImport) {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
      process.exit(1);
    }
    runStep(
      'Import PNGs + copy into Supabase',
      'npx',
      ['tsx', 'scripts/import-goldback-nano-ads-to-client.ts'],
      {
        GOLDBACK_IMPORT_DIR: pngDir,
        GOLDBACK_ADS_JSON: adsJson,
      },
    );
  }

  const summary = [
    'Goldback Idaho GTM — pipeline complete',
    '',
    `Run folder: ${pipelineRoot}`,
    `Ads JSON:   ${adsJson}`,
    `PNG folder: ${pngDir}`,
    '',
    skipGen ? 'Skipped JSON generation (used existing 200-ads.generated.json).' : 'Generated fresh 200-ad JSON + overrides.',
    skipGemini ? 'Skipped Gemini (no new PNGs this run).' : 'Rendered PNGs under generated-png/ on your Desktop.',
    skipImport ? 'Skipped Supabase import.' : 'Imported creatives into Supabase (ad_creatives + storage).',
    '',
    `Finished: ${new Date().toISOString()}`,
  ].join('\n');

  writeFileSync(join(pipelineRoot, 'PIPELINE-SUMMARY.txt'), summary);
  console.log(`\n${summary}\n`);

  if (doZip) {
    const zipName = `Goldback-Idaho-GTM-200-run-${stamp}.zip`;
    const zipPath = desktopPath(zipName);
    console.log(`\n=== Zip archive → ${zipPath} ===\n`);
    const z = spawnSync('zip', ['-r', '-q', zipPath, basename(pipelineRoot)], {
      cwd: dirname(pipelineRoot) || '.',
      stdio: 'inherit',
    });
    if (z.status !== 0) {
      console.warn('[pipeline] zip failed (install zip CLI or skip GOLDBACK_PIPELINE_ZIP)');
    } else {
      console.log(`Wrote ${zipPath}`);
    }
  }
}

main();
