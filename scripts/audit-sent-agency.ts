/**
 * Cross-check that every calendar sent in the April 2026 batch went out under
 * the correct agency brand. Pulls clients.agency for each, runs it through
 * getBrandFromAgency(), and flags any mismatch with what we actually sent.
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
import { getBrandFromAgency } from '@/lib/agency/detect';

const SENT = [
  { name: 'All Shutters and Blinds', sentAs: 'nativz' as const },
  { name: 'Custom Shade and Shutter', sentAs: 'nativz' as const },
  { name: 'Coast to Coast', sentAs: 'anderson' as const },
  { name: 'Crystal Creek Cattle', sentAs: 'nativz' as const },
  { name: "Dunston's Steakhouse", sentAs: 'nativz' as const },
  { name: 'Equidad Homes', sentAs: 'anderson' as const },
  { name: 'Fusion Brands', sentAs: 'nativz' as const },
  { name: 'Varsity Vault', sentAs: 'nativz' as const },
  { name: 'Goodier Labs', sentAs: 'nativz' as const },
  { name: 'Hartley Law', sentAs: 'nativz' as const },
  { name: 'National Lenders', sentAs: 'nativz' as const },
  { name: 'Owings Auto', sentAs: 'anderson' as const },
  { name: 'Rank Prompt', sentAs: 'nativz' as const },
  { name: 'Skibell Fine Jewelry', sentAs: 'nativz' as const },
  { name: 'The Standard Ranch Water', sentAs: 'nativz' as const },
  { name: 'Total Plumbing', sentAs: 'nativz' as const },
];

async function main() {
  const admin = createAdminClient();
  const { data: clients } = await admin
    .from('clients')
    .select('name, agency')
    .returns<Array<{ name: string; agency: string | null }>>();

  const byName = new Map<string, string | null>();
  for (const c of clients ?? []) byName.set(c.name, c.agency);

  console.log('\n=== Brand audit (April 2026 batch) ===\n');
  let mismatches = 0;
  for (const row of SENT) {
    const agency = byName.get(row.name);
    if (agency === undefined) {
      console.log(`✗ ${row.name}: not found in clients table`);
      mismatches++;
      continue;
    }
    const expected = getBrandFromAgency(agency);
    const ok = expected === row.sentAs;
    const symbol = ok ? '✓' : '✗ MISMATCH';
    console.log(
      `${symbol} ${row.name}  ·  agency="${agency ?? '(null)'}"  →  expected=${expected}  sent=${row.sentAs}`,
    );
    if (!ok) mismatches++;
  }

  console.log(
    `\nResult: ${SENT.length - mismatches}/${SENT.length} match · ${mismatches} mismatch${mismatches === 1 ? '' : 'es'}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
