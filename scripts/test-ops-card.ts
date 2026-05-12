/**
 * One-shot: fire the new paid-media Card V2 payload at the ops webhook to
 * verify (a) no duplicate plain-text bubble and (b) the "Approved for
 * Meta ads" copy renders cleanly.
 *
 * Usage: npx tsx scripts/test-ops-card.ts
 */
import { config } from 'dotenv';
import { buildChatCard, postToGoogleChat } from '../lib/chat/post-to-google-chat';

config({ path: '.env.local' });

async function main() {
  const url = process.env.OPS_CHAT_WEBHOOK_URL?.trim() || '';
  if (!url) {
    console.error('No OPS webhook env var set (expected OPS_CHAT_WEBHOOK_URL).');
    process.exit(1);
  }

  const downloadUrl =
    'https://cortex.andersoncollaborative.com/c/ae851ae4cf8e4580bc3fe30c53cb890dfc07872bed9e7d86303eedae65192d8b/download';

  await postToGoogleChat(
    url,
    buildChatCard({
      cardId: `ops-test-paid-media-${Date.now()}`,
      headerTitle: '🎬 Approved for Meta ads',
      headerSubtitle: 'College Hunks Hauling Junk (ops test)',
      sections: [
        {
          widgets: [
            {
              type: 'text',
              text: 'Client approved every post on this calendar. Creatives are cleared to run as Meta ads.',
            },
            {
              type: 'button',
              text: 'Download all assets',
              url: downloadUrl,
              filled: true,
            },
          ],
        },
      ],
      // Intentionally still passes fallbackText — verifying that the
      // library drops it from the wire payload so no plain-text twin shows.
      fallbackText: 'this should NOT appear as a duplicate bubble',
    }),
  );

  console.log('OK — card posted. Check the ops chat: expect ONE message (card only).');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
