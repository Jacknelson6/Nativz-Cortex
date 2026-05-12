/**
 * One-off: send the missing-core-platforms Google Chat alert for National
 * Lenders right now, instead of waiting for the daily cron's first run.
 *
 * We meet with this client tomorrow (2026-05-12) and we just noticed IG +
 * TikTok have never been connected — only FB and LinkedIn are publishing.
 * The new cron at /api/cron/missing-core-platforms will catch this
 * automatically going forward; this script just covers the one-time gap.
 *
 * Run with: npx tsx scripts/alert-national-lenders-missing-platforms.ts
 */
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const CLIENT_NAME_MATCH = 'National Lenders';

async function main() {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { resolveTeamChatWebhook } = await import(
    '@/lib/chat/resolve-team-webhook'
  );
  const { postToGoogleChatSafe } = await import(
    '@/lib/chat/post-to-google-chat'
  );

  const admin = createAdminClient();
  const { data: client, error: clientErr } = await admin
    .from('clients')
    .select(
      'id, name, agency, chat_webhook_url, missing_platforms_alerted_at, missing_platforms_last_set',
    )
    .ilike('name', `%${CLIENT_NAME_MATCH}%`)
    .single();

  if (clientErr || !client) {
    throw new Error(
      `Could not find National Lenders client: ${clientErr?.message ?? 'no row'}`,
    );
  }

  const { data: profiles } = await admin
    .from('social_profiles')
    .select('platform, is_active, token_status')
    .eq('client_id', client.id);

  const connected = new Set(
    (profiles ?? [])
      .filter(
        (p) =>
          p.is_active !== false &&
          ((p.token_status as string | null) ?? 'valid') !== 'expired',
      )
      .map((p) => p.platform as string),
  );
  const CORE = ['facebook', 'instagram', 'tiktok', 'youtube'] as const;
  const missing = CORE.filter((p) => !connected.has(p));
  console.log(
    `[diag] ${client.name} connected=${Array.from(connected).join(',') || 'none'}`,
  );
  console.log(`[diag] missing core=${missing.join(',') || 'none'}`);

  if (missing.length === 0) {
    console.log('[skip] nothing missing, no alert needed.');
    return;
  }

  const webhook = await resolveTeamChatWebhook(admin, {
    primaryUrl: client.chat_webhook_url as string | null,
    agency: client.agency as string | null,
  });
  const finalWebhook = webhook ?? process.env.OPS_CHAT_WEBHOOK_URL ?? null;
  if (!finalWebhook) {
    throw new Error('No Google Chat webhook resolved for this client.');
  }

  const PLATFORM_LABEL: Record<string, string> = {
    facebook: 'Facebook',
    instagram: 'Instagram',
    tiktok: 'TikTok',
    youtube: 'YouTube',
  };
  const platformLines = missing
    .map((p) => `• ${PLATFORM_LABEL[p] ?? p}`)
    .join('\n');
  const text = [
    `📵 *${client.name}* is missing core platform connections`,
    platformLines,
    ``,
    `We are actively scheduling posts for this client but these platforms have no connected account, so nothing is going out there. Send a reconnect invite from the Connections matrix.`,
  ].join('\n');

  console.log('[send] posting to Google Chat...');
  await postToGoogleChatSafe(
    finalWebhook,
    { text },
    `missing-core-platforms:oneoff:${client.id}`,
  );

  const gapKey = missing.slice().sort().join(',');
  await admin
    .from('clients')
    .update({
      missing_platforms_alerted_at: new Date().toISOString(),
      missing_platforms_last_set: gapKey,
    })
    .eq('id', client.id);

  console.log('[done] alert sent, dedup stamps updated.');
}

main().catch((err) => {
  console.error('alert failed:', err);
  process.exit(1);
});
