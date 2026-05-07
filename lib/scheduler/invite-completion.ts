/**
 * Self-serve connection invite completion side effects.
 *
 * Called from the OAuth callback when the signed state token contains
 * an `invite_token`. Appends the just-connected platform to the
 * invite's `completed_platforms`, sets `completed_at` if the entire
 * ask list is now done, and posts a Google Chat ping to the team so
 * we know a client just (re)connected.
 *
 * The creator email used to fire from here too. Killed on 2026-05-06,
 * Chat is enough. The `notify_email` column is still written by the
 * minters for back-compat but is no longer read.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { postToGoogleChatSafe } from '@/lib/chat/post-to-google-chat';
import { resolveTeamChatWebhook } from '@/lib/chat/resolve-team-webhook';

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
      'id, client_id, platforms, completed_platforms, notify_chat, completed_at',
    )
    .eq('token', inviteToken)
    .maybeSingle();
  if (!invite) return;
  if ((invite.client_id as string) !== clientId) {
    console.warn(
      '[invite-completion] state.client_id != invite.client_id, refusing',
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
        allDone && !invite.completed_at
          ? new Date().toISOString()
          : invite.completed_at,
    })
    .eq('id', invite.id);

  if (!wasNew || !invite.notify_chat) return;

  const { data: client } = await admin
    .from('clients')
    .select('name, agency, chat_webhook_url')
    .eq('id', clientId)
    .maybeSingle();
  if (!client) return;

  const brandName = client.name as string;
  const platformLabel = PLATFORM_LABEL[platform] ?? platform;
  const handle = username ? `@${username}` : 'their account';
  const summary = `${brandName} just reconnected ${platformLabel} as ${handle}.`;

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
