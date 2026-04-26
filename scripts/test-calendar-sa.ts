/**
 * Smoke-test the Calendar freebusy path through service-account / DWD.
 *
 * Run: `npx tsx scripts/test-calendar-sa.ts`
 *
 * Reads env from .env.local. For each authorized teammate, mints a calendar
 * token by impersonation and queries the next 7 days of busy ranges. Prints
 * per-user pass/fail with a sample of busy windows.
 */

import { config as dotenv } from 'dotenv';
import { resolve } from 'node:path';

dotenv({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  const { fetchBusyForEmail } = await import('../lib/scheduling/google-busy');

  const targets = [
    'jack@nativz.io',
    'jake@nativz.io',
    'khen@nativz.io',
    'trevor@andersoncollaborative.com',
  ];

  const now = new Date();
  const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  for (const email of targets) {
    process.stdout.write(`${email.padEnd(36)} ... `);
    const r = await fetchBusyForEmail({ email, timeMin: now, timeMax: weekOut });
    if (!r.ok) {
      console.log(`FAIL — ${r.error}`);
      continue;
    }
    const sample = r.busy.slice(0, 3).map((b) =>
      `${b.start.toISOString().slice(0, 16)}→${b.end.toISOString().slice(11, 16)}`,
    );
    console.log(`OK — ${r.busy.length} busy windows${sample.length ? `; e.g. ${sample.join(', ')}` : ''}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
