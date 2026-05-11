/**
 * One-off: add IG + TikTok + YouTube legs to National Lenders' 5-11 and
 * 5-12 posts. The originals already publish on FB + LinkedIn; this script
 * creates a SECOND Zernio post per slot (same caption + video, same
 * scheduledFor) targeting the three newly-backfilled social_profiles
 * (IG/TT/YT) so the client meeting tomorrow has full coverage.
 *
 * We don't touch the existing FB+LI Zernio posts — they're locked in. We
 * just add new scheduled_post_platforms rows referencing the existing
 * scheduled_posts row, stamp them with the new Zernio post's external IDs,
 * and let Zernio fire them at the slot time alongside the FB+LI legs.
 *
 * Run with: npx tsx scripts/add-nl-ig-tt-yt-legs.ts
 */
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const NL_CLIENT_ID = '9fee126e-c32c-4092-8da5-63709d5ccca2';
const POSTS = [
  {
    label: '5-11',
    scheduledPostId: '86c31281-ab61-41e4-84dc-8c4f5baba0bf',
    scheduledFor: '2026-05-11T17:00:00.000Z',
  },
  {
    label: '5-12',
    scheduledPostId: '44979bd9-9032-48aa-bb04-b62f82a8ed9d',
    scheduledFor: '2026-05-12T17:00:00.000Z',
  },
];

async function main() {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { getPostingService } = await import('@/lib/posting');

  const admin = createAdminClient();
  const service = getPostingService();

  // Pull the three target profiles we just backfilled.
  const { data: targetProfiles, error: profErr } = await admin
    .from('social_profiles')
    .select('id, platform, late_account_id, username')
    .eq('client_id', NL_CLIENT_ID)
    .in('platform', ['instagram', 'tiktok', 'youtube']);
  if (profErr || !targetProfiles || targetProfiles.length !== 3) {
    throw new Error(
      `Expected 3 backfilled social_profiles, got ${targetProfiles?.length ?? 0}: ${profErr?.message ?? ''}`,
    );
  }
  console.log('[targets]');
  for (const p of targetProfiles) {
    console.log(`  - ${p.platform} @${p.username} late=${p.late_account_id}`);
  }
  const lateAccountIds = targetProfiles.map((p) => p.late_account_id as string);
  const platformHints: Record<string, string> = {};
  for (const p of targetProfiles) {
    platformHints[p.late_account_id as string] = p.platform as string;
  }

  for (const slot of POSTS) {
    console.log(`\n[slot ${slot.label}] ${slot.scheduledFor}`);

    const { data: parent, error: parentErr } = await admin
      .from('scheduled_posts')
      .select('id, caption, hashtags, cover_image_url, post_type')
      .eq('id', slot.scheduledPostId)
      .single();
    if (parentErr || !parent) {
      throw new Error(
        `Couldn't read scheduled_post ${slot.scheduledPostId}: ${parentErr?.message}`,
      );
    }

    const { data: mediaRows } = await admin
      .from('scheduled_post_media')
      .select('media_id, sort_order, scheduler_media!inner(late_media_url, mime_type)')
      .eq('post_id', slot.scheduledPostId)
      .order('sort_order', { ascending: true });

    const mediaItems: Array<{ url: string; type: 'video' | 'image' }> = [];
    for (const m of mediaRows ?? []) {
      const sm = Array.isArray(m.scheduler_media)
        ? m.scheduler_media[0]
        : m.scheduler_media;
      if (!sm?.late_media_url) continue;
      mediaItems.push({
        url: sm.late_media_url as string,
        type: (sm.mime_type as string)?.startsWith('video/')
          ? 'video'
          : 'image',
      });
    }
    if (mediaItems.length === 0) {
      throw new Error(`No media found for post ${slot.scheduledPostId}`);
    }
    const videoUrl =
      mediaItems[0].type === 'video' ? mediaItems[0].url : undefined;
    console.log(`[media] ${mediaItems.length} items, primary type=${mediaItems[0].type}`);

    console.log('[step 1] publishPost → Zernio');
    const publish = await service.publishPost({
      videoUrl,
      mediaItems: mediaItems.length > 1 ? mediaItems : undefined,
      caption: parent.caption as string,
      hashtags: (parent.hashtags as string[] | null) ?? [],
      coverImageUrl: (parent.cover_image_url as string | null) ?? undefined,
      platformProfileIds: lateAccountIds,
      platformHints: platformHints as Record<string, 'instagram' | 'tiktok' | 'youtube'>,
      scheduledAt: slot.scheduledFor,
    });
    console.log(`[step 1] externalPostId=${publish.externalPostId}`);
    for (const p of publish.platforms) {
      console.log(
        `  - ${p.platform} status=${p.status} externalPostId=${p.externalPostId ?? '-'} error=${p.error ?? '-'}`,
      );
    }

    console.log('[step 2] insert scheduled_post_platforms rows');
    const sppRows = publish.platforms.map((p) => {
      const profile = targetProfiles.find(
        (tp) => tp.late_account_id === p.profileId,
      );
      return {
        post_id: slot.scheduledPostId,
        social_profile_id: profile?.id,
        status: p.status === 'failed' ? 'failed' : 'pending',
        external_post_id: p.externalPostId ?? null,
        external_post_url: p.externalPostUrl ?? null,
        failure_reason: p.error ?? null,
      };
    });
    const { error: sppErr } = await admin
      .from('scheduled_post_platforms')
      .insert(sppRows);
    if (sppErr) {
      console.error('[step 2] insert failed:', sppErr.message);
      throw new Error(`spp insert: ${sppErr.message}`);
    }
    console.log(`[step 2] inserted ${sppRows.length} legs`);
  }

  console.log('\n[done] IG/TT/YT legs added for both slots.');
}

main().catch((err) => {
  console.error('add-legs failed:', err);
  process.exit(1);
});
