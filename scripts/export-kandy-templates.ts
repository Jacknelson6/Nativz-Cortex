// scripts/export-kandy-templates.ts
// Imports pre-exported Kandy template PNGs into Supabase Storage + creates DB records.
// Also generates an export manifest for use with Canva MCP.
//
// Usage:
//   npx tsx scripts/export-kandy-templates.ts                    # generate manifest only
//   npx tsx scripts/export-kandy-templates.ts --import <dir>     # import PNGs from directory

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'fs';
import { resolve, basename, extname } from 'path';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Load .env.local manually (no dotenv dependency)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Supabase admin client
// ---------------------------------------------------------------------------
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Kandy Collection definitions
// ---------------------------------------------------------------------------
const COLLECTIONS = [
  { name: 'General Feed', designId: 'DAHEUJpZcXU', pageCount: 213, vertical: 'general', format: 'feed', aspectRatio: '1:1' },
  { name: 'General 2.0', designId: 'DAG-Oz6D5X8', pageCount: 212, vertical: 'general', format: 'feed', aspectRatio: '1:1' },
  { name: 'Health & Beauty', designId: 'DAG-l_m8QIs', pageCount: 213, vertical: 'health_beauty', format: 'feed', aspectRatio: '1:1' },
  { name: 'Health & Beauty 3.0', designId: 'DAG7Dp0HUfM', pageCount: 212, vertical: 'health_beauty', format: 'feed', aspectRatio: '1:1' },
  { name: 'Digital Products', designId: 'DAHCdETJvlo', pageCount: 212, vertical: 'digital_products', format: 'feed', aspectRatio: '1:1' },
  { name: 'Story Examples', designId: 'DAG7DhlKWBI', pageCount: 212, vertical: 'general', format: 'story', aspectRatio: '9:16' },
  { name: 'Fashion Story', designId: 'DAG6LVI2cik', pageCount: 212, vertical: 'fashion', format: 'story', aspectRatio: '9:16' },
] as const;

type Collection = (typeof COLLECTIONS)[number];

const STORAGE_BUCKET = 'kandy-templates';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the even page numbers from 12..pageCount (finalized examples). */
function getExamplePages(pageCount: number): number[] {
  const pages: number[] = [];
  for (let p = 12; p <= pageCount; p += 2) {
    pages.push(p);
  }
  return pages;
}

/** Build a manifest entry for a single collection. */
function buildManifestEntry(col: Collection) {
  const pages = getExamplePages(col.pageCount);
  return {
    collectionName: col.name,
    designId: col.designId,
    vertical: col.vertical,
    format: col.format,
    aspectRatio: col.aspectRatio,
    totalExamplePages: pages.length,
    pageNumbers: pages,
    suggestedFilenamePattern: `${col.designId}_page_{PAGE}.png`,
  };
}

/** Generate and write the export manifest. */
function generateManifest() {
  const manifest = {
    description: 'Kandy template export manifest. Use these page numbers to export finalized examples from Canva.',
    generatedAt: new Date().toISOString(),
    storageBucket: STORAGE_BUCKET,
    collections: COLLECTIONS.map(buildManifestEntry),
    summary: {
      totalCollections: COLLECTIONS.length,
      totalExamplePages: COLLECTIONS.reduce((sum, c) => sum + getExamplePages(c.pageCount).length, 0),
    },
    instructions: [
      'For each collection, export the listed page numbers as individual PNGs from Canva.',
      'Name files as: {designId}_page_{pageNumber}.png (e.g. DAHEUJpZcXU_page_12.png)',
      'Place all PNGs in a single directory, then run: npx tsx scripts/export-kandy-templates.ts --import <dir>',
    ],
  };

  const outPath = '/tmp/kandy-export-manifest.json';
  writeFileSync(outPath, JSON.stringify(manifest, null, 2));
  console.log(`Manifest written to ${outPath}`);
  console.log(`  Collections: ${manifest.summary.totalCollections}`);
  console.log(`  Total example pages: ${manifest.summary.totalExamplePages}`);
  return manifest;
}

