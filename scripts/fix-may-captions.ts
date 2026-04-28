/**
 * Caption hygiene pass for May 2026 calendars.
 *
 *   1. Strip em-dashes (—) from every caption — replace `\s*—\s*` with `, `
 *      and collapse double commas. Targets:
 *        - scheduled_posts.caption  (May 2026)
 *        - content_drop_videos.draft_caption  (linked to those posts)
 *        - clients.caption_cta  (so future regenerations don't reintroduce them)
 *
 *   2. Ensure exactly one emoji in the body:
 *        - 0 emoji → inject a per-slug topical emoji at the end of the caption.
 *        - 2+ emoji → keep the first, strip the rest.
 *      Also normalize clients.caption_cta down to one emoji.
 *
 * Captions are still in draftMode (Zernio not pushed yet) so this only
 * touches Cortex DB rows; the public share link will reflect the change
 * on next reload.
 *
 *   npx tsx scripts/fix-may-captions.ts          # dry-run
 *   npx tsx scripts/fix-may-captions.ts --apply  # apply
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createAdminClient } from '@/lib/supabase/admin';

// Match a single emoji codepoint (base char). To count user-perceived emojis
// (which include skin-tone modifiers, VS-16, ZWJ joiners), we segment by
// grapheme and check each cluster for an emoji codepoint.
const EMOJI_CHAR_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{2300}-\u{23FF}]/u;
const EMDASH_RE = /\s*—\s*/g;
const SEGMENTER = new Intl.Segmenter('en', { granularity: 'grapheme' });

function emojiClusters(s: string): { segment: string; isEmoji: boolean }[] {
  const out: { segment: string; isEmoji: boolean }[] = [];
  for (const seg of SEGMENTER.segment(s)) {
    out.push({ segment: seg.segment, isEmoji: EMOJI_CHAR_RE.test(seg.segment) });
  }
  return out;
}

const TOPICAL_EMOJI: Record<string, string> = {
  'safe-stop': '🚛',
  'goodier-labs': '🧪',
  'national-lenders': '💼',
  'all-shutters-and-blinds': '🪟',
  'avondale-private-lending': '💼',
  'equidad-homes': '🏡',
  'varsity-vault': '🏈',
  'coast-to-coast': '🚗',
  'crystal-creek-cattle': '🐄',
  'custom-shade-and-shutter': '🪟',
  'dunstons-steakhouse': '🥩',
  'fusion-brands': '✨',
  'hartley-law': '⚖️',
  'owings-auto': '🚗',
  'rana-furniture': '🛋️',
  'rank-prompt': '🚀',
  'skibell-fine-jewelry': '💎',
  'the-standard-ranch-water': '🍹',
  'total-plumbing': '🔧',
};

// CTAs that ship with multiple emojis — pick the most brand-relevant one
// to keep, strip the rest. Every other CTA already has 0 or 1.
const CTA_KEEP_EMOJI: Record<string, string> = {
  'skibell-fine-jewelry': '💍',
  'total-plumbing': '👉🏼',
  'the-standard-ranch-water': '🍻',
};

function stripEmdash(s: string): string {
  return s
    .replace(EMDASH_RE, ', ')
    .replace(/,\s*,/g, ',')
    .replace(/\s+,/g, ',')
    .replace(/\.\s*,/g, '.')
    .replace(/,\s*\./g, '.')
    .replace(/  +/g, ' ');
}

function countEmoji(s: string): number {
  return emojiClusters(s).filter((c) => c.isEmoji).length;
}

function stripAllEmoji(s: string): string {
  return emojiClusters(s).filter((c) => !c.isEmoji).map((c) => c.segment).join('')
    .replace(/  +/g, ' ').replace(/\s+([.,!?])/g, '$1');
}

function keepFirstEmoji(s: string): string {
  let kept = false;
  return emojiClusters(s).map((c) => {
    if (!c.isEmoji) return c.segment;
    if (!kept) { kept = true; return c.segment; }
    return '';
  }).join('').replace(/  +/g, ' ').replace(/\s+([.,!?])/g, '$1');
}

