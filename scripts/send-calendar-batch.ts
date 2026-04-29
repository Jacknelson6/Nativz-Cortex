/**
 * Bulk send the "your content calendar is ready" emails for every Monday
 * Content Calendars row in the target group whose Client Approval is empty
 * or "Not sent" AND has a Later Calendar View URL filled in.
 *
 * Behavior:
 *   • Filters out POCs whose role contains "Paid Media only" or "Avoid bulk"
 *   • Groups calendars by *identical recipient set* — if the same POC list
 *     covers multiple needs-send clients, send one combined email with a
 *     sub-section per calendar (e.g. Amanda → All Shutters + Custom Shade)
 *   • Pulls postCount/startDate/endDate from content_drops via the share token
 *   • Resolves brand from clients.agency via getBrandFromAgency()
 *   • Default dry-run; APPLY=1 actually sends
 *
 * Usage:
 *   npx tsx scripts/send-calendar-batch.ts                          # dry run, default group
 *   npx tsx scripts/send-calendar-batch.ts --group "April 2026"
 *   APPLY=1 npx tsx scripts/send-calendar-batch.ts                  # send for real
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
import {
  sendCalendarDeliveryEmail,
  sendCombinedCalendarDeliveryEmail,
} from '@/lib/email/resend';
import { fetchContentCalendarItems, parseContentCalendarItem } from '@/lib/monday/client';
import {
  findContentCalendarItem,
  setClientApprovalStatus,
} from '@/lib/monday/calendar-approval';

const APPLY = process.env.APPLY === '1';
const TARGET_GROUP = process.argv.includes('--group')
  ? process.argv[process.argv.indexOf('--group') + 1]
  : 'April 2026';
const LIMIT_PER_BRAND = process.argv.includes('--limit-per-brand')
  ? parseInt(process.argv[process.argv.indexOf('--limit-per-brand') + 1], 10)
  : Infinity;
const CC_NATIVZ = 'jack@nativz.io';
const CC_ANDERSON = 'jack@andersoncollaborative.com';

const NEEDS_SEND = new Set(['', 'not sent']);
const EXCLUDE_ROLE_PATTERNS = [/paid media only/i, /avoid bulk/i];

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
}

function firstName(full: string): string {
  return (full.split(/\s+/)[0] || full).trim();
}

function extractToken(url: string): string | null {
  const m = url.match(/\/c\/([a-f0-9]+)/i);
  return m ? m[1] : null;
}

interface CalendarReady {
  clientId: string;
  clientName: string;
  agency: string | null;
  shareUrl: string;
  postCount: number;
  startDate: string;
  endDate: string;
  contacts: Array<{ name: string; email: string }>;
}

async function main() {
  const admin = createAdminClient();

  const [{ items }, clientsRes, contactsRes, sharesRes] = await Promise.all([
    fetchContentCalendarItems(),
    admin.from('clients').select('id, name, agency').returns<Array<{
      id: string; name: string; agency: string | null;
    }>>(),
    admin.from('contacts').select('client_id, name, email, role').returns<Array<{
      client_id: string; name: string; email: string | null; role: string | null;
    }>>(),
    admin
      .from('content_drop_share_links')
      .select('token, drop_id, content_drops!inner(client_id, start_date, end_date, total_videos)')
      .returns<Array<{
        token: string;
        drop_id: string;
        content_drops: {
          client_id: string;
          start_date: string;
          end_date: string;
          total_videos: number;
        };
      }>>(),
  ]);

  const clientByNorm = new Map<string, { id: string; name: string; agency: string | null }>();
  for (const c of clientsRes.data ?? []) {
    clientByNorm.set(normalizeName(c.name), { id: c.id, name: c.name, agency: c.agency });
  }

  const tokenToDrop = new Map<string, { clientId: string; startDate: string; endDate: string; postCount: number }>();
  for (const s of sharesRes.data ?? []) {
    tokenToDrop.set(s.token, {
      clientId: s.content_drops.client_id,
      startDate: s.content_drops.start_date,
      endDate: s.content_drops.end_date,
      postCount: s.content_drops.total_videos,
    });
  }

  const contactsByClientId = new Map<string, Array<{ name: string; email: string }>>();
  for (const ct of contactsRes.data ?? []) {
    if (!ct.email) continue;
    if (EXCLUDE_ROLE_PATTERNS.some((re) => re.test(ct.role ?? ''))) continue;
    const arr = contactsByClientId.get(ct.client_id) ?? [];
    arr.push({ name: ct.name, email: ct.email });
    contactsByClientId.set(ct.client_id, arr);
  }

  const parsed = items
    .filter((it) => it.group.title === TARGET_GROUP)
    .map(parseContentCalendarItem)
    .filter((p) => NEEDS_SEND.has((p.clientApproval || '').trim().toLowerCase()));

  const ready: CalendarReady[] = [];
  const skipped: Array<{ client: string; reason: string }> = [];

  for (const p of parsed) {
    if (!p.laterCalendarUrl) {
      skipped.push({ client: p.clientName, reason: 'no Later Calendar View link' });
      continue;
    }
    const token = extractToken(p.laterCalendarUrl);
    if (!token) {
      skipped.push({ client: p.clientName, reason: `unrecognized share URL ${p.laterCalendarUrl}` });
      continue;
    }
    const drop = tokenToDrop.get(token);
    if (!drop) {
      skipped.push({ client: p.clientName, reason: `share token ${token} not in Cortex` });
      continue;
    }
    const cortex = clientByNorm.get(normalizeName(p.clientName));
    if (!cortex) {
      skipped.push({ client: p.clientName, reason: 'no Cortex client match' });
      continue;
    }
    if (cortex.id !== drop.clientId) {
      skipped.push({ client: p.clientName, reason: 'share link resolves to a different Cortex client (MISMATCH)' });
      continue;
    }
    const contacts = contactsByClientId.get(cortex.id) ?? [];
    if (contacts.length === 0) {
      skipped.push({ client: p.clientName, reason: 'no eligible POCs (empty after role filter)' });
      continue;
    }
    ready.push({
      clientId: cortex.id,
      clientName: cortex.name,
      agency: cortex.agency,
      shareUrl: p.laterCalendarUrl,
      postCount: drop.postCount,
      startDate: drop.startDate,
      endDate: drop.endDate,
      contacts,
    });
  }

  // Group by identical recipient set + brand. Calendars in the same group
  // ship as a single combined email.
  const groupKey = (r: CalendarReady) =>
    [
      getBrandFromAgency(r.agency),
      [...r.contacts.map((c) => c.email.toLowerCase().trim())].sort().join(','),
    ].join('|');

  const groups = new Map<string, CalendarReady[]>();
  for (const r of ready) {
    const key = groupKey(r);
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }

  const allShipments = [...groups.values()].sort(
    (a, b) => a[0].clientName.localeCompare(b[0].clientName),
  );

  // Optional per-brand cap (e.g. for sending one Nativz + one Anderson test)
  const perBrandCount = new Map<string, number>();
  const shipments: CalendarReady[][] = [];
  for (const ship of allShipments) {
    const brand = getBrandFromAgency(ship[0].agency);
    const seen = perBrandCount.get(brand) ?? 0;
    if (seen >= LIMIT_PER_BRAND) continue;
    perBrandCount.set(brand, seen + 1);
    shipments.push(ship);
  }

  console.log(`\n=== ${TARGET_GROUP} — ${ready.length} calendars · ${shipments.length} shipments ===\n`);

  for (const shipment of shipments) {
    const brand = getBrandFromAgency(shipment[0].agency);
    const recipients = shipment[0].contacts.map((c) => c.email);
    const cc = brand === 'anderson' ? CC_ANDERSON : CC_NATIVZ;
    const label = shipment.length > 1 ? `[combined ×${shipment.length}]` : '';
    console.log(
      `→ ${shipment.map((s) => s.clientName).join(' + ')}  ${label}  brand=${brand}  to=${recipients.join(', ')}  cc=${cc}`,
    );
    for (const c of shipment) {
      console.log(`    · ${c.clientName} — ${c.postCount} posts, ${c.startDate} → ${c.endDate}`);
    }
  }

  if (skipped.length > 0) {
    console.log(`\n— ${skipped.length} skipped —`);
    for (const s of skipped) console.log(`  · ${s.client}: ${s.reason}`);
  }

  if (!APPLY) {
    console.log('\nDry run. Re-run with APPLY=1 to send.');
    return;
  }

  console.log(`\n— Sending ${shipments.length} emails —\n`);

  for (const shipment of shipments) {
    const brand = getBrandFromAgency(shipment[0].agency);
    const recipients = shipment[0].contacts.map((c) => c.email);
    const pocFirstNames = shipment[0].contacts.map((c) => firstName(c.name));
    const cc = brand === 'anderson' ? CC_ANDERSON : CC_NATIVZ;

    try {
      let sendError: unknown = null;
      let sendId: string | undefined;

      if (shipment.length === 1) {
        const c = shipment[0];
        const result = await sendCalendarDeliveryEmail({
          to: recipients,
          cc,
          pocFirstNames,
          clientName: c.clientName,
          postCount: c.postCount,
          startDate: c.startDate,
          endDate: c.endDate,
          shareUrl: c.shareUrl,
          firstRoundIntro: true,
          agency: brand,
        });
        sendError = result.error;
        sendId = result.data?.id;
      } else {
        const result = await sendCombinedCalendarDeliveryEmail({
          to: recipients,
          cc,
          pocFirstNames,
          calendars: shipment.map((c) => ({
            clientName: c.clientName,
            postCount: c.postCount,
            startDate: c.startDate,
            endDate: c.endDate,
            shareUrl: c.shareUrl,
          })),
          firstRoundIntro: true,
          agency: brand,
        });
        sendError = result.error;
        sendId = result.data?.id;
      }

      const label = shipment.map((s) => s.clientName).join(' + ');
      if (sendError) {
        console.error(`  ✗ ${label} failed:`, sendError);
        continue;
      }
      console.log(`  ✓ ${label} → ${recipients.join(', ')}  (id=${sendId})`);

      // Flip every underlying Monday row to "Waiting on approval" so it
      // drops out of needs-send filter on subsequent runs.
      for (const c of shipment) {
        try {
          const item = await findContentCalendarItem(c.clientName, TARGET_GROUP);
          if (!item) {
            console.warn(`    · Monday item not found for ${c.clientName} in "${TARGET_GROUP}"`);
            continue;
          }
          await setClientApprovalStatus(item.itemId, 'Waiting on approval');
          console.log(`    · ${c.clientName}: Monday → Waiting on approval`);
        } catch (e) {
          console.error(`    · ${c.clientName}: Monday writeback failed:`, e);
        }
      }
    } catch (e) {
      console.error(`  ✗ shipment threw:`, e);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
