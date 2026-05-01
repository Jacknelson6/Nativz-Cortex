/**
 * Send a sample 48h shoot brief reminder email to jack@nativz.io so we can
 * eyeball the layout. Uses fake but realistic shoot data 48 hours out.
 *
 * Usage:
 *   npx tsx scripts/test-shoot-brief-reminder.ts
 *   TO=other@nativz.io npx tsx scripts/test-shoot-brief-reminder.ts
 *   AGENCY=anderson npx tsx scripts/test-shoot-brief-reminder.ts
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

if (!process.env.RESEND_API_KEY) {
  console.error('Missing RESEND_API_KEY in .env.local');
  process.exit(1);
}

import { sendShootBriefReminderEmail } from '@/lib/email/resend';
import type { AgencyBrand } from '@/lib/agency/detect';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';

const TO = process.env.TO ?? 'jack@nativz.io';
const AGENCY: AgencyBrand = process.env.AGENCY === 'anderson' ? 'anderson' : 'nativz';

async function main() {
  const shootDate = new Date(Date.now() + 48 * 3600 * 1000);
  // Use the agency-aware production host, NOT NEXT_PUBLIC_APP_URL, so a dev
  // .env.local with localhost cannot end up in the rendered email.
  const baseUrl = getCortexAppUrl(AGENCY);

  console.log(`Sending sample shoot-brief-reminder to ${TO}`);
  console.log(`  agency: ${AGENCY}`);
  console.log(`  shoot date: ${shootDate.toISOString()}`);

  const result = await sendShootBriefReminderEmail({
    to: TO,
    memberFirstName: 'Jack',
    clientName: 'Safestop',
    shootTitle: 'Safestop content day',
    shootDateISO: shootDate.toISOString(),
    location: 'Salt Lake City studio',
    contentLabUrl: `${baseUrl}/lab`,
    agency: AGENCY,
  });

  if (!result.ok) {
    console.error('Send failed:', result.error);
    process.exit(1);
  }
  console.log(`Sent. resend_id=${result.messageId}  email_messages.id=${result.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
