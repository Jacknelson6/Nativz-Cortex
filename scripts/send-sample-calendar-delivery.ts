/**
 * Send the "your content calendar is ready" delivery email for one or more
 * clients. Looks up `clients.name` + `clients.agency` from the DB and resolves
 * agency via getBrandFromAgency() — no hardcoded brand per entry, so AC clients
 * can never accidentally receive a Nativz-branded email and vice versa.
 *
 * Configure the per-client list in DELIVERIES below (slug-keyed). The script
 * will:
 *   1. Look up id/name/agency from `clients`
 *   2. Resolve brand from clients.agency
 *   3. Call sendCalendarDeliveryEmail with the right brand + subject
 *
 * Usage:
 *   npx tsx scripts/send-sample-calendar-delivery.ts
 *
 * To dry-run (no email sent), set DRY_RUN=1 in the env.
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

import { createAdminClient } from '@/lib/supabase/admin';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { sendCalendarDeliveryEmail } from '@/lib/email/resend';

interface DeliverySpec {
  clientSlug: string;
  to: string | string[];
  pocFirstNames: string[];
  postCount: number;
  startDate: string;
  endDate: string;
  shareUrl: string;
  firstRoundIntro?: boolean;
}

const DELIVERIES: DeliverySpec[] = [
  // Examples — replace with the real first-round list.
  {
    clientSlug: 'fusion-brands',
    to: 'jack@nativz.io',
    pocFirstNames: ['Sample'],
    postCount: 10,
    startDate: '2026-05-01',
    endDate: '2026-05-31',
    shareUrl: 'https://cortex.nativz.io/c/b7cf3c6a03ff3ff70bd7816b9774ea56689393bba7b608907ab544f092d2488a',
    firstRoundIntro: true,
  },
  {
    clientSlug: 'equidad-homes',
    to: 'jack@nativz.io',
    pocFirstNames: ['Sample'],
    postCount: 12,
    startDate: '2026-05-01',
    endDate: '2026-05-31',
    shareUrl: 'https://cortex.andersoncollaborative.com/c/ef8101adc0677f0ba604959010e490a366eee4c08c3a80d871877bcb6461822f',
    firstRoundIntro: true,
  },
];

const DRY_RUN = process.env.DRY_RUN === '1';

async function main() {
  const admin = createAdminClient();

  for (const spec of DELIVERIES) {
    const { data: client, error } = await admin
      .from('clients')
      .select('id, name, agency')
      .eq('slug', spec.clientSlug)
      .single<{ id: string; name: string; agency: string | null }>();

    if (error || !client) {
      console.error(`✗ ${spec.clientSlug}: client not found (${error?.message ?? 'no row'})`);
      continue;
    }

    const brand = getBrandFromAgency(client.agency);
    const recipients = Array.isArray(spec.to) ? spec.to.join(', ') : spec.to;
    console.log(
      `→ ${client.name} (slug=${spec.clientSlug}, agency=${client.agency ?? 'null'} → brand=${brand}) to ${recipients}`,
    );

    if (DRY_RUN) {
      console.log('  DRY_RUN — skipping send');
      continue;
    }

    const result = await sendCalendarDeliveryEmail({
      to: spec.to,
      pocFirstNames: spec.pocFirstNames,
      clientName: client.name,
      postCount: spec.postCount,
      startDate: spec.startDate,
      endDate: spec.endDate,
      shareUrl: spec.shareUrl,
      firstRoundIntro: spec.firstRoundIntro ?? false,
      agency: brand,
    });

    if (result.error) {
      console.error(`  ✗ failed:`, result.error);
    } else {
      console.log(`  ✓ sent — id=${result.messageId}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
