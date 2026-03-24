/**
 * Builds 100 Goldback Idaho ads for Meta-weighted Gemini batch.
 * Run: npx tsx scripts/generate-goldback-meta-100.ts
 */
import * as fs from 'fs';
import { resolve } from 'path';
import { NANO_BANANA_CATALOG } from '../lib/ad-creatives/nano-banana/catalog-data';
import { fillNanoBananaTemplate } from '../lib/ad-creatives/nano-banana/fill-template';
import { buildMetaPerformanceSlotOrder } from '../lib/ad-creatives/nano-banana/bulk-presets';

const OUT_DIR = '/Users/jack/Desktop/Goldback-Meta-Top100';

const IMAGE_POOL = fs
  .readFileSync(resolve(process.cwd(), 'scripts/.goldback-idaho-image-pool.txt'), 'utf8')
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean);

/** 100 rows: headline, sub, cta, offer, product_service */
const COPY_ROWS: [string, string, string, string, string][] = [
  ['Resist inflation. Spend gold locally.', 'Real 24K gold in spendable notes — independents accept Goldbacks at checkout.', 'Where to buy', '', 'Goldbacks — spendable 24K gold currency.'],
  ['24-karat gold you can actually spend', 'Not just stored wealth — engineered for everyday transactions.', 'Learn more', '', 'Goldback notes with verifiable gold content.'],
  ['Idaho Goldbacks are here', 'Preorder the Gem State series — join the movement for sound money.', 'Find a seller', 'Preorder starts now', 'Idaho Goldback series preorders.'],
  ['Pay in gold at checkout', 'Goldbacks work like cash at thousands of independents — Idaho’s network is growing.', 'Where to spend', '', 'Goldback merchant acceptance.'],
  ['Preorder ends. Circulation begins.', 'Full Idaho series March 24 — secure notes through authorized sellers.', 'Where to buy', 'Full series March 24', 'Idaho Goldback launch timeline.'],
  ['Inflation eats cash. Goldbacks don’t.', 'Hold purchasing power in metal you can pass across the counter.', 'About Goldbacks', '', 'Spendable gold-backed currency.'],
  ['Verify serials. Trust the note.', 'UV features, polymer coat, intricate art — security built for circulation.', 'Learn more', '', 'Goldback anti-counterfeiting features.'],
  ['3,000 only', 'Idaho 3 Limited Early Release — rare mintage; LER program per goldback.com.', 'Find a distributor', 'Limited Early Release', 'Idaho LER scarcity and distributors.'],
  ['Earn a free Idaho LER', 'Refer an Idaho business to accept Goldbacks — rewards for community builders.', 'Learn more', 'Idaho LER program', 'Limited Early Release referral program.'],
  ['The Gem State runs on gold', 'State-themed art on every denomination — preorder before launch week rush.', 'Find a seller', 'Preorder starts now', 'Idaho Goldback artwork and preorders.'],
  ['Sound money. Local spend.', 'Protect purchasing power without giving up day-to-day commerce.', 'Where to exchange', '', 'Goldback exchange and seller network.'],
  ['Stack denominations. Stay flexible', 'Small gold units for real change-making — not just bars in a vault.', 'Where to buy Goldbacks', '', 'Goldback denomination lineup.'],
  ['Merchants: get paid in gold', 'Attract sound-money customers; keep fees and settlement aligned with your values.', 'Why accept Goldbacks', '', 'Goldback merchant onboarding.'],
  ['Hold Idaho. Spend Idaho.', 'Studio-grade notes — made to show and to circulate.', 'Find a seller', '', 'Idaho Goldback physical notes.'],
  ['March 24: Idaho goes live', 'Preorders from March 10 — don’t wait for launch-day scarcity noise.', 'Where to buy', 'Preorder starts now', 'Idaho series preorder window.'],
  ['Real gold. Real checkout.', 'Polymer-protected notes with gold content stated on every piece.', 'Learn more', '', 'Goldback construction and gold content.'],
  ['Join the Goldback movement', 'Since 2019, expanding state by state — Idaho is next.', 'About us', '', 'Goldback multi-state expansion.'],
  ['Where locals spend gold', 'Find sellers, exchanges, and spend locations through official tools.', 'Where to exchange', '', 'Goldback official exchange map.'],
  ['Security you can see', 'Raised reverse imagery and serial tracking — confidence for buyers and shops.', 'Learn more', '', 'Goldback note security.'],
  ['Preorder now. Spend soon.', 'Authorized distributors are listing Idaho inventory — grab your denominations.', 'Find a distributor', 'Preorder starts now', 'Idaho Goldback distributors.'],
  ['Independent businesses say yes', 'Goldbacks are accepted at registers nationwide — help Idaho catch up fast.', 'Become a merchant', '', 'Merchant signup — accept Goldbacks.'],
  ['“Finally, gold that spends.”', 'Customers ask for it — give them a checkout option that stands out.', 'Why accept Goldbacks', '', 'Merchant value proposition for Goldbacks.'],
  ['Limited mintage. Loud demand.', 'LER notes move fast — check official channels for availability.', 'Find a distributor', 'Idaho LER', 'Idaho Limited Early Release sales.'],
  ['Your wallet. Your metal.', 'Carry spendable gold in note form — not a promise on a screen.', 'Where to buy', '', 'Physical Goldback notes.'],
  ['Art you can circulate', 'Every Idaho note tells a regional story — collect or spend.', 'Open the safe', '', 'Idaho Goldback series lore and mintages.'],
  ['Stop watching purchasing power slip', 'Goldbacks aim to keep value in something you can verify and use.', 'Learn more', '', 'Inflation-resistant spendable gold.'],
  ['Gem State. Metal state.', 'Idaho-themed virtues and landscapes — struck into gold you can hold.', 'Find a seller', '', 'Idaho Goldback design story.'],
  ['Build your Idaho set', 'Mix denominations for everyday spends and long-term holding.', 'Where to buy', '', 'Idaho Goldback denomination mix.'],
  ['For savers who still buy coffee', 'Gold doesn’t have to mean “vault only.”', 'About Goldbacks', '', 'Spendable gold positioning.'],
  ['Official app. On your phone.', 'Calculator and tools for buyers, sellers, distributors.', 'Learn more', 'Now available', 'Goldback mobile app.'],
  ['Trust, but verify', 'Serial numbers and security features you can check — not mystery metal.', 'Learn more', '', 'Goldback verification story.'],
  ['Local currency. National story.', 'State series with local art — part of a growing U.S. network.', 'About us', '', 'Goldback local currency model.'],
  ['Preorder = first in line', 'Launch week gets noisy — secure notes early through sellers you trust.', 'Find a seller', 'Preorder starts now', 'Idaho preorder urgency.'],
  ['Spend gold like locals do', 'Find Idaho sellers and spend locations as the network expands.', 'Where to spend', '', 'Idaho spend map growth.'],
  ['LER: reward the builders', 'Help onboard merchants — Limited Early Release perks per official program.', 'How to earn a free Idaho LER', '', 'Idaho LER referral mechanics.'],
  ['Not another crypto pitch', 'Physical notes. Real gold. Human checkout.', 'Learn more', '', 'Goldback vs abstract digital claims.'],
  ['Protect the purchase power you earned', 'Goldbacks are designed around metal, not printer ink.', 'Where to buy', '', 'Sound money value prop.'],
  ['One series. Many stories', 'Each denomination adds a chapter — start with what you’ll actually spend.', 'Open the safe', '', 'Series storytelling.'],
  ['Questions? Go official', 'Sellers, spend maps, and education live on goldback.com.', 'Learn more', '', 'Official Goldback resources.'],
  ['Community-first money', 'When independents accept Goldbacks, wealth stays local longer.', 'Why accept Goldbacks', '', 'Local commerce + Goldbacks.'],
  ['Sharp metal. Sharp details', 'Macro-worthy engraving — show the note, earn the stop.', 'Find a seller', '', 'Product craft story.'],
  ['Dates matter', 'March 10 preorders · March 24 circulation — plan your pickup.', 'Where to buy', 'Full series March 24', 'Idaho key dates.'],
  ['Diversify how you hold value', 'Notes are one path — still read disclosures; this is education, not advice.', 'Learn more', '', 'General education framing.'],
  ['The note is the ad', 'Let the Idaho artwork do the flex — headline stays short.', 'Find a seller', '', 'Art-forward creative.'],
  ['Spend where you’re proud', 'Idaho businesses can lead on acceptance — early movers win attention.', 'Become a merchant', '', 'Idaho merchant CTA.'],
  ['Rare doesn’t mean inaccessible', 'Distributors list inventory — compare options officially.', 'Find a distributor', '', 'Distribution clarity.'],
  ['UV ink. Real features', 'Security stack called out on goldback.com — ask sellers to explain.', 'Learn more', '', 'UV / security education.'],
  ['Goldbacks ≠ “someday gold”', 'Spend today, hold tomorrow — same note.', 'Where to spend', '', 'Utility + saving duality.'],
  ['Your neighbor might already spend gold', 'Network growth means more checkout options — check the map.', 'Where to spend', '', 'Network growth social proof.'],
  ['Preorder calm > launch chaos', 'Beat the last-minute scramble; pick your denominations now.', 'Find a seller', 'Preorder starts now', 'Preorder rational urgency.'],
  ['Metal confidence', 'Hold it, tilt it, spend it — tactile trust.', 'Where to buy', '', 'Tactile product angle.'],
  ['Idaho winter. Golden joy.', 'LER art celebrates joy in Idaho peaks — story lives on goldback.com.', 'Learn more', 'Limited Early Release', 'LER artwork hook.'],
  ['For the “show me” buyer', 'Serials and art you can inspect — not a black box.', 'Find a seller', '', 'Proof-forward buyer.'],
  ['Merchants: fewer surprises', 'Clear acceptance playbooks via official onboarding.', 'Become a merchant', '', 'Merchant friction reduction.'],
  ['Collect. Or circulate.', 'You choose — denominations support both behaviors.', 'Where to buy Goldbacks', '', 'Dual use case.'],
  ['The movement needs merchants', 'Acceptance makes spendability real — Idaho launch is the moment.', 'Why accept Goldbacks', '', 'Movement + merchant CTA.'],
  ['Don’t sleep on LER', 'Limited quantities — official program details on site.', 'Find a distributor', 'Idaho LER', 'LER scarcity reminder.'],
  ['Gold that fits a wallet', 'Thin notes, serious metal content per denomination.', 'Learn more', '', 'Form factor benefit.'],
  ['See the Idaho series', 'Preview artwork and mintages in the Goldback Safe.', 'Open the safe', '', 'Safe / catalog CTA.'],
  ['Strong communities choose options', 'Goldbacks are one tool for locals who want choice.', 'About us', '', 'Community positioning.'],
  ['Your CTA is simple', 'Find a seller, buy official, verify features.', 'Find a seller', '', 'Direct response clarity.'],
  ['Teach the register once', 'Train staff on Goldbacks — repeat customers follow.', 'Become a merchant', '', 'Merchant ops angle.'],
  ['Not hype. Hardware.', 'Physical notes with stated gold content.', 'Learn more', '', 'Tangible product emphasis.'],
  ['March matters for Idaho', 'Two dates to remember: preorder open and circulation start.', 'Where to buy', 'Preorder starts now', 'Date reminder variant.'],
  ['Stack smart', 'Layer denominations for how you actually spend weekly.', 'Where to buy Goldbacks', '', 'Denomination planning.'],
  ['We’re not rewriting economics', 'We’re making gold spendable again — in small units.', 'About Goldbacks', '', 'Simple philosophy line.'],
  ['Ask: “Do you take Goldbacks?”', 'If the answer spreads, Idaho wins.', 'Where to spend', '', 'Question-hook creative.'],
  ['Official channels only', 'Avoid scams — use seller tools from goldback.com.', 'Where to exchange', '', 'Trust / safety reminder.'],
  ['Premium look. Practical job', 'Notes should feel special — and work at checkout.', 'Find a seller', '', 'Premium + utility.'],
  ['LER is a handshake program', 'Referrals reward people who grow acceptance.', 'Learn more', 'Idaho LER', 'LER humanized.'],
  ['Gold color. Clear message', 'Keep copy short; let metal read expensive.', 'Where to buy', '', 'Creative direction note in copy.'],
  ['For Idaho independents', 'Coffee, gear, services — if you take payment, you can explore Goldbacks.', 'Become a merchant', '', 'Independent business targeting.'],
  ['Circulation beats speculation', 'Spend drives adoption — merchants make the loop.', 'Why accept Goldbacks', '', 'Adoption philosophy.'],
  ['Numbers talk', 'Gold content is printed on the note — read the banner.', 'Learn more', '', 'On-note proof reference.'],
  ['Be early, stay official', 'Preorder through authorized paths — protect your purchase.', 'Find a distributor', 'Preorder starts now', 'Trust + preorder.'],
  ['This is what spendable looks like', 'A note, a hand, a register — real commerce.', 'Where to spend', '', 'Literal spend visual hint.'],
  ['Idaho deserves options', 'Local series, national standards for security.', 'Learn more', '', 'State pride + standards.'],
  ['You’re not “buying a story” only', 'You’re buying a negotiable instrument with stated gold.', 'Where to buy', '', 'Product seriousness.'],
  ['More acceptance = more utility', 'Help merchants list; help buyers ask.', 'Become a merchant', '', 'Flywheel two-sided.'],
  ['Keep claims grounded', 'Use official pages for dates, programs, and availability.', 'Learn more', '', 'Compliance-minded CTA.'],
  ['Goldback economy, one town at a time', 'Idaho launch adds another node to the network.', 'About us', '', 'Network growth narrative.'],
  ['Short headline. Big stop.', 'Spendable 24K — Idaho series.', 'Find a seller', 'Preorder starts now', 'Ultra-short hook variant.'],
  ['Security is layered', 'Art + polymer + serial discipline — not a single gimmick.', 'Learn more', '', 'Security depth.'],
  ['Distributors are listed', 'No guesswork — official exchange tools.', 'Where to exchange', '', 'Exchange clarity.'],
  ['Your phone can help', 'App tools for calculation — not a replacement for official buying advice.', 'Learn more', 'Now available', 'App assistive angle.'],
  ['LER: for the community builders', 'If you onboard shops, you grow spendability.', 'How to earn a free Idaho LER', '', 'LER community angle.'],
  ['Think long. Spend weekly.', 'Goldbacks bridge holding and living.', 'Where to buy', '', 'Behavior bridge.'],
  ['Idaho notes hit different', 'Regional art hits local pride — test it in-state.', 'Find a seller', '', 'Geo pride test.'],
  ['Make the CTA obvious', 'Find a seller beats clever every time in prospecting.', 'Find a seller', '', 'DR discipline meta line.'],
  ['Compare denominations', 'Pick what matches your typical purchase size.', 'Where to buy Goldbacks', '', 'Denomination selector mindset.'],
  ['We’re pro-small-business', 'Acceptance keeps fees and culture local.', 'Why accept Goldbacks', '', 'SMB values alignment.'],
  ['No fake urgency words', 'Real dates from official Idaho launch communications.', 'Where to buy', 'Full series March 24', 'Credible urgency.'],
  ['Gold that travels flat', 'Notes fit how people actually carry value.', 'Learn more', '', 'Portability.'],
  ['Education first', 'If Goldbacks are new to you, start with “About Goldbacks.”', 'About Goldbacks', '', 'TOF education CTA.'],
  ['Spend local. Strengthen local.', 'Goldbacks reward independents who say yes.', 'Where to spend', '', 'Localism repeat.'],
  ['LER inventory moves', 'Check distributors for graded LER availability.', 'Find a distributor', 'Limited mintage', 'LER inventory CTA.'],
  ['Art + assay mindset', 'Beautiful notes with serious manufacturing discipline.', 'Open the safe', '', 'Craft + discipline.'],
  ['Ask your favorite shop', 'One question can start acceptance in your town.', 'Become a merchant', '', 'Peer nudge to merchants.'],
  ['Goldbacks in the wild', 'Real notes, real registers — that’s the goal.', 'Where to spend', '', 'Real-world goal statement.'],
  ['Preorder: pick your mix', 'Don’t default to one denomination — diversify picks.', 'Find a seller', 'Preorder starts now', 'Basket building.'],
];

