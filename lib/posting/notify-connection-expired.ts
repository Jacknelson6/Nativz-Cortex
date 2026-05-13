import type { SupabaseClient } from '@supabase/supabase-js';
import { buildChatCardMessage, postToGoogleChatSafe } from '@/lib/chat/post-to-google-chat';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';
import type { AgencyBrand } from '@/lib/agency/detect';

/**
 * Connection-expired chat alert.
 *
 * Single source of truth for the "your client's social token is dead"
 * Google Chat card. Used by:
 *
 * - `connection-expired-watch` cron — daily sweep + post-expiry confirm
 *   (slow path, runs every 6h on its own schedule).
 * - `publish-posts` cron — when the pre-publish probe (PUB-01) catches
 *   a token that died between the last health sweep and now (fast path,
 *   per scheduled-post tick).
 *
 * Both paths group candidates by client and ship one card per client
 * with all affected platforms collapsed. The card has an "Open reconnect
 * form" button that deep-links to the Connections matrix pre-filtered to
 * the affected platforms — one click pops the Invite Builder modal.
 *
 * Routing (2026-05-13): OPS only. The per-client `chat_webhook_url` and
 * agency-team-webhook fallback were stripped — connection-expired is an
 * internal triage signal (someone has to refresh a token or hand-send a
 * reconnect invite), it should never reach a client chat space. We send
 * a single card per client straight to `OPS_CHAT_WEBHOOK_URL`.
 *
 * Idempotency: the caller is responsible for stamping
 * `social_profiles.disconnect_alerted_at` before invoking this, so a
 * second tick with the same dead token doesn't re-ping. We *do not*
 * mutate the DB here; this is pure send-side. That keeps each call site
 * in charge of its own dedup window (the watcher resets the stamp when
 * a token returns to healthy; the publisher relies on the watcher to do
 * the reset). The watcher also requires a confirming re-probe before
 * stamping (REPROBE_DELAY_MS), so a single bad read at the expiry
 * boundary doesn't fan out — agreement between two probes does.
 */

const PLATFORM_LABEL: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  googlebusiness: 'Google Business',
  pinterest: 'Pinterest',
  x: 'X (Twitter)',
  threads: 'Threads',
  bluesky: 'Bluesky',
};

const OWNER_LABEL: Record<string, string> = {
  agency: 'agency-owned (we created it)',
  client: 'client-owned',
  unknown: 'ownership unknown',
};

export interface ConnectionExpiredCandidate {
  profileId: string;
  clientId: string;
  platform: string;
  accountOwner: string;
  username: string | null;
}

export interface NotifyConnectionExpiredResult {
  alerted: number;
  groupsAlerted: number;
}

/**
 * Fire one Google Chat card per affected client with all dead-token
 * platforms collapsed onto a single card. Side-effect-free w.r.t. the
 * DB other than the team-chat-webhook lookup; the caller owns the
 * `disconnect_alerted_at` stamp for dedup.
 *
 * @param admin       Supabase admin client (service role)
 * @param candidates  Flat list of affected platforms. Will be grouped by
 *                    clientId internally; a client with 3 dead platforms
 *                    produces one card listing all 3.
 * @param contextTag  Short string included in the dedup key for the
 *                    Google Chat sender so two different code paths
 *                    (e.g. "connection-expired-watch" vs
 *                    "publish-posts:token-dead-at-publish") don't
 *                    collide on the same client's card.
 */
export async function notifyConnectionExpired(
  admin: SupabaseClient,
  candidates: ConnectionExpiredCandidate[],
  contextTag = 'connection-expired-watch',
): Promise<NotifyConnectionExpiredResult> {
  if (candidates.length === 0) {
    return { alerted: 0, groupsAlerted: 0 };
  }

  const clientIds = Array.from(new Set(candidates.map((c) => c.clientId)));
  const { data: clients } = await admin
    .from('clients')
    .select('id, name, agency')
    .in('id', clientIds);

  const clientById = new Map<
    string,
    { name: string; agency: string | null }
  >(
    (clients ?? []).map((c) => [
      c.id as string,
      {
        name: c.name as string,
        agency: (c.agency as string | null) ?? null,
      },
    ]),
  );

  const groups = new Map<string, ConnectionExpiredCandidate[]>();
  for (const cand of candidates) {
    const list = groups.get(cand.clientId) ?? [];
    list.push(cand);
    groups.set(cand.clientId, list);
  }

  let alerted = 0;
  for (const [, group] of groups) {
    const sample = group[0];
    if (!sample) continue;
    const client = clientById.get(sample.clientId);
    if (!client) continue;

    // OPS only — connection-expired never reaches a client chat space.
    const finalWebhook = process.env.OPS_CHAT_WEBHOOK_URL ?? null;
    if (!finalWebhook) continue;

    const ownership = sample.accountOwner;
    const allSameOwner = group.every((g) => g.accountOwner === ownership);
    const ownerLine = allSameOwner
      ? OWNER_LABEL[ownership] ?? OWNER_LABEL.unknown
      : 'mixed ownership, check matrix';

    const platformLines = group
      .map((g) => {
        const label = PLATFORM_LABEL[g.platform] ?? g.platform;
        const handle = g.username ? ` (@${g.username})` : '';
        return `• ${label}${handle}`;
      })
      .join('\n');

    const fixHint =
      ownership === 'agency'
        ? 'Refresh internally, do not email the client.'
        : ownership === 'client'
          ? 'Hand-send a reconnect invite from the Connections matrix.'
          : 'Triage ownership in the Connections matrix, then act.';

    const titleEmoji = '🔌';
    const titleVerb = 'social authorization expired';
    const headerTitle = `${titleEmoji} ${client.name}`;
    const headerSubtitle = titleVerb;

    const baseUrl = getCortexAppUrl(
      ((client.agency as AgencyBrand | null) ?? 'nativz') as AgencyBrand,
    );
    const platformsParam = Array.from(
      new Set(group.map((g) => g.platform)),
    ).join(',');
    const deepLink =
      `${baseUrl}/admin/content-tools` +
      `?tab=connections` +
      `&clientId=${encodeURIComponent(sample.clientId)}` +
      `&platforms=${encodeURIComponent(platformsParam)}`;

    const buttonText = 'Open reconnect form';

    const fallbackText = [
      `${titleEmoji} *${client.name}* ${titleVerb}`,
      platformLines,
      ``,
      `Owner: ${ownerLine}`,
      fixHint,
      ``,
      `${buttonText}: ${deepLink}`,
    ].join('\n');

    postToGoogleChatSafe(
      finalWebhook,
      buildChatCardMessage({
        cardId: `conn-expiry-${sample.clientId}`,
        title: headerTitle,
        subtitle: headerSubtitle,
        paragraphs: [
          platformLines,
          { html: `<b>Owner:</b> ${ownerLine}<br>${fixHint}` },
        ],
        buttons: [{ text: buttonText, url: deepLink }],
        fallback: fallbackText,
      }),
      `${contextTag}:${sample.clientId}`,
    );
    alerted += group.length;
  }

  return { alerted, groupsAlerted: groups.size };
}
