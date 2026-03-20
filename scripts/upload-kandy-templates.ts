import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'fs';
import { resolve, basename } from 'path';

// Load env
const envPath = resolve(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const env: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEMPLATE_DIR = resolve(process.env.HOME!, 'Desktop/Ad Templates');

const FOLDER_CONFIG: Record<string, { vertical: string; sourceBrand: string }> = {
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

async function main() {
  console.log('=== Uploading Kandy Templates (Examples Only) ===\n');
  
  let totalUploaded = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  const folders = readdirSync(TEMPLATE_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();

  for (const folder of folders) {
    const config = FOLDER_CONFIG[folder];
    if (!config) {
      console.log(`⚠ Skipping unknown folder: ${folder}`);
      continue;
    }

    const folderPath = resolve(TEMPLATE_DIR, folder);
    const files = readdirSync(folderPath)
      .filter(f => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'))
      .filter(f => /example|exmaple/i.test(f))  // Only examples (including typo "exmaple")
      .sort();

    console.log(`\n📁 ${folder} — ${files.length} examples (${config.vertical})`);

    for (const file of files) {
      const filePath = resolve(folderPath, file);
      const fileBuffer = readFileSync(filePath);
      
      // Extract concept number from filename
      const conceptMatch = file.match(/Concept\s+(\d+)/i);
      const conceptNum = conceptMatch ? parseInt(conceptMatch[1]) : 0;
      
      // Upload to Supabase Storage
      const storagePath = `${config.vertical}/${folder.replace(/\s+/g, '-').toLowerCase()}/${file.replace(/\s+/g, '-').toLowerCase()}`;
      
      const { error: uploadError } = await supabase.storage
        .from('kandy-templates')
        .upload(storagePath, fileBuffer, {
          contentType: 'image/png',
          upsert: true,
        });

      if (uploadError) {
        console.error(`  ✗ Upload failed: ${file} — ${uploadError.message}`);
        totalFailed++;
        continue;
      }

      // Get public URL
      const { data: urlData } = supabase.storage.from('kandy-templates').getPublicUrl(storagePath);

      // Insert DB record
      const { error: insertError } = await supabase.from('kandy_templates').insert({
        collection_name: folder,
        canva_design_id: `local-${folder.replace(/\s+/g, '-').toLowerCase()}-${conceptNum || file.replace(/\s+/g, '-')}`,
        page_index: conceptNum,
        image_url: urlData.publicUrl,
        vertical: config.vertical,
        format: 'feed',
        aspect_ratio: '1:1',
        ad_category: folder.startsWith('BFCM') ? 'sale_discount' : 'other',
        is_favorite: false,
        is_active: true,
        source_brand: config.sourceBrand,
      });

      if (insertError) {
        console.error(`  ✗ DB insert failed: ${file} — ${insertError.message}`);
        totalFailed++;
        continue;
      }

      totalUploaded++;
      if (totalUploaded % 25 === 0) {
        console.log(`  ... ${totalUploaded} uploaded so far`);
      }
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Uploaded: ${totalUploaded}`);
  console.log(`Skipped: ${totalSkipped}`);
  console.log(`Failed: ${totalFailed}`);
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
