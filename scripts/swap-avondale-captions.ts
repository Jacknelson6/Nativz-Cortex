/**
 * Swap Avondale May calendar captions to Jack's borrower/investor boilerplate.
 *
 *   npx tsx scripts/swap-avondale-captions.ts --dry        # preview only
 *   npx tsx scripts/swap-avondale-captions.ts --skip-zernio # local DB only
 *   npx tsx scripts/swap-avondale-captions.ts              # full swap incl. Zernio
 *
 * Format per Jack's examples: tight hook ending in an emoji + blank line +
 * borrower-or-investor CTA + blank line + standard 11-tag hashtag block.
 *
 * Per video:
 *   1. Updates content_drop_videos.draft_caption/draft_hashtags (share-link copy)
 *   2. Updates scheduled_posts.caption/hashtags (admin scheduler view)
 *   3. Deletes the existing Zernio post (no PATCH endpoint exists) and
 *      republishes with the new caption so the May 1+ FB queue actually goes
 *      out with the new copy. Saves the new late_post_id back.
 *
 * Local DB writes happen first — if Zernio republish fails for one post the
 * share link is still correct, only that one FB post would need a manual
 * re-schedule.
 */

import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const DROP_ID = 'c6c4ccb7-49d1-4c6b-8786-9e8c7ad0778d';

const HASHTAGS = [
  'investing',
  'investment',
  'money',
  'trading',
  'invest',
  'stockmarket',
  'finance',
  'stocks',
  'investor',
  'business',
  'financialfreedom',
];

const BORROWER_CTA =
  'Borrowers, talk to us about how we can help you acquire properties and build homes faster, more efficiently, and more profitably 📈';
const INVESTOR_CTA =
  'Investors, talk to us about our private lending fund and the potential for 9–10% tax-advantaged annual returns 💼';

type Audience = 'borrower' | 'investor';

interface Plan {
  audience: Audience;
  hook: string;
}

const PLAN: Record<number, Plan> = {
  0: {
    audience: 'borrower',
    hook: 'Speed changes the math. A 7-month finish can make a 12% private loan cost like 6.8% all in, builders who move fast win 📐',
  },
  1: {
    audience: 'investor',
    hook: "Volatility kills sleep. Stable, asset-backed monthly distributions don't 💼",
  },
  2: {
    audience: 'borrower',
    hook: 'Premium hardwood, French and European oak in wider planks, helps a home stand out and sell stronger 🪵',
  },
  3: {
    audience: 'borrower',
    hook: '$4–5M sounds like a big number until you break down the roof alone, asphalt $30–40k, metal $50–60k, slate up to $100k 💰',
  },
  4: {
    audience: 'investor',
    hook: 'At 10% paid monthly, $1M produces $8,300 a month, treated as qualified REIT dividends 💼',
  },
  5: {
    audience: 'borrower',
    hook: "4% in a savings account doesn't build homes. We fund builders at 90–95% of project cost so they take on 2–3× the deals 🏗️",
  },
  6: {
    audience: 'borrower',
    hook: 'Banks slow deals down. Private lending closes Texas builds and flips in 5–10 days, no tax returns, no junk fees ⚡',
  },
  7: {
    audience: 'borrower',
    hook: 'A real loan servicer means your project can pay contractors, buy materials, and keep moving the day funds hit 🛠️',
  },
  8: {
    audience: 'investor',
    hook: 'Private lending can pay like a yield fund without the usual lock-up, 9–10% paid monthly, early withdrawals in 24–48 hours 💼',
  },
  9: {
    audience: 'borrower',
    hook: 'Ludowici tile inside or outside the build, the kind of finish detail buyers notice and that protects the asset 🏛️',
  },
};

function buildCaption(idx: number): string {
  const plan = PLAN[idx];
  const cta = plan.audience === 'borrower' ? BORROWER_CTA : INVESTOR_CTA;
  return `${plan.hook}\n\n${cta}`;
}

