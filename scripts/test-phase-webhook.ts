/**
 * Fire two test phase-change cards into the Ops Google Chat space.
 *
 * Picks `OPS_CHAT_WEBHOOK_URL` out of .env.local and POSTs the same
 * Card V2 payload the real notifyPhaseChange() helper would build.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildChatCardMessage, postToGoogleChat } from '../lib/chat/post-to-google-chat';

const envPath = resolve(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const env: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  let value = trimmed.slice(eqIdx + 1);
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  env[trimmed.slice(0, eqIdx)] = value;
}

const opsUrl = env.OPS_CHAT_WEBHOOK_URL;
if (!opsUrl) {
  console.error('Missing OPS_CHAT_WEBHOOK_URL in .env.local');
  process.exit(1);
}

interface TestCardInput {
  client: string;
  project: string;
  fromPhase: string;
  toPhase: string;
  actor: string;
  extras?: Record<string, string>;
}

function buildTestCard(input: TestCardInput) {
  const paragraphs: Array<string | { html: string }> = [
    { html: `<b>${input.fromPhase}</b> &rarr; <b>${input.toPhase}</b>` },
    { html: `Moved by ${input.actor}` },
  ];
  if (input.extras) {
    for (const [k, v] of Object.entries(input.extras)) {
      paragraphs.push({ html: `<b>${k}:</b> ${v}` });
    }
  }
  paragraphs.push({
    html: `<i>(test card from scripts/test-phase-webhook.ts &mdash; safe to dismiss)</i>`,
  });
  return buildChatCardMessage({
    cardId: `test-phase-${Date.now()}-${input.toPhase}`,
    title: `Phase advanced &middot; ${input.client}`,
    subtitle: input.project,
    paragraphs,
    buttons: [{ text: 'Open in Cortex (demo)', url: 'https://cortex.nativz.io/admin/content-tools' }],
  });
}

async function main() {
  console.log(`[test-phase-webhook] firing 2 cards to OPS_CHAT_WEBHOOK_URL`);

  const cards: TestCardInput[] = [
    {
      client: 'EcoView',
      project: 'May social drops',
      fromPhase: 'Planning',
      toPhase: 'Shoot booked',
      actor: 'Jack Nelson',
      extras: { 'Shoot date': '2026-05-22' },
    },
    {
      client: 'Avondale Private Lending',
      project: 'Q2 vertical series',
      fromPhase: 'Editing',
      toPhase: 'Client review',
      actor: 'Jack Nelson',
      extras: { Videos: '4', 'Share link': 'cortex.nativz.io/c/test123' },
    },
  ];

  for (const c of cards) {
    try {
      await postToGoogleChat(opsUrl, buildTestCard(c));
      console.log(`  ok: ${c.client} :: ${c.fromPhase} -> ${c.toPhase}`);
    } catch (err) {
      console.error(`  FAILED: ${c.client} :: ${c.fromPhase} -> ${c.toPhase}`, err);
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  console.error('[test-phase-webhook] threw:', err);
  process.exit(1);
});