// Keep the *first occurrence* of `keepEmoji` (in its original position) and
// strip every other emoji. Falls back to keepFirstEmoji() if `keepEmoji`
// isn't present.
function keepSpecificEmoji(s: string, keepEmoji: string): string {
  const clusters = emojiClusters(s);
  if (!clusters.some((c) => c.isEmoji && c.segment === keepEmoji)) {
    return keepFirstEmoji(s);
  }
  let kept = false;
  return clusters.map((c) => {
    if (!c.isEmoji) return c.segment;
    if (c.segment === keepEmoji && !kept) { kept = true; return c.segment; }
    return '';
  }).join('').replace(/  +/g, ' ').replace(/\s+([.,!?])/g, '$1');
}

function injectEmoji(caption: string, emoji: string): string {
  // Append before trailing whitespace; if caption already ends with punctuation,
  // put emoji after it with a space.
  const trimmed = caption.replace(/\s+$/, '');
  return `${trimmed} ${emoji}`;
}

interface Plan {
  postId: string;
  videoId: string | null;
  slug: string;
  before: string;
  after: string;
  notes: string[];
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`${apply ? 'APPLY' : 'DRY-RUN'} — caption hygiene pass for May 2026\n`);

  const admin = createAdminClient();

  // ─── Step 1: clients.caption_cta cleanup ─────────────────────────
  // Only touch CTAs for clients in the May 2026 calendar so we don't
  // accidentally rewrite boilerplate for clients who aren't being audited.
  console.log('── Identifying May 2026 client slugs ──');
  const { data: mayPosts } = await admin
    .from('scheduled_posts')
    .select('clients(slug)')
    .gte('scheduled_at', '2026-05-01')
    .lt('scheduled_at', '2026-06-01');
  const maySlugs = new Set<string>();
  for (const p of mayPosts ?? []) {
    const slug = (p as { clients: { slug: string } | null }).clients?.slug;
    if (slug) maySlugs.add(slug);
  }
  console.log(`  ${maySlugs.size} clients in May 2026 calendar`);

  console.log('\n── clients.caption_cta cleanup (May clients only) ──');
  const { data: clients } = await admin
    .from('clients')
    .select('id, slug, caption_cta')
    .in('slug', [...maySlugs])
    .not('caption_cta', 'is', null);

  const ctaUpdates: { id: string; slug: string; before: string; after: string }[] = [];
  for (const c of clients ?? []) {
    if (!c.caption_cta) continue;
    let next = stripEmdash(c.caption_cta);
    const emojiCount = countEmoji(next);
    if (emojiCount > 1) {
      const keep = CTA_KEEP_EMOJI[c.slug];
      next = keep ? keepSpecificEmoji(next, keep) : keepFirstEmoji(next);
    }
    if (next !== c.caption_cta) {
      ctaUpdates.push({ id: c.id, slug: c.slug, before: c.caption_cta, after: next });
    }
  }
  for (const u of ctaUpdates) {
    console.log(`  ${u.slug}`);
    console.log(`    before: ${u.before}`);
    console.log(`    after:  ${u.after}`);
  }
  if (ctaUpdates.length === 0) console.log('  (no CTA changes needed)');

  // ─── Step 2: May 2026 captions — joined via content_drop_videos ──
  // scheduled_posts.caption is the source of truth shown to clients;
  // content_drop_videos.draft_caption is the regen-friendly mirror.
  console.log('\n── May 2026 captions (scheduled_posts + content_drop_videos) ──');
  const { data: posts } = await admin
    .from('scheduled_posts')
    .select('id, caption, client_id, scheduled_at, clients(slug)')
    .gte('scheduled_at', '2026-05-01')
    .lt('scheduled_at', '2026-06-01');

  // Build post-id → video-id map by querying content_drop_videos.
  const postIds = (posts ?? []).map((p) => p.id);
  const { data: videoLinks } = await admin
    .from('content_drop_videos')
    .select('id, scheduled_post_id, draft_caption')
    .in('scheduled_post_id', postIds);
  const videoByPostId = new Map<string, { id: string; draftCaption: string | null }>();
  for (const v of videoLinks ?? []) {
    if (v.scheduled_post_id) {
      videoByPostId.set(v.scheduled_post_id, { id: v.id, draftCaption: v.draft_caption ?? null });
    }
  }

  const plans: Plan[] = [];
  for (const p of posts ?? []) {
    if (!p.caption) continue;
    const slug = (p as { clients: { slug: string } }).clients.slug;
    const before = p.caption;
    let after = stripEmdash(before);
    const notes: string[] = [];
    if (after !== before) notes.push('em-dash');

    const emojiCount = countEmoji(after);
    if (emojiCount > 1) {
      const keep = CTA_KEEP_EMOJI[slug];
      after = keep ? keepSpecificEmoji(after, keep) : keepFirstEmoji(after);
      notes.push(`reduced ${emojiCount}→1 emoji`);
    } else if (emojiCount === 0) {
      const emoji = TOPICAL_EMOJI[slug];
      if (!emoji) {
        console.warn(`  ⚠ no topical emoji defined for ${slug}, skipping injection`);
      } else {
        after = injectEmoji(after, emoji);
        notes.push(`injected ${emoji}`);
      }
    }

    if (after !== before) {
      plans.push({
        postId: p.id,
        videoId: videoByPostId.get(p.id)?.id ?? null,
        slug,
        before,
        after,
        notes,
      });
    }
  }

  console.log(`Plans: ${plans.length} of ${posts?.length ?? 0} posts need updates`);
  // Group by slug for summary
  const bySlug = new Map<string, Plan[]>();
  for (const p of plans) {
    if (!bySlug.has(p.slug)) bySlug.set(p.slug, []);
    bySlug.get(p.slug)!.push(p);
  }
  for (const [slug, ps] of [...bySlug.entries()].sort()) {
    const tally = ps.reduce((acc, p) => {
      for (const n of p.notes) acc[n] = (acc[n] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log(`  ${slug.padEnd(28)} ${ps.length} posts  ${JSON.stringify(tally)}`);
  }

  // Show one sample per affected slug
  console.log('\nSample diffs (one per slug, full text):');
  const seenSlug = new Set<string>();
  for (const p of plans) {
    if (seenSlug.has(p.slug)) continue;
    seenSlug.add(p.slug);
    console.log(`\n  ── ${p.slug} (${p.notes.join(', ')}) ──`);
    console.log(`  before:\n${p.before}`);
    console.log(`  after:\n${p.after}`);
  }

  if (!apply) {
    console.log('\n(dry-run — re-run with --apply)');
    return;
  }

  // ─── Apply ──────────────────────────────────────────────────────
  console.log('\n── Applying ──');

  for (const u of ctaUpdates) {
    const { error } = await admin.from('clients').update({ caption_cta: u.after }).eq('id', u.id);
    if (error) console.error(`  ✗ ${u.slug}: ${error.message}`);
    else console.log(`  ✓ ${u.slug} caption_cta updated`);
  }

  let okPosts = 0;
  let okVideos = 0;
  for (const p of plans) {
    const { error: postErr } = await admin
      .from('scheduled_posts')
      .update({ caption: p.after })
      .eq('id', p.postId);
    if (postErr) console.error(`  ✗ post ${p.postId}: ${postErr.message}`);
    else okPosts += 1;

    if (p.videoId) {
      const { error: vidErr } = await admin
        .from('content_drop_videos')
        .update({ draft_caption: p.after })
        .eq('id', p.videoId);
      if (vidErr) console.error(`  ✗ video ${p.videoId}: ${vidErr.message}`);
      else okVideos += 1;
    }
  }

  console.log(`\n✓ Updated ${okPosts}/${plans.length} scheduled_posts, ${okVideos} content_drop_videos, ${ctaUpdates.length} client CTAs`);
}

main().catch((err) => {
  console.error('\n✗ fix-may-captions crashed:', err);
  process.exit(1);
});
