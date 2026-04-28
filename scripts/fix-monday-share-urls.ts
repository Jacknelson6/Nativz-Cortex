/**
 * Reconcile Monday "Later Calendar Link" cells with the per-client brand host.
 *
 * Two classes of bug get fixed in one pass:
 *   1. localhost URLs left over from the early batch run that defaulted
 *      QUEUE_APP_URL to localhost:3001.
 *   2. Cross-brand mismatches — Anderson Collaborative clients (agency=AC)
 *      whose share URLs point at cortex.nativz.io instead of
 *      cortex.andersoncollaborative.com.
 *
 * The DB-stored share token is portable across hosts; only the Monday cell
 * value (and the link the client clicks from email) needs to match the brand.
 *
 *   npx tsx scripts/fix-monday-share-urls.ts          # dry-run
 *   npx tsx scripts/fix-monday-share-urls.ts --apply  # apply
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAprilRows, getMondayToken, setLaterCalendarLink, type MondayRow } from '@/lib/monday/calendars-board';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';
import { getBrandFromAgency } from '@/lib/agency/detect';

const NAME_TO_SLUG: Record<string, string> = {
  'Coast to Coast': 'coast-to-coast',
  'Owings Auto': 'owings-auto',
  'Equidad Homes': 'equidad-homes',
  'Rana Furniture': 'rana-furniture',
  'All Shutters and Blinds': 'all-shutters-and-blinds',
  'Avondale Private Lending': 'avondale-private-lending',
  'Crystal Creek Cattle': 'crystal-creek-cattle',
  'Custom Shade and Shutter': 'custom-shade-and-shutter',
  'Goodier Labs': 'goodier-labs',
  "Dunston's Steakhouse": 'dunstons-steakhouse',
  'Fusion Brands': 'fusion-brands',
  'Hartley Law': 'hartley-law',
  'Skibell Fine Jewelry': 'skibell-fine-jewelry',
  'The Standard Ranch Water': 'the-standard-ranch-water',
  'Total Plumbing': 'total-plumbing',
  'Varsity Vault': 'varsity-vault',
  'Goldback': 'goldback',
  'Safe Stop': 'safe-stop',
  'National Lenders': 'national-lenders',
  'Rank Prompt': 'rank-prompt',
};

const SHARE_PATH_RE = /\/c\/([a-f0-9]+)/i;

interface Rewrite {
  row: MondayRow;
  oldUrl: string;
  newUrl: string;
  reason: 'localhost' | 'wrong-brand';
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`${apply ? 'APPLY' : 'DRY-RUN'} — reconciling Monday share URLs against client brand\n`);

  const admin = createAdminClient();
  const token = getMondayToken();
  const rows = await fetchAprilRows(token);

  const rewrites: Rewrite[] = [];

  for (const row of rows) {
    if (!row.shareLink) continue;
    const slug = NAME_TO_SLUG[row.name];
    if (!slug) continue;

    const { data: client } = await admin
      .from('clients')
      .select('agency')
      .eq('slug', slug)
      .maybeSingle<{ agency: string | null }>();
    const brand = getBrandFromAgency(client?.agency ?? null);
    const expectedBase = getCortexAppUrl(brand);

    const tokenMatch = row.shareLink.match(SHARE_PATH_RE);
    if (!tokenMatch) continue;
    const shareToken = tokenMatch[1];
    const expectedUrl = `${expectedBase}/c/${shareToken}`;

    if (row.shareLink === expectedUrl) continue;

    const isLocalhost = /^https?:\/\/localhost(?::\d+)?\//i.test(row.shareLink);
    rewrites.push({
      row,
      oldUrl: row.shareLink,
      newUrl: expectedUrl,
      reason: isLocalhost ? 'localhost' : 'wrong-brand',
    });
  }

  console.log(`Found ${rewrites.length} rows needing rewrite\n`);

  for (const r of rewrites) {
    console.log(`  ${r.row.name}  [${r.reason}]`);
    console.log(`    old: ${r.oldUrl}`);
    console.log(`    new: ${r.newUrl}`);
    if (apply) {
      try {
        await setLaterCalendarLink(token, r.row.id, r.newUrl);
        console.log('    ✓ updated');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`    ✗ ${msg}`);
      }
    }
    console.log();
  }

  if (!apply) console.log('(dry-run — re-run with --apply to write back)');
}

main().catch((err) => {
  console.error('\n✗ fix-monday-share-urls crashed:', err);
  process.exit(1);
});
