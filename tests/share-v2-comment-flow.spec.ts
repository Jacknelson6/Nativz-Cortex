/**
 * Share v2 comment-flow E2E.
 *
 * Covers the share-v2 stack that landed in PRDs 02-09 (lib/share/identity,
 * admin-gate, audit, comment-style, feature-flags, notify-viewers) which
 * shipped without an E2E. Targets the guest-comment path on a calendar
 * share link, since guests don't pass through the admin-agency gate, and
 * verifies:
 *
 *   1. A guest comment POST creates a `post_review_comments` row with the
 *      submitted content, author_name, and `parent_comment_id = null`.
 *   2. A guest reply POST (parentCommentId set) creates a child row whose
 *      parent_comment_id points at the first comment.
 *   3. The route's text-only "approval phrasing" inference is dead — even
 *      "approved!" submitted as status='comment' stays a comment, never
 *      auto-upgrades. (Spec lives in lib/calendar/auto-approve guard.)
 *   4. Migration 320's audit table exists and is empty for guest writes
 *      (only admin-gated writes log there).
 *
 * Hermetic: seeds its own drop / post / video / contact / share link via
 * the production routes (same patterns as cup-03), tears everything down
 * in finally. No assumptions about other specs' state.
 *
 * NOTE on guest auth: the share-comment POST does not call
 * requireAdminOnShare and so works without a session. We deliberately use
 * a *fresh* APIRequestContext (not page.request) for the guest calls so
 * the admin storageState cookie does not leak in.
 */

import { test, expect, request as playwrightRequest } from '@playwright/test';
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
  clientName: string;
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
      caption: 'share-v2 comment smoke',
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
    drive_file_name: 'share-v2.mp4',
    media_type: 'video',
    status: 'ready',
    order_index: 0,
    scheduled_post_id: post.id,
    draft_caption: 'share-v2 comment smoke',
  });
  if (videoErr) {
    await db.from('scheduled_posts').delete().eq('id', post.id);
    await db.from('content_drops').delete().eq('id', drop.id);
    throw new Error(`seed video failed: ${videoErr?.message}`);
  }

  return { dropId: drop.id, postId: post.id };
}

