/**
 * Generalized version of scripts/add-nl-ig-tt-yt-legs.ts.
 *
 * For each in-flight scheduled_post that's missing legs for newly-
 * backfilled platforms, create a SECOND Zernio post targeting only
 * the missing platforms (same media, caption, scheduledFor) and insert
 * the new scheduled_post_platforms rows pointing at the existing
 * scheduled_posts row.
 *
 * Reads directly from the live diff (no hard-coded slot list). Skips
 * any post that's already past-due or already published.
 *
 * Run:
 *   npx tsx scripts/backfill-missing-post-legs.ts          # dry run
 *   npx tsx scripts/backfill-missing-post-legs.ts --apply  # write
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

// Same target list as diag-missed-post-legs.ts.
const TARGETS: Array<{ name: string; platforms: string[] }> = [
  { name: 'EcoView', platforms: ['youtube'] },
  { name: 'Owings Auto', platforms: ['tiktok', 'youtube'] },
  // National Lenders: 5/11 + 5/12 were patched manually earlier today, so
  // the dedup logic will skip them. The remaining 9 in-flight posts still
  // only target FB + LI; this pass adds the three missing platforms.
  { name: 'National Lenders', platforms: ['instagram', 'tiktok', 'youtube'] },
];

type Plat = 'instagram' | 'tiktok' | 'youtube' | 'facebook' | 'linkedin' | 'googlebusiness';

async function main() {
  const apply = process.argv.includes('--apply');
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { getPostingService } = await import('@/lib/posting');

  const admin = createAdminClient();
  const service = getPostingService();
  const nowIso = new Date().toISOString();

  let plannedSlots = 0;
  let plannedLegs = 0;
  const failures: string[] = [];

  for (const target of TARGETS) {
    const { data: client } = await admin
      .from('clients')
      .select('id, name')
      .ilike('name', target.name)
      .single();
    if (!client) {
      console.log(`\n[${target.name}] no client matched, skipping`);
      continue;
    }

    const { data: profiles } = await admin
      .from('social_profiles')
      .select('id, platform, late_account_id, username')
      .eq('client_id', client.id);
    const profileByPlatform = new Map<string, { id: string; lateAccountId: string; username: string }>();
    for (const p of profiles ?? []) {
      profileByPlatform.set(p.platform as string, {
        id: p.id as string,
        lateAccountId: p.late_account_id as string,
        username: (p.username as string) ?? '',
      });
    }

    const { data: posts } = await admin
      .from('scheduled_posts')
      .select(
        'id, scheduled_at, status, caption, hashtags, cover_image_url, scheduled_post_platforms(social_profile_id, social_profiles(platform))',
      )
      .eq('client_id', client.id)
      .gte('scheduled_at', nowIso)
      .in('status', ['scheduled', 'pending', 'queued'])
      .order('scheduled_at', { ascending: true });

    console.log(`\n[${client.name}] ${posts?.length ?? 0} in-flight posts to inspect`);

    for (const post of posts ?? []) {
      const legPlatforms = new Set<string>();
      for (const leg of (post.scheduled_post_platforms ?? []) as Array<{
        social_profiles: { platform: string } | null;
      }>) {
        if (leg.social_profiles?.platform) legPlatforms.add(leg.social_profiles.platform);
      }
      const missing = target.platforms.filter((pl) => !legPlatforms.has(pl));
      if (missing.length === 0) continue;

      const when = (post.scheduled_at as string).slice(0, 16).replace('T', ' ');
      const teaser = ((post.caption as string) ?? '').slice(0, 50).replace(/\n/g, ' ');
      console.log(`  ${when} UTC  needs:[${missing.join(',')}]  "${teaser}…"`);

      const { data: mediaRows } = await admin
        .from('scheduled_post_media')
        .select('media_id, sort_order, scheduler_media!inner(late_media_url, mime_type)')
        .eq('post_id', post.id)
        .order('sort_order', { ascending: true });

      const mediaItems: Array<{ url: string; type: 'video' | 'image' }> = [];
      for (const m of mediaRows ?? []) {
        const sm = Array.isArray(m.scheduler_media) ? m.scheduler_media[0] : m.scheduler_media;
        if (!sm?.late_media_url) continue;
        mediaItems.push({
          url: sm.late_media_url as string,
          type: (sm.mime_type as string)?.startsWith('video/') ? 'video' : 'image',
        });
      }
      if (mediaItems.length === 0) {
        failures.push(`${client.name} ${when}: no media`);
        console.log(`    SKIP: no media on post ${post.id}`);
        continue;
      }

      const lateAccountIds = missing
        .map((p) => profileByPlatform.get(p)?.lateAccountId)
        .filter((x): x is string => Boolean(x));
      if (lateAccountIds.length !== missing.length) {
        failures.push(`${client.name} ${when}: missing profile rows`);
        console.log(`    SKIP: missing social_profiles rows for ${missing.join(',')}`);
        continue;
      }

      const platformHints: Record<string, Plat> = {};
      for (const pl of missing) {
        const prof = profileByPlatform.get(pl);
        if (prof) platformHints[prof.lateAccountId] = pl as Plat;
      }

      plannedSlots += 1;
      plannedLegs += missing.length;

      if (!apply) continue;

      try {
        const videoUrl = mediaItems[0].type === 'video' ? mediaItems[0].url : undefined;
        const publish = await service.publishPost({
          videoUrl,
          mediaItems: mediaItems.length > 1 ? mediaItems : undefined,
          caption: post.caption as string,
          hashtags: (post.hashtags as string[] | null) ?? [],
          coverImageUrl: (post.cover_image_url as string | null) ?? undefined,
          platformProfileIds: lateAccountIds,
          platformHints,
          scheduledAt: post.scheduled_at as string,
        });

        const sppRows = publish.platforms.map((p) => {
          const prof = Array.from(profileByPlatform.values()).find(
            (v) => v.lateAccountId === p.profileId,
          );
          return {
            post_id: post.id as string,
            social_profile_id: prof?.id ?? null,
            status: p.status === 'failed' ? 'failed' : 'pending',
            external_post_id: p.externalPostId ?? null,
            external_post_url: p.externalPostUrl ?? null,
            failure_reason: p.error ?? null,
          };
        });
        const { error: sppErr } = await admin
          .from('scheduled_post_platforms')
          .insert(sppRows);
        if (sppErr) throw new Error(`spp insert: ${sppErr.message}`);
        console.log(`    OK: zernio=${publish.externalPostId}  legs=${sppRows.length}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failures.push(`${client.name} ${when}: ${msg}`);
        console.log(`    FAIL: ${msg}`);
      }
    }
  }

  console.log(
    `\n[summary] ${apply ? 'applied' : 'planned'} ${plannedSlots} slots / ${plannedLegs} legs`,
  );
  if (failures.length > 0) {
    console.log(`[failures] ${failures.length}`);
    for (const f of failures) console.log(`  - ${f}`);
  }
  if (!apply) console.log('\n(dry run) pass --apply to actually create.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
