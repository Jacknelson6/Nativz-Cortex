/**
 * Resolve the paid-media (ads team) Google Chat webhook for a client.
 *
 * Priority:
 *   1. `clients.paid_media_webhook_url` (DB-stored, editable from the
 *      brand settings UI). When set, treat the client as paid-media
 *      active without consulting Monday.
 *   2. Hard-coded map in `lib/chat/calendar-team-webhooks.ts` (legacy
 *      mirror of the AC ops sheet). Only consulted when the client is
 *      gated as paid-media in Monday — same behaviour the existing
 *      `fireAllApprovedNotifications` flow had.
 *
 * The hard-coded fallback is preserved so we don't regress on the dozen+
 * clients already wired up. New clients only need to set
 * `paid_media_webhook_url` on their `clients` row.
 *
 * NAT-66 v0.1: in-process fire-and-forget via `postToGoogleChatSafe`.
 * v2 will move delivery to Vercel Workflow DevKit so transient webhook
 * failures retry instead of silently dropping.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getCalendarTeamWebhook } from './calendar-team-webhooks';
import { isClientPaidMedia } from '@/lib/monday/paid-media';
import { isMondayConfigured } from '@/lib/monday/client';

export interface PaidMediaWebhook {
  url: string;
  source: 'client_column' | 'legacy_map';
}

interface ResolveArgs {
  clientId: string | null;
  clientName: string | null;
}

export async function resolvePaidMediaWebhook(
  admin: SupabaseClient,
  args: ResolveArgs,
): Promise<PaidMediaWebhook | null> {
  // Preferred path: DB column. Wins over the legacy map and skips the
  // Monday gate, which is the right semantics: if Jack put a webhook on
  // the client row, the client IS paid-media. No second source of truth.
  if (args.clientId) {
    const { data: client } = await admin
      .from('clients')
      .select('paid_media_webhook_url')
      .eq('id', args.clientId)
      .maybeSingle<{ paid_media_webhook_url: string | null }>();
    const url = client?.paid_media_webhook_url?.trim();
    if (url) return { url, source: 'client_column' };
  }

  // Legacy fallback: only consult the hard-coded map when Monday tags
  // the client as paid-media. Mirrors the original gating in
  // `fireAllApprovedNotifications` so existing clients keep firing.
  if (!args.clientName) return null;
  if (!isMondayConfigured()) return null;
  const isPaidMedia = await isClientPaidMedia(args.clientName);
  if (!isPaidMedia) return null;
  const legacy = getCalendarTeamWebhook(args.clientName);
  if (!legacy) return null;
  return { url: legacy.url, source: 'legacy_map' };
}
