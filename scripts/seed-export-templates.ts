// scripts/seed-export-templates.ts
// Creates kandy_templates DB records for export-style PNGs already in Supabase Storage.
// Run this to sync storage → DB for files uploaded via Canva export approach.
//
// Usage: npx tsx scripts/seed-export-templates.ts [--dry-run]

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

// Load .env.local
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
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const STORAGE_BUCKET = 'kandy-templates';

// Collection metadata keyed by Canva design ID
const COLLECTION_META: Record<string, {
  name: string;
  vertical: 'general' | 'health_beauty' | 'fashion' | 'digital_products';
  format: 'feed' | 'story';
  aspectRatio: '1:1' | '9:16';
}> = {
  DAHEUJpZcXU: { name: 'General Feed', vertical: 'general', format: 'feed', aspectRatio: '1:1' },
  'DAG-Oz6D5X8': { name: 'General 2.0', vertical: 'general', format: 'feed', aspectRatio: '1:1' },
  'DAG-l_m8QIs': { name: 'Health & Beauty', vertical: 'health_beauty', format: 'feed', aspectRatio: '1:1' },
  DAG7Dp0HUfM: { name: 'Health & Beauty 3.0', vertical: 'health_beauty', format: 'feed', aspectRatio: '1:1' },
  DAHCdETJvlo: { name: 'Digital Products', vertical: 'digital_products', format: 'feed', aspectRatio: '1:1' },
  DAG7DhlKWBI: { name: 'Story Examples', vertical: 'general', format: 'story', aspectRatio: '9:16' },
  DAG6LVI2cik: { name: 'Fashion Story', vertical: 'fashion', format: 'story', aspectRatio: '9:16' },
};

// Storage folders to search in
const SEARCH_FOLDERS = ['general', 'general/', 'health_beauty', 'digital_products', 'fashion'];

function parseFilename(filename: string): { designId: string; pageNumber: number } | null {
  // Match pattern like "DAHEUJpZcXU_page_12.png"
  const basename = filename.split('/').pop() ?? filename;
  const match = basename.match(/^(.+)_page_(\d+)\.png$/i);
  if (!match) return null;
  return { designId: match[1], pageNumber: parseInt(match[2], 10) };
}

async function listStorageFiles(prefix: string): Promise<string[]> {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .list(prefix, { limit: 1000 });

  if (error) {
    console.error(`Failed to list ${prefix}:`, error.message);
    return [];
  }

  const files: string[] = [];
  for (const item of data ?? []) {
    if (item.id) {
      // It's a file
      files.push(`${prefix}/${item.name}`);
    }
  }
  return files;
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');

  if (isDryRun) {
    console.log('=== DRY RUN — no changes will be made ===\n');
  } else {
    console.log('=== Seeding export-style templates from storage ===\n');
  }

  // Collect all export-style files from storage
  const allFiles: string[] = [];

  // Scan all top-level folders
  const { data: topFolders } = await supabase.storage
    .from(STORAGE_BUCKET)
    .list('', { limit: 100 });

  for (const folder of topFolders ?? []) {
    if (folder.id) continue; // Skip files at root

    const files = await listStorageFiles(folder.name);
    allFiles.push(...files);
  }

  // Filter to only export-style files (those matching {designId}_page_{N}.png)
  const exportFiles = allFiles.filter(f => parseFilename(f) !== null);

  console.log(`Found ${exportFiles.length} export-style files in storage`);
  console.log(`(Out of ${allFiles.length} total files)\n`);

  if (exportFiles.length === 0) {
    console.log('No export-style files found. Nothing to seed.');
    return;
  }

  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  for (const filePath of exportFiles) {
    const parsed = parseFilename(filePath);
    if (!parsed) continue;

    const meta = COLLECTION_META[parsed.designId];
    if (!meta) {
      console.warn(`  Skipping unknown design ID: ${parsed.designId} (${filePath})`);
      skipped++;
      continue;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(filePath);

    const imageUrl = urlData.publicUrl;

    if (isDryRun) {
      console.log(`  Would insert: ${meta.name} page ${parsed.pageNumber} (${meta.vertical}) → ${filePath}`);
      inserted++;
      continue;
    }

    // Check if this record already exists (unique constraint was dropped when canva_design_id was made nullable)
    const { data: existing } = await supabase
      .from('kandy_templates')
      .select('id')
      .eq('canva_design_id', parsed.designId)
      .eq('page_index', parsed.pageNumber)
      .maybeSingle();

    if (existing) {
      console.log(`  ~ Already exists: ${meta.name} page ${parsed.pageNumber}`);
      skipped++;
      continue;
    }

    // Insert DB record
    const { error } = await supabase
      .from('kandy_templates')
      .insert({
        collection_name: meta.name,
        canva_design_id: parsed.designId,
        page_index: parsed.pageNumber,
        image_url: imageUrl,
        vertical: meta.vertical,
        format: meta.format,
        aspect_ratio: meta.aspectRatio,
        is_active: true,
      });

    if (error) {
      console.error(`  Failed: ${filePath} — ${error.message}`);
      failed++;
    } else {
      console.log(`  ✓ ${meta.name} page ${parsed.pageNumber} (${meta.vertical})`);
      inserted++;
    }
  }

  console.log('\n=== Complete ===');
  console.log(`  Inserted/updated: ${inserted}`);
  console.log(`  Skipped:          ${skipped}`);
  console.log(`  Failed:           ${failed}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
