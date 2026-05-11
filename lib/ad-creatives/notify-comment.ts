/**
 * Notify side-effects for the static-ad public share comment endpoint.
 * Parity with `notifyAdminsOfComment` in
 * app/api/calendar/share/[token]/comment/route.ts:
 *
 *   - In-app bell to every admin user.
 *   - Google Chat ping to the client webhook (with OPS fallback).
 *       comment    → immediate ping with body + share URL
 *       rejection  → immediate ping with body + share URL
 *       approval   → silent UNTIL every concept in the token's scope has at
 *                    least one kind='approval' comment via THIS token, then
 *                    fire the 🎉 celebration. Atomic claim via
 *                    `all_approved_notified_at IS NULL` so concurrent
 *                    approvals can't both win.
 *
 * No Monday writeback / Zernio publish / paid-media ping / credit consume —
 * those are calendar-only concerns. Static-ad approval has no downstream
 * publish step.
 */
import type { createAdminClient } from '@/lib/supabase/admin';
import { createNotification } from '@/lib/notifications/create';
import { resolveTeamChatWebhook } from '@/lib/chat/resolve-team-webhook';
import { postToGoogleChatSafe } from '@/lib/chat/post-to-google-chat';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';

type CommentKind = 'comment' | 'approval' | 'rejection';

const TITLE_BY_KIND: Record<CommentKind, (a: string, c: string) => string> = {
  approval: (a, c) => `${a} approved an ad concept on ${c}`,
  rejection: (a, c) => `${a} rejected an ad concept on ${c}`,
  comment: (a, c) => `${a} commented on an ad concept for ${c}`,
};

export interface AdConceptCommentEvent {
  conceptId: string;
  /** Row id of the share token. Used for the atomic all-approved claim. */
  shareTokenId: string;
  /** The opaque share-token string. Used to build the public /s/{token} URL. */
  shareTokenString: string;
  authorName: string;
  body: string;
  kind: CommentKind;
}

interface ConceptRow {
  id: string;
  headline: string | null;
  template_name: string | null;
  client_id: string;
  batch_id: string | null;
  clients: {
    name: string;
    agency: string | null;
    chat_webhook_url: string | null;
  } | null;
}

interface TokenRow {
  id: string;
  batch_id: string | null;
  client_id: string;
  /** Admin-facing project title shown on the celebration ping. */
  label: string | null;
  all_approved_notified_at: string | null;
}

