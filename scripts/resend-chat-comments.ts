/**
 * One-off: re-fire Google Chat notifications for comments that landed before
 * the per-client Chat webhook integration shipped.
 *
 *   npx tsx scripts/resend-chat-comments.ts <client-slug> [--since=ISO]
 *
 * Defaults to the last 24h of comments. Mirrors the formatting in
 * app/api/calendar/share/[token]/comment/route.ts so the messages look
 * identical to ones that go out in real time.
 *
 * Approvals are NOT resent individually — the live route only fires an
 * "all approved" message when every post in a share link is approved.
 * If --include-approvals is passed and every post in the most recent
 * share link is approved, this script will fire that single all-approved
 * message at the end.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createAdminClient } from '@/lib/supabase/admin';
import { postToGoogleChat } from '@/lib/chat/post-to-google-chat';

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith('--'));
const sinceArg = args.find((a) => a.startsWith('--since='))?.split('=')[1];
const includeApprovals = args.includes('--include-approvals');
const dryRun = args.includes('--dry-run');

if (!slug) {
  console.error('Usage: npx tsx scripts/resend-chat-comments.ts <client-slug> [--since=ISO] [--include-approvals] [--dry-run]');
  process.exit(1);
}

async function main() {
  const admin = createAdminClient();

  const { data: client, error: clientErr } = await admin
    .from('clients')
    .select('id, name, chat_webhook_url')
    .eq('slug', slug)
    .single<{ id: string; name: string; chat_webhook_url: string | null }>();
  if (clientErr || !client) {
    console.error(`Client not found for slug "${slug}":`, clientErr?.message);
    process.exit(1);
  }
  if (!client.chat_webhook_url) {
    console.error(`Client "${client.name}" has no chat_webhook_url set.`);
    process.exit(1);
  }

  const since = sinceArg ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  type Attachment = { url: string; filename: string; mime_type: string; size_bytes: number };
  type CommentRow = {
    id: string;
    author_name: string;
    status: 'approved' | 'changes_requested' | 'comment';
    content: string;
    created_at: string;
    review_link_id: string;
    attachments: Attachment[] | null;
    post_review_links: { post_id: string; scheduled_posts: { client_id: string } | null } | null;
  };

  const { data: comments, error } = await admin
    .from('post_review_comments')
    .select(`
      id, author_name, status, content, created_at, review_link_id, attachments,
      post_review_links!inner (
        post_id,
        scheduled_posts!inner ( client_id )
      )
    `)
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .returns<CommentRow[]>();

  if (error) {
    console.error('Query failed:', error);
    process.exit(1);
  }

  const filtered = (comments ?? []).filter(
    (c) => c.post_review_links?.scheduled_posts?.client_id === client.id,
  );

  if (filtered.length === 0) {
    console.log(`No comments for ${client.name} since ${since}.`);
    return;
  }

  // Find the most recent share link for this client (for dropUrl).
  const { data: shareLink } = await admin
    .from('content_drop_share_links')
    .select('drop_id, included_post_ids')
    .order('created_at', { ascending: false })
    .limit(1)
    .single<{ drop_id: string; included_post_ids: string[] }>();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cortex.nativz.io';
  const dropUrl = shareLink?.drop_id
    ? `${appUrl}/admin/calendar/${shareLink.drop_id}`
    : `${appUrl}/admin/calendar`;

  // Per-comment messages — only comment + changes_requested, mirroring live route.
  const realtime = filtered.filter((c) => c.status === 'comment' || c.status === 'changes_requested');
  console.log(`Re-firing ${realtime.length} per-comment messages to ${client.name}'s chat space…`);
  console.log(`Drop URL: ${dropUrl}`);
  console.log('---');

  for (const c of realtime) {
    const verb = c.status === 'changes_requested' ? 'requested changes' : 'commented';
    const quoted = c.content
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    const attachments = c.attachments ?? [];
    const attachmentBlock =
      attachments.length > 0
        ? '\n\n' + attachments.map((a) => `📎 ${a.filename}\n${a.url}`).join('\n\n')
        : '';
    const text = `*${c.author_name}* ${verb} on ${client.name}:\n${quoted}${attachmentBlock}\n\n${dropUrl}`;
    console.log(`[${c.created_at}] ${c.author_name} (${c.status})`);
    const oneLine = c.content.replace(/\n/g, ' ');
    console.log(`  content: ${oneLine.slice(0, 80)}${oneLine.length > 80 ? '…' : ''}`);
    if (attachments.length > 0) {
      console.log(`  attachments: ${attachments.map((a) => a.filename).join(', ')}`);
    }
    if (dryRun) {
      console.log('  (dry-run, not posting)');
    } else {
      try {
        await postToGoogleChat(client.chat_webhook_url!, { text });
        console.log('  ✓ posted');
      } catch (err) {
        console.error('  ✗ post failed:', err instanceof Error ? err.message : err);
      }
    }
  }

  // All-approved check (only when --include-approvals)
  if (includeApprovals && shareLink) {
    const { data: reviewLinks } = await admin
      .from('post_review_links')
      .select('id, post_id')
      .in('post_id', shareLink.included_post_ids ?? []);
    const reviewLinkIds = (reviewLinks ?? []).map((r) => r.id as string);
    if (reviewLinkIds.length > 0) {
      const { data: approvals } = await admin
        .from('post_review_comments')
        .select('review_link_id')
        .in('review_link_id', reviewLinkIds)
        .eq('status', 'approved');
      const approvedSet = new Set((approvals ?? []).map((a) => a.review_link_id as string));
      const allApproved = reviewLinkIds.every((id) => approvedSet.has(id));
      if (allApproved) {
        const text = `🎉 All ${reviewLinkIds.length} posts in ${client.name}'s calendar are approved.\n${dropUrl}`;
        console.log('---');
        console.log('All posts approved — firing all-approved message.');
        if (dryRun) {
          console.log('(dry-run)');
        } else {
          await postToGoogleChat(client.chat_webhook_url!, { text });
          console.log('✓ posted');
        }
      } else {
        console.log(`---\nNot all posts approved (${approvedSet.size}/${reviewLinkIds.length}) — skipping all-approved message.`);
      }
    }
  }

  console.log('---');
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