async function seedContact(db: SupabaseClient, clientId: string): Promise<string> {
  const { data, error } = await db
    .from('contacts')
    .insert({
      client_id: clientId,
      email: `share-v2-${Date.now()}@test.nativz.io`,
      name: 'Share v2 Recipient',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`seed contact failed: ${error?.message}`);
  return data.id;
}

async function cleanupDrop(db: SupabaseClient, dropId: string, postId: string): Promise<void> {
  // post_review_comments cascades through review_link_id; delete those first
  // so the comment rows seeded in this spec don't dangle if cleanup order
  // changes upstream.
  const { data: rl } = await db
    .from('post_review_links')
    .select('id')
    .eq('scheduled_post_id', postId);
  const rlIds = (rl ?? []).map((r) => r.id);
  if (rlIds.length > 0) {
    await db.from('post_review_comments').delete().in('review_link_id', rlIds);
  }
  await db.from('content_drop_videos').delete().eq('drop_id', dropId);
  await db.from('content_drop_share_links').delete().eq('drop_id', dropId);
  await db.from('post_review_links').delete().eq('scheduled_post_id', postId);
  await db.from('scheduled_posts').delete().eq('id', postId);
  await db.from('content_drops').delete().eq('id', dropId);
}

test('share-v2: guest comment + reply thread + no audit row for guest writes', async ({
  page,
  baseURL,
}) => {
  const data = getTestData();
  const db = adminClient();
  const seeded = await seedDrop(db, { clientId: data.clientId, userId: data.adminUserId });
  // The send route refuses to mint without at least one contact on the brand.
  // cup-03 seeds its own contact and tears it down in finally, so this spec
  // can't assume one exists when it runs in parallel.
  const contactId = await seedContact(db, data.clientId);

  // Track audit rows created during this spec so we can assert "no admin
  // audit was written for any guest action" without touching unrelated rows.
  const beforeAuditCount = await db
    .from('share_link_admin_actions')
    .select('id', { count: 'exact', head: true });

  try {
    await signInAsAdmin(page, data.adminEmail, data.adminPassword);

    // Drive through to client_sent state so we have a usable share token.
    const handoff = await page.request.post(
      `/api/calendar/drops/${seeded.dropId}/handoff`,
      { data: {} },
    );
    expect(handoff.status(), await handoff.text()).toBe(200);

    const approve = await page.request.post(
      `/api/calendar/drops/${seeded.dropId}/handoff/approve`,
      { data: { mintAndSend: false } },
    );
    expect(approve.status(), await approve.text()).toBe(200);

    const mint = await page.request.post(
      `/api/calendar/drops/${seeded.dropId}/share`,
      { data: { postIds: [seeded.postId] } },
    );
    expect(mint.status(), await mint.text()).toBe(200);
    const mintBody = await mint.json();
    const token: string = mintBody.link?.token ?? mintBody.token;
    expect(token).toBeTruthy();

    const send = await page.request.post(
      `/api/calendar/share/${token}/send`,
      { data: { variant: 'initial' } },
    );
    expect(send.status(), await send.text()).toBe(200);

    // Fresh APIRequestContext = no admin storageState cookie. This is how a
    // real client-facing visitor would hit the route. Sharing the same
    // baseURL keeps the request hitting the dev server.
    const guest = await playwrightRequest.newContext({ baseURL });

    // 1) Guest comment, status='comment', no parent.
    const commentRes = await guest.post(`/api/calendar/share/${token}/comment`, {
      data: {
        postId: seeded.postId,
        authorName: 'Reviewer Guest',
        content: 'Looks reasonable but the cover thumbnail feels off.',
        status: 'comment',
      },
    });
    expect(commentRes.status(), await commentRes.text()).toBe(200);
    const commentBody = await commentRes.json();
    const parentId: string = commentBody.comment?.id;
    expect(parentId).toBeTruthy();

    // Verify the row landed with the right shape.
    const { data: parentRow } = await db
      .from('post_review_comments')
      .select('id, content, author_name, status, parent_comment_id')
      .eq('id', parentId)
      .single();
    expect(parentRow?.content).toContain('cover thumbnail feels off');
    expect(parentRow?.author_name).toBe('Reviewer Guest');
    expect(parentRow?.status).toBe('comment');
    expect(parentRow?.parent_comment_id).toBeNull();

    // 2) Guest reply, parent_comment_id = parentId.
    const replyRes = await guest.post(`/api/calendar/share/${token}/comment`, {
      data: {
        postId: seeded.postId,
        authorName: 'Reviewer Guest',
        content: 'Replying to my own note: ignore the thumbnail comment.',
        status: 'comment',
        parentCommentId: parentId,
      },
    });
    expect(replyRes.status(), await replyRes.text()).toBe(200);
    const replyBody = await replyRes.json();
    const replyId: string = replyBody.comment?.id;
    expect(replyId).toBeTruthy();

    const { data: replyRow } = await db
      .from('post_review_comments')
      .select('id, content, parent_comment_id, status')
      .eq('id', replyId)
      .single();
    expect(replyRow?.parent_comment_id).toBe(parentId);
    expect(replyRow?.status).toBe('comment');

    // 3) Phrasing inference should be dead (NAT-style approve heuristic was
    //    removed 2026-05-14). Even submitting "approved!!!" as a plain
    //    comment must NOT promote to status='approved'.
    const phrasingRes = await guest.post(`/api/calendar/share/${token}/comment`, {
      data: {
        postId: seeded.postId,
        authorName: 'Reviewer Guest',
        content: 'approved!!!',
        status: 'comment',
      },
    });
    expect(phrasingRes.status(), await phrasingRes.text()).toBe(200);
    const phrasingBody = await phrasingRes.json();
    expect(phrasingBody.comment?.status).toBe('comment');

    await guest.dispose();

    // 4) No admin-audit rows were created by any of the guest writes. The
    //    audit table only stamps when an admin-gated endpoint fires.
    const afterAuditCount = await db
      .from('share_link_admin_actions')
      .select('id', { count: 'exact', head: true });
    expect(afterAuditCount.count).toBe(beforeAuditCount.count);
  } finally {
    await cleanupDrop(db, seeded.dropId, seeded.postId);
    await db.from('contacts').delete().eq('id', contactId);
  }
});
