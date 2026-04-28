/**
 * Quick inspection of May 2026 caption state — em-dash count + emoji count.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { createAdminClient } from '@/lib/supabase/admin';

const EMOJI_CHAR_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{2300}-\u{23FF}]/u;
const EMDASH_RE = /—/g;
const SEG = new Intl.Segmenter('en', { granularity: 'grapheme' });
function emojiCount(s: string): number {
  let n = 0;
  for (const seg of SEG.segment(s)) {
    if (EMOJI_CHAR_RE.test(seg.segment)) n += 1;
  }
  return n;
}

async function main() {
  const admin = createAdminClient();

  const { data: posts } = await admin
    .from('scheduled_posts')
    .select('id, client_id, caption, scheduled_at, clients(slug, name)')
    .gte('scheduled_at', '2026-05-01')
    .lt('scheduled_at', '2026-06-01')
    .order('scheduled_at');

  console.log(`Found ${posts?.length ?? 0} May 2026 scheduled posts\n`);

  const bySlug = new Map<string, { name: string; total: number; emdash: number; noEmoji: number; multiEmoji: number; samples: string[] }>();
  for (const p of posts ?? []) {
    const c = (p as { clients: { slug: string; name: string } }).clients;
    if (!bySlug.has(c.slug)) bySlug.set(c.slug, { name: c.name, total: 0, emdash: 0, noEmoji: 0, multiEmoji: 0, samples: [] });
    const e = bySlug.get(c.slug)!;
    e.total += 1;
    const cap = p.caption ?? '';
    const emdashes = (cap.match(EMDASH_RE) ?? []).length;
    const emojis = emojiCount(cap);
    if (emdashes > 0) e.emdash += 1;
    if (emojis === 0) e.noEmoji += 1;
    if (emojis > 1) e.multiEmoji += 1;
    if (e.samples.length < 1) e.samples.push(cap.slice(0, 200));
  }

  console.log('slug                           | total | em-dash | 0-emoji | 2+-emoji');
  console.log('-'.repeat(78));
  for (const [slug, e] of [...bySlug.entries()].sort()) {
    console.log(`${slug.padEnd(30)} |  ${String(e.total).padStart(3)}  |   ${String(e.emdash).padStart(3)}   |   ${String(e.noEmoji).padStart(3)}   |   ${String(e.multiEmoji).padStart(3)}`);
  }

  console.log('\nSample captions:');
  for (const [slug, e] of [...bySlug.entries()].slice(0, 3)) {
    console.log(`\n${slug} (${e.name}):`);
    console.log('  ', e.samples[0]);
  }

  // Also inspect clients.caption_cta
  console.log('\n\nclients.caption_cta with em-dashes:');
  const { data: clients } = await admin
    .from('clients')
    .select('slug, name, caption_cta')
    .not('caption_cta', 'is', null);
  for (const c of clients ?? []) {
    if (c.caption_cta && EMDASH_RE.test(c.caption_cta)) {
      console.log(`  ${c.slug.padEnd(30)} ${c.caption_cta.slice(0, 120)}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
