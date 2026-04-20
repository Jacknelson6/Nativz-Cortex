/**
 * Backfill social_profiles.late_account_id from Zernio /v1/accounts.
 *
 * Zernio holds the ground truth: each connected social account has
 * profileId._id that maps 1:1 to clients.late_profile_id in our DB.
 * Our OAuth callback has historically failed to persist the accountId
 * (Zernio's redirect often omits ?accountId=…), so many clients show as
 * disconnected in our DB even though they're fully wired in Zernio.
 *
 * Usage: npx tsx scripts/backfill-zernio-account-ids.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

// Load .env.local
const envLines = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8').split('\n');
for (const l of envLines) {
  const m = l.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const ZERNIO_KEY = process.env.ZERNIO_API_KEY ?? process.env.LATE_API_KEY;
const ZERNIO_BASE = (process.env.ZERNIO_API_BASE ?? 'https://zernio.com/api/v1').replace(/\/$/, '');

if (!ZERNIO_KEY) {
  console.error('ZERNIO_API_KEY is missing.');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface ZernioAccount {
  _id: string;
  platform: string;
  username?: string;
  displayName?: string;
  profileId?: { _id?: string; name?: string } | string;
  isActive?: boolean;
}

function normalizeUsername(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function main() {
  // 1) Pull all Zernio accounts.
  const res = await fetch(`${ZERNIO_BASE}/accounts`, {
    headers: { Authorization: `Bearer ${ZERNIO_KEY}` },
  });
  if (!res.ok) {
    console.error('Zernio /accounts failed:', res.status, await res.text());
    process.exit(1);
  }
  const body = (await res.json()) as { accounts?: ZernioAccount[] };
  const accounts = body.accounts ?? [];
  console.log(`[zernio] fetched ${accounts.length} accounts`);

  // 2) Pull clients with a Zernio profile id.
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, late_profile_id')
    .not('late_profile_id', 'is', null);

  const clientByZernioProfile = new Map<string, { id: string; name: string }>();
  for (const c of clients ?? []) {
    if (c.late_profile_id) clientByZernioProfile.set(c.late_profile_id, { id: c.id, name: c.name });
  }

  // 3) For each Zernio account, resolve -> client -> social_profile and update.
  let updated = 0;
  let skippedNoClient = 0;
  let skippedNoProfile = 0;
  let created = 0;

  for (const a of accounts) {
    const zernioProfileId =
      typeof a.profileId === 'string' ? a.profileId : a.profileId?._id ?? null;
    if (!zernioProfileId) {
      skippedNoClient++;
      continue;
    }
    const client = clientByZernioProfile.get(zernioProfileId);
    if (!client) {
      skippedNoClient++;
      console.log(`[skip] account ${a._id} (${a.platform}) → no client with late_profile_id=${zernioProfileId}`);
      continue;
    }

    // Find matching social_profile row. Match on (client_id, platform) —
    // username may drift or be slightly normalised, so prefer platform match
    // and then refine by username when multiple rows exist.
    const { data: profiles } = await supabase
      .from('social_profiles')
      .select('id, platform, username, late_account_id')
      .eq('client_id', client.id)
      .eq('platform', a.platform);

    const norm = normalizeUsername(a.username);
    let target = (profiles ?? []).find((p) => normalizeUsername(p.username) === norm);
    if (!target && (profiles?.length ?? 0) === 1) target = profiles![0];

    if (!target) {
      // No matching row — create one so the cron can pick it up.
      const { error } = await supabase.from('social_profiles').insert({
        client_id: client.id,
        platform: a.platform,
        platform_user_id: a.username ?? a._id,
        username: a.username ?? '',
        late_account_id: a._id,
        is_active: true,
      });
      if (error) {
        console.log(`[err] insert for ${client.name} ${a.platform} ${a.username}: ${error.message}`);
        skippedNoProfile++;
        continue;
      }
      created++;
      console.log(`[new] ${client.name} ${a.platform} @${a.username} → ${a._id}`);
      continue;
    }

    if (target.late_account_id === a._id) continue; // already correct

    const { error } = await supabase
      .from('social_profiles')
      .update({ late_account_id: a._id, is_active: true })
      .eq('id', target.id);
    if (error) {
      console.log(`[err] update ${target.id}: ${error.message}`);
      skippedNoProfile++;
      continue;
    }
    updated++;
    console.log(`[upd] ${client.name} ${a.platform} @${a.username} → ${a._id}`);
  }

  console.log('---');
  console.log(`updated: ${updated}`);
  console.log(`created: ${created}`);
  console.log(`skipped (no client): ${skippedNoClient}`);
  console.log(`skipped (errors): ${skippedNoProfile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
