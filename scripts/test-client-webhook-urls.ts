/**
 * Validate every client.chat_webhook_url against the Google Chat
 * webhook prefix guard. Anything that fails would silently no-op in
 * production (postToGoogleChatSafe drops the message).
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx);
  let value = trimmed.slice(eqIdx + 1);
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  if (!(key in process.env)) process.env[key] = value;
}

import { createAdminClient } from '../lib/supabase/admin';
import { isGoogleChatWebhook } from '../lib/chat/post-to-google-chat';

async function main() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('clients')
    .select('id, name, chat_webhook_url, is_active')
    .order('name');
  if (error) {
    console.error('[test-client-webhook-urls] read failed:', error);
    process.exit(1);
  }
  const rows = data ?? [];

  let total = 0;
  let withUrl = 0;
  let valid = 0;
  let invalid = 0;
  let activeWithoutUrl = 0;
  const bad: Array<{ name: string; url: string }> = [];

  for (const r of rows) {
    total += 1;
    const url = r.chat_webhook_url as string | null;
    if (!url) {
      if (r.is_active) activeWithoutUrl += 1;
      continue;
    }
    withUrl += 1;
    if (isGoogleChatWebhook(url)) {
      valid += 1;
    } else {
      invalid += 1;
      bad.push({ name: r.name as string, url });
    }
  }

  console.log(`[test-client-webhook-urls] summary`);
  console.log(`  total clients          : ${total}`);
  console.log(`  with chat_webhook_url  : ${withUrl}`);
  console.log(`  passes prefix guard    : ${valid}`);
  console.log(`  FAILS prefix guard     : ${invalid}`);
  console.log(`  active w/o webhook url : ${activeWithoutUrl}`);

  // OPS env var check.
  const opsUrl = process.env.OPS_CHAT_WEBHOOK_URL ?? null;
  console.log(
    `  OPS_CHAT_WEBHOOK_URL   : ${opsUrl ? (isGoogleChatWebhook(opsUrl) ? 'set + valid' : 'set + INVALID') : 'MISSING'}`,
  );

  if (bad.length > 0) {
    console.error('[test-client-webhook-urls] invalid URLs:');
    for (const b of bad) console.error(`  - ${b.name} :: ${b.url.slice(0, 60)}...`);
    process.exit(1);
  }
  if (!opsUrl || !isGoogleChatWebhook(opsUrl)) process.exit(1);
  console.log('[test-client-webhook-urls] all known webhook URLs pass prefix guard');
}

main().catch((err) => {
  console.error('[test-client-webhook-urls] threw:', err);
  process.exit(1);
});
