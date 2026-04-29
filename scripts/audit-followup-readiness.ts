/**
 * Audit whether the calendar-reminders cron will actually fire for the
 * 16 calendars we just sent.
 *
 * The cron at /api/cron/calendar-reminders pulls recipients from
 * `user_client_access` (portal users, role=viewer). But we just emailed POCs
 * from the `contacts` table — different list. If a client has 0 portal users,
 * the cron skips them silently.
 *
 * For each sent calendar, this script reports:
 *   • drop status
 *   • share link present + expiry + last_viewed_at
 *   • portal user count (recipients of any reminder)
 *   • POCs we emailed (from contacts) — for context
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

const SENT = [
  'All Shutters and Blinds',
  'Custom Shade and Shutter',
  'Coast to Coast',
  'Crystal Creek Cattle',
  "Dunston's Steakhouse",
  'Equidad Homes',
  'Fusion Brands',
  'Varsity Vault',
  'Goodier Labs',
  'Hartley Law',
  'National Lenders',
  'Owings Auto',
  'Rank Prompt',
  'Skibell Fine Jewelry',
  'The Standard Ranch Water',
  'Total Plumbing',
];

async function main() {
  const admin = createAdminClient();

  const { data: clients } = await admin
    .from('clients')
    .select('id, name')
    .in('name', SENT)
    .returns<Array<{ id: string; name: string }>>();
  const clientIds = (clients ?? []).map((c) => c.id);
  const idToName = new Map(clientIds.map((id) => [id, (clients ?? []).find((c) => c.id === id)!.name]));

  const [dropsRes, sharesRes, portalRes, contactsRes] = await Promise.all([
    admin
      .from('content_drops')
      .select('id, client_id, status, start_date')
      .in('client_id', clientIds)
      .gte('start_date', '2026-05-01')
      .lt('start_date', '2026-06-01')
      .returns<Array<{ id: string; client_id: string; status: string; start_date: string }>>(),
    admin
      .from('content_drop_share_links')
      .select('drop_id, last_viewed_at, expires_at, no_open_nudge_sent_at, no_action_nudge_sent_at, final_call_sent_at')
      .returns<Array<{
        drop_id: string;
        last_viewed_at: string | null;
        expires_at: string;
        no_open_nudge_sent_at: string | null;
        no_action_nudge_sent_at: string | null;
        final_call_sent_at: string | null;
      }>>(),
    admin
      .from('user_client_access')
      .select('client_id, users!inner(email, role)')
      .in('client_id', clientIds)
      .returns<Array<{ client_id: string; users: { email: string; role: string } | null }>>(),
    admin
      .from('contacts')
      .select('client_id, name, email, role')
      .in('client_id', clientIds)
      .returns<Array<{ client_id: string; name: string; email: string; role: string | null }>>(),
  ]);

  const shareByDrop = new Map<string, NonNullable<typeof sharesRes.data>[number]>();
  for (const s of sharesRes.data ?? []) shareByDrop.set(s.drop_id, s);

  // A client can have multiple drops in the window: an autopost-only backfill
  // (no share link, content goes out without client review) plus the drafted
  // calendar we actually share for approval. Prefer the drop with a share link
  // — that's the one the cron is meant to chase.
  const dropByClient = new Map<string, typeof dropsRes.data extends Array<infer R> ? R : never>();
  for (const d of dropsRes.data ?? []) {
    const existing = dropByClient.get(d.client_id);
    const dHasShare = shareByDrop.has(d.id);
    if (!existing) {
      dropByClient.set(d.client_id, d);
      continue;
    }
    const existingHasShare = shareByDrop.has(existing.id);
    if (dHasShare && !existingHasShare) dropByClient.set(d.client_id, d);
  }

  const portalByClient = new Map<string, string[]>();
  for (const p of portalRes.data ?? []) {
    if (!p.users?.email) continue;
    const arr = portalByClient.get(p.client_id) ?? [];
    arr.push(`${p.users.email} (${p.users.role})`);
    portalByClient.set(p.client_id, arr);
  }

  const contactsByClient = new Map<string, Array<{ name: string; email: string; role: string | null }>>();
  for (const c of contactsRes.data ?? []) {
    const arr = contactsByClient.get(c.client_id) ?? [];
    arr.push({ name: c.name, email: c.email, role: c.role });
    contactsByClient.set(c.client_id, arr);
  }

  let cronEligible = 0;
  let noPortalUsers = 0;
  let missingDrop = 0;
  let missingShare = 0;

  console.log('\n=== Follow-up readiness audit ===\n');
  for (const name of SENT) {
    const client = (clients ?? []).find((c) => c.name === name);
    if (!client) {
      console.log(`✗ ${name}: not found in clients`);
      continue;
    }
    const drop = dropByClient.get(client.id);
    if (!drop) {
      console.log(`✗ ${name}: no May 2026 content_drop`);
      missingDrop++;
      continue;
    }
    const share = shareByDrop.get(drop.id);
    if (!share) {
      console.log(`✗ ${name}: drop ${drop.id} has no share_link`);
      missingShare++;
      continue;
    }
    const portal = portalByClient.get(client.id) ?? [];
    const contacts = contactsByClient.get(client.id) ?? [];

    const status = `drop=${drop.status} · expires=${share.expires_at.slice(0, 10)} · viewed=${share.last_viewed_at ? '✓' : '✗'}`;
    const cronOk = portal.length > 0;
    if (cronOk) cronEligible++;
    else noPortalUsers++;

    const symbol = cronOk ? '✓' : '⚠';
    console.log(`${symbol} ${name}`);
    console.log(`    ${status}`);
    console.log(`    portal users (cron will email): ${portal.length === 0 ? '(none — cron will skip)' : portal.join(', ')}`);
    console.log(`    POCs we emailed (contacts): ${contacts.map((c) => `${c.email}${c.role ? ` [${c.role}]` : ''}`).join(', ') || '(none)'}`);
  }

  console.log('\n— Summary —');
  console.log(`  cron will fire reminders for: ${cronEligible}/${SENT.length}`);
  console.log(`  cron will skip (no portal users): ${noPortalUsers}`);
  console.log(`  missing drop: ${missingDrop}`);
  console.log(`  missing share link: ${missingShare}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
