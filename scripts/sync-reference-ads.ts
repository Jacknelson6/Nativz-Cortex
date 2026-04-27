/**
 * One-off: ingest the default reference-ads Drive folder into ad_reference_ads.
 *
 *   npx tsx scripts/sync-reference-ads.ts
 *
 * Auth uses the Workspace SA (domain-wide delegation impersonating the user
 * passed in), so SYNC_USER_EMAIL must be on an allowlisted domain.
 *
 * Env:
 *   SYNC_USER_EMAIL  email to attribute the sync to (default jack@nativz.io)
 *   SYNC_DRIVE_URL   override Drive folder (default = DEFAULT_REFERENCE_ADS_DRIVE_URL)
 *   SYNC_LIMIT       max files to import (default 300)
 *   SYNC_NO_ANALYZE  set to "1" to skip per-image vision extraction
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createAdminClient } from '@/lib/supabase/admin';
import {
  DEFAULT_REFERENCE_ADS_DRIVE_URL,
  syncReferenceAdsFromDrive,
} from '@/lib/ad-creatives/reference-ad-library';

async function main() {
  const email = process.env.SYNC_USER_EMAIL ?? 'jack@nativz.io';
  const driveUrl = process.env.SYNC_DRIVE_URL ?? DEFAULT_REFERENCE_ADS_DRIVE_URL;
  const limit = process.env.SYNC_LIMIT ? Number(process.env.SYNC_LIMIT) : undefined;
  const analyze = process.env.SYNC_NO_ANALYZE === '1' ? false : true;

  const admin = createAdminClient();
  const { data: user, error } = await admin
    .from('users')
    .select('id, email')
    .ilike('email', email)
    .single();

  if (error || !user) {
    throw new Error(`User not found by email "${email}": ${error?.message ?? 'no row'}`);
  }

  console.log('Sync starting');
  console.log('  user      ', `${user.email} (${user.id})`);
  console.log('  driveUrl  ', driveUrl);
  console.log('  limit     ', limit ?? 'default');
  console.log('  analyze   ', analyze);
  console.log('');

  const result = await syncReferenceAdsFromDrive({
    userId: user.id,
    driveUrl,
    limit,
    analyze,
  });

  console.log('Done.');
  console.log('  scanned   ', result.scanned);
  console.log('  imported  ', result.imported);
  console.log('  updated   ', result.updated);
  console.log('  failed    ', result.failed.length);
  if (result.failed.length > 0) {
    for (const f of result.failed.slice(0, 10)) {
      console.log(`    - ${f.name}: ${f.error}`);
    }
    if (result.failed.length > 10) {
      console.log(`    (+${result.failed.length - 10} more)`);
    }
  }
}

main().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
