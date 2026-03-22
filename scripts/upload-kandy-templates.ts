/**
 * Upload local Kandy export folders → Supabase Storage (`kandy-templates`) + `kandy_templates`.
 * This is how Desktop (or any disk) folders become the in-app template library.
 *
 * Setup:
 *   - `.env.local` with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   - Optional: KANDY_TEMPLATES_ROOT=/absolute/path/to/Ad Templates (defaults to ~/Desktop/Ad Templates)
 *   - Optional: copy scripts/kandy-folder-map.example.json → scripts/kandy-folder-map.json
 *     to set vertical + sourceBrand per folder name (merged over built-in defaults)
 *   - DB: apply `053_kandy_templates_vertical_expand.sql` so ecommerce/saas/health_wellness
 *     are allowed. Without it, the script still succeeds by falling back to 043 vertical values.
 *
 * Usage:
 *   npm run kandy:upload
 *   npm run kandy:upload -- --all              # every png/jpg, not only *example* files
 *   npm run kandy:upload -- --dry-run          # print plan only
 *   npm run kandy:upload -- --strict-folders   # skip folders not in defaults / map (old behavior)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';

const envPath = resolve(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx);
  let val = trimmed.slice(eqIdx + 1);
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = val;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type FolderMeta = { vertical: string; sourceBrand: string };

const DEFAULT_FOLDER_MAP: Record<string, FolderMeta> = {
  'BFCM 1': { vertical: 'ecommerce', sourceBrand: 'Kandy - Sales & Offers' },
  'BFCM 2': { vertical: 'ecommerce', sourceBrand: 'Kandy - Sales & Offers' },
  'BFCM 3': { vertical: 'ecommerce', sourceBrand: 'Kandy - Sales & Offers' },
  'Digital Products 1': { vertical: 'saas', sourceBrand: 'Kandy - Digital Products' },
  'Fashion 1': { vertical: 'fashion', sourceBrand: 'Kandy - Fashion' },
  'General 1': { vertical: 'general', sourceBrand: 'Kandy - General' },
  'General 2': { vertical: 'general', sourceBrand: 'Kandy - General' },
  'Health & Beauty 1': { vertical: 'health_wellness', sourceBrand: 'Kandy - Health & Beauty' },
  'Health & Beauty 2': { vertical: 'health_wellness', sourceBrand: 'Kandy - Health & Beauty' },
  'Health & Beauty 3': { vertical: 'health_wellness', sourceBrand: 'Kandy - Health & Beauty' },
};

function loadMergedFolderMap(): Record<string, FolderMeta> {
  const merged: Record<string, FolderMeta> = { ...DEFAULT_FOLDER_MAP };
  const mapPath = resolve(process.cwd(), 'scripts/kandy-folder-map.json');
  if (!existsSync(mapPath)) return merged;
  try {
    const raw = JSON.parse(readFileSync(mapPath, 'utf-8')) as Record<string, unknown>;
    for (const [name, val] of Object.entries(raw)) {
      if (val && typeof val === 'object' && val !== null && 'vertical' in val && 'sourceBrand' in val) {
        const v = val as { vertical: string; sourceBrand: string };
        merged[name] = { vertical: v.vertical, sourceBrand: v.sourceBrand };
      }
    }
    console.log(`Loaded folder overrides from scripts/kandy-folder-map.json (${Object.keys(raw).length} entries)\n`);
  } catch (e) {
    console.error('Failed to parse scripts/kandy-folder-map.json:', e);
    process.exit(1);
  }
  return merged;
}

function contentTypeForFile(file: string): string {
  const lower = file.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

function slugFileBase(file: string): string {
  return file.replace(/\s+/g, '-').toLowerCase();
}

function resolveFolderMeta(
  folder: string,
  folderMap: Record<string, FolderMeta>,
  strictFolders: boolean
): FolderMeta | null {
  const hit = folderMap[folder];
  if (hit) return hit;
  if (strictFolders) return null;
  return { vertical: 'general', sourceBrand: `Kandy — ${folder}` };
}

/**
 * Migration 043 only allows: general, health_beauty, fashion, digital_products.
 * Migration 053 adds ecommerce, saas, health_wellness, etc. If 053 is not applied
 * on the project, inserts with the expanded values fail every time.
 */
