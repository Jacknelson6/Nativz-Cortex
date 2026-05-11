/**
 * VFF-03 T02: idempotent setup for the `viral-thumbnails` Supabase Storage
 * bucket. Public-read; thumbnails are not sensitive. Re-running is a no-op.
 *
 * Usage: `npx tsx scripts/setup-viral-thumbnails-bucket.ts`
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.
 */

import { createClient } from '@supabase/supabase-js';

const BUCKET = 'viral-thumbnails';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: list, error: listErr } = await admin.storage.listBuckets();
  if (listErr) {
    console.error('listBuckets failed:', listErr.message);
    process.exit(1);
  }
  const exists = (list ?? []).some((b) => b.name === BUCKET);
  if (exists) {
    console.log(`bucket "${BUCKET}" already exists, no-op.`);
    return;
  }

  const { error: createErr } = await admin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 10 * 1024 * 1024, // 10 MB ceiling per thumbnail
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  });
  if (createErr) {
    console.error('createBucket failed:', createErr.message);
    process.exit(1);
  }
  console.log(`created bucket "${BUCKET}" (public-read).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
