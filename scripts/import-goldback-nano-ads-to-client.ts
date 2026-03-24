/**
 * Upload local Goldback (Nano Banana) PNG outputs into Supabase for a Cortex client’s ad creatives gallery.
 *
 * The Goldback CLI scripts (`nano-banana-goldback-gemini-batch.ts`, etc.) write only to disk — they do not
 * create `ad_creatives` rows. This script creates a completed batch + one row per PNG under the target client.
 *
 * Usage:
 *   GOLDBACK_IMPORT_DIR=~/Desktop/Goldback-Idaho-Gemini-<stamp> \
 *   GOLDBACK_ADS_JSON=~/Desktop/Goldback-Meta-Top100/100-ads.generated.json \
 *   npx tsx scripts/import-goldback-nano-ads-to-client.ts
 *
 * Or set client explicitly:
 *   GOLDBACK_CLIENT_ID=<uuid> GOLDBACK_IMPORT_DIR=... npx tsx scripts/import-goldback-nano-ads-to-client.ts
 *
 * Env:
 *   GOLDBACK_IMPORT_DIR — folder with manifest.json (optional) and/or NNN-slug.png files (3-digit index, e.g. 001-headline.png)
 *   GOLDBACK_CLIENT_ID — Cortex clients.id (recommended)
 *   GOLDBACK_CLIENT_SLUG — fallback lookup (default `goldback`)
 *   GOLDBACK_ADS_JSON — optional { ads: [...] } from generate-goldback-meta-100 for copy + product_service
 *   GOLDBACK_ASPECT_RATIO — default 1:1
 *   GOLDBACK_DRY_RUN=1 — list actions only
 *
 * Requires `.env.local`: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, basename, join } from 'path';
import { homedir } from 'os';
import crypto from 'crypto';
import { loadEnvLocal } from './load-env-local';
import { createAdminClient } from '@/lib/supabase/admin';

type ManifestEntry = {
  ad_index?: number;
  slug?: string;
  ok?: boolean;
  output?: string;
  reference?: string;
};

type AdsJsonRow = {
  ad_index: number;
  nano_banana_slug: string;
  headline: string;
  subheadline: string;
  cta: string;
  offer: string | null;
  product_service: string;
};

function expandPath(p: string): string {
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return resolve(p);
}

function pngNameFor(adIndex: number, slug: string): string {
  const n = String(adIndex).padStart(3, '0');
  return `${n}-${slug}.png`;
}

function resolvePngPath(importDir: string, adIndex: number, slug: string, manifestOutput?: string): string | null {
  if (manifestOutput && existsSync(manifestOutput)) return manifestOutput;
  const primary = join(importDir, pngNameFor(adIndex, slug));
  if (existsSync(primary)) return primary;
  const legacy2 = join(importDir, `${String(adIndex).padStart(2, '0')}-${slug}.png`);
  if (existsSync(legacy2)) return legacy2;
  return null;
}

function discoverPngs(importDir: string): { adIndex: number; slug: string; filePath: string }[] {
  const re = /^(\d+)-([a-z0-9-]+)\.png$/i;
  const out: { adIndex: number; slug: string; filePath: string }[] = [];
  for (const name of readdirSync(importDir)) {
    const m = name.match(re);
    if (!m) continue;
    out.push({
      adIndex: parseInt(m[1], 10),
      slug: m[2],
      filePath: join(importDir, name),
    });
  }
  out.sort((a, b) => a.adIndex - b.adIndex || a.slug.localeCompare(b.slug));
  return out;
}

async function resolveClientId(admin: ReturnType<typeof createAdminClient>): Promise<{ id: string; name: string }> {
  const envId = process.env.GOLDBACK_CLIENT_ID?.trim();
  if (envId) {
    const { data, error } = await admin.from('clients').select('id, name').eq('id', envId).single();
    if (error || !data) {
      throw new Error(`GOLDBACK_CLIENT_ID not found: ${envId}`);
    }
    return { id: data.id, name: data.name ?? data.id };
  }

  const slug = process.env.GOLDBACK_CLIENT_SLUG?.trim() || 'goldback';
  const { data: bySlug } = await admin.from('clients').select('id, name, slug').eq('slug', slug).maybeSingle();
  if (bySlug) return { id: bySlug.id, name: bySlug.name ?? bySlug.slug ?? bySlug.id };

  const { data: fuzzy } = await admin
    .from('clients')
    .select('id, name, slug')
    .ilike('name', '%goldback%')
    .limit(5);

  if (fuzzy?.length === 1) {
    return { id: fuzzy[0].id, name: fuzzy[0].name ?? fuzzy[0].id };
  }
  if (fuzzy && fuzzy.length > 1) {
    const lines = fuzzy.map((c) => `  ${c.id}  slug=${c.slug ?? '?'}  name=${c.name ?? '?'}`).join('\n');
    throw new Error(
      `Multiple clients match "goldback" in name — set GOLDBACK_CLIENT_ID explicitly:\n${lines}`,
    );
  }

  throw new Error(
    `No client found (slug "${slug}" or name ilike %goldback%). Create the client in Admin or set GOLDBACK_CLIENT_ID.`,
  );
}

async function main(): Promise<void> {
  loadEnvLocal();
  const dryRun = process.env.GOLDBACK_DRY_RUN === '1';
  const importDirRaw = process.env.GOLDBACK_IMPORT_DIR?.trim();
  if (!importDirRaw) {
    console.error('Set GOLDBACK_IMPORT_DIR to the folder containing manifest.json and/or NN-slug.png files.');
    process.exit(1);
  }
  const importDir = expandPath(importDirRaw);
  if (!existsSync(importDir)) {
    console.error('GOLDBACK_IMPORT_DIR does not exist:', importDir);
    process.exit(1);
  }

  const aspectRatio = (process.env.GOLDBACK_ASPECT_RATIO?.trim() || '1:1') as '1:1' | '9:16' | '4:5';

  let copyByIndex = new Map<number, AdsJsonRow>();
  const adsJsonPath = process.env.GOLDBACK_ADS_JSON?.trim();
  if (adsJsonPath) {
    const p = expandPath(adsJsonPath);
    if (existsSync(p)) {
      const raw = JSON.parse(readFileSync(p, 'utf8')) as { ads: AdsJsonRow[] };
      for (const row of raw.ads ?? []) {
        copyByIndex.set(row.ad_index, row);
      }
      console.log(`[import-goldback] loaded copy for ${copyByIndex.size} ads from ${p}`);
    } else {
      console.warn('[import-goldback] GOLDBACK_ADS_JSON not found:', p);
    }
  }

  type WorkItem = { adIndex: number; slug: string; pngPath: string };
  const items: WorkItem[] = [];

  const manifestPath = join(importDir, 'manifest.json');
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { ads: ManifestEntry[] };
    for (const e of manifest.ads ?? []) {
      if (e.ok !== true || !e.slug || e.ad_index == null) continue;
      const out =
        typeof e.output === 'string' && e.output.trim()
          ? e.output.startsWith('/')
            ? e.output
            : join(importDir, basename(e.output))
          : undefined;
      const png = resolvePngPath(importDir, e.ad_index, e.slug, out);
      if (!png) {
        console.warn(`[import-goldback] skip ad_index=${e.ad_index} slug=${e.slug} — PNG not found`);
        continue;
      }
      items.push({ adIndex: e.ad_index, slug: e.slug, pngPath: png });
    }
  }

  if (items.length === 0) {
    for (const d of discoverPngs(importDir)) {
      items.push({ adIndex: d.adIndex, slug: d.slug, pngPath: d.filePath });
    }
  }

  if (items.length === 0) {
    console.error('[import-goldback] No PNGs to import. Add manifest.json or name files like 01-headline.png');
    process.exit(1);
  }

  const admin = createAdminClient();
  const client = await resolveClientId(admin);
  console.log(`[import-goldback] client: ${client.name} (${client.id})`);
  console.log(`[import-goldback] importing ${items.length} image(s) from ${importDir}`);

  if (dryRun) {
    console.log('[import-goldback] dry run — no database or storage writes');
    items.slice(0, 5).forEach((i) => console.log('  sample:', i.pngPath));
    if (items.length > 5) console.log(`  ... +${items.length - 5} more`);
    return;
  }

  const batchId = crypto.randomUUID();
  const { error: batchErr } = await admin.from('ad_generation_batches').insert({
    id: batchId,
    client_id: client.id,
    status: 'completed',
    config: {
      importSource: 'goldback-local-nano-png',
      importDir: importDir,
      adCount: items.length,
    } as unknown as Record<string, unknown>,
    total_count: items.length,
    completed_count: items.length,
    failed_count: 0,
    brand_context_source: 'brand_dna',
    ephemeral_url: null,
    created_by: null,
    completed_at: new Date().toISOString(),
    placeholder_config: null,
  });

  if (batchErr) {
    console.error('[import-goldback] batch insert failed:', batchErr.message);
    process.exit(1);
  }

  const model = process.env.GEMINI_IMAGE_MODEL?.trim() || 'gemini-3.1-flash-image-preview';
  let ok = 0;

  for (let slot = 0; slot < items.length; slot++) {
    const { adIndex, slug, pngPath } = items[slot];
    const copy = copyByIndex.get(adIndex);
    const creativeId = crypto.randomUUID();
    const storagePath = `${client.id}/${batchId}/${creativeId}.png`;
    const buf = readFileSync(pngPath);

    const { error: upErr } = await admin.storage.from('ad-creatives').upload(storagePath, buf, {
      contentType: 'image/png',
      upsert: false,
    });
    if (upErr) {
      console.error(`[import-goldback] upload failed ad_index=${adIndex}:`, upErr.message);
      continue;
    }

    const { data: urlData } = admin.storage.from('ad-creatives').getPublicUrl(storagePath);
    const imageUrl = urlData.publicUrl;

    const { error: insErr } = await admin.from('ad_creatives').insert({
      id: creativeId,
      batch_id: batchId,
      client_id: client.id,
      template_id: null,
      template_source: 'global',
      image_url: imageUrl,
      aspect_ratio: aspectRatio,
      prompt_used: `[imported] Goldback Nano Banana — ${slug} (ad_index ${adIndex})`,
      on_screen_text: {
        headline: copy?.headline ?? '',
        subheadline: copy?.subheadline ?? '',
        cta: copy?.cta ?? '',
      },
      product_service: copy?.product_service ?? 'Goldbacks — spendable gold currency.',
      offer: copy?.offer ?? '',
      is_favorite: false,
      metadata: {
        model,
        brand_layout_mode: 'schema_only',
        image_pipeline: 'nano_banana',
        global_slug: slug,
        batch_item_index: slot,
        imported_from: 'goldback-cli-png',
        source_ad_index: adIndex,
        local_source_file: basename(pngPath),
      },
    });

    if (insErr) {
      console.error(`[import-goldback] insert failed ad_index=${adIndex}:`, insErr.message);
      continue;
    }
    ok++;
    if (ok % 10 === 0 || ok === items.length) {
      console.log(`[import-goldback] progress ${ok}/${items.length}`);
    }
  }

  console.log(`[import-goldback] done: ${ok}/${items.length} creatives — batch ${batchId}`);
  if (ok < items.length) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
