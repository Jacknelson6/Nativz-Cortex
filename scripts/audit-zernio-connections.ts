// Read-only audit: diff Zernio's connected-accounts state against our
// `social_profiles` rows. No writes. Surfaces:
//   - accounts in Zernio that aren't in our DB (orphan accounts)
//   - DB rows pointing at a `late_account_id` Zernio doesn't know
//   - drift on token_status / token_expires_at / username / is_active
//   - DB rows with NULL late_account_id but matching agency profile in Zernio
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { getPostingService } from '../lib/posting';

const envPath = existsSync('.env.local') ? '.env.local' : '../../../.env.local';
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface DbProfile {
  id: string;
  client_id: string;
  platform: string;
  username: string | null;
  is_active: boolean;
  late_account_id: string | null;
  token_status: string | null;
  token_expires_at: string | null;
  disconnect_alerted_at: string | null;
  account_owner: string | null;
}

interface ClientRow {
  id: string;
  name: string;
}

function fmtAge(iso: string | null): string {
  if (!iso) return 'never';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const ms = Date.now() - t;
  if (ms < 0) {
    const d = -ms / 86400000;
    return d < 1 ? `in ${Math.round(-ms / 3600000)}h` : `in ${d.toFixed(1)}d`;
  }
  const d = ms / 86400000;
  return d < 1 ? `${Math.round(ms / 3600000)}h ago` : `${d.toFixed(1)}d ago`;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

async function main() {
  const service = getPostingService();

  console.log('=== Zernio Connections Audit ===\n');

  // ── Load DB side ────────────────────────────────────────────────────────
  const { data: profilesRaw, error: pErr } = await admin
    .from('social_profiles')
    .select(
      'id, client_id, platform, username, is_active, late_account_id, token_status, token_expires_at, disconnect_alerted_at, account_owner',
    );
  if (pErr) throw pErr;
  const profiles = (profilesRaw ?? []) as DbProfile[];
  console.log(`db social_profiles rows: ${profiles.length}`);

  const { data: clientsRaw } = await admin.from('clients').select('id, name');
  const clientById = new Map<string, string>(
    ((clientsRaw ?? []) as ClientRow[]).map((c) => [c.id, c.name]),
  );

  // ── Load Zernio side ────────────────────────────────────────────────────
  console.log('fetching zernio accounts...');
  const zAccounts = await service.getConnectedProfiles();
  console.log(`zernio account rows: ${zAccounts.length}\n`);

  const zById = new Map(zAccounts.map((a) => [a.id, a]));
  const dbByLateId = new Map<string, DbProfile>();
  for (const p of profiles) {
    if (p.late_account_id) dbByLateId.set(p.late_account_id, p);
  }

  // ── Probe health for every account Zernio still claims ─────────────────
  console.log(`probing health for ${zAccounts.length} zernio accounts...`);
  const healthById = new Map<string, Awaited<ReturnType<typeof service.getAccountHealth>>>();
  await Promise.all(
    zAccounts.map(async (a) => {
      const h = await service.getAccountHealth(a.id);
      healthById.set(a.id, h);
    }),
  );

  // ── Section 1: Orphan Zernio accounts (in Zernio, not in DB) ───────────
  const orphanZernio = zAccounts.filter((a) => !dbByLateId.has(a.id));
  console.log(`\n── orphan zernio accounts (no DB row): ${orphanZernio.length} ──`);
  for (const a of orphanZernio) {
    const h = healthById.get(a.id);
    console.log(
      `  ${pad(a.platform, 12)} ${pad(a.username || '(no username)', 28)} zernio_id=${a.id}  health=${h?.status ?? 'n/a'}`,
    );
  }

  // ── Section 2: DB rows pointing at a missing Zernio account ───────────
  const stalePointers = profiles.filter(
    (p) => p.late_account_id && !zById.has(p.late_account_id),
  );
  console.log(`\n── db rows pointing at missing zernio account: ${stalePointers.length} ──`);
  for (const p of stalePointers) {
    const clientName = clientById.get(p.client_id) ?? '(unknown client)';
    console.log(
      `  ${pad(clientName, 28)} ${pad(p.platform, 12)} ${pad(p.username ?? '', 24)} late_id=${p.late_account_id}`,
    );
  }

  // ── Section 3: DB rows with NULL late_account_id ──────────────────────
  const unlinked = profiles.filter((p) => !p.late_account_id);
  console.log(`\n── db rows with NULL late_account_id: ${unlinked.length} ──`);
  for (const p of unlinked) {
    const clientName = clientById.get(p.client_id) ?? '(unknown client)';
    console.log(
      `  ${pad(clientName, 28)} ${pad(p.platform, 12)} ${pad(p.username ?? '', 24)} active=${p.is_active}`,
    );
  }

  // ── Section 4: Token health drift on linked rows ───────────────────────
  console.log(`\n── token health (linked rows) ──`);
  let healthy = 0;
  let degraded = 0;
  let dead = 0;
  let unknown = 0;
  type DriftRow = {
    clientName: string;
    p: DbProfile;
    h: NonNullable<Awaited<ReturnType<typeof service.getAccountHealth>>>;
    drift: string[];
  };
  const drifts: DriftRow[] = [];

  for (const p of profiles) {
    if (!p.late_account_id) continue;
    const h = healthById.get(p.late_account_id);
    if (!h) {
      unknown++;
      continue;
    }
    const tokenValid = h.tokenValid;
    const expiresAt = h.tokenExpiresAt;
    const expired = !!expiresAt && Date.parse(expiresAt) < Date.now();
    if (expired || !tokenValid) dead++;
    else if (h.needsRefresh) degraded++;
    else healthy++;

    const drift: string[] = [];
    if (p.username !== h.username && h.username) {
      drift.push(`username db="${p.username}" zernio="${h.username}"`);
    }
    // Cortex stores its own enum (`valid` | `needs_refresh` | `expired`);
    // Zernio's raw `status` is a different enum (`healthy` | `warning` | …).
    // Only flag drift when Cortex thinks the token is healthy but Zernio
    // thinks it's bad (the actually-dangerous case).
    const cortexThinksHealthy = !p.token_status || p.token_status === 'valid';
    const zernioThinksBad = !h.tokenValid || h.needsRefresh;
    if (cortexThinksHealthy && zernioThinksBad) {
      drift.push(`status db="${p.token_status ?? 'null'}" but zernio reports status=${h.status} valid=${h.tokenValid} needsRefresh=${h.needsRefresh}`);
    }
    // Parse-equal timestamps with different formatting (`+00:00` vs `Z`,
    // trailing zero precision) are not real drift — only flag when the
    // millisecond-resolution timestamps actually differ.
    const dbMs = p.token_expires_at ? Date.parse(p.token_expires_at) : null;
    const zMs = h.tokenExpiresAt ? Date.parse(h.tokenExpiresAt) : null;
    const bothNull = dbMs === null && zMs === null;
    const equalish =
      dbMs !== null && zMs !== null && Math.abs(dbMs - zMs) <= 1000;
    if (!bothNull && !equalish) {
      drift.push(
        `expires db=${p.token_expires_at ?? 'null'} (${fmtAge(p.token_expires_at)}) zernio=${h.tokenExpiresAt ?? 'null'} (${fmtAge(h.tokenExpiresAt)})`,
      );
    }
    const clientName = clientById.get(p.client_id) ?? '(unknown client)';
    if (drift.length) drifts.push({ clientName, p, h, drift });
  }

  console.log(`  summary: healthy=${healthy} degraded=${degraded} dead=${dead} unknown=${unknown}`);
  console.log(`\n── drift on linked rows: ${drifts.length} ──`);
  for (const d of drifts) {
    console.log(`  ${d.clientName} / ${d.p.platform} / @${d.p.username ?? '?'}`);
    for (const line of d.drift) console.log(`      ${line}`);
  }

  // ── Section 5: Dead-token roster ───────────────────────────────────────
  console.log(`\n── dead / expired tokens (linked rows) ──`);
  for (const p of profiles) {
    if (!p.late_account_id) continue;
    const h = healthById.get(p.late_account_id);
    if (!h) continue;
    const expired = !!h.tokenExpiresAt && Date.parse(h.tokenExpiresAt) < Date.now();
    if (!expired && h.tokenValid) continue;
    const clientName = clientById.get(p.client_id) ?? '(unknown client)';
    const expiresFmt = h.tokenExpiresAt ? fmtAge(h.tokenExpiresAt) : 'unknown';
    console.log(
      `  ${pad(clientName, 28)} ${pad(p.platform, 12)} @${pad(p.username ?? '?', 22)} zernio_status=${h.status}  expires=${expiresFmt}  alerted=${fmtAge(p.disconnect_alerted_at)}`,
    );
  }

  console.log('\ndone');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
