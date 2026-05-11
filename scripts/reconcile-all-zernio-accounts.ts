/**
 * One-off: run the sync-zernio-accounts logic across every client right
 * now, so we surface every client whose Zernio side has accounts that
 * Cortex's social_profiles table is missing.
 *
 * - Dry-run first: prints the full diff (client → platforms it would
 *   add) and asks for `--apply` to actually insert.
 * - Same safety rules as the cron: never delete, never overwrite, only
 *   insert missing (client_id, platform) rows.
 * - Picks `is_active=true`, `token_status='valid'`, `account_owner='client'`
 *   as safe defaults.
 *
 * Run:
 *   npx tsx scripts/reconcile-all-zernio-accounts.ts          # dry run
 *   npx tsx scripts/reconcile-all-zernio-accounts.ts --apply  # write
 */
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { ZernioPostingService } = await import('@/lib/posting');

  const admin = createAdminClient();
  const service = new ZernioPostingService();

  const { data: clientRows, error: clientsErr } = await admin
    .from('clients')
    .select('id, name, agency, late_profile_id, updated_at')
    .not('late_profile_id', 'is', null);
  if (clientsErr) throw new Error(`clients: ${clientsErr.message}`);

  const profileToClient = new Map<string, { clientId: string; name: string }>();
  for (const c of [...(clientRows ?? [])].sort((a, b) =>
    (b.updated_at as string).localeCompare(a.updated_at as string),
  )) {
    const pid = c.late_profile_id as string;
    if (profileToClient.has(pid)) continue;
    profileToClient.set(pid, {
      clientId: c.id as string,
      name: c.name as string,
    });
  }

  console.log(`[clients] ${profileToClient.size} clients with late_profile_id`);

  const zernio = await service.getConnectedProfiles();
  console.log(`[zernio] ${zernio.length} total accounts returned`);

  const { data: existing } = await admin
    .from('social_profiles')
    .select('client_id, platform');
  const existingKeys = new Set<string>();
  for (const row of existing ?? []) {
    existingKeys.add(`${row.client_id}:${row.platform}`);
  }

  type Candidate = {
    clientId: string;
    clientName: string;
    platform: string;
    lateAccountId: string;
    username: string;
  };
  const candidates: Candidate[] = [];
  const skipUnmatched: string[] = [];
  const skipNoProfile: string[] = [];

  for (const a of zernio) {
    if (!a.profileId) {
      skipNoProfile.push(`${a.platform} @${a.username}`);
      continue;
    }
    const client = profileToClient.get(a.profileId);
    if (!client) {
      skipUnmatched.push(`${a.platform} @${a.username} profileId=${a.profileId}`);
      continue;
    }
    const key = `${client.clientId}:${a.platform}`;
    if (existingKeys.has(key)) continue;
    candidates.push({
      clientId: client.clientId,
      clientName: client.name,
      platform: a.platform,
      lateAccountId: a.id,
      username: a.username || '',
    });
    existingKeys.add(key);
  }

  const byClient = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const list = byClient.get(c.clientId) ?? [];
    list.push(c);
    byClient.set(c.clientId, list);
  }

  console.log(`\n[diff] ${candidates.length} missing rows across ${byClient.size} clients`);
  if (byClient.size === 0) {
    console.log('[diff] no drift detected. all clients in sync.');
  }
  for (const [, group] of byClient) {
    const name = group[0].clientName;
    const list = group
      .map((g) => `${g.platform}(@${g.username || '?'})`)
      .join(', ');
    console.log(`  - ${name}: ${list}`);
  }

  if (skipNoProfile.length > 0) {
    console.log(`\n[skipped] ${skipNoProfile.length} Zernio rows with no profileId`);
  }
  if (skipUnmatched.length > 0) {
    console.log(`[skipped] ${skipUnmatched.length} Zernio rows whose profileId matches no client`);
    for (const s of skipUnmatched.slice(0, 10)) console.log(`    ${s}`);
    if (skipUnmatched.length > 10) console.log(`    ... +${skipUnmatched.length - 10} more`);
  }

  if (!apply) {
    console.log('\n[dry-run] pass --apply to actually insert.');
    return;
  }
  if (candidates.length === 0) {
    console.log('\n[apply] nothing to do.');
    return;
  }

  const rows = candidates.map((c) => ({
    client_id: c.clientId,
    platform: c.platform,
    platform_user_id: c.lateAccountId,
    username: c.username,
    late_account_id: c.lateAccountId,
    is_active: true,
    token_status: 'valid' as const,
    account_owner: 'client' as const,
  }));

  const { error: insertErr } = await admin
    .from('social_profiles')
    .insert(rows);
  if (insertErr) {
    console.error(`[apply] insert failed: ${insertErr.message}`);
    process.exit(1);
  }
  console.log(`\n[apply] inserted ${rows.length} social_profiles rows.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
