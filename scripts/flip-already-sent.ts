/**
 * One-shot: mark the 3 calendars we already sent (test pair) as
 * "Waiting on approval" on Monday so the next bulk-send run skips them.
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

import {
  findContentCalendarItem,
  setClientApprovalStatus,
} from '@/lib/monday/calendar-approval';

const ALREADY_SENT = [
  { clientName: 'All Shutters and Blinds', group: 'April 2026' },
  { clientName: 'Custom Shade and Shutter', group: 'April 2026' },
  { clientName: 'Coast to Coast', group: 'April 2026' },
];

async function main() {
  for (const row of ALREADY_SENT) {
    const item = await findContentCalendarItem(row.clientName, row.group);
    if (!item) {
      console.warn(`✗ ${row.clientName}: Monday item not found in "${row.group}"`);
      continue;
    }
    await setClientApprovalStatus(item.itemId, 'Waiting on approval');
    console.log(`✓ ${row.clientName} → Waiting on approval (item ${item.itemId})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
