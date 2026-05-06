// One-off: replicate /api/calendar/review aggregation and print
// status per share link, so we can compare against what the UI shows.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

import { existsSync } from 'fs';
const envPath = existsSync('.env.local')
  ? '.env.local'
  : '/Users/jack/Claude Code Projects/Nativz Cortex/.env.local';
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type CommentRow = {
  review_link_id: string;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function postStatus(comments: CommentRow[]): 'approved' | 'changes_requested' | null {
  for (let i = comments.length - 1; i >= 0; i--) {
    const c = comments[i];
    if (c.status === 'approved') return 'approved';
    if (c.status === 'changes_requested') {
      const resolved = !!(c.metadata && (c.metadata as Record<string, unknown>).resolved);
      if (!resolved) return 'changes_requested';
    }
  }
  return null;
}

async function main() {
  const { data: drops } = await admin.from('content_drops').select('id, client_id');
  if (!drops) throw new Error('no drops');
  const dropIds = drops.map((d) => d.id);

  const { data: links, error } = await admin
    .from('content_drop_share_links')
    .select(
      'id, drop_id, included_post_ids, post_review_link_map, expires_at, abandoned_at, first_sent_at, archived_at',
    )
    .in('drop_id', dropIds)
    .is('archived_at', null);
  if (error) throw error;
  if (!links) return;

  const { data: clients } = await admin.from('clients').select('id, name');
  const dropById = new Map(drops.map((d) => [d.id, d]));
  const clientById = new Map((clients ?? []).map((c) => [c.id, c]));

  const allReviewLinkIds = new Set<string>();
  for (const l of links) {
    const map = l.post_review_link_map as Record<string, string> | null;
    for (const v of Object.values(map ?? {})) {
      if (typeof v === 'string') allReviewLinkIds.add(v);
    }
  }
  console.log('Total review_link_ids gathered:', allReviewLinkIds.size);

  const { data: comments, error: commentErr } = await admin
    .from('post_review_comments')
    .select('review_link_id, status, metadata, created_at')
    .in('review_link_id', Array.from(allReviewLinkIds))
    .order('created_at', { ascending: true });
  if (commentErr) throw commentErr;
  console.log('Total comments returned:', comments?.length ?? 0);

  const commentsByReviewLink = new Map<string, CommentRow[]>();
  for (const c of (comments ?? []) as CommentRow[]) {
    const arr = commentsByReviewLink.get(c.review_link_id) ?? [];
    arr.push(c);
    commentsByReviewLink.set(c.review_link_id, arr);
  }

  const now = Date.now();
  for (const link of links) {
    const drop = dropById.get(link.drop_id);
    const client = drop ? clientById.get(drop.client_id) : null;
    const map = (link.post_review_link_map ?? {}) as Record<string, string>;

    let approvedCount = 0;
    let changesCount = 0;
    let pendingCount = 0;
    for (const postId of link.included_post_ids ?? []) {
      const reviewLinkId = map[postId];
      const cs = reviewLinkId ? commentsByReviewLink.get(reviewLinkId) ?? [] : [];
      const s = postStatus(cs);
      if (s === 'approved') approvedCount += 1;
      else if (s === 'changes_requested') changesCount += 1;
      else pendingCount += 1;
    }

    const expired = new Date(link.expires_at).getTime() < now;
    const abandoned = !!link.abandoned_at;
    let status: string;
    if (abandoned) status = 'abandoned';
    else if (expired) status = 'expired';
    else if (changesCount > 0) status = 'revising';
    else if (
      (link.included_post_ids ?? []).length > 0 &&
      approvedCount === (link.included_post_ids ?? []).length
    )
      status = 'approved';
    else status = 'ready_for_review';

    const postCount = link.included_post_ids?.length ?? 0;
    console.log(
      `${(client?.name ?? '?').padEnd(28)} | ${postCount}/${approvedCount}/${changesCount}/${pendingCount} | first_sent=${link.first_sent_at ? 'Y' : 'N'} | API=${status}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
