/**
 * Wipe all Kandy catalog data: `kandy_templates` rows + nested files in Storage bucket `kandy-templates`.
 *
 * Requires `.env.local`: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   npm run kandy:clear -- --confirm
 *   npx tsx scripts/clear-kandy-templates.ts --confirm
 *
 * Does NOT touch `ad_prompt_templates` (per-client custom templates) or `ad_creatives` history.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  deleteAllKandyTemplateRows,
  emptyKandyTemplatesStorage,
} from '../lib/ad-creatives/kandy-templates-maintenance';

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

async function main() {
  if (!process.argv.includes('--confirm')) {
    console.error('Refusing to run without --confirm (this deletes all Kandy templates and bucket files).');
    console.error('Run: npm run kandy:clear -- --confirm');
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('Deleting kandy_templates rows…');
  const { deletedApprox, error: dbErr } = await deleteAllKandyTemplateRows(admin);
  if (dbErr) {
    console.error('DB delete failed:', dbErr.message);
    process.exit(1);
  }
  console.log(`  Removed ~${deletedApprox} row(s).`);

  console.log('Emptying kandy-templates storage bucket (recursive)…');
  const { removed, error: stErr } = await emptyKandyTemplatesStorage(admin);
  if (stErr) {
    console.warn('  Storage cleanup warning:', stErr.message);
    console.warn('  You can delete remaining objects from Dashboard → Storage → kandy-templates.');
  } else {
    console.log(`  Removed ${removed} object(s).`);
  }

  console.log('\nDone. Kandy template picker in the app will be empty until you upload a new catalog.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
