/**
 * One-off recovery: cancel Zernio queue entries for drop posts that were
 * scheduled without an approved review comment, then revert them to draft.
 *
 * Catches anything currently sitting at status='scheduled' (or 'publishing')
 * with a `content_drop_videos` row and zero approved review comments. The
 * cron's approval gate covers future runs; this script cleans up posts
 * that were already handed to Zernio under the old behaviour.
 *
 * Run: set -a && source .env.local && set +a && npx tsx scripts/cancel-unapproved-drop-posts.ts
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { getPostingService } from '../lib/posting';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});
const posting = getPostingService();

type Row = {
  id: string;
  client_id: string;
  late_post_id: string | null;
  status: string;
  scheduled_at: string;
};

async function main() {
  // 1. Pull all queued drop posts (status scheduled/publishing, late_post_id set).
  // 2. Filter to drop posts (have a content_drop_videos row).
  // 3. Drop the ones that already have an approved review comment.
  const { data: candidates, error: candidateErr } = await supabase
    .from('scheduled_posts')
    .select('id, client_id, late_post_id, status, scheduled_at')
    .in('status', ['scheduled', 'publishing'])
    .not('late_post_id', 'is', null)
    .returns<Row[]>();
  if (candidateErr) {
    console.error('Query failed:', candidateErr.message);
    process.exit(1);
  }
  if (!candidates || candidates.length === 0) {
    console.log('No queued drop posts to check.');
    return;
  }

  const candidateIds = candidates.map((r) => r.id);

  // Restrict to drop posts.
  const { data: dropVideoRows } = await supabase
    .from('content_drop_videos')
    .select('scheduled_post_id')
    .in('scheduled_post_id', candidateIds);
  const dropPostIds = new Set(
    (dropVideoRows ?? []).map((r) => r.scheduled_post_id as string),
  );

  // Find which drop posts have approval comments.
  const dropPostIdList = Array.from(dropPostIds);
  let approvedPostIds = new Set<string>();
  if (dropPostIdList.length > 0) {
    const { data: reviewLinks } = await supabase
      .from('post_review_links')
      .select('id, post_id')
      .in('post_id', dropPostIdList);
    const linkIdToPostId = new Map<string, string>();
    for (const r of reviewLinks ?? []) {
      linkIdToPostId.set(r.id as string, r.post_id as string);
    }
    if (linkIdToPostId.size > 0) {
      const { data: approvedComments } = await supabase
        .from('post_review_comments')
        .select('review_link_id')
        .in('review_link_id', Array.from(linkIdToPostId.keys()))
        .eq('status', 'approved');
      approvedPostIds = new Set(
        (approvedComments ?? [])
          .map((c) => linkIdToPostId.get(c.review_link_id as string))
          .filter((id): id is string => !!id),
      );
    }
  }

  const unapproved = candidates.filter(
    (r) => dropPostIds.has(r.id) && !approvedPostIds.has(r.id),
  );

  if (unapproved.length === 0) {
    console.log('All queued drop posts are approved. Nothing to revert.');
    return;
  }

  console.log(`Reverting ${unapproved.length} unapproved drop post(s)…\n`);

  for (const post of unapproved) {
    const label = `[${post.id.slice(0, 8)}]`;
    try {
      // 1. Cancel in Zernio. If already deleted (404), keep going.
      if (post.late_post_id) {
        try {
          await posting.deletePost(post.late_post_id);
          console.log(`${label} cancelled Zernio ${post.late_post_id}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
            console.log(`${label} Zernio already cancelled (404)`);
          } else {
            throw err;
          }
        }
      }

      // 2. Revert to draft + clear external id.
      const { error: updErr } = await supabase
        .from('scheduled_posts')
        .update({
          status: 'draft',
          late_post_id: null,
          failure_reason:
            'Reverted to draft: queued without approved review comment.',
          updated_at: new Date().toISOString(),
        })
        .eq('id', post.id);
      if (updErr) throw updErr;

      // 3. Reset the per-platform rows so re-publish can re-queue cleanly.
      await supabase
        .from('scheduled_post_platforms')
        .update({ status: 'pending', external_post_id: null, failure_reason: null })
        .eq('post_id', post.id);

      console.log(`${label} reverted to draft (was ${post.status})`);
    } catch (err) {
      console.error(
        `${label} FAILED:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