function main(): void {
  const slugs = buildMetaPerformanceSlotOrder(100);
  if (slugs.length !== 100) throw new Error(`expected 100 slugs, got ${slugs.length}`);
  if (COPY_ROWS.length !== 100) throw new Error(`expected 100 copy rows, got ${COPY_ROWS.length}`);
  if (IMAGE_POOL.length < 50) throw new Error('image pool too small');

  const bySlug = new Map(NANO_BANANA_CATALOG.map((e) => [e.slug, e]));
  const ads = slugs.map((slug, i) => {
    const entry = bySlug.get(slug);
    if (!entry) throw new Error(`bad slug ${slug}`);
    const [headline, subheadline, cta, offer, product_service] = COPY_ROWS[i];
    const ref = IMAGE_POOL[i % IMAGE_POOL.length];
    const filled = fillNanoBananaTemplate(entry.promptTemplate, {
      onScreenText: { headline, subheadline, cta },
      productService: product_service,
      offer,
    });
    return {
      ad_index: i + 1,
      nano_banana_slug: slug,
      nano_banana_name: entry.name,
      nano_type: entry.nanoType,
      sort_order: entry.sortOrder,
      headline,
      subheadline,
      cta,
      offer: offer || null,
      product_service,
      local_reference_image: ref,
      client_image_modifier: `Meta static — high legibility at small sizes; single primary CTA; product must match reference photo exactly. File: ${ref}`,
      filled_nano_banana_template: filled,
      meta_batch: 'goldback-top100-v1',
    };
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(resolve(OUT_DIR, '100-ads.generated.json'), JSON.stringify({ ads }, null, 2));
  fs.writeFileSync(
    resolve(OUT_DIR, 'cortex-creative-overrides.json'),
    JSON.stringify(
      {
        creativeOverrides: ads.map((a) => ({
          templateId: a.nano_banana_slug,
          variationIndex: 0,
          headline: a.headline,
          subheadline: a.subheadline,
          cta: a.cta,
          styleNotes: a.client_image_modifier,
        })),
      },
      null,
      2,
    ),
  );
  console.log(`Wrote ${ads.length} ads to ${OUT_DIR}`);
}

main();
