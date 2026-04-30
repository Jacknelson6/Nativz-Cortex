/**
 * Test the "revised videos ready for review" email by replaying it against
 * a real share link, but sending the result to jack@nativz.io instead of the
 * client POCs. Used to QA the notify-revisions email path end to end.
 *
 * Picks the most recent share link for the target client (default: Safestop)
 * and assembles the same payload the live route builds, caption preview +
 * the bulleted change-request quotes per pending revised video. If no
 * `revised_video_notify_pending` rows exist (the editor's already cleared
 * them), it falls back to the most recent revised videos on that drop so the
 * test still has a representative payload.
 *
 * Usage:
 *   npx tsx scripts/test-revised-videos-email.ts                   # default client + jack@nativz.io
 *   npx tsx scripts/test-revised-videos-email.ts --client "Acme"   # different client
 *   TO=someone@example.com npx tsx scripts/test-revised-videos-email.ts
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
import { sendCalendarRevisedVideosEmail } from '@/lib/email/resend';
import { summarizeRevisionEdits } from '@/lib/calendar/summarize-revisions';

const TARGET_CLIENT_NAME = process.argv.includes('--client')
  ? process.argv[process.argv.indexOf('--client') + 1]
  : 'Safestop';
const TO = process.env.TO ?? 'jack@nativz.io';

function firstName(full: string): string {
  return (full.split(/\s+/)[0] || full).trim();
}

async function main() {
  const admin = createAdminClient();

  // Resolve the client. ilike for tolerant matching ("Safestop" vs "SafeStop").
  const { data: clients, error: clientErr } = await admin
    .from('clients')
    .select('id, name, agency')
    .ilike('name', `%${TARGET_CLIENT_NAME}%`)
    .limit(5);
  if (clientErr) throw clientErr;
  if (!clients || clients.length === 0) {
    console.error(`No client found matching "${TARGET_CLIENT_NAME}"`);
    process.exit(1);
  }
  if (clients.length > 1) {
    console.log('Multiple clients matched; using first:', clients.map((c) => c.name));
  }
  const client = clients[0];
  console.log(`Client: ${client.name} (${client.id}), agency=${client.agency ?? '∅'}`);

  // Most recent share link for that client (joined through content_drops).
  const { data: shareLinks, error: linkErr } = await admin
    .from('content_drop_share_links')
    .select(
      'id, token, drop_id, post_review_link_map, included_post_ids, expires_at, created_at, content_drops!inner(client_id)',
    )
    .eq('content_drops.client_id', client.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .returns<
      Array<{
        id: string;
        token: string;
        drop_id: string;
        post_review_link_map: Record<string, string>;
        included_post_ids: string[];
        expires_at: string;
        created_at: string;
      }>
    >();
  if (linkErr) throw linkErr;
  const link = shareLinks?.[0];
  if (!link) {
    console.error(`No share link found for ${client.name}`);
    process.exit(1);
  }
  console.log(`Share link: ${link.token}  drop=${link.drop_id}`);

  // Pull pending revised videos for this drop. If none, fall back to the most
  // recent revised videos so the test payload still reflects reality.
  const { data: pendingRows } = await admin
    .from('content_drop_videos')
    .select('id, scheduled_post_id, revised_video_url, revised_video_uploaded_at, revised_video_notify_pending')
    .eq('drop_id', link.drop_id)
    .order('revised_video_uploaded_at', { ascending: false, nullsFirst: false });

  type VRow = {
    id: string;
    scheduled_post_id: string | null;
    revised_video_url: string | null;
    revised_video_uploaded_at: string | null;
    revised_video_notify_pending: boolean | null;
  };
  const allRevised = ((pendingRows ?? []) as VRow[]).filter(
    (v) =>
      !!v.revised_video_url &&
      !!v.scheduled_post_id &&
      link.included_post_ids?.includes(v.scheduled_post_id),
  );
  const pendingForLink = allRevised.filter((v) => v.revised_video_notify_pending);
  const usedRows = pendingForLink.length > 0 ? pendingForLink : allRevised.slice(0, 3);
  if (usedRows.length === 0) {
    console.error('No revised videos found on this drop; nothing to test against.');
    process.exit(1);
  }
  console.log(
    `Using ${usedRows.length} revised video row${usedRows.length === 1 ? '' : 's'} ` +
      `(${pendingForLink.length} actually pending; fallback used = ${pendingForLink.length === 0})`,
  );

  // Same payload assembly as the live route. NOTE: union review_link_ids
  // across every share link for this drop so we capture comments from
  // reviewers who came in via a DIFFERENT share link (each share link has
  // its own `post_review_link_map`).
  const pendingPostIds = usedRows
    .map((v) => v.scheduled_post_id)
    .filter((id): id is string => !!id);

  const { data: allDropShareLinks } = await admin
    .from('content_drop_share_links')
    .select('post_review_link_map')
    .eq('drop_id', link.drop_id)
    .returns<Array<{ post_review_link_map: Record<string, string> | null }>>();
  const reviewLinkIdSet = new Set<string>();
  for (const sl of allDropShareLinks ?? []) {
    const map = sl.post_review_link_map ?? {};
    for (const pid of pendingPostIds) {
      const rid = map[pid];
      if (rid) reviewLinkIdSet.add(rid);
    }
  }
  const reviewLinkIds = Array.from(reviewLinkIdSet);

  const commentsRes = reviewLinkIds.length > 0
    ? await admin
        .from('post_review_comments')
        .select('review_link_id, content, created_at')
        .in('review_link_id', reviewLinkIds)
        .eq('status', 'changes_requested')
        .order('created_at', { ascending: true })
    : { data: [] as Array<{ review_link_id: string; content: string; created_at: string }> };

  const allChangeRequests = ((commentsRes.data ?? []) as Array<{
    review_link_id: string;
    content: string;
    created_at: string;
  }>)
    .map((c) => (c.content ?? '').trim())
    .filter((s) => s.length > 0);

  console.log('\nRaw change requests being summarized:');
  for (const c of allChangeRequests) console.log(`  · ${c}`);

  console.log('\nCalling LLM to summarize…');
  const summaryBullets = await summarizeRevisionEdits(allChangeRequests);
  console.log('Generated summary bullets:');
  for (const b of summaryBullets) console.log(`  • ${b}`);

  const agency = getBrandFromAgency(client.agency);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  const shareUrl = `${appUrl}/c/${link.token}`;

  // POC first names, pull a real list so the greeting reads like the real
  // email, but the recipient is the test address. Falls back to "Jack" if
  // no contacts exist for the client.
  const { data: contactRows } = await admin
    .from('contacts')
    .select('name, email, role')
    .eq('client_id', client.id);
  const eligible = ((contactRows ?? []) as Array<{ name: string; email: string | null; role: string | null }>)
    .filter((c) => !!c.email && !/paid media only|avoid bulk/i.test(c.role ?? ''));
  const pocFirstNames = eligible.length > 0 ? eligible.map((c) => firstName(c.name)) : ['Jack'];

  console.log(`\nSending to ${TO}  (greeting first names: ${pocFirstNames.join(', ')})`);
  console.log(`Brand: ${agency}  share URL: ${shareUrl}\n`);

  const result = await sendCalendarRevisedVideosEmail({
    to: TO,
    pocFirstNames,
    clientName: client.name,
    shareUrl,
    summaryBullets,
    revisedCount: usedRows.length,
    agency,
    clientId: client.id,
    dropId: link.drop_id,
    isTestOverride: true,
  });

  if (!result.ok) {
    console.error('Send failed:', result.error);
    process.exit(1);
  }
  console.log(`✓ Sent. resend_id=${result.messageId}  email_messages.id=${result.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
