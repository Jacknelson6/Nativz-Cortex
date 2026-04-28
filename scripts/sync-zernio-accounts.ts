/**
 * Backfill `social_profiles` from Zernio for clients whose accounts were
 * connected directly in Zernio (not via the in-app OAuth flow that writes
 * to social_profiles via /api/scheduler/connect/callback).
 *
 *   npx tsx scripts/sync-zernio-accounts.ts --slug=safe-stop          # dry-run
 *   npx tsx scripts/sync-zernio-accounts.ts --slug=safe-stop --apply  # upsert
 *
 * Reads `clients.late_profile_id`, calls `GET {ZERNIO_API_BASE}/accounts`,
 * filters to that profile, and upserts one row per platform into
 * `social_profiles` keyed on (client_id, platform, platform_user_id) — same
 * shape used by the OAuth callback route.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createAdminClient } from '@/lib/supabase/admin';
import { getZernioApiBase, getZernioApiKey } from '@/lib/posting';

interface ZernioAccount {
  _id?: string;
  platform?: string;
  username?: string;
  profileId?: { _id?: string } | string;
  createdAt?: string;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const slugArg = process.argv.find((a) => a.startsWith('--slug='));
  const slug = slugArg ? slugArg.slice('--slug='.length) : null;
  if (!slug) {
    console.error('usage: npx tsx scripts/sync-zernio-accounts.ts --slug=<client-slug> [--apply]');
    process.exit(1);
  }

  console.log(`${apply ? 'APPLY' : 'DRY-RUN'} — sync Zernio accounts for ${slug}\n`);

  const admin = createAdminClient();
  const { data: client } = await admin
    .from('clients')
    .select('id, name, late_profile_id, agency')
    .eq('slug', slug)
    .maybeSingle<{ id: string; name: string; late_profile_id: string | null; agency: string | null }>();
  if (!client) {
    console.error(`✗ client not found: ${slug}`);
    process.exit(1);
  }
  if (!client.late_profile_id) {
    console.error(`✗ ${client.name} has no late_profile_id — cannot resolve Zernio accounts`);
    process.exit(1);
  }
  console.log(`Client: ${client.name}  (${client.id})  zernio profile=${client.late_profile_id}`);

  const res = await fetch(`${getZernioApiBase()}/accounts`, {
    headers: { Authorization: `Bearer ${getZernioApiKey()}` },
  });
  if (!res.ok) {
    console.error(`✗ Zernio /accounts ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const body = (await res.json()) as { accounts?: ZernioAccount[] };
  const allAccounts = body.accounts ?? [];

  const matches = allAccounts.filter((a) => {
    const pid = typeof a.profileId === 'string' ? a.profileId : a.profileId?._id;
    return pid === client.late_profile_id;
  });

  if (matches.length === 0) {
    console.error(`✗ Zernio returned 0 accounts for profile ${client.late_profile_id}`);
    process.exit(1);
  }

  console.log(`Found ${matches.length} Zernio accounts for this profile:\n`);
  for (const a of matches) {
    console.log(`  ${(a.platform ?? '?').padEnd(10)} @${a.username ?? '?'}  id=${a._id}`);
  }

  // Existing rows so we report what's net-new vs updated.
  const { data: existing } = await admin
    .from('social_profiles')
    .select('platform, late_account_id, username, is_active')
    .eq('client_id', client.id);
  const existingByPlatform = new Map((existing ?? []).map((e) => [e.platform, e]));

  console.log('\nPlanned writes:');
  const rows = matches
    .filter((a) => a._id && a.platform)
    .map((a) => ({
      client_id: client.id,
      platform: a.platform!,
      platform_user_id: a.username || a._id!,
      username: a.username ?? '',
      avatar_url: null as string | null,
      late_account_id: a._id!,
      is_active: true,
    }));

  for (const r of rows) {
    const cur = existingByPlatform.get(r.platform);
    if (!cur) console.log(`  + ${r.platform.padEnd(10)} INSERT  late=${r.late_account_id}`);
    else if (cur.late_account_id !== r.late_account_id)
      console.log(`  ~ ${r.platform.padEnd(10)} UPDATE  late ${cur.late_account_id ?? '(null)'} → ${r.late_account_id}`);
    else console.log(`  · ${r.platform.padEnd(10)} unchanged`);
  }

  if (!apply) {
    console.log('\n(dry-run — re-run with --apply)');
    return;
  }

  for (const r of rows) {
    const { error } = await admin.from('social_profiles').upsert(r, {
      onConflict: 'client_id,platform,platform_user_id',
    });
    if (error) console.error(`  ✗ ${r.platform}: ${error.message}`);
    else console.log(`  ✓ ${r.platform}`);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('\n✗ sync-zernio-accounts crashed:', err);
  process.exit(1);
});