async function main() {
  const dryRun = process.argv.includes('--dry');
  const skipZernio = process.argv.includes('--skip-zernio');

  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { getPostingService } = await import('@/lib/posting');
  const admin = createAdminClient();
  const service = getPostingService();

  const { data: videos, error } = await admin
    .from('content_drop_videos')
    .select('id, order_index, drive_file_name, video_url, thumbnail_url, scheduled_post_id')
    .eq('drop_id', DROP_ID)
    .order('order_index');
  if (error) throw new Error(error.message);
  if (!videos || videos.length !== 10) {
    throw new Error(`Expected 10 videos, got ${videos?.length ?? 0}`);
  }

  let dbUpdated = 0;
  let zernioRepublished = 0;
  let zernioFailed = 0;

  for (const v of videos) {
    const plan = PLAN[v.order_index];
    if (!plan) {
      console.log(`✗ #${v.order_index}: no plan, skipping`);
      continue;
    }

    const newCaption = buildCaption(v.order_index);
    const audienceTag = plan.audience.toUpperCase();

    console.log(
      `\n#${String(v.order_index).padStart(2, '0')} ${v.drive_file_name} [${audienceTag}]`,
    );
    console.log('  ───');
    for (const line of newCaption.split('\n')) console.log(`  ${line}`);
    console.log(`  ${HASHTAGS.map((t) => `#${t}`).join(' ')}`);
    console.log('  ───');

    if (dryRun) {
      console.log('  (dry-run, no changes)');
      continue;
    }

    if (!v.scheduled_post_id) {
      console.log('  ✗ no scheduled_post_id, skipping');
      continue;
    }

    const { data: post, error: postErr } = await admin
      .from('scheduled_posts')
      .select('id, late_post_id, scheduled_at')
      .eq('id', v.scheduled_post_id)
      .single();
    if (postErr || !post) {
      console.log(`  ✗ scheduled_post not found: ${postErr?.message ?? 'missing'}`);
      continue;
    }

    // 1. Local DB updates first — share link reflects new copy even if Zernio fails.
    const { error: postUpdErr } = await admin
      .from('scheduled_posts')
      .update({
        caption: newCaption,
        hashtags: HASHTAGS,
        updated_at: new Date().toISOString(),
      })
      .eq('id', post.id);
    if (postUpdErr) {
      console.log(`  ✗ scheduled_posts update failed: ${postUpdErr.message}`);
      continue;
    }

    const { error: vidUpdErr } = await admin
      .from('content_drop_videos')
      .update({
        draft_caption: newCaption,
        draft_hashtags: HASHTAGS,
      })
      .eq('id', v.id);
    if (vidUpdErr) {
      console.log(`  ✗ content_drop_videos update failed: ${vidUpdErr.message}`);
      continue;
    }
    dbUpdated += 1;
    console.log('  ✓ DB updated');

    if (skipZernio) {
      console.log('  (skipping zernio)');
      continue;
    }

    if (!post.late_post_id) {
      console.log('  ⚠ no late_post_id, nothing to push to Zernio');
      continue;
    }

    // 2. Zernio: delete + republish (no PATCH endpoint exists).
    const { data: platforms } = await admin
      .from('scheduled_post_platforms')
      .select('social_profile_id')
      .eq('post_id', post.id);
    const profileIds = (platforms ?? []).map((p) => p.social_profile_id);
    const { data: profiles } = await admin
      .from('social_profiles')
      .select('id, late_account_id, platform')
      .in('id', profileIds);
    const lateProfiles = (profiles ?? []).filter(
      (p): p is { id: string; late_account_id: string; platform: string } =>
        typeof p.late_account_id === 'string' && p.late_account_id.length > 0,
    );
    if (lateProfiles.length === 0) {
      console.log('  ⚠ no late_account_id on profiles, cannot republish');
      continue;
    }

    try {
      await service.deletePost(post.late_post_id);
      console.log(`  ✓ deleted Zernio post ${post.late_post_id}`);
    } catch (delErr) {
      const msg = delErr instanceof Error ? delErr.message : 'unknown';
      console.log(`  ⚠ Zernio delete failed (continuing): ${msg}`);
    }

    try {
      const publish = await service.publishPost({
        videoUrl: v.video_url,
        caption: newCaption,
        hashtags: HASHTAGS,
        coverImageUrl: v.thumbnail_url ?? undefined,
        platformProfileIds: lateProfiles.map((p) => p.late_account_id),
        platformHints: Object.fromEntries(
          lateProfiles.map((p) => [p.late_account_id, p.platform]),
        ),
        scheduledAt: post.scheduled_at,
      });

      await admin
        .from('scheduled_posts')
        .update({ late_post_id: publish.externalPostId })
        .eq('id', post.id);
      zernioRepublished += 1;
      console.log(`  ✓ republished as ${publish.externalPostId}`);
    } catch (pubErr) {
      const msg = pubErr instanceof Error ? pubErr.message : 'unknown';
      console.log(`  ✗ republish FAILED: ${msg}`);
      zernioFailed += 1;
    }
  }

  console.log(`\nDone.`);
  console.log(`  DB updated:        ${dbUpdated}/10`);
  console.log(`  Zernio republished: ${zernioRepublished}/10`);
  if (zernioFailed > 0) console.log(`  Zernio failures:    ${zernioFailed}`);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
