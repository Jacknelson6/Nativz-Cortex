/**
 * Seed Avondale's caption-gen voice from their actual public website.
 *
 *   npx tsx scripts/seed-avondale-voice.ts
 *
 * Why this script exists:
 *   - Zernio has zero history for this brand (probed earlier — they posted
 *     manually before Zernio was wired up).
 *   - mbasic.facebook.com blocks scraping with a "browser not supported" wall.
 *   - But avondaleprivatelending.com is wide open and full of strong copy.
 *
 * What it does:
 *   1. Updates clients.brand_voice + target_audience with Avondale's actual
 *      taglines, numbers, and dual-audience structure (verbatim from their
 *      site).
 *   2. Inserts ~8 voice-anchor "saved_captions" rows. These aren't real
 *      historical posts — they're caption-shaped distillations of the
 *      borrower/investor language on their borrowers/investors pages,
 *      written in the voice the LLM should mimic. The caption generator
 *      pulls the last 10 saved_captions as exemplars, so this gives it
 *      real signal instead of hallucinating tone.
 *
 * Idempotent: skips brand updates if values already match, and skips caption
 * inserts if (client_id, caption_text) already exists.
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

const CLIENT_ID = 'fb8a1a10-166c-43e7-bd13-981486095cb4';

const TARGET_AUDIENCE = [
  'Two distinct audiences — every caption must address both, leading with the angle most relevant to the video:',
  '',
  '(1) BORROWERS: Experienced real estate professionals — home builders, developers, fix-and-flip investors operating in the Texas Triangle (Dallas, Houston, Austin, San Antonio). They feel the pain of slow banks killing deals. They care about: close-time (Avondale closes in 5-10 days), straightforward terms, no junk fees (no doc prep, application, draw, or wire fees), and a lender that understands the build/flip business — not one that asks for tax returns. Avondale funds projects "traditional banks won\'t touch."',
  '',
  '(2) INVESTORS: Accredited investors looking for high-yield, tax-efficient passive income. Minimum $100k, 12-month lock-up. They care about: 9-10% annual returns paid monthly, the QBI tax deduction (up to 20%, making 9-10% pre-tax comparable to 10-11% from non-QBI-eligible investments), capital preservation backed by real-estate-collateralized loans, and the fact that the principals invest their own family capital in the same share class.',
  '',
  'Track record to weave in when relevant: $500M+ originated, 800+ loans funded, 160+ investors, since 2016, Texas Triangle focus.',
].join('\n');

const BRAND_VOICE = [
  'Professional, plain-spoken, partnership-oriented. Sound like a senior lender who has closed thousands of deals — not a marketer.',
  '',
  'Anchor taglines (use these literally when they fit):',
  '• "Build more homes. Build your business." (borrower)',
  '• "Simple, fast funding." (borrower)',
  '• "High-yield, tax-efficient income." (investor)',
  '• "Stick to the knitting." (philosophy — local, relationship-based)',
  '',
  'Caption rules:',
  '• Short, declarative sentences. No startup-speak ("unlock", "game-changer", "level up", "elevate").',
  '• Lead with concrete proof points: 5-10 day close, no junk fees, $500M originated, 9-10% paid monthly, QBI-eligible, principals invest alongside.',
  '• Each caption opens with the angle most relevant to the video, then weaves the other audience\'s value in 1-2 sentences.',
  '• End with a clear CTA — borrowers: "DM to qualify" or "Apply at the link". Investors: "Link in bio for the investor brief".',
  '• 80-280 chars total. No hashtag walls — 3-6 max, business-specific (#texasrealestate #privatecredit #homebuilders #accreditedinvestor).',
].join('\n');

// Voice anchors — caption-shaped distillations of the actual website copy.
// These are NOT past posts; they are exemplars that show the LLM the dual-
// audience structure + Avondale-specific phrasing it should mimic.
const VOICE_ANCHORS: { title: string; caption: string; hashtags: string[] }[] = [
  {
    title: 'Anchor · 5-10 day close (borrower lead)',
    caption:
      'Builders: deals die when banks drag. We close in 5-10 days, no tax returns, no junk fees. While they fund the project, our investors earn 9-10% paid monthly, asset-backed. DM to qualify.',
    hashtags: ['texasrealestate', 'homebuilders', 'privatecredit', 'realestateinvesting'],
  },
  {
    title: 'Anchor · QBI tax-advantaged returns (investor lead)',
    caption:
      'Accredited investors: 9-10% annual returns, paid monthly, QBI-eligible. Same share class our family is in. Capital backed by Texas builders we\'ve funded $500M for since 2016. Link in bio for the investor brief.',
    hashtags: ['accreditedinvestor', 'privatecredit', 'passiveincome', 'realestateinvesting'],
  },
  {
    title: 'Anchor · No junk fees (borrower lead)',
    caption:
      'No doc prep fees. No application fees. No draw fees. No wire fees. Just straightforward terms and a team that understands the build. Investors: every loan we fund is yours, asset-backed at 9-10%. Apply at the link.',
    hashtags: ['homebuilders', 'texasrealestate', 'fixandflip', 'privatelending'],
  },
  {
    title: 'Anchor · Texas Triangle focus',
    caption:
      'We stick to the knitting — Dallas, Houston, Austin, San Antonio. 800 loans funded. $500M originated. Builders close in 5-10 days. Investors collect 9-10% monthly, tax-advantaged. DM to qualify or link in bio for the investor brief.',
    hashtags: ['texasrealestate', 'dallasrealestate', 'houstonrealestate', 'privatecredit'],
  },
  {
    title: 'Anchor · Principal alignment (investor lead)',
    caption:
      'Our principals and their families invest alongside you in the same share class. 9-10% paid monthly. 12-month lock-up, $100k minimum, accredited only. Backed by builders we\'ve closed deals for since 2016. Link in bio.',
    hashtags: ['accreditedinvestor', 'passiveincome', 'reit', 'realestateinvesting'],
  },
  {
    title: 'Anchor · Speed in competitive markets (borrower lead)',
    caption:
      'In this market, speed wins the deal. Our team funds in 5-10 days — no tax returns, no junk fees, focus on the deal. Same loans pay our investors 9-10% monthly, asset-backed. DM to qualify.',
    hashtags: ['homebuilders', 'fixandflip', 'realestateinvesting', 'privatecredit'],
  },
  {
    title: 'Anchor · Track record',
    caption:
      'Since 2016: $500M originated, 800 loans funded, 160 investors paid monthly. Builders close in 5-10 days. Investors earn 9-10% tax-advantaged. Texas Triangle, the deals banks won\'t touch. DM to qualify or link in bio.',
    hashtags: ['texasrealestate', 'privatecredit', 'accreditedinvestor', 'homebuilders'],
  },
  {
    title: 'Anchor · Banks vs us (borrower lead)',
    caption:
      'Banks are slow and rigid. We\'re not. 5-10 day close, no junk fees, no tax returns. Built by lenders who understand the business. Investors: every loan is your collateral at 9-10% monthly. Apply at the link.',
    hashtags: ['homebuilders', 'realestateinvesting', 'privatelending', 'texasrealestate'],
  },
];

async function main() {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();

  // 1. Update brand fields
  const { error: clientErr } = await admin
    .from('clients')
    .update({ brand_voice: BRAND_VOICE, target_audience: TARGET_AUDIENCE })
    .eq('id', CLIENT_ID);
  if (clientErr) {
    console.error('✗ Failed to update client brand fields:', clientErr.message);
    process.exit(1);
  }
  console.log('✓ Updated clients.brand_voice + target_audience with verbatim Avondale copy');

  // 2. Insert voice anchors (idempotent on caption_text)
  let inserted = 0;
  let skipped = 0;
  for (const anchor of VOICE_ANCHORS) {
    const { data: existing } = await admin
      .from('saved_captions')
      .select('id')
      .eq('client_id', CLIENT_ID)
      .eq('caption_text', anchor.caption)
      .maybeSingle();
    if (existing) {
      skipped += 1;
      continue;
    }
    const { error: insertErr } = await admin.from('saved_captions').insert({
      client_id: CLIENT_ID,
      title: anchor.title,
      caption_text: anchor.caption,
      hashtags: anchor.hashtags,
    });
    if (insertErr) {
      console.error(`✗ Failed to insert "${anchor.title}":`, insertErr.message);
      continue;
    }
    inserted += 1;
  }
  console.log(`✓ Seeded ${inserted} voice anchors (skipped ${skipped} duplicates)`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
