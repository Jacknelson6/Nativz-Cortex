/**
 * Import client POC contacts into Cortex `contacts` table.
 *
 * Sources:
 *   1. Monday Clients board POCs (auto-pulled, full Name <email>)
 *   2. MANUAL_POCS below (Jack-provided, for clients Monday doesn't have POCs for)
 *
 * Behavior:
 *   - Matches Monday client name → Cortex client by normalized name
 *   - Skips any (client_id, lower(email)) that already exists in Cortex
 *   - First inserted POC for a client gets is_primary=true (only if that
 *     client currently has zero contacts)
 *
 * Usage:
 *   npx tsx scripts/import-client-contacts.ts            # dry run by default
 *   APPLY=1 npx tsx scripts/import-client-contacts.ts    # actually insert
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

const APPLY = process.env.APPLY === '1';

interface ManualPoc {
  clientName: string;
  name: string;
  email: string;
  role?: string; // free-form note, e.g. "Paid Media only"
}

// Manual POCs for Cortex clients Monday doesn't cover.
// Add first/last names as you confirm them — script falls back to email
// local-part if `name` is left empty.
const MANUAL_POCS: ManualPoc[] = [
  // All Shutters and Blinds (Custom Shade and Shutter shares this contact)
  { clientName: 'All Shutters and Blinds', name: 'Amanda Jackson', email: 'amanda@two-usa.com' },

  // Avondale Private Lending
  { clientName: 'Avondale Private Lending', name: 'Allison Spears', email: 'allison@avondale-im.com' },
  { clientName: 'Avondale Private Lending', name: 'John Spears', email: 'john@avondale-im.com' },

  // College Hunks Hauling Junk
  { clientName: 'College Hunks Hauling Junk', name: 'Alex Turnage', email: 'alex.Turnage@chhj.com' },
  { clientName: 'College Hunks Hauling Junk', name: 'Mary Mills', email: 'Mary.Mills@chhj.com' },
  { clientName: 'College Hunks Hauling Junk', name: 'Joe Fortunato', email: 'joe.fortunato@chhj.com', role: 'Paid Media only' },

  // EcoView
  { clientName: 'EcoView', name: 'Allyssa Williamson', email: 'allyssa@ecoviewdfw.com' },

  // JAMNOLA
  { clientName: 'JAMNOLA', name: 'Jonny Liss', email: 'jonny@jamnola.com' },
  { clientName: 'JAMNOLA', name: 'Amber Soletti', email: 'amber@jamnola.com' },
  { clientName: 'JAMNOLA', name: 'Chad Smith', email: 'chad@jamnola.com' },
  { clientName: 'JAMNOLA', name: 'Cait Doyle', email: 'cait@jamnola.com' },

  // National Lenders
  { clientName: 'National Lenders', name: 'Krisahn Williams', email: 'kwilliams@nationallenders.com' },
  { clientName: 'National Lenders', name: 'Eric Hurst', email: 'ehurst@nationallenders.com' },
  { clientName: 'National Lenders', name: 'Ken Terkel', email: 'kterkel@nationallenders.com', role: 'Avoid bulk/marketing emails' },

  // Cortex clients not on Monday at all
  { clientName: 'Ampersand Studios', name: 'Erenia Lemus-Vazquez', email: 'erenia@amperstudios.com' },
  { clientName: 'Bit Bunker', name: 'Steven Rangel', email: 'shrangel@atlanticmfgs.com', role: 'Paid Media only' },
  { clientName: 'Bit Bunker', name: 'Camila Checa', email: 'camila@atlanticmfgs.com', role: 'Paid Media only' },
  { clientName: 'Claude Skills 360', name: 'Cole Feigl', email: 'cole@nativz.io' },
  { clientName: 'Claude Skills 360', name: 'Trevor Anderson', email: 'trevor@andersoncollaborative.com' },
  { clientName: 'Claude Skills 360', name: 'Jack Nelson', email: 'jack@nativz.io' },
  { clientName: 'SafeStop', name: 'Mandy Polansky', email: 'mandy@sablerealty.com' },
  { clientName: 'SafeStop', name: 'Chris Storm', email: 'Chris@sablerealty.com' },

  // Stealth Health Life — Paid Media only client
  { clientName: 'Stealth Health Life', name: 'Tom Walsh', email: 'tom@stealthhealthcookbook.com', role: 'Paid Media only' },
  { clientName: 'Stealth Health Life', name: 'Sean Henke', email: 'sean@stealthhealthcookbook.com', role: 'Paid Media only' },
  { clientName: 'Stealth Health Life', name: 'Trevor Anderson', email: 'trevor@andersoncollaborative.com', role: 'Paid Media only' },
  { clientName: 'Stealth Health Life', name: 'Cole Feigl', email: 'cole@nativz.io', role: 'Paid Media only' },

  // Ethan Kramer
  { clientName: 'Ethan Kramer', name: 'Ethan Kramer', email: 'ethan@ethankramer.com' },
];

interface CortexClient {
  id: string;
  name: string;
  agency: string | null;
  has_contacts: boolean;
  existing_emails: Set<string>;
}

interface InsertSpec {
  client_id: string;
  client_name: string;
  name: string;
  email: string;
  role?: string;
  is_primary: boolean;
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
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

  const byNorm = new Map<string, CortexClient>();
  const byId = new Map<string, CortexClient>();
  for (const c of clients ?? []) {
    const entry: CortexClient = {
      id: c.id,
      name: c.name,
      agency: c.agency,
      has_contacts: false,
      existing_emails: new Set(),
    };
    byNorm.set(normalizeName(c.name), entry);
    byId.set(c.id, entry);
  }
  for (const ct of contacts ?? []) {
    const cli = byId.get(ct.client_id);
    if (!cli) continue;
    cli.has_contacts = true;
    if (ct.email) cli.existing_emails.add(ct.email.toLowerCase().trim());
  }
  return byNorm;
}

async function main() {
  const cortexByNorm = await loadCortexClients();
  const mondayItems = await fetchMondayClients();

  const inserts: InsertSpec[] = [];
  const skipped: Array<{ client: string; email: string; reason: string }> = [];
  // track which clients already have a primary committed in this run
  const claimedPrimary = new Set<string>();

  function queue(rawName: string, email: string, clientName: string, role?: string) {
    const cleanedEmail = email.trim().toLowerCase();
    const cortex = cortexByNorm.get(normalizeName(clientName));
    if (!cortex) {
      skipped.push({ client: clientName, email: cleanedEmail, reason: 'no Cortex client match' });
      return;
    }
    if (cortex.existing_emails.has(cleanedEmail)) {
      skipped.push({ client: cortex.name, email: cleanedEmail, reason: 'overlap (already on contacts)' });
      return;
    }
    const trimmedName = rawName.trim();
    if (!trimmedName) {
      skipped.push({ client: cortex.name, email: cleanedEmail, reason: 'name pending — fill MANUAL_POCS.name and re-run' });
      return;
    }
    const isPrimary =
      !cortex.has_contacts && !claimedPrimary.has(cortex.id);
    if (isPrimary) claimedPrimary.add(cortex.id);
    inserts.push({
      client_id: cortex.id,
      client_name: cortex.name,
      name: trimmedName,
      email: cleanedEmail,
      role,
      is_primary: isPrimary,
    });
    cortex.existing_emails.add(cleanedEmail); // protect against later dupes within run
  }

  // 1. Monday-sourced POCs
  for (const item of mondayItems) {
    const parsed = parseMondayClient(item);
    for (const c of parsed.contacts) {
      queue(c.name, c.email, parsed.name);
    }
  }

  // 2. Manual POCs
  for (const m of MANUAL_POCS) {
    queue(m.name, m.email, m.clientName, m.role);
  }

  inserts.sort(
    (a, b) =>
      a.client_name.localeCompare(b.client_name) ||
      (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0),
  );

  console.log(`\n— ${inserts.length} contacts to insert —`);
  for (const row of inserts) {
    const flag = row.is_primary ? ' ★ primary' : '';
    const role = row.role ? ` · ${row.role}` : '';
    console.log(`  + ${row.client_name}: ${row.name} <${row.email}>${flag}${role}`);
  }

  if (skipped.length > 0) {
    console.log(`\n— ${skipped.length} skipped —`);
    for (const s of skipped) {
      console.log(`  · ${s.client}: ${s.email}  (${s.reason})`);
    }
  }

  if (!APPLY) {
    console.log('\nDry run. Re-run with APPLY=1 to insert.');
    return;
  }

  if (inserts.length === 0) {
    console.log('\nNothing to insert.');
    return;
  }

  const admin = createAdminClient();
  const { error } = await admin.from('contacts').insert(
    inserts.map((r) => ({
      client_id: r.client_id,
      name: r.name,
      email: r.email,
      role: r.role ?? null,
      is_primary: r.is_primary,
    })),
  );

  if (error) {
    console.error('\nInsert failed:', error.message);
    process.exit(1);
  }

  console.log(`\n✓ Inserted ${inserts.length} contacts.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
