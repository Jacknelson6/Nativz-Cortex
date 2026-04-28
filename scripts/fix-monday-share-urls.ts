/**
 * Replace localhost share URLs on the Monday Content Calendars board with the
 * prod URL. The earlier batch run defaulted QUEUE_APP_URL to localhost:3001,
 * so every "Later Calendar Link" cell got a URL that nobody outside Jack's
 * machine can open. The DB-stored share tokens themselves are correct and
 * portable — only the Monday cell value needs swapping.
 *
 *   npx tsx scripts/fix-monday-share-urls.ts          # dry-run
 *   npx tsx scripts/fix-monday-share-urls.ts --apply  # apply
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { fetchAprilRows, getMondayToken, setLaterCalendarLink } from '@/lib/monday/calendars-board';

const PROD_BASE = 'https://cortex.nativz.io';
const LOCALHOST_RE = /^https?:\/\/localhost(?::\d+)?\//i;

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`${apply ? 'APPLY' : 'DRY-RUN'} — rewriting localhost share URLs on Monday`);

  const token = getMondayToken();
  const rows = await fetchAprilRows(token);

  const candidates = rows.filter((r) => r.shareLink && LOCALHOST_RE.test(r.shareLink));
  console.log(`Found ${candidates.length} rows with localhost share URL\n`);

  for (const row of candidates) {
    const oldUrl = row.shareLink!;
    const path = oldUrl.replace(LOCALHOST_RE, '/');
    const newUrl = `${PROD_BASE}${path}`;
    console.log(`  ${row.name}`);
    console.log(`    old: ${oldUrl}`);
    console.log(`    new: ${newUrl}`);
    if (apply) {
      try {
        await setLaterCalendarLink(token, row.id, newUrl);
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
