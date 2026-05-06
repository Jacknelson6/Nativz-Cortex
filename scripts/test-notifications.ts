/**
 * Sends every email-channel notification touched by the recent SMM↔Editing
 * parity work to jack@nativz.io as a one-shot dry run. Real client recipients
 * are never resolved; everything is hard-coded to Jack and prefixed with [TEST].
 *
 * Chat-only notifications (comment / all-approved / auto-approve cards) are
 * not exercised here — those only make sense in a Google Chat space and were
 * cluttering the inbox as fake "preview" emails. Trigger them via the real
 * flow if you need to verify them.
 *
 * Run:
 *   npx dotenv -e .env.local -- tsx scripts/test-notifications.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import {
  sendCalendarCadenceFollowupEmail,
  sendEditingCadenceFollowupEmail,
  sendCalendarRevisionsCompleteEmail,
  sendEditingRevisionsCompleteEmail,
  sendCalendarCommentDigestEmail,
  layout,
} from '@/lib/email/resend';

const TO = 'jack@nativz.io';
const SAMPLE_CLIENT = 'Avondale Furnishings';
const SAMPLE_PROJECT = 'May Reels Batch';
const SAMPLE_POC = ['Megan'];
const SAMPLE_URL = 'https://cortex.nativz.io/c/sample-token';
const SAMPLE_EDITING_URL = 'https://cortex.nativz.io/c/edit/sample-token';

async function main() {
  const results: Array<{ name: string; ok: boolean; err?: string }> = [];

  const tasks: Array<[string, () => Promise<{ ok: boolean; error?: string }>]> = [
    [
      'calendar_followup_cadence stage 1',
      () =>
        sendCalendarCadenceFollowupEmail({
          to: TO,
          stage: 1,
          pocFirstNames: SAMPLE_POC,
          clientName: SAMPLE_CLIENT,
          shareUrl: SAMPLE_URL,
        }).then((r) => ({ ok: r.ok, error: r.error })),
    ],
    [
      'calendar_followup_cadence stage 2',
      () =>
        sendCalendarCadenceFollowupEmail({
          to: TO,
          stage: 2,
          pocFirstNames: SAMPLE_POC,
          clientName: SAMPLE_CLIENT,
          shareUrl: SAMPLE_URL,
        }).then((r) => ({ ok: r.ok, error: r.error })),
    ],
    [
      'calendar_followup_cadence stage 3 (final call)',
      () =>
        sendCalendarCadenceFollowupEmail({
          to: TO,
          stage: 3,
          pocFirstNames: SAMPLE_POC,
          clientName: SAMPLE_CLIENT,
          shareUrl: SAMPLE_URL,
        }).then((r) => ({ ok: r.ok, error: r.error })),
    ],
    [
      'editing_followup_cadence stage 1',
      () =>
        sendEditingCadenceFollowupEmail({
          to: TO,
          stage: 1,
          pocFirstNames: SAMPLE_POC,
          clientName: SAMPLE_CLIENT,
          projectName: SAMPLE_PROJECT,
          shareUrl: SAMPLE_EDITING_URL,
          noun: { singular: 'post', plural: 'posts' },
        }).then((r) => ({ ok: r.ok, error: r.error })),
    ],
    [
      'editing_followup_cadence stage 2',
      () =>
        sendEditingCadenceFollowupEmail({
          to: TO,
          stage: 2,
          pocFirstNames: SAMPLE_POC,
          clientName: SAMPLE_CLIENT,
          projectName: SAMPLE_PROJECT,
          shareUrl: SAMPLE_EDITING_URL,
          noun: { singular: 'post', plural: 'posts' },
        }).then((r) => ({ ok: r.ok, error: r.error })),
    ],
    [
      'editing_followup_cadence stage 3 (final call)',
      () =>
        sendEditingCadenceFollowupEmail({
          to: TO,
          stage: 3,
          pocFirstNames: SAMPLE_POC,
          clientName: SAMPLE_CLIENT,
          projectName: SAMPLE_PROJECT,
          shareUrl: SAMPLE_EDITING_URL,
          noun: { singular: 'post', plural: 'posts' },
        }).then((r) => ({ ok: r.ok, error: r.error })),
    ],
    [
      'calendar_revisions_complete',
      () =>
        sendCalendarRevisionsCompleteEmail({
          to: TO,
          clientName: SAMPLE_CLIENT,
          shareUrl: SAMPLE_URL,
          pocFirstNames: SAMPLE_POC,
        }).then((r) => ({ ok: r.ok, error: r.error })),
    ],
    [
      'editing_revisions_complete',
      () =>
        sendEditingRevisionsCompleteEmail({
          to: TO,
          pocFirstNames: SAMPLE_POC,
          clientName: SAMPLE_CLIENT,
          projectName: SAMPLE_PROJECT,
          shareUrl: SAMPLE_EDITING_URL,
          noun: { singular: 'post', plural: 'posts' },
        }).then((r) => ({ ok: r.ok, error: r.error })),
    ],
    [
      'calendar_comment_digest (combined calendar + editing)',
      () =>
        sendCalendarCommentDigestEmail({
          to: TO,
          windowLabel: 'past 24h',
          groups: [
            {
              clientName: SAMPLE_CLIENT,
              dropUrl: SAMPLE_URL,
              comments: [
                {
                  authorName: 'Megan Reed',
                  status: 'changes_requested',
                  contentPreview:
                    'Can we swap clip 3 for one that shows the linen texture?',
                  captionPreview: 'Spring drop preview, first walk through',
                  createdAt: new Date().toISOString(),
                },
                {
                  authorName: 'Megan Reed',
                  status: 'approved',
                  contentPreview: '',
                  captionPreview: 'Behind the scenes, sourcing the new collection',
                  createdAt: new Date().toISOString(),
                },
              ],
            },
            {
              clientName: `${SAMPLE_CLIENT} · ${SAMPLE_PROJECT}`,
              dropUrl: SAMPLE_EDITING_URL,
              ctaLabel: `Review ${SAMPLE_PROJECT}`,
              comments: [
                {
                  authorName: 'Megan Reed',
                  status: 'changes_requested',
                  contentPreview:
                    'Captions on cut 2 overlap the product, please reposition.',
                  captionPreview: 'Reel-02-walkthrough.mp4',
                  createdAt: new Date().toISOString(),
                },
              ],
            },
          ],
        }).then((r) => ({ ok: r.ok, error: r.error })),
    ],
  ];

  for (const [name, fn] of tasks) {
    try {
      const r = await fn();
      results.push({ name, ok: r.ok, err: r.error });
      console.log(`${r.ok ? 'OK ' : 'FAIL'} ${name}${r.error ? ' :: ' + r.error : ''}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ name, ok: false, err: msg });
      console.log(`FAIL ${name} :: ${msg}`);
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\nDone. ${results.length - failed.length}/${results.length} sent to ${TO}.`,
  );
  if (failed.length > 0) {
    console.log('Failures:', failed);
    process.exit(1);
  }
  void layout;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