function verticalForPostgres(
  v: string,
  mode: 'modern' | 'legacy043'
): string {
  if (mode === 'modern') return v;
  switch (v) {
    case 'ecommerce':
      return 'general';
    case 'saas':
      return 'digital_products';
    case 'health_wellness':
      return 'health_beauty';
    default:
      return v;
  }
}

type KandyRow = {
  collection_name: string;
  canva_design_id: string;
  page_index: number;
  image_url: string;
  vertical: string;
  format: string;
  aspect_ratio: string;
  ad_category: string;
  is_favorite: boolean;
  is_active: boolean;
  source_brand: string;
};

/**
 * PostgREST `.upsert({ onConflict: 'a,b' })` often fails (no matching unique
 * index in cache, or merge semantics). Use select → update | insert instead.
 *
 * If migration 053 is not applied, `vertical` CHECK rejects ecommerce/saas/
 * health_wellness — we retry once with 043-era values.
 */
async function saveKandyTemplateRow(row: KandyRow): Promise<{ error: Error | null }> {
  const run = async (r: KandyRow): Promise<{ pgCode?: string; message: string } | null> => {
    const { data: existingRows, error: selErr } = await supabase
      .from('kandy_templates')
      .select('id')
      .eq('canva_design_id', r.canva_design_id)
      .eq('page_index', r.page_index)
      .limit(1);

    if (selErr) {
      return { message: selErr.message, pgCode: selErr.code };
    }

    const existingId = existingRows?.[0]?.id;

    if (existingId) {
      const { error: updErr } = await supabase
        .from('kandy_templates')
        .update({
          collection_name: r.collection_name,
          image_url: r.image_url,
          vertical: r.vertical,
          format: r.format,
          aspect_ratio: r.aspect_ratio,
          ad_category: r.ad_category,
          is_favorite: r.is_favorite,
          is_active: r.is_active,
          source_brand: r.source_brand,
        })
        .eq('id', existingId);

      if (updErr) {
        return { message: updErr.message, pgCode: updErr.code };
      }
      return null;
    }

    const { error: insErr } = await supabase.from('kandy_templates').insert(r);
    if (insErr) {
      return { message: insErr.message, pgCode: insErr.code };
    }
    return null;
  };

  const err = await run(row);
  if (!err) return { error: null };

  const isCheck =
    err.pgCode === '23514' || /violates check constraint|check constraint/i.test(err.message);
  const legacyVertical = verticalForPostgres(row.vertical, 'legacy043');
  if (isCheck && legacyVertical !== row.vertical) {
    const err2 = await run({ ...row, vertical: legacyVertical });
    if (!err2) {
      return { error: null };
    }
    return {
      error: new Error(
        `${err2.message}\n  (Tried legacy vertical "${legacyVertical}" after CHECK failure; apply supabase/migrations/053_kandy_templates_vertical_expand.sql if you need modern verticals.)`
      ),
    };
  }

  return { error: new Error(err.message) };
}

