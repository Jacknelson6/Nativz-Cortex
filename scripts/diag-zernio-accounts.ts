/**
 * Diagnostic: dump all Zernio accounts and compare against our
 * social_profiles table. We just discovered the Zernio Connections dashboard
 * shows IG + TikTok + YouTube connected for National Lenders, but our
 * social_profiles table only has FB + LinkedIn, so the calendar isn't
 * scheduling those legs.
 *
 * This dumps Zernio's source of truth so we can write a reconciler.
 *
 * Run with: npx tsx scripts/diag-zernio-accounts.ts
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
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();
  const { data: client } = await admin
    .from('clients')
    .select('id, name, late_profile_id')
    .ilike('name', '%National Lenders%')
    .single();

  if (!client?.late_profile_id) {
    console.error('No late_profile_id on client.');
    return;
  }
  console.log(`[client] ${client.name} (${client.id})`);
  console.log(`[profile] ${client.late_profile_id}`);

  const base =
    process.env.ZERNIO_API_BASE_URL ??
    process.env.LATE_API_BASE_URL ??
    'https://getlate.dev/api/v1';
  const key = process.env.ZERNIO_API_KEY ?? process.env.LATE_API_KEY;
  if (!key) throw new Error('Missing ZERNIO_API_KEY');

  const res = await fetch(`${base}/accounts`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const raw = await res.json();
  const list = Array.isArray(raw) ? raw : (raw?.accounts ?? []);
  console.log(`\n[zernio] ${list.length} total accounts on this org`);
  console.log('[zernio] sample row:');
  console.log(JSON.stringify(list[0], null, 2));
  console.log('\n[zernio] keys present on a row:', Object.keys(list[0] ?? {}));
  const nl = (list as Array<Record<string, unknown>>).filter((a) => {
    const u = String(a.username ?? '').toLowerCase();
    return u.includes('national') || u.includes('lender');
  });
  console.log(`\n[zernio] ${nl.length} accounts with "national" or "lender" in username:`);
  for (const a of nl) {
    console.log(
      `  - ${a.platform} @${a.username} profileId=${a.profileId ?? a.profile_id} id=${a._id ?? a.id}`,
    );
  }

  type Acct = {
    _id?: string;
    id?: string;
    profileId?: string;
    profile_id?: string;
    platform?: string;
    username?: string;
    isActive?: boolean;
    is_active?: boolean;
  };
  const matching = (list as Acct[]).filter(
    (a) =>
      a.profileId === client.late_profile_id ||
      a.profile_id === client.late_profile_id,
  );
  console.log(
    `[zernio] ${matching.length} accounts on profile ${client.late_profile_id}:`,
  );
  for (const a of matching) {
    console.log(
      `  - ${a.platform} @${a.username} id=${a._id ?? a.id} active=${
        a.isActive ?? a.is_active
      }`,
    );
  }

  const { data: profs } = await admin
    .from('social_profiles')
    .select('platform, username, late_account_id, is_active, token_status')
    .eq('client_id', client.id);
  console.log(`\n[cortex] ${(profs ?? []).length} social_profiles rows:`);
  for (const p of profs ?? []) {
    console.log(
      `  - ${p.platform} @${p.username} late_account_id=${p.late_account_id} active=${p.is_active} token=${p.token_status}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