/** Parse a filename like "DAHEUJpZcXU_page_12.png" into { designId, pageNumber }. */
function parseFilename(filename: string): { designId: string; pageNumber: number } | null {
  const match = filename.match(/^(.+)_page_(\d+)\.png$/i);
  if (!match) return null;
  return { designId: match[1], pageNumber: parseInt(match[2], 10) };
}

/** Find the collection definition for a design ID. */
function findCollection(designId: string): Collection | undefined {
  return COLLECTIONS.find((c) => c.designId === designId);
}

// ---------------------------------------------------------------------------
// Import pipeline
// ---------------------------------------------------------------------------

async function ensureBucketExists() {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some((b) => b.name === STORAGE_BUCKET);
  if (!exists) {
    const { error } = await supabase.storage.createBucket(STORAGE_BUCKET, {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024, // 10 MB
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    });
    if (error) throw new Error(`Failed to create bucket: ${error.message}`);
    console.log(`Created storage bucket: ${STORAGE_BUCKET}`);
  }
}

async function uploadAndRecord(filePath: string, filename: string) {
  const parsed = parseFilename(filename);
  if (!parsed) {
    console.warn(`  Skipping "${filename}" — does not match expected pattern {designId}_page_{N}.png`);
    return null;
  }

  const collection = findCollection(parsed.designId);
  if (!collection) {
    console.warn(`  Skipping "${filename}" — unknown design ID "${parsed.designId}"`);
    return null;
  }

  const storagePath = `${collection.vertical}/${filename}`;
  const fileBuffer = readFileSync(filePath);

  // Upload to storage
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: 'image/png',
      upsert: true,
    });

  if (uploadError) {
    console.error(`  Upload failed for "${filename}": ${uploadError.message}`);
    return null;
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(storagePath);

  const imageUrl = urlData.publicUrl;

  // Upsert kandy_templates record
  const { error: dbError } = await supabase
    .from('kandy_templates')
    .upsert(
      {
        collection_name: collection.name,
        canva_design_id: collection.designId,
        page_index: parsed.pageNumber,
        image_url: imageUrl,
        vertical: collection.vertical,
        format: collection.format,
        aspect_ratio: collection.aspectRatio,
        is_active: true,
      },
      { onConflict: 'canva_design_id,page_index' }
    );

  if (dbError) {
    console.error(`  DB insert failed for "${filename}": ${dbError.message}`);
    return null;
  }

  return { filename, storagePath, imageUrl };
}

async function importFromDirectory(dirPath: string) {
  if (!existsSync(dirPath)) {
    console.error(`Directory not found: ${dirPath}`);
    process.exit(1);
  }

  const files = readdirSync(dirPath).filter(
    (f) => extname(f).toLowerCase() === '.png'
  );

  if (files.length === 0) {
    console.error(`No PNG files found in ${dirPath}`);
    process.exit(1);
  }

  console.log(`Found ${files.length} PNG files in ${dirPath}`);
  await ensureBucketExists();

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = resolve(dirPath, file);
    console.log(`[${i + 1}/${files.length}] Uploading ${file}...`);

    const result = await uploadAndRecord(filePath, file);
    if (result) {
      uploaded++;
    } else {
      // Check if it was a skip (bad filename) or actual failure
      const parsed = parseFilename(file);
      if (!parsed || !findCollection(parsed.designId)) {
        skipped++;
      } else {
        failed++;
      }
    }
  }

  console.log('\n--- Import complete ---');
  console.log(`  Uploaded: ${uploaded}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Failed:   ${failed}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--import' && args[1]) {
    const dirPath = resolve(args[1]);
    await importFromDirectory(dirPath);
  } else {
    // Default: generate manifest
    generateManifest();
    console.log('\nTo import exported PNGs, run:');
    console.log('  npx tsx scripts/export-kandy-templates.ts --import /path/to/pngs');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
