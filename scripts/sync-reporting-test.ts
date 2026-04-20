/**
 * One-shot manual sync for a few clients to verify the new Zernio pipeline.
 * Usage: npx tsx scripts/sync-reporting-test.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const envLines = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8').split('\n');
for (const l of envLines) {
  const m = l.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

async function main() {
  const { syncClientReporting } = await import('../lib/reporting/sync');

  const clients = [
    { id: 'e1b61d86-8c55-4c5b-b19c-a1542b41492d', name: 'All Shutters and Blinds' },
    { id: '8013e014-7738-4f1c-af32-40ae59a446ad', name: 'Weston Funding' },
  ];

  const start = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const end = new Date().toISOString().split('T')[0];

  for (const c of clients) {
    console.log(`\n=== ${c.name} ===`);
    try {
      const r = await syncClientReporting(c.id, { start, end });
      console.log(JSON.stringify(r, null, 2));
    } catch (e) {
      console.log('ERR', e instanceof Error ? e.message : e);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