export async function notifyAdminsOfAdConceptComment(
  admin: ReturnType<typeof createAdminClient>,
  ev: AdConceptCommentEvent,
): Promise<void> {
  const [conceptRes, tokenRes] = await Promise.all([
    admin
      .from('ad_concepts')
      .select(
        'id, headline, template_name, client_id, batch_id, clients(name, agency, chat_webhook_url)',
      )
      .eq('id', ev.conceptId)
      .maybeSingle<ConceptRow>(),
    admin
      .from('ad_concept_share_tokens')
      .select('id, batch_id, client_id, label, all_approved_notified_at')
      .eq('id', ev.shareTokenId)
      .maybeSingle<TokenRow>(),
  ]);

  const concept = conceptRes.data;
  const tokenRow = tokenRes.data;
  if (!concept || !tokenRow) return;

  const clientName = concept.clients?.name ?? 'Client';
  const conceptLabel =
    concept.headline?.trim() || concept.template_name?.trim() || 'concept';
  const agency = concept.clients?.agency ?? null;

  // Per-client webhook first, agency misc-catchall second. No OPS fallback —
  // that space is reserved for system-level alerts.
  const targetWebhookUrl = await resolveTeamChatWebhook(admin, {
    primaryUrl: concept.clients?.chat_webhook_url ?? null,
    agency,
  });

  const shareUrl = `${getCortexAppUrl(getBrandFromAgency(agency))}/s/${ev.shareTokenString}`;
  // Admin-side deep link: ad generator scoped to this client (and batch when
  // the token is batch-locked) so clicking the bell lands on the right gallery.
  const linkPath = `/admin/ad-generator?clientId=${concept.client_id}${
    concept.batch_id ? `&batchId=${concept.batch_id}` : ''
  }`;

  const title = TITLE_BY_KIND[ev.kind](ev.authorName, clientName);
  const trimmed = ev.body.trim();
  const preview =
    trimmed.length > 0
      ? trimmed.slice(0, 140) + (trimmed.length > 140 ? '…' : '')
      : conceptLabel;

  // In-app bell — same recipient list as SMM (every admin user, not just Jack).
  const { data: adminUsers } = await admin
    .from('users')
    .select('id')
    .eq('role', 'admin');
  for (const u of adminUsers ?? []) {
    const recipientId = (u as { id: string }).id;
    createNotification({
      recipientUserId: recipientId,
      type: 'general',
      title,
      body: preview,
      linkPath,
    }).catch(() => {});
  }

  // Atomic claim for the all-approved celebration. Only the request that flips
  // all_approved_notified_at NULL → timestamp wins and posts. Two concurrent
  // approvers can't double-fire.
  let allApprovedClaim: 'won' | 'lost' | 'not-yet' = 'not-yet';
  if (ev.kind === 'approval') {
    const everythingApproved = await checkAllConceptsApproved(admin, tokenRow);
    if (everythingApproved) {
      const { data: claimed } = await admin
        .from('ad_concept_share_tokens')
        .update({ all_approved_notified_at: new Date().toISOString() })
        .eq('id', tokenRow.id)
        .is('all_approved_notified_at', null)
        .select('id')
        .maybeSingle();
      allApprovedClaim = claimed ? 'won' : 'lost';
    }
  }

  if (!targetWebhookUrl) return;

  if (ev.kind === 'comment' || ev.kind === 'rejection') {
    const verb = ev.kind === 'rejection' ? 'rejected' : 'commented on';
    const quotedBlock = trimmed
      ? '\n' + trimmed.split('\n').map((line) => `> ${line}`).join('\n')
      : '';
    const text =
      `💬 *${ev.authorName}* (client) ${verb} *${conceptLabel}* for ${clientName}:${quotedBlock}\n` +
      `Only the client has seen this so far. Reply from the share link:\n${shareUrl}`;
    postToGoogleChatSafe(
      targetWebhookUrl,
      { text },
      `ad-${ev.kind} ${ev.conceptId}`,
    );
  } else if (allApprovedClaim === 'won') {
    // Surface the share-token's admin-facing label so the chat ping reads
    // "from <Client>'s <Project Title> project" rather than the generic
    // "<Client>'s gallery". Falls back to "gallery" wording when the admin
    // didn't bother labeling the share.
    const projectTitle = tokenRow.label?.trim() ?? '';
    const subject = projectTitle
      ? `${clientName}'s ${projectTitle} project`
      : `${clientName}'s gallery`;
    const text =
      `🎉 *${subject}* — client approved every ad concept. Gallery is locked; no team action needed.\n${shareUrl}`;
    postToGoogleChatSafe(
      targetWebhookUrl,
      { text },
      `ad-all-approved ${tokenRow.id}`,
    );
  }
}

/**
 * Every concept in the token's scope (same filter as the public GET:
 * status IN ('pending','approved'), batch-scoped if the token is) has at
 * least one kind='approval' comment via THIS share token. Approvals via a
 * different token (e.g. an admin's preview link) don't count toward another
 * token's celebration.
 */
async function checkAllConceptsApproved(
  admin: ReturnType<typeof createAdminClient>,
  tokenRow: TokenRow,
): Promise<boolean> {
  let q = admin
    .from('ad_concepts')
    .select('id')
    .eq('client_id', tokenRow.client_id)
    .in('status', ['pending', 'approved']);
  if (tokenRow.batch_id) q = q.eq('batch_id', tokenRow.batch_id);
  const { data: concepts } = await q;
  const conceptIds = (concepts ?? []).map((c) => (c as { id: string }).id);
  if (conceptIds.length === 0) return false;

  const { data: approvals } = await admin
    .from('ad_concept_comments')
    .select('concept_id')
    .eq('share_token_id', tokenRow.id)
    .eq('kind', 'approval')
    .in('concept_id', conceptIds);
  const approved = new Set(
    (approvals ?? []).map((a) => (a as { concept_id: string }).concept_id),
  );
  return conceptIds.every((id) => approved.has(id));
}
