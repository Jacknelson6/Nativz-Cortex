// One-off resync for ASAB — pulls last 30 days of reporting data, which
// now includes per-day gross follows / unfollows for IG/FB via Zernio's
// account-insights endpoint. Lets us verify the headline matches Meta
// Business Suite's "Follows" card for any user-selected window.
//
// Run with:  npx tsx scripts/sync-reporting-asab.ts

import { config as dotenv } from 'dotenv';
dotenv({ path: '.env.local' });

async function main() {
  const { syncClientReporting } = await import('@/lib/reporting/sync');
  const ASAB_CLIENT_ID = 'e1b61d86-8c55-4c5b-b19c-a1542b41492d';

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  const toStr = (d: Date) => d.toISOString().slice(0, 10);

  console.log(`Resyncing ASAB ${toStr(start)} → ${toStr(end)}...`);
  const result = await syncClientReporting(ASAB_CLIENT_ID, {
    start: toStr(start),
    end: toStr(end),
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