async function main() {
  const args = process.argv.slice(2);
  const examplesOnly = !args.includes('--all');
  const dryRun = args.includes('--dry-run');
  const strictFolders = args.includes('--strict-folders');

  const home = process.env.HOME ?? '';
  const defaultRoot = join(home, 'Desktop', 'Ad Templates');
  const templateRoot = process.env.KANDY_TEMPLATES_ROOT?.trim() || defaultRoot;

  if (!existsSync(templateRoot)) {
    console.error(`Template root does not exist: ${templateRoot}`);
    console.error('Set KANDY_TEMPLATES_ROOT in .env.local to your Ad Templates folder, or create the default path.');
    process.exit(1);
  }

  const folderMap = loadMergedFolderMap();

  console.log('=== Kandy templates → Supabase ===\n');
  console.log(`Root: ${templateRoot}`);
  console.log(`Mode: ${examplesOnly ? 'example filenames only (*example* / *exmaple*)' : 'all images'}`);
  console.log(`Unknown folders: ${strictFolders ? 'skipped' : 'mapped to general + Kandy — <folder name>'}`);
  console.log(`Dry run: ${dryRun}\n`);

  let totalUploaded = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  const folders = readdirSync(templateRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const folder of folders) {
    const meta = resolveFolderMeta(folder, folderMap, strictFolders);
    if (!meta) {
      console.log(`⚠ Skipping unknown folder: ${folder}`);
      totalSkipped++;
      continue;
    }

    const folderPath = resolve(templateRoot, folder);
    let files = readdirSync(folderPath).filter((f) => /\.(png|jpg|jpeg)$/i.test(f));
    if (examplesOnly) {
      files = files.filter((f) => /example|exmaple/i.test(f));
    }
    files.sort();

    console.log(`\n📁 ${folder} — ${files.length} file(s) (${meta.vertical})`);

    for (const file of files) {
      const filePath = resolve(folderPath, file);
      const fileBuffer = readFileSync(filePath);
      const conceptMatch = file.match(/Concept\s+(\d+)/i);
      const conceptNum = conceptMatch ? parseInt(conceptMatch[1], 10) : 0;
      const folderSlug = folder.replace(/\s+/g, '-').toLowerCase();
      const fileStem = slugFileBase(file).replace(/\.(png|jpg|jpeg)$/i, '');
      // One stable id per file (avoids collisions when multiple assets share the same concept #).
      const canvaDesignId = `local-${folderSlug}-${fileStem}`;
      const pageIndex = conceptNum;

      const storagePath = `${meta.vertical}/${folderSlug}/${slugFileBase(file)}`;

      if (dryRun) {
        console.log(`  [dry-run] ${file} → ${storagePath}`);
        totalUploaded++;
        continue;
      }

      const { error: uploadError } = await supabase.storage.from('kandy-templates').upload(storagePath, fileBuffer, {
        contentType: contentTypeForFile(file),
        upsert: true,
      });

      if (uploadError) {
        console.error(`  ✗ Upload failed: ${file} — ${uploadError.message}`);
        totalFailed++;
        continue;
      }

      const { data: urlData } = supabase.storage.from('kandy-templates').getPublicUrl(storagePath);
      const imageUrl = urlData.publicUrl;

      const row: KandyRow = {
        collection_name: folder,
        canva_design_id: canvaDesignId,
        page_index: pageIndex,
        image_url: imageUrl,
        vertical: meta.vertical,
        format: 'feed',
        aspect_ratio: '1:1',
        ad_category: folder.startsWith('BFCM') ? 'sale_discount' : 'other',
        is_favorite: false,
        is_active: true,
        source_brand: meta.sourceBrand,
      };

      const { error: dbErr } = await saveKandyTemplateRow(row);

      if (dbErr) {
        console.error(`  ✗ DB save failed: ${file} — ${dbErr.message}`);
        totalFailed++;
        continue;
      }

      totalUploaded++;
      if (totalUploaded % 25 === 0) {
        console.log(`  ... ${totalUploaded} processed so far`);
      }
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Processed (ok): ${totalUploaded}`);
  console.log(`Skipped folders: ${totalSkipped}`);
  console.log(`Failed: ${totalFailed}`);
  if (!dryRun && totalFailed === 0) {
    console.log(`\nNext: npm run kandy:analyze   (if defined) or: npx tsx scripts/analyze-kandy-templates.ts`);
  }
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
