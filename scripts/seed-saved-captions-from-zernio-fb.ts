/**
 * Pull a brand's past Facebook captions from Zernio and seed `saved_captions`
 * so the calendar caption generator picks them up as voice anchors.
 *
 *   npx tsx scripts/seed-saved-captions-from-zernio-fb.ts <clientId> [count]
 *
 *   clientId — Cortex client UUID (required)
 *   count    — keep at most this many recent captions (default 12)
 *
 * Reads the FB social_profile to get the Zernio account ID, lists the last
 * `limit` posts from Zernio (filtered to platform=facebook), keeps the ones
 * that actually targeted this brand's account, and inserts them as
 * saved_captions rows. Idempotent on (client_id, caption_text).
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

async function main() {
  const clientId = process.argv[2];
  if (!clientId) {
    console.error('Usage: npx tsx scripts/seed-saved-captions-from-zernio-fb.ts <clientId> [count]');
    process.exit(1);
  }
  const keepCount = Number(process.argv[3] ?? '12');

  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { getPostingService } = await import('@/lib/posting');
  const admin = createAdminClient();

  const { data: profile, error: profileErr } = await admin
    .from('social_profiles')
    .select('late_account_id, username')
    .eq('client_id', clientId)
    .eq('platform', 'facebook')
    .maybeSingle();
  if (profileErr) {
    console.error('✗ Failed to load FB social_profile:', profileErr.message);
    process.exit(1);
  }
  if (!profile?.late_account_id) {
    console.error(`✗ No FB late_account_id on file for client ${clientId}`);
    process.exit(1);
  }
  const fbAccountId = profile.late_account_id;
  console.log(`→ Pulling Zernio FB posts for account ${fbAccountId} (${profile.username ?? 'no username'})`);

  const service = getPostingService();
  const posts = await service.listPosts({ platform: 'facebook', limit: 100 });
  console.log(`  Zernio returned ${posts.length} FB posts (across the workspace)`);

  const mine = posts.filter((p) => p.platforms.some((pl) => pl.accountId === fbAccountId));
  console.log(`  ${mine.length} of those targeted this brand`);

  if (mine.length === 0) {
    console.log('  Nothing to seed.');
    return;
  }

  // Prefer published posts, fall back to the rest. Sort by publishedAt then
  // createdAt so the most recent voice example wins.
  const sorted = [...mine].sort((a, b) => {
    const aDate = a.publishedAt ?? a.scheduledFor ?? a.createdAt;
    const bDate = b.publishedAt ?? b.scheduledFor ?? b.createdAt;
    return bDate.localeCompare(aDate);
  });

  const seen = new Set<string>();
  const picks = [];
  for (const p of sorted) {
    const text = (p.content ?? '').trim();
    if (!text) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    picks.push({ text, externalId: p.id, publishedAt: p.publishedAt ?? null });
    if (picks.length >= keepCount) break;
  }
  console.log(`  Picking top ${picks.length} unique captions to save`);

  let inserted = 0;
  let skipped = 0;
  for (const pick of picks) {
    // Idempotency: skip if we already saved this caption for this brand.
    const { data: existing } = await admin
      .from('saved_captions')
      .select('id')
      .eq('client_id', clientId)
      .eq('caption_text', pick.text)
      .maybeSingle();
    if (existing) {
      skipped += 1;
      continue;
    }
    const titleStub = pick.publishedAt
      ? `Zernio FB · ${pick.publishedAt.split('T')[0]}`
      : `Zernio FB · ${pick.externalId.slice(0, 8)}`;
    const { error: insertErr } = await admin.from('saved_captions').insert({
      client_id: clientId,
      title: titleStub,
      caption_text: pick.text,
      hashtags: extractHashtags(pick.text),
    });
    if (insertErr) {
      console.error(`  ✗ Failed to insert "${titleStub}":`, insertErr.message);
      continue;
    }
    inserted += 1;
  }

  console.log(`✓ Seeded ${inserted} saved_captions (skipped ${skipped} duplicates)`);
}

function extractHashtags(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/#([\p{L}\p{N}_]+)/gu)) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
