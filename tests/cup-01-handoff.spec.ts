/**
 * CUP-01 editor handoff gate — full state-machine E2E.
 *
 * Drives one drop through editing -> smm_review -> smm_approved -> client_sent
 * via the real route handlers (signed-in admin session, no mocks), then asserts
 * the drop row + handoff_history row in the database matches.
 *
 * Seeds + cleans up its own content_drop so the spec is hermetic. Posts a
 * single content_drop_video so the send-side has something to mint review
 * links for; share_link send + email is mocked at the network layer by
 * stubbing the response from /api/calendar/share/[token]/send (the email
 * provider is exercised in unit tests; this spec is about state transitions).
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadEnvConfig } from '@next/env';
import * as fs from 'fs';
import * as path from 'path';
import { signInAsAdmin } from './admin-login-helpers';

loadEnvConfig(process.cwd());

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

interface TestData {
  clientId: string;
  adminEmail: string;
  adminPassword: string;
  adminUserId: string;
}

function getTestData(): TestData {
  const p = path.join(__dirname, '.auth', 'test-data.json');
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

async function seedDrop(
  db: SupabaseClient,
  opts: { clientId: string; userId: string },
): Promise<{ dropId: string; postId: string }> {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() + 1);
  const end = new Date(today);
  end.setDate(end.getDate() + 7);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const { data: drop, error: dropErr } = await db
    .from('content_drops')
    .insert({
      client_id: opts.clientId,
      created_by: opts.userId,
      start_date: fmt(start),
      end_date: fmt(end),
      default_post_time: '12:00',
      total_videos: 1,
      processed_videos: 1,
      status: 'ready',
      media_type: 'video',
      handoff_state: 'editing',
      handoff_history: [],
    })
    .select('id')
    .single();
  if (dropErr || !drop) throw new Error(`seed drop failed: ${dropErr?.message}`);

  const { data: post, error: postErr } = await db
    .from('scheduled_posts')
    .insert({
      client_id: opts.clientId,
      created_by: opts.userId,
      caption: 'cup-01 handoff smoke',
      scheduled_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      status: 'draft',
    })
    .select('id')
    .single();
  if (postErr || !post) {
    await db.from('content_drops').delete().eq('id', drop.id);
    throw new Error(`seed post failed: ${postErr?.message}`);
  }

  const { error: videoErr } = await db.from('content_drop_videos').insert({
    drop_id: drop.id,
    drive_file_name: 'cup-01.mp4',
    media_type: 'video',
    status: 'ready',
    order_index: 0,
    scheduled_post_id: post.id,
    draft_caption: 'cup-01 handoff smoke',
  });
  if (videoErr) {
    await db.from('scheduled_posts').delete().eq('id', post.id);
    await db.from('content_drops').delete().eq('id', drop.id);
    throw new Error(`seed video failed: ${videoErr?.message}`);
  }

  return { dropId: drop.id, postId: post.id };
}

async function cleanupDrop(db: SupabaseClient, dropId: string, postId: string): Promise<void> {
  await db.from('content_drop_videos').delete().eq('drop_id', dropId);
  await db.from('content_drop_share_links').delete().eq('drop_id', dropId);
  await db.from('post_review_links').delete().eq('scheduled_post_id', postId);
  await db.from('scheduled_posts').delete().eq('id', postId);
  await db.from('content_drops').delete().eq('id', dropId);
}

test('CUP-01 editor handoff: editing -> smm_review -> smm_approved -> client_sent', async ({ page }) => {
  const data = getTestData();
  const db = adminClient();

  const seeded = await seedDrop(db, { clientId: data.clientId, userId: data.adminUserId });

  try {
    await signInAsAdmin(page, data.adminEmail, data.adminPassword);

    // 1) Editor hands off to SMM.
    const handoffRes = await page.request.post(
      `/api/calendar/drops/${seeded.dropId}/handoff`,
      { data: {} },
    );
    expect(handoffRes.status(), await handoffRes.text()).toBe(200);

    {
      const { data: row } = await db
        .from('content_drops')
        .select('handoff_state, handoff_history')
        .eq('id', seeded.dropId)
        .single();
      expect(row?.handoff_state).toBe('smm_review');
      expect((row?.handoff_history as unknown[])?.length ?? 0).toBe(1);
    }

    // 2) SMM approves (no mint+send yet — we want to verify each step
    //    leaves its own history entry).
    const approveRes = await page.request.post(
      `/api/calendar/drops/${seeded.dropId}/handoff/approve`,
      { data: { mintAndSend: false } },
    );
    expect(approveRes.status(), await approveRes.text()).toBe(200);

    {
      const { data: row } = await db
        .from('content_drops')
        .select('handoff_state, handoff_history')
        .eq('id', seeded.dropId)
        .single();
      expect(row?.handoff_state).toBe('smm_approved');
      expect((row?.handoff_history as unknown[])?.length ?? 0).toBe(2);
    }

    // 3) Approve + mintAndSend now flips drop -> client_sent and writes the
    //    third history entry. (The PRD names "press send" as the third
    //    step; in this codebase mintAndSend on the approve route is the
    //    equivalent terminal action when the drop is already smm_approved.)
    const sendRes = await page.request.post(
      `/api/calendar/drops/${seeded.dropId}/handoff/approve`,
      { data: { mintAndSend: true } },
    );
    // Approve from already-approved state is a 409 by design (legal
    // smm_approved->smm_approved is not in LEGAL_TRANSITIONS). The real
    // "send" path is /api/calendar/share/[token]/send. So we mint a share
    // link via existing share endpoint, then POST send.
    if (sendRes.status() === 409) {
      // Mint share link via the legacy share endpoint.
      const mintRes = await page.request.post(
        `/api/calendar/drops/${seeded.dropId}/share`,
        { data: { postIds: [seeded.postId] } },
      );
      expect(mintRes.status(), await mintRes.text()).toBe(200);
      const mintBody = await mintRes.json();
      const token: string = mintBody.token ?? mintBody.shareLink?.token;
      expect(token).toBeTruthy();

      // POST send -- this is the step that flips drop -> client_sent and
      // stamps the third history entry.
      const sendNow = await page.request.post(
        `/api/calendar/share/${token}/send`,
        { data: { variant: 'initial' } },
      );
      expect(sendNow.status(), await sendNow.text()).toBe(200);
    } else {
      expect(sendRes.status(), await sendRes.text()).toBe(200);
    }

    const { data: finalRow } = await db
      .from('content_drops')
      .select('handoff_state, handoff_history')
      .eq('id', seeded.dropId)
      .single();
    expect(finalRow?.handoff_state).toBe('client_sent');
    const history = (finalRow?.handoff_history as unknown[]) ?? [];
    expect(history.length).toBeGreaterThanOrEqual(3);
  } finally {
    await cleanupDrop(db, seeded.dropId, seeded.postId);
  }
});
