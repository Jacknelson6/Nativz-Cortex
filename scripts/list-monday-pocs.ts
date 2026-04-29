/**
 * List Monday POC contacts for every client we have in Cortex, grouped by
 * client. Marks any Monday email that already exists on the Cortex contacts
 * card as [skip — overlap]. Use the output to fill the gaps in each client's
 * contacts card on Cortex.
 *
 * Usage:
 *   npx tsx scripts/list-monday-pocs.ts
 *   npx tsx scripts/list-monday-pocs.ts --smm-only      # only SMM clients
 *   npx tsx scripts/list-monday-pocs.ts --json          # machine-readable
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
import { fetchMondayClients, parseMondayClient } from '@/lib/monday/client';

const SMM_ONLY = process.argv.includes('--smm-only');
const JSON_OUT = process.argv.includes('--json');

interface CortexClient {
  id: string;
  name: string;
  agency: string | null;
  contact_emails: Set<string>;
}

async function loadCortexClients(): Promise<Map<string, CortexClient>> {
  const admin = createAdminClient();
  const { data: clients } = await admin
    .from('clients')
    .select('id, name, agency')
    .returns<Array<{ id: string; name: string; agency: string | null }>>();
  const { data: contacts } = await admin
    .from('contacts')
    .select('client_id, email')
    .returns<Array<{ client_id: string; email: string | null }>>();

  const byId = new Map<string, CortexClient>();
  for (const c of clients ?? []) {
    byId.set(c.id, { id: c.id, name: c.name, agency: c.agency, contact_emails: new Set() });
  }
  for (const ct of contacts ?? []) {
    if (!ct.email) continue;
    const cli = byId.get(ct.client_id);
    if (cli) cli.contact_emails.add(ct.email.toLowerCase().trim());
  }
  return byId;
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

interface Row {
  cortexClient: CortexClient;
  mondayName: string;
  services: string[];
  pocs: Array<{ name: string; email: string; overlap: boolean }>;
}

async function main() {
  const cortexClients = await loadCortexClients();
  const mondayItems = await fetchMondayClients();

  const cortexByNorm = new Map<string, CortexClient>();
  for (const c of cortexClients.values()) {
    cortexByNorm.set(normalizeName(c.name), c);
  }

  const rows: Row[] = [];
  const unmatchedMonday: Array<{ name: string; services: string[]; pocCount: number }> = [];

  for (const item of mondayItems) {
    const parsed = parseMondayClient(item);
    if (SMM_ONLY && !parsed.services.includes('SMM')) continue;
    const cortex = cortexByNorm.get(normalizeName(parsed.name));
    if (!cortex) {
      if (parsed.contacts.length > 0) {
        unmatchedMonday.push({
          name: parsed.name,
          services: parsed.services,
          pocCount: parsed.contacts.length,
        });
      }
      continue;
    }
    const pocs = parsed.contacts.map((c) => ({
      name: c.name,
      email: c.email,
      overlap: cortex.contact_emails.has(c.email.toLowerCase().trim()),
    }));
    rows.push({
      cortexClient: cortex,
      mondayName: parsed.name,
      services: parsed.services,
      pocs,
    });
  }

  rows.sort((a, b) => a.cortexClient.name.localeCompare(b.cortexClient.name));

  if (JSON_OUT) {
    console.log(JSON.stringify({ rows, unmatchedMonday }, null, 2));
    return;
  }

  let totalGaps = 0;
  let totalOverlaps = 0;

  for (const row of rows) {
    const services = row.services.length ? row.services.join(', ') : 'no services';
    const agency = row.cortexClient.agency ?? '—';
    console.log(`\n${row.cortexClient.name}  [${agency}]  · ${services}`);
    if (row.pocs.length === 0) {
      console.log('  (no POCs on Monday)');
      continue;
    }
    for (const poc of row.pocs) {
      if (poc.overlap) {
        console.log(`  · ${poc.name} <${poc.email}>  [skip — overlap]`);
        totalOverlaps++;
      } else {
        console.log(`  + ${poc.name} <${poc.email}>`);
        totalGaps++;
      }
    }
  }

  if (unmatchedMonday.length > 0) {
    console.log('\n— Monday clients with POCs but no matching Cortex client —');
    for (const u of unmatchedMonday) {
      const services = u.services.length ? u.services.join(', ') : 'no services';
      console.log(`  · ${u.name}  (${services}, ${u.pocCount} POC${u.pocCount === 1 ? '' : 's'})`);
    }
  }

  console.log(
    `\nSummary: ${rows.length} Cortex clients matched · ${totalGaps} contacts to add · ${totalOverlaps} overlaps to skip · ${unmatchedMonday.length} Monday-only clients`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
