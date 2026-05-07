import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';
import { postToGoogleChatSafe } from '@/lib/chat/post-to-google-chat';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';
import { getBrandFromAgency } from '@/lib/agency/detect';

export const maxDuration = 60;

/**
 * GET /api/cron/calendar-no-click-escalation
 *
 * Hourly. Finds calendar-share sends (initial delivery + revised-videos
 * variant) that Resend has confirmed delivered to the recipient but where
 * no click event has fired in the 72 hours since `sent_at`. For each one,
 * posts a single Google Chat ping into Jack's ops space with the brand,
 * subject, share URL, and how long it's been silent.
 *
 * Why we gate on `delivered_at IS NOT NULL`:
 *   The cron only knows the email is "unclicked" because Resend webhooks
 *   are wired to /api/webhooks/resend. If a `delivered` event hasn't
 *   landed for the row we have no signal that webhooks are flowing for
 *   that domain at all, and false-positive escalations would spam the
 *   channel. The delivered stamp is the cheap "yes, webhooks work for
 *   this send" tell.
 *
 * Per-message dedup via `no_click_escalated_at` (column added in
 * migration 262). Stamping happens before the chat post so a slow chat
 * webhook can't cause duplicate pings on the next cron tick.
 *
 * @auth Bearer CRON_SECRET (Vercel cron)
 */

const CALENDAR_TYPE_KEYS = ['calendar_delivery', 'calendar_revised_videos'] as const;
const SILENT_HOURS = 72;
// Don't backfill ancient sends — anything older than 14 days is treated
// as already-handled (the cadence cron will have expired the share link
// long before this anyway). Keeps the query bounded.
const MAX_BACKFILL_DAYS = 14;

interface CandidateRow {
  id: string;
  type_key: string | null;
  subject: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  client_id: string | null;
  drop_id: string | null;
  to_emails: string[] | null;
}

interface ClientRow {
  id: string;
  name: string | null;
  agency: string | null;
}

interface ShareLinkRow {
  drop_id: string;
  token: string;
  archived_at: string | null;
  created_at: string;
}

async function handleGet(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const opsWebhook = process.env.OPS_GOOGLE_CHAT_WEBHOOK?.trim() || null;
  if (!opsWebhook) {
    return NextResponse.json({
      ok: true,
      skipped: 'OPS_GOOGLE_CHAT_WEBHOOK not configured',
      escalated: 0,
    });
  }

  const admin = createAdminClient();
  const now = new Date();
  const cutoffSent = new Date(now.getTime() - SILENT_HOURS * 60 * 60 * 1000).toISOString();
  const cutoffFloor = new Date(
    now.getTime() - MAX_BACKFILL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Pull the smallest possible candidate set. Index in migration 262
  // makes this a partial-index scan.
  const { data: candidates, error: qErr } = await admin
    .from('email_messages')
    .select(
      'id, type_key, subject, sent_at, delivered_at, client_id, drop_id, to_emails',
    )
    .in('type_key', CALENDAR_TYPE_KEYS as unknown as string[])
    .is('clicked_at', null)
    .is('no_click_escalated_at', null)
    .not('delivered_at', 'is', null)
    .lte('sent_at', cutoffSent)
    .gte('sent_at', cutoffFloor)
    .order('sent_at', { ascending: true })
    .limit(50)
    .returns<CandidateRow[]>();

  if (qErr) {
    console.error('[calendar-no-click-escalation] query failed:', qErr);
    return NextResponse.json({ error: 'query_failed', detail: qErr.message }, { status: 500 });
  }

  const rows = candidates ?? [];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, escalated: 0 });
  }

  // Batch-load related clients + share links in two round-trips.
  const clientIds = Array.from(
    new Set(rows.map((r) => r.client_id).filter((v): v is string => !!v)),
  );
  const dropIds = Array.from(
    new Set(rows.map((r) => r.drop_id).filter((v): v is string => !!v)),
  );

  const [clientsRes, linksRes] = await Promise.all([
    clientIds.length
      ? admin
          .from('clients')
          .select('id, name, agency')
          .in('id', clientIds)
          .returns<ClientRow[]>()
      : Promise.resolve({ data: [] as ClientRow[], error: null }),
    dropIds.length
      ? admin
          .from('content_drop_share_links')
          .select('drop_id, token, archived_at, created_at')
          .in('drop_id', dropIds)
          .order('created_at', { ascending: false })
          .returns<ShareLinkRow[]>()
      : Promise.resolve({ data: [] as ShareLinkRow[], error: null }),
  ]);

  const clientById = new Map((clientsRes.data ?? []).map((c) => [c.id, c]));
  // Newest non-archived share link per drop wins; falls back to newest
  // archived link if every link for the drop is archived.
  const linkByDrop = new Map<string, ShareLinkRow>();
  for (const link of linksRes.data ?? []) {
    const existing = linkByDrop.get(link.drop_id);
    if (!existing) {
      linkByDrop.set(link.drop_id, link);
      continue;
    }
    const existingActive = !existing.archived_at;
    const candidateActive = !link.archived_at;
    if (candidateActive && !existingActive) linkByDrop.set(link.drop_id, link);
  }

  const results: Array<{
    messageId: string;
    clientName: string;
    ok: boolean;
    skipped?: string;
  }> = [];

  for (const row of rows) {
    const client = row.client_id ? clientById.get(row.client_id) : null;
    const clientName = client?.name?.trim() || 'Unknown brand';
    const agency = getBrandFromAgency(client?.agency ?? null);
    const shareLink = row.drop_id ? linkByDrop.get(row.drop_id) : null;
    const shareUrl = shareLink ? `${getCortexAppUrl(agency)}/s/${shareLink.token}` : null;

    // Stamp first so a chat-side hiccup can't double-ping. Conditional
    // update + select to confirm we actually owned the row this tick.
    const { data: stamped, error: stampErr } = await admin
      .from('email_messages')
      .update({ no_click_escalated_at: now.toISOString() })
      .eq('id', row.id)
      .is('no_click_escalated_at', null)
      .select('id')
      .maybeSingle();

    if (stampErr || !stamped) {
      results.push({
        messageId: row.id,
        clientName,
        ok: false,
        skipped: stampErr ? `stamp_failed:${stampErr.message}` : 'lost_dedup_race',
      });
      continue;
    }

    const sentAt = row.sent_at ? new Date(row.sent_at) : null;
    const hoursSilent = sentAt
      ? Math.round((now.getTime() - sentAt.getTime()) / (60 * 60 * 1000))
      : SILENT_HOURS;
    const variantLabel =
      row.type_key === 'calendar_revised_videos' ? 'revised videos' : 'calendar delivery';
    const subjectFragment = row.subject ? ` "${row.subject}"` : '';
    const recipientFragment =
      Array.isArray(row.to_emails) && row.to_emails.length > 0
        ? ` to ${row.to_emails.join(', ')}`
        : '';
    const urlFragment = shareUrl ? `\nLink: ${shareUrl}` : '';

    const text =
      `⏰ ${clientName}: ${variantLabel}${subjectFragment} sent ${hoursSilent}h ago${recipientFragment} hasn't been clicked yet.${urlFragment}`;

    postToGoogleChatSafe(opsWebhook, { text }, `calendar-no-click-escalation:${row.id}`);
    results.push({ messageId: row.id, clientName, ok: true });
  }

  return NextResponse.json({
    ok: true,
    escalated: results.filter((r) => r.ok).length,
    skipped: results.filter((r) => !r.ok).length,
    results,
  });
}

export const GET = withCronTelemetry(
  { route: '/api/cron/calendar-no-click-escalation' },
  handleGet,
);
