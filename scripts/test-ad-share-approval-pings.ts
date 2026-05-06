/**
 * Smoke test for the static-ad share approval-ping flow.
 *
 * What this exercises end-to-end:
 *   1. Inserts a synthetic batch + 2 concepts + 1 share token for Hartley Law
 *      (which has a Google Chat webhook configured).
 *   2. Inserts an `approval` comment for concept #1 + calls
 *      `notifyAdminsOfAdConceptComment` — should fire admin bells but stay
 *      silent on Chat (per-approval is silent until everything is approved).
 *   3. Inserts an `approval` comment for concept #2 + calls notify again —
 *      should now fire the 🎉 all-approved Chat ping (atomic claim) plus
 *      bells.
 *   4. Cleans up the synthetic data.
 *
 * Run:
 *   npx tsx scripts/test-ad-share-approval-pings.ts
 */
import { config } from 'dotenv';
import path from 'path';
// Worktree has no .env.local of its own — load from the main checkout.
config({ path: '.env.local' });
config({ path: path.resolve(__dirname, '../../../../.env.local') });

import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyAdminsOfAdConceptComment } from '@/lib/ad-creatives/notify-comment';

const HARTLEY_LAW_CLIENT_ID = '70f721e1-1f74-42d8-b7fd-9805e851f10b';

async function main() {
  const admin = createAdminClient();

  // Confirm the client has a webhook so the test will actually fire something
  const { data: client } = await admin
    .from('clients')
    .select('id, name, chat_webhook_url, agency')
    .eq('id', HARTLEY_LAW_CLIENT_ID)
    .single();
  if (!client) throw new Error('Hartley Law client row missing');
  console.log(
    `[setup] client=${client.name} agency=${client.agency ?? 'null'} webhook=${
      client.chat_webhook_url ? 'yes' : 'no (will fall back to OPS)'
    }`,
  );

  // 1. batch
  const { data: batch, error: batchErr } = await admin
    .from('ad_generation_batches')
    .insert({
      client_id: HARTLEY_LAW_CLIENT_ID,
      status: 'completed',
      config: { source: 'test-script', purpose: 'webhook smoke' },
      total_count: 2,
      completed_count: 2,
    })
    .select('id')
    .single();
  if (batchErr || !batch) throw batchErr ?? new Error('batch insert failed');
  console.log(`[setup] batch=${batch.id}`);

  // 2. concepts
  const { data: concepts, error: conceptsErr } = await admin
    .from('ad_concepts')
    .insert([
      {
        client_id: HARTLEY_LAW_CLIENT_ID,
        batch_id: batch.id,
        slug: 'webhook-test-1',
        template_name: 'webhook-test',
        headline: 'Webhook smoke #1 (test, ignore)',
        source_grounding: 'synthetic-test',
        image_prompt: 'n/a',
        position: 0,
      },
      {
        client_id: HARTLEY_LAW_CLIENT_ID,
        batch_id: batch.id,
        slug: 'webhook-test-2',
        template_name: 'webhook-test',
        headline: 'Webhook smoke #2 (test, ignore)',
        source_grounding: 'synthetic-test',
        image_prompt: 'n/a',
        position: 1,
      },
    ])
    .select('id, headline');
  if (conceptsErr || !concepts) throw conceptsErr ?? new Error('concept insert failed');
  console.log(`[setup] concepts=${concepts.map((c) => c.id).join(',')}`);

  // 3. share token
  const tokenStr = crypto.randomBytes(24).toString('base64url');
  const { data: tokenRow, error: tokenErr } = await admin
    .from('ad_concept_share_tokens')
    .insert({
      token: tokenStr,
      batch_id: batch.id,
      client_id: HARTLEY_LAW_CLIENT_ID,
      label: 'April Static Drop',
    })
    .select('id, token')
    .single();
  if (tokenErr || !tokenRow) throw tokenErr ?? new Error('token insert failed');
  console.log(`[setup] token row=${tokenRow.id} string=${tokenRow.token}`);

  const cleanup = async () => {
    await admin.from('ad_concept_comments').delete().eq('share_token_id', tokenRow.id);
    await admin.from('ad_concept_share_tokens').delete().eq('id', tokenRow.id);
    await admin
      .from('ad_concepts')
      .delete()
      .in('id', concepts.map((c) => c.id));
    await admin.from('ad_generation_batches').delete().eq('id', batch.id);
    console.log('[cleanup] synthetic rows removed');
  };

  try {
    // ----- Approval 1 (should be silent on Chat, but fire bell) -----
    console.log('\n[approve 1/2] inserting approval comment for concept #1');
    await admin.from('ad_concept_comments').insert({
      concept_id: concepts[0].id,
      share_token_id: tokenRow.id,
      author_name: 'Webhook Test',
      body: 'Looks good (test approval 1/2).',
      kind: 'approval',
    });
    await notifyAdminsOfAdConceptComment(admin, {
      conceptId: concepts[0].id,
      shareTokenId: tokenRow.id,
      shareTokenString: tokenRow.token,
      authorName: 'Webhook Test',
      body: 'Looks good (test approval 1/2).',
      kind: 'approval',
    });
    const { data: t1 } = await admin
      .from('ad_concept_share_tokens')
      .select('all_approved_notified_at')
      .eq('id', tokenRow.id)
      .single();
    console.log(
      `[approve 1/2] all_approved_notified_at=${t1?.all_approved_notified_at ?? 'null (correct, not yet all-approved)'}`,
    );

    // ----- Approval 2 (should fire 🎉 ping) -----
    console.log('\n[approve 2/2] inserting approval comment for concept #2');
    await admin.from('ad_concept_comments').insert({
      concept_id: concepts[1].id,
      share_token_id: tokenRow.id,
      author_name: 'Webhook Test',
      body: 'Looks good (test approval 2/2).',
      kind: 'approval',
    });
    await notifyAdminsOfAdConceptComment(admin, {
      conceptId: concepts[1].id,
      shareTokenId: tokenRow.id,
      shareTokenString: tokenRow.token,
      authorName: 'Webhook Test',
      body: 'Looks good (test approval 2/2).',
      kind: 'approval',
    });
    const { data: t2 } = await admin
      .from('ad_concept_share_tokens')
      .select('all_approved_notified_at')
      .eq('id', tokenRow.id)
      .single();
    console.log(
      `[approve 2/2] all_approved_notified_at=${
        t2?.all_approved_notified_at ?? 'null (BUG: 🎉 claim did not fire)'
      }`,
    );

    // ----- Re-run approval 2 to confirm dedup (should NOT re-fire 🎉) -----
    console.log('\n[dedup] firing notify a second time, should NOT re-celebrate');
    await notifyAdminsOfAdConceptComment(admin, {
      conceptId: concepts[1].id,
      shareTokenId: tokenRow.id,
      shareTokenString: tokenRow.token,
      authorName: 'Webhook Test',
      body: 'Should be silent.',
      kind: 'approval',
    });
    console.log('[dedup] done — check Chat space received exactly ONE 🎉');

    // Wait for fire-and-forget chat posts to land before we tear down.
    await new Promise((r) => setTimeout(r, 1500));
  } finally {
    await cleanup();
  }

  console.log('\n[done] expected outcome:');
  console.log('  - admin bells: 3 unread "approved an ad concept on Hartley Law"');
  console.log('  - chat space: ONE 🎉 message linking to the (now-deleted) share URL');
}

main().catch((err) => {
  console.error('test failed:', err);
  process.exit(1);
});
