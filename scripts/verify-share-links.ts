/**
 * Pull Monday "Later Calendar View" link for every NEEDS SEND row and resolve
 * each share URL against the Cortex content_drop_share_links table to confirm
 * the link points at the right client. Also surface POC overlaps across
 * clients (same email on multiple Cortex clients).
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), '.env.local');
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq);
  let val = trimmed.slice(eq + 1);
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = val;
}

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchContentCalendarItems, parseContentCalendarItem } from '@/lib/monday/client';

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
}

const TARGET_GROUP = process.argv.includes('--group')
  ? process.argv[process.argv.indexOf('--group') + 1]
  : 'April 2026';

const NEEDS_SEND = new Set(['', 'not sent']);

async function main() {
  const admin = createAdminClient();

  const [{ items }, clientsRes, contactsRes, sharesRes] = await Promise.all([
    fetchContentCalendarItems(),
    admin.from('clients').select('id, name, agency').returns<Array<{ id: string; name: string; agency: string | null }>>(),
    admin.from('contacts').select('client_id, name, email, is_primary, role').returns<Array<{
      client_id: string; name: string; email: string | null; is_primary: boolean; role: string | null;
    }>>(),
    admin.from('content_drop_share_links').select('token, drop_id, content_drops!inner(client_id, start_date)').returns<Array<{
      token: string; drop_id: string; content_drops: { client_id: string; start_date: string };
    }>>(),
  ]);

  const clientById = new Map<string, { name: string; agency: string | null }>();
  for (const c of clientsRes.data ?? []) clientById.set(c.id, { name: c.name, agency: c.agency });

  const clientByNorm = new Map<string, { id: string; name: string; agency: string | null }>();
  for (const c of clientsRes.data ?? []) {
    clientByNorm.set(normalizeName(c.name), { id: c.id, name: c.name, agency: c.agency });
  }

  // share_token → cortex client
  const shareToCortexClient = new Map<string, { clientId: string; clientName: string; agency: string | null; startDate: string }>();
  for (const s of sharesRes.data ?? []) {
    const cli = clientById.get(s.content_drops.client_id);
    shareToCortexClient.set(s.token, {
      clientId: s.content_drops.client_id,
      clientName: cli?.name ?? '?',
      agency: cli?.agency ?? null,
      startDate: s.content_drops.start_date,
    });
  }

  // contacts grouped by client
  const contactsByClientId = new Map<string, Array<{ name: string; email: string; is_primary: boolean; role: string | null }>>();
  for (const ct of contactsRes.data ?? []) {
    if (!ct.email) continue;
    const arr = contactsByClientId.get(ct.client_id) ?? [];
    arr.push({ name: ct.name, email: ct.email, is_primary: ct.is_primary, role: ct.role });
    contactsByClientId.set(ct.client_id, arr);
  }

  const parsed = items
    .filter((it) => it.group.title === TARGET_GROUP)
    .map(parseContentCalendarItem)
    .filter((p) => NEEDS_SEND.has((p.clientApproval || '').trim().toLowerCase()));

  console.log(`\n=== Share-link verification (${TARGET_GROUP}, ${parsed.length} needs-send items) ===\n`);

  function extractToken(url: string): string | null {
    const m = url.match(/\/c\/([a-f0-9]+)/i);
    return m ? m[1] : null;
  }

  const verified: Array<{
    monday: string;
    cortex: string;
    cortexId: string;
    agency: string | null;
    url: string;
    contacts: Array<{ name: string; email: string; is_primary: boolean; role: string | null }>;
  }> = [];

  for (const p of parsed) {
    const url = p.laterCalendarUrl;
    if (!url) {
      console.log(`✗ ${p.clientName}: no Later Calendar View link`);
      continue;
    }
    const token = extractToken(url);
    if (!token) {
      console.log(`✗ ${p.clientName}: link doesn't look like a share URL — ${url}`);
      continue;
    }
    const resolved = shareToCortexClient.get(token);
    if (!resolved) {
      console.log(`✗ ${p.clientName}: token ${token} not found in Cortex content_drop_share_links`);
      continue;
    }
    const expected = clientByNorm.get(normalizeName(p.clientName));
    if (!expected) {
      console.log(`✗ ${p.clientName}: not in Cortex clients — link goes to ${resolved.clientName}`);
      continue;
    }
    const ok = expected.id === resolved.clientId;
    const symbol = ok ? '✓' : '✗ MISMATCH';
    console.log(`${symbol} ${p.clientName}  →  ${resolved.clientName}  (start=${resolved.startDate})`);
    if (!ok) {
      console.log(`    Monday says: ${p.clientName}`);
      console.log(`    Share resolves to: ${resolved.clientName}`);
      console.log(`    URL: ${url}`);
    }
    if (ok) {
      const contacts = (contactsByClientId.get(expected.id) ?? []).filter(
        (c) => !/paid media only/i.test(c.role ?? '') && !/avoid bulk/i.test(c.role ?? ''),
      );
      contacts.sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
      verified.push({
        monday: p.clientName,
        cortex: resolved.clientName,
        cortexId: expected.id,
        agency: expected.agency,
        url,
        contacts,
      });
    }
  }

  // POC overlap detection
  console.log('\n=== POC overlaps (same email across multiple needs-send clients) ===\n');
  const emailToRows = new Map<string, typeof verified>();
  for (const v of verified) {
    for (const c of v.contacts) {
      const key = c.email.toLowerCase();
      const arr = emailToRows.get(key) ?? [];
      arr.push(v);
      emailToRows.set(key, arr);
    }
  }
  let overlapCount = 0;
  for (const [email, rows] of emailToRows.entries()) {
    const uniqueClients = new Set(rows.map((r) => r.cortex));
    if (uniqueClients.size > 1) {
      overlapCount++;
      const agencies = new Set(rows.map((r) => r.agency ?? '—'));
      console.log(`  ${email}  →  ${[...uniqueClients].join(', ')}  [${[...agencies].join(', ')}]`);
    }
  }
  if (overlapCount === 0) console.log('  (none)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
