/**
 * Hitlist of clients who still need their content calendar sent.
 *
 * Logic:
 *   • Pull Monday Content Calendars items in a target group (default: the
 *     "creation month" group whose calendar is currently in flight).
 *   • Empty Client Approval status = nobody has acted yet → either we haven't
 *     sent it, or the client hasn't clicked through.
 *   • Cross-reference each row against Cortex clients + contacts so the POC
 *     list is in the same view.
 *
 * Group naming reminder: "April 2026" group = May 1-31 calendar (creation
 * month, not live month).
 *
 * Usage:
 *   npx tsx scripts/calendar-send-hitlist.ts
 *   npx tsx scripts/calendar-send-hitlist.ts --group "April 2026"
 *   npx tsx scripts/calendar-send-hitlist.ts --all-groups
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
type ParsedItem = ReturnType<typeof parseContentCalendarItem>;

function defaultTargetGroup(): string {
  const now = new Date();
  return now.toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');
}

function parseArgs(): { group: string | null; allGroups: boolean } {
  const args = process.argv.slice(2);
  const allGroups = args.includes('--all-groups');
  const groupIdx = args.indexOf('--group');
  const group = groupIdx >= 0 ? args[groupIdx + 1] : null;
  return { group, allGroups };
}

interface CortexContact {
  name: string;
  email: string;
  is_primary: boolean;
  role: string | null;
}

async function loadCortexContactsByClient(): Promise<
  Map<string, { agency: string | null; contacts: CortexContact[] }>
> {
  const admin = createAdminClient();
  const { data: clients } = await admin
    .from('clients')
    .select('id, name, agency')
    .returns<Array<{ id: string; name: string; agency: string | null }>>();
  const { data: contacts } = await admin
    .from('contacts')
    .select('client_id, name, email, is_primary, role')
    .returns<Array<{
      client_id: string;
      name: string;
      email: string | null;
      is_primary: boolean;
      role: string | null;
    }>>();

  const idToName = new Map<string, { name: string; agency: string | null }>();
  for (const c of clients ?? []) {
    idToName.set(c.id, { name: c.name, agency: c.agency });
  }

  const byNorm = new Map<string, { agency: string | null; contacts: CortexContact[] }>();
  for (const c of clients ?? []) {
    byNorm.set(normalizeName(c.name), { agency: c.agency, contacts: [] });
  }
  for (const ct of contacts ?? []) {
    const cli = idToName.get(ct.client_id);
    if (!cli) continue;
    const entry = byNorm.get(normalizeName(cli.name));
    if (!entry) continue;
    if (!ct.email) continue;
    entry.contacts.push({
      name: ct.name,
      email: ct.email,
      is_primary: ct.is_primary,
      role: ct.role,
    });
  }
  // primary first
  for (const entry of byNorm.values()) {
    entry.contacts.sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
  }
  return byNorm;
}

async function main() {
  const { group: groupArg, allGroups } = parseArgs();
  const targetGroup = groupArg ?? defaultTargetGroup();

  const [{ items, groups }, cortexByName] = await Promise.all([
    fetchContentCalendarItems(),
    loadCortexContactsByClient(),
  ]);

  const filtered = allGroups
    ? items
    : items.filter((item) => item.group.title === targetGroup);

  if (!allGroups && filtered.length === 0) {
    console.log(`No items in group "${targetGroup}".`);
    console.log('\nAvailable groups:');
    for (const g of groups) console.log(`  · ${g.title}`);
    console.log(`\nRe-run with --group "Group Name" or --all-groups.`);
    return;
  }

  const parsed = filtered.map(parseContentCalendarItem);

  // "Not sent" or empty means we still need to send. Anything else (Waiting on
  // approval, Needs revision) means it's in the client's court.
  const NEEDS_SEND_STATES = new Set(['', 'not sent']);
  const status = (p: ParsedItem) => (p.clientApproval || '').trim().toLowerCase();
  const needsSend = parsed.filter((p) => NEEDS_SEND_STATES.has(status(p)));
  const inFlight = parsed.filter(
    (p) => !NEEDS_SEND_STATES.has(status(p)) && status(p) !== 'client approved',
  );
  const approved = parsed.filter((p) => status(p) === 'client approved');

  const groupLabel = allGroups ? 'all groups' : targetGroup;
  console.log(`\n=== ${groupLabel} — ${parsed.length} items ===`);

  function printRow(p: ParsedItem) {
    const cortex = cortexByName.get(normalizeName(p.clientName));
    const agency = cortex?.agency ?? '—';
    console.log(`\n  ${p.clientName}  [${agency}]  · ${p.groupTitle}`);
    if (p.agency) console.log(`    Monday agency: ${p.agency}`);
    if (p.clientApproval) console.log(`    Status: ${p.clientApproval}`);
    if (!cortex || cortex.contacts.length === 0) {
      console.log(`    POCs: (none on Cortex)`);
      return;
    }
    for (const c of cortex.contacts) {
      const flags = [c.is_primary ? '★' : null, c.role ?? null].filter(Boolean).join(' · ');
      console.log(`    POC: ${c.name} <${c.email}>${flags ? `  (${flags})` : ''}`);
    }
  }

  console.log(`\n— 🎯 NEEDS SEND  (${needsSend.length}) —`);
  for (const p of needsSend.sort((a, b) => a.clientName.localeCompare(b.clientName))) {
    printRow(p);
  }

  console.log(`\n— ⏳ awaiting client action  (${inFlight.length}) —`);
  for (const p of inFlight.sort((a, b) => a.clientName.localeCompare(b.clientName))) {
    printRow(p);
  }

  console.log(`\n— ✅ approved  (${approved.length}) —`);
  for (const p of approved.sort((a, b) => a.clientName.localeCompare(b.clientName))) {
    console.log(`  · ${p.clientName} (${p.groupTitle})`);
  }

  console.log(
    `\nSummary: ${needsSend.length} to send · ${inFlight.length} awaiting client · ${approved.length} approved`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
