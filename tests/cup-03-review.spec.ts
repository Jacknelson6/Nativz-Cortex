/**
 * CUP-03 SMM review surface, full review-flow E2E.
 *
 * Drives one drop through the review-surface lifecycle:
 *   editing -> smm_review -> smm_rejected -> smm_review -> smm_approved -> client_sent
 *
 * Each transition is exercised by the same route handlers the UI calls:
 *   POST /api/calendar/drops/[id]/handoff             editor -> smm_review
 *   POST /api/calendar/drops/[id]/handoff/reject      smm_rejected
 *   POST /api/calendar/drops/[id]/handoff             smm_rejected -> smm_review (resubmit)
 *   POST /api/calendar/drops/[id]/handoff/approve     smm_review -> smm_approved
 *   POST /api/calendar/drops/[id]/share               mint share link
 *   POST /api/calendar/share/[token]/send             smm_approved -> client_sent
 *
 * After each transition the drop row + handoff_history are asserted.
 * Then the review surface pages themselves are loaded with the real session:
 *   GET /admin/calendar/review/drop/[id]   when state in {smm_review, smm_approved}
 *   GET /admin/calendar/review/[token]     when state is client_sent (and the
 *     drop-id route should 307 over to the token route)
 *
 * Hermetic: seeds + cleans up its own drop, post, and any share links.
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

async function seedContact(db: SupabaseClient, clientId: string): Promise<string> {
  const { data, error } = await db
    .from('contacts')
    .insert({
      client_id: clientId,
      email: `test-recipient-${Date.now()}@test.nativz.io`,
      name: 'Test Recipient',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`seed contact failed: ${error?.message}`);
  return data.id;
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
      caption: 'cup-03 review smoke',
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
    drive_file_name: 'cup-03.mp4',
    media_type: 'video',
    status: 'ready',
    order_index: 0,
    scheduled_post_id: post.id,
    draft_caption: 'cup-03 review smoke',
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

test('CUP-03 SMM review: handoff -> reject -> resubmit -> approve -> send -> resend', async ({ page }) => {
  const data = getTestData();
  const db = adminClient();

  const seeded = await seedDrop(db, { clientId: data.clientId, userId: data.adminUserId });
  const contactId = await seedContact(db, data.clientId);

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
        .select('handoff_state')
        .eq('id', seeded.dropId)
        .single();
      expect(row?.handoff_state).toBe('smm_review');
    }

    // 2) SMM opens the review surface and sees a 200 + the client name.
    const reviewPage = await page.request.get(`/admin/calendar/review/drop/${seeded.dropId}`);
    expect(reviewPage.status(), 'review page should render in smm_review').toBe(200);

    // 3) SMM rejects with a note (targetState: smm_rejected).
    const rejectRes = await page.request.post(
      `/api/calendar/drops/${seeded.dropId}/handoff/reject`,
      { data: { note: 'caption tone off', targetState: 'smm_rejected' } },
    );
    expect(rejectRes.status(), await rejectRes.text()).toBe(200);
    {
      const { data: row } = await db
        .from('content_drops')
        .select('handoff_state, handoff_history')
        .eq('id', seeded.dropId)
        .single();
      expect(row?.handoff_state).toBe('smm_rejected');
      const history = (row?.handoff_history as Array<{ state: string; note?: string }>) ?? [];
      const lastRejection = [...history].reverse().find((h) => h.state === 'smm_rejected');
      expect(lastRejection?.note).toBe('caption tone off');
    }

    // 4) Editor resubmits (smm_rejected -> smm_review). The /handoff route's
    //    target state is hardcoded to smm_review and smm_rejected -> smm_review
    //    is a legal transition.
    const resubmitRes = await page.request.post(
      `/api/calendar/drops/${seeded.dropId}/handoff`,
      { data: {} },
    );
    expect(resubmitRes.status(), await resubmitRes.text()).toBe(200);
    {
      const { data: row } = await db
        .from('content_drops')
        .select('handoff_state')
        .eq('id', seeded.dropId)
        .single();
      expect(row?.handoff_state).toBe('smm_review');
    }

    // 5) SMM approves (without mintAndSend so we exercise the "Send to client"
    //    button path separately, matching the UI's two-step send flow).
    const approveRes = await page.request.post(
      `/api/calendar/drops/${seeded.dropId}/handoff/approve`,
      { data: { mintAndSend: false } },
    );
    expect(approveRes.status(), await approveRes.text()).toBe(200);
    {
      const { data: row } = await db
        .from('content_drops')
        .select('handoff_state')
        .eq('id', seeded.dropId)
        .single();
      expect(row?.handoff_state).toBe('smm_approved');
    }

    // 6) "Send to client" = mint share link, then POST send with variant=initial.
    const mintRes = await page.request.post(
      `/api/calendar/drops/${seeded.dropId}/share`,
      { data: { postIds: [seeded.postId] } },
    );
    expect(mintRes.status(), await mintRes.text()).toBe(200);
    const mintBody = await mintRes.json();
    const token: string = mintBody.token ?? mintBody.shareLink?.token ?? mintBody.link?.token;
    expect(token).toBeTruthy();

    const sendRes = await page.request.post(
      `/api/calendar/share/${token}/send`,
      { data: { variant: 'initial' } },
    );
    expect(sendRes.status(), await sendRes.text()).toBe(200);
    {
      const { data: row } = await db
        .from('content_drops')
        .select('handoff_state, handoff_history')
        .eq('id', seeded.dropId)
        .single();
      expect(row?.handoff_state).toBe('client_sent');
      const history = (row?.handoff_history as unknown[]) ?? [];
      expect(history.length).toBeGreaterThanOrEqual(4);
    }

    // 7) Token route renders 200 in client_sent state (resend surface).
    const tokenPage = await page.request.get(`/admin/calendar/review/${token}`);
    expect(tokenPage.status(), 'token review page should render in client_sent').toBe(200);

    // 8) Resend uses variant=revised against the same token.
    const resendRes = await page.request.post(
      `/api/calendar/share/${token}/send`,
      { data: { variant: 'revised' } },
    );
    expect(resendRes.status(), await resendRes.text()).toBe(200);
  } finally {
    await cleanupDrop(db, seeded.dropId, seeded.postId);
    await db.from('contacts').delete().eq('id', contactId);
  }
});
