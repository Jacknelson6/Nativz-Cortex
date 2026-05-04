/**
 * Self-serve connection invite completion side effects.
 *
 * Called from the OAuth callback when the signed state token contains
 * an `invite_token`. Appends the just-connected platform to the
 * invite's `completed_platforms`, sets `completed_at` if the entire
 * ask list is now done, and fires the notify hooks the admin opted
 * into when minting the invite (Google Chat to the brand's webhook,
 * email to the admin who created the invite).
 *
 * All side-effects are best-effort: a failed Chat post or Resend
 * email is logged but never surfaces to the client mid-OAuth. The
 * happy path of "they finished connecting" must always succeed even
 * if the team-side notification flakes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { getFromAddress, getReplyTo, layout } from '@/lib/email/resend';
import { getSecret } from '@/lib/secrets/store';
import { postToGoogleChatSafe } from '@/lib/chat/post-to-google-chat';
import { resolveTeamChatWebhook } from '@/lib/chat/resolve-team-webhook';
import { getBrandFromAgency } from '@/lib/agency/detect';

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

export async function handleInviteCompletion(opts: {
  admin: SupabaseClient;
  inviteToken: string;
  clientId: string;
  platform: string;
  username: string | null;
}): Promise<void> {
  const { admin, inviteToken, clientId, platform, username } = opts;

  const { data: invite } = await admin
    .from('connection_invites')
    .select(
      'id, client_id, platforms, completed_platforms, notify_chat, notify_email, completed_at, created_by',
    )
    .eq('token', inviteToken)
    .maybeSingle();
  if (!invite) return;
  if ((invite.client_id as string) !== clientId) {
    console.warn(
      '[invite-completion] state.client_id != invite.client_id — refusing',
    );
    return;
  }

  const asked: string[] = (invite.platforms as string[]) ?? [];
  const completed = new Set<string>(
    (invite.completed_platforms as string[]) ?? [],
  );
  const wasNew = !completed.has(platform);
  completed.add(platform);

  const allDone = asked.every((p) => completed.has(p));

  await admin
    .from('connection_invites')
    .update({
      completed_platforms: Array.from(completed),
      completed_at:
        allDone && !invite.completed_at ? new Date().toISOString() : invite.completed_at,
    })
    .eq('id', invite.id);

  if (!wasNew) return;

  const [{ data: client }, { data: creator }] = await Promise.all([
    admin
      .from('clients')
      .select('name, agency, chat_webhook_url')
      .eq('id', clientId)
      .maybeSingle(),
    invite.created_by
      ? admin
          .from('users')
          .select('email, name')
          .eq('id', invite.created_by as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!client) return;

  const brandName = client.name as string;
  const platformLabel = PLATFORM_LABEL[platform] ?? platform;
  const handle = username ? `@${username}` : 'their account';
  const summary = `${brandName} just reconnected ${platformLabel} as ${handle}.`;

  if (invite.notify_chat) {
    // Resolver: client's own webhook → agency miscellaneous catchall → ops env.
    const resolved = await resolveTeamChatWebhook(admin, {
      primaryUrl: (client.chat_webhook_url as string | null) ?? null,
      agency: (client.agency as string | null) ?? null,
    });
    const webhook = resolved ?? process.env.OPS_GOOGLE_CHAT_WEBHOOK ?? null;
    postToGoogleChatSafe(
      webhook,
      { text: `🔌 ${summary}` },
      `connection-invite:${platform}:${clientId}`,
    );
  }

  if (invite.notify_email && creator?.email) {
    void sendCreatorEmail({
      to: creator.email as string,
      brandName,
      platformLabel,
      handle,
      brand: getBrandFromAgency((client.agency as string | null) ?? null),
    }).catch((err) =>
      console.error('[invite-completion] creator email failed:', err),
    );
  }
}

async function sendCreatorEmail(opts: {
  to: string;
  brandName: string;
  platformLabel: string;
  handle: string;
  brand: 'nativz' | 'anderson';
}): Promise<void> {
  const apiKey = (await getSecret('RESEND_API_KEY')) ?? '';
  if (!apiKey) return;
  const resend = new Resend(apiKey);
  const subject = `${opts.brandName} reconnected ${opts.platformLabel}`;
  const matrixHost =
    opts.brand === 'anderson'
      ? process.env.PROPOSALS_PUBLIC_HOST_ANDERSON ??
        'https://cortex.andersoncollaborative.com'
      : process.env.PROPOSALS_PUBLIC_HOST_NATIVZ ??
        'https://cortex.nativz.io';
  const matrixUrl = `${matrixHost.replace(/\/+$/, '')}/admin/content-tools`;
  const inner = `
    <p class="subtext">
      <strong>${opts.brandName}</strong> just reconnected ${opts.platformLabel} as ${opts.handle}. The Connections matrix should now show this slot in green.
    </p>
    <div class="button-wrap">
      <a class="button" href="${matrixUrl}">Open the matrix &rarr;</a>
    </div>`;
  await resend.emails.send({
    from: getFromAddress(opts.brand),
    replyTo: getReplyTo(opts.brand),
    to: opts.to,
    subject,
    html: layout(inner, opts.brand, {
      eyebrow: 'Reconnected',
      heroTitle: `${opts.brandName} is back online`,
    }),
  });
}
