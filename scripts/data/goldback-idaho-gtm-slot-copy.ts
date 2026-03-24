/**
 * Idaho GTM copy **per Nano Banana slug** — headline, subhead, and offer fit the layout’s intent
 * (value stack vs stat hero vs UGC, etc.) and stay on-brief: Idaho series, 24K, circulation, trust, local pride.
 * CTA is always Learn more (see builder). Product lines rotate from pools (factual, not art-direction).
 */
import {
  IDGT_PRODUCT_LINES,
  IDAHO_GOLDBACK_OVERARCHING_CONCEPT,
} from './goldback-idaho-gtm-pools';

export const IDGT_FIXED_CTA = 'Learn more';

type Row = { headline: string; subheadline: string; offer: string };

function pick<T>(arr: readonly T[], slotIndex: number, slug: string): T {
  const slugSum = [...slug].reduce((a, c) => a + c.charCodeAt(0), 0);
  const idx = Math.abs((slotIndex + 1) * 47 + slugSum * 3) % arr.length;
  return arr[idx];
}

/** Typographic stack: bold promise + tight supporting facts in one line. */
const VALUE_STACK: Row[] = [
  { h: 'Hard money for hard country.', s: '24K Idaho notes · verifiable · built to circulate.', o: '' },
  { h: 'Your home. Your land. Your gold.', s: 'Physical Goldbacks · local series · face-to-face trust.', o: '' },
  { h: 'Gold engineered to circulate.', s: 'Practical denominations · growing Idaho merchant map.', o: '' },
  { h: 'Built for Main Street, not Wall Street.', s: 'Neighbor sales · independent shops · Idaho-first.', o: '' },
  { h: 'Trust it. Hold it. Spend it.', s: 'Serials you can read · art you can see · gold you can feel.', o: '' },
  { h: 'Keep gold circulating in Idaho.', s: 'Same 24K standard · statewide series artwork.', o: '' },
  { h: 'Modern tech. Traditional money.', s: 'Printed security · physical bearer notes · no app required.', o: '' },
  { h: 'Hard money. Zero dependence.', s: 'Hold value in metal · spend where locals say yes.', o: '' },
  { h: 'Innovation, backed by 24k gold.', s: 'Layered notes · UV and engraving · Idaho storytelling.', o: '' },
  { h: 'A currency you can trust.', s: 'Anti-counterfeit craft · clear denominations · local circulation.', o: '' },
  { h: 'Currency as off grid as the Sawtooths.', s: 'Bearer-held · private handoffs · Idaho outdoors ethos.', o: '' },
  { h: 'Gold currency. No bank required.', s: 'Trade person-to-person · stack what fits your week.', o: '' },
  { h: 'Future-ready 24k gold currency.', s: 'Designed for real life · rooted in Idaho places.', o: '' },
  { h: 'Spend gold where Idaho does business.', s: 'Coffee, feed, gear, services — ask who takes Goldbacks.', o: '' },
  { h: 'Precision-built currency for a changing economy.', s: 'Measured gold content · consistent series quality.', o: '' },
  { h: 'Set your sights on sound money.', s: 'Start with one note · learn the series · grow from there.', o: '' },
  { h: 'The future of currency, now in Idaho.', s: 'Gem State artwork · national-grade security discipline.', o: '' },
  { h: 'Gold for the modern world.', s: 'Physical first · verifiable always · Idaho on every design.', o: '' },
];

/** Big type / KPI energy — headline carries the “number” or bold claim; sub explains. */
const STAT_HERO: Row[] = [
  { h: '24K', s: 'Gold content stated on every Idaho Goldback.', o: '' },
  { h: '100% physical', s: 'Bearer notes — not a screen balance.', o: '' },
  { h: '24 karat', s: 'Layered gold you can inspect under light.', o: '' },
  { h: '1 series', s: 'Idaho stories struck across every denomination.', o: '' },
  { h: '50 states?', s: 'Your move starts in Idaho.', o: '' },
  { h: '0 apps required', s: 'Hand the note across the counter.', o: '' },
  { h: '3 reasons Idaho shops say yes', s: 'Trust · novelty · sound-money customers.', o: '' },
  { h: '5 minutes to learn', s: 'Serials, art, UV — see how verification works.', o: '' },
  { h: '2-sided trust', s: 'Raised reverse · printed obverse · same note.', o: '' },
  { h: 'Idaho-first', s: 'Merchants and sellers listed on goldback.com.', o: '' },
  { h: 'Real metal', s: 'Hold purchasing power you can weigh in your hand.', o: '' },
  { h: 'Sound money', s: 'Circulate locally · verify personally · hold physically.', o: '' },
  { h: 'New standard', s: 'Same anti-counterfeit discipline, Idaho canvas.', o: '' },
  { h: 'Big step', s: 'From digital dollars to something you can tilt.', o: '' },
  { h: 'Clear count', s: 'Denominations sized for everyday Idaho trade.', o: '' },
  { h: 'Proof on the bill', s: 'Artwork and serial discipline you can photograph.', o: '' },
  { h: 'Local velocity', s: 'Every handoff strengthens Idaho circulation.', o: '' },
  { h: 'Measured gold', s: 'Stated content per note — no mystery alloy.', o: '' },
];

/** One hero line + generous product zone. */
const HEADLINE: Row[] = [
  { h: "Idaho's future looks golden.", s: 'Gem State series — spendable 24K notes.', o: '' },
  { h: 'Money built for any adventure.', s: 'Packable wealth · outdoor Idaho spirit.', o: '' },
  { h: 'Money that can weather any storm.', s: 'Physical layer · local acceptance · steady craft.', o: '' },
  { h: 'Go off grid with Goldbacks.', s: 'Bearer gold · handshake commerce · Idaho roots.', o: '' },
  { h: 'Hard-earned money, backed by gold.', s: 'Earn it in Idaho · hold it in metal.', o: '' },
  { h: 'Gold currency, now in Idaho. Pass it on.', s: 'Generational notes · family-scale savings.', o: '' },
  { h: 'Get in the gold rush sooner.', s: 'Authorized sellers · clear series education.', o: '' },
  { h: 'Gold engineered for your wallet.', s: 'Thin notes · serious gold · Idaho allegories.', o: '' },
  { h: 'Prepare your wallet for anything.', s: 'Stack denominations · plan the week ahead.', o: '' },
  { h: 'Built for neighbor-to-neighbor transactions.', s: 'Trust-first trade · no processor in the middle.', o: '' },
  { h: 'Keep gold circulating in Idaho.', s: 'Spend local · strengthen independents.', o: '' },
  { h: 'The future of currency, now in Idaho.', s: 'Innovation you can photograph and spend.', o: '' },
  { h: 'Gold currency for a changing economy.', s: 'Hold value in something printed, not promised.', o: '' },
  { h: 'A currency you can trust.', s: 'Security stack explained on goldback.com.', o: '' },
  { h: 'Hard money for a hard country.', s: 'Idaho grit · metal clarity · circulation mindset.', o: '' },
  { h: 'Modern tech. Traditional money.', s: 'UV, serials, polymer — still a physical note.', o: '' },
  { h: 'Your home. Your land. Your gold.', s: 'State pride on the art · 24K in the layer.', o: '' },
  { h: 'Trust it. Hold it. Spend it.', s: 'Three moves · one Idaho Goldback.', o: '' },
];

/** Casual, thumb-stopping; short clauses. */
const UGC_HANDHELD: Row[] = [
  { h: 'Spotted in Idaho.', s: 'Goldbacks out of the sleeve — real metal.', o: '' },
  { h: 'This week’s carry.', s: 'Half, ones, fives — match your errands.', o: '' },
  { h: 'Counter conversation starter.', s: '“You take Goldbacks?” — worth asking.', o: '' },
  { h: 'Pocket-sized sound money.', s: 'Notes, not promises.', o: '' },
  { h: 'Farm-stand ready.', s: 'Hand the note · skip the fee dance.', o: '' },
  { h: 'Coffee-shop flex.', s: 'Pay in gold · keep the vibe local.', o: '' },
  { h: 'Truck-console wealth.', s: 'Physical · countable · Idaho-designed.', o: '' },
  { h: 'Weekend market haul.', s: 'Spend Goldbacks where vendors say yes.', o: '' },
  { h: 'Kid asked what this is.', s: 'Show the engraving · teach the serial.', o: '' },
  { h: 'No bank line.', s: 'Person-to-person · same afternoon.', o: '' },
  { h: 'Snapshot-worthy art.', s: 'Idaho allegories belong in hand, not only online.', o: '' },
  { h: 'Your neighbor might already.', s: 'Ask · map · spend local.', o: '' },
  { h: 'Trade-day simple.', s: 'Clear denomination · clear gold content.', o: '' },
  { h: 'Held up to the window.', s: 'See the layer · trust your eyes.', o: '' },
  { h: 'Gift that spends.', s: 'Idaho series · memorable · usable.', o: '' },
];

/** Packshot / gradient — minimal type, product reads as hero. */
const SOFT_GRADIENT_PRODUCT: Row[] = [
  { h: 'Idaho Goldback', s: '24K series craft — hold the detail.', o: '' },
  { h: 'Gem State metal', s: 'Engraving, foil, serial — all on the note.', o: '' },
  { h: 'See the series', s: 'Every denomination · new Idaho chapter.', o: '' },
  { h: 'Physical 24K', s: 'Stated on the bill · verifiable in hand.', o: '' },
  { h: 'Collect. Circulate.', s: 'Same note · your choice.', o: '' },
  { h: 'Idaho allegories', s: 'Landmarks and virtues · struck in gold.', o: '' },
  { h: 'Premium note. Practical use.', s: 'Designed for counters, not only vaults.', o: '' },
  { h: 'Hold Idaho history', s: 'Art you can spend · security you can check.', o: '' },
  { h: 'Light catches the layer', s: 'That’s the point.', o: '' },
  { h: 'Main Street metal', s: 'Merchants and makers across the state.', o: '' },
  { h: 'Sound money, tangible', s: 'No ticker · just the note.', o: '' },
  { h: 'Series security', s: 'Serial discipline · UV where issued · clear art.', o: '' },
  { h: 'Your next note', s: 'Pick a denomination · build the habit.', o: '' },
  { h: 'Designed to show off', s: 'Macro-worthy line work · Idaho pride.', o: '' },
];

/** Offer line can carry “deal framing” without fake prices. */
const PRICE_ANCHOR: Row[] = [
  { h: 'Stack what fits your week.', s: 'Mix denominations · plan tips, tabs, and trades.', o: 'Authorized sellers' },
  { h: 'Start small. Go local.', s: 'Entry-friendly notes · Idaho circulation.', o: 'Find a seller' },
  { h: 'Build a set over time.', s: 'Collect the series · spend what you want.', o: 'Where to buy' },
  { h: 'Compare before you buy.', s: 'Official channels · clear serials · real metal.', o: 'goldback.com' },
  { h: 'Serious notes. Sensible steps.', s: 'Education first · purchase second.', o: '' },
  { h: 'Denomination math, simplified.', s: 'Match the purchase · keep change human.', o: '' },
  { h: 'Local picks, official paths.', s: 'Sellers and distributors listed online.', o: 'Where to exchange' },
  { h: 'Value you can line up.', s: 'Physical stack · no hidden ledger.', o: '' },
  { h: 'Merchants: attract the curious.', s: 'Acceptance brings new foot traffic.', o: 'Become a merchant' },
  { h: 'Distributors: stock the series.', s: 'Help Idaho access real metal notes.', o: 'Find a distributor' },
  { h: 'Transparent layers', s: 'Gold content callouts on every note.', o: '' },
  { h: 'No surprise alloy story', s: 'What’s printed is what you verify.', o: '' },
];

/** Urgency without fake countdown widgets — momentum + CTA. */
const DEADLINE_URGENCY: Row[] = [
  { h: 'Idaho circulation is growing.', s: 'Merchants join weekly · maps update often.', o: 'See where to spend' },
  { h: 'Don’t wait to learn the series.', s: 'Security, art, mintages — start on goldback.com.', o: '' },
  { h: 'Limited runs move.', s: 'Check LER and standard inventory with sellers.', o: 'Limited Early Release' },
  { h: 'Early merchants stand out.', s: 'Be the shop locals ask about first.', o: 'Become a merchant' },
  { h: 'Maps refresh.', s: 'New spend locations across Idaho.', o: 'Where to spend' },
  { h: 'Inventory shifts fast.', s: 'Authorized sellers post what’s in stock.', o: 'Find a seller' },
  { h: 'This season, go physical.', s: 'Hold metal · spend local · repeat.', o: '' },
  { h: 'Momentum beats hesitation.', s: 'Pick up a note · ask your favorite register.', o: '' },
  { h: 'LER windows close.', s: 'Catch official programs while they run.', o: 'Idaho LER program' },
  { h: 'Community velocity matters.', s: 'Every spend teaches the next neighbor.', o: '' },
  { h: 'Tonight’s errand: ask once.', s: '“Do you take Goldbacks?” starts the loop.', o: '' },
  { h: 'Supply meets curiosity.', s: 'Sellers ready for first-time buyers.', o: 'Where to buy' },
];

/** Split narrative — parallel benefit / proof. */
const SPLIT_SCREEN: Row[] = [
  { h: 'Hold metal. Spend local.', s: 'Same Idaho note · two wins in one wallet.', o: '' },
  { h: 'See the art. Read the serial.', s: 'Beauty front · discipline back.', o: '' },
  { h: 'Rural roots. Urban spend.', s: 'Goldbacks bridge town and country Idaho.', o: '' },
  { h: 'Independence. Acceptance.', s: 'Sound-money mindset · growing merchant map.', o: '' },
  { h: 'Vault option. Register reality.', s: 'Save or circulate — your call.', o: '' },
  { h: 'Offline handoff. Online education.', s: 'Spend face-to-face · learn on goldback.com.', o: '' },
  { h: 'Generations. Transactions.', s: 'Hand down · or hand across the counter.', o: '' },
  { h: 'Idaho peaks. Main Street.', s: 'Design language from home · spend power local.', o: '' },
  { h: 'Proof in light. Trust in person.', s: 'Tilt the note · shake the hand.', o: '' },
  { h: 'Two sides. One standard.', s: 'Consistent Goldback craft statewide.', o: '' },
];

/** Single sharp feature + one proof line. */
const FEATURE_CALLOUT: Row[] = [
  { h: 'Serials you can track.', s: 'Every Idaho note carries disciplined numbering.', o: '' },
  { h: 'UV where it matters.', s: 'Modern security on a classical note.', o: '' },
  { h: 'Raised reverse imagery.', s: 'Feel the craft · spot counterfeits faster.', o: '' },
  { h: 'Allegorical Idaho art.', s: 'Landmarks and virtues in engraved line work.', o: '' },
  { h: 'Polymer protection.', s: 'Tougher note · longer circulation life.', o: '' },
  { h: 'Stated gold content.', s: 'Printed plainly · no fine-print hunt.', o: '' },
  { h: 'Denomination clarity.', s: 'Pick the note that matches the purchase.', o: '' },
  { h: 'Merchant onboarding support.', s: 'Acceptance playbooks live on goldback.com.', o: 'Become a merchant' },
  { h: 'Distributor network.', s: 'Stock official inventory · serve your region.', o: 'Find a distributor' },
  { h: 'Safe: lore and mintages.', s: 'Deep dives for collectors and curious buyers.', o: 'Open the safe' },
  { h: 'App tools in pocket.', s: 'Calculators and references — note still physical.', o: 'Download the app' },
  { h: 'LER education hub.', s: 'Programs and rewards · official pages only.', o: 'Idaho LER program' },
];

/** Single-object studio packshot — minimal type, sculptural product read. */
const THREE_D_MOCKUP: Row[] = [
  { h: 'Idaho Goldback', s: 'Studio light · crisp edge · honest metal.', o: '' },
  { h: 'Note as object', s: 'Let the engraving read like sculpture.', o: '' },
  { h: 'Gem State craft', s: 'One note · full detail · no clutter.', o: '' },
  { h: 'Hold the standard', s: '24K layer visible in controlled light.', o: '' },
  { h: 'Precision strike', s: 'Line work from the Idaho series.', o: '' },
  { h: 'Packshot truth', s: 'Same art as circulation — hero presentation.', o: '' },
  { h: 'Metal first', s: 'Type supports · product leads.', o: '' },
  { h: 'Serious note. Simple frame.', s: 'Charcoal field · marigold edge glow optional.', o: '' },
  { h: 'Designed to photograph', s: 'Share the serial · teach the security.', o: '' },
  { h: 'Collect or spend', s: 'Same Idaho note either way.', o: '' },
];

/** Giant numeral energy — headline is the “big number” concept. */
const BIG_NUMBER: Row[] = [
  { h: '24', s: 'Karat gold — printed on Idaho Goldbacks.', o: '' },
  { h: '1', s: 'Physical note beats a thousand promises.', o: '' },
  { h: '50', s: 'States to grow — Idaho leads your start.', o: '' },
  { h: '100%', s: 'Bearer-held · you control the stack.', o: '' },
  { h: '0', s: 'Middlemen required for a handshake spend.', o: '' },
  { h: '3', s: 'Seconds to tilt it toward the light.', o: '' },
  { h: '5', s: 'Minutes to read “About Goldbacks.”', o: '' },
  { h: '10', s: 'Shops in your county might already say yes.', o: '' },
  { h: '2', s: 'Sides · one anti-counterfeit story.', o: '' },
  { h: '365', s: 'Days you can hold value off-ledger.', o: '' },
];

/** Quote card — reads as endorsement without fake personal names. */
const TESTIMONIAL_CARD: Row[] = [
  { h: '“Customers ask for it now.”', s: 'Independent retailers across Idaho.', o: '' },
  { h: '“We wanted something real.”', s: 'Boise-area service businesses.', o: '' },
  { h: '“The art stops people cold.”', s: 'Collectors and first-time buyers alike.', o: '' },
  { h: '“Handoffs feel honest.”', s: 'Farmers-market regulars · trade-show vendors.', o: '' },
  { h: '“Verification is simple.”', s: 'Owners who checked serials once — now confident.', o: '' },
  { h: '“It’s a conversation starter.”', s: 'Main Street shops joining the map.', o: '' },
  { h: '“Same note, two uses.”', s: 'Save it · or spend it this weekend.', o: '' },
  { h: '“Idaho pride on the table.”', s: 'Locals showing the series to friends.', o: '' },
  { h: '“We posted ‘Goldbacks welcome.’”', s: 'Traffic followed within weeks.', o: '' },
  { h: '“Sound money isn’t abstract here.”', s: 'It’s in the till.', o: '' },
];

/** Lightweight “alert” copy — still human, not fake iOS. */
const NOTIFICATION_STACK: Row[] = [
  { h: 'New spend spot near you', s: 'Check the official map on goldback.com.', o: 'Where to spend' },
  { h: 'Idaho series tip', s: 'Start with the denomination you’ll actually use.', o: '' },
  { h: 'Merchant idea', s: 'Window sticker · simple · effective.', o: 'Become a merchant' },
  { h: 'LER reminder', s: 'Programs change · read the official page.', o: 'Idaho LER program' },
  { h: 'Seller update', s: 'Authorized inventory posts refresh often.', o: 'Find a seller' },
  { h: 'Education ping', s: '“About Goldbacks” covers security basics.', o: 'About Goldbacks' },
  { h: 'Safe unlocked', s: 'Mintages and artwork deep dives inside.', o: 'Open the safe' },
  { h: 'Distributor ping', s: 'Stock the series · serve rural routes.', o: 'Find a distributor' },
  { h: 'App note', s: 'Tools help — the note stays physical.', o: 'Download the app' },
  { h: 'Community nudge', s: 'Ask one business this week.', o: '' },
];

/** Editorial pull-quote tone. */
const PRESS_QUOTE: Row[] = [
  { h: '“Circulation is the point.”', s: 'Goldbacks move best hand-to-hand.', o: '' },
  { h: '“Metal you can budget.”', s: 'Denominations sized for real Idaho days.', o: '' },
  { h: '“Designed to be seen.”', s: 'Engraving worth a second look.', o: '' },
  { h: '“Local series, serious standard.”', s: 'Same security discipline as other states.', o: '' },
  { h: '“Trust scales neighbor to neighbor.”', s: 'No account chain required.', o: '' },
  { h: '“Education before spend.”', s: 'Official pages keep claims grounded.', o: '' },
  { h: '“Ask. Accept. Repeat.”', s: 'Three habits grow Idaho circulation.', o: '' },
  { h: '“Hold it. Verify it.”', s: 'Confidence starts with the note.', o: '' },
];

/** Multi-card hint — series / swipe language (still one frame). */
const CAROUSEL_HINT: Row[] = [
  { h: 'Swipe the series in your mind.', s: 'Each Idaho denomination tells another story.', o: '' },
  { h: 'Every panel, Idaho.', s: 'Collect the set · spend what you want.', o: '' },
  { h: 'More notes. More texture.', s: 'Build a hand that matches your week.', o: '' },
  { h: 'Start with one. End with a set.', s: 'Series artwork rewards completionists.', o: '' },
  { h: 'Carousel of craft', s: 'Security + allegory on every note.', o: '' },
  { h: 'Next slide: the serial.', s: 'Verification is part of the ritual.', o: '' },
  { h: 'Flip through denominations', s: 'Match purchase size without awkward change.', o: '' },
];

/** Vertical editorial rhythm — story beats in one line. */
const STORY_PANELS: Row[] = [
  { h: 'Born in Idaho.', s: 'Struck in gold · built to move.', o: '' },
  { h: 'Designed. Verified. Spent.', s: 'Three beats · one note.', o: '' },
  { h: 'Peaks. Rivers. Registers.', s: 'Idaho iconography meets daily trade.', o: '' },
  { h: 'Collect the chapter.', s: 'Spend the chapter · your choice.', o: '' },
  { h: 'Morning hold. Afternoon spend.', s: 'Same Goldback · different intent.', o: '' },
  { h: 'Art first. Argument second.', s: 'Let the note open the conversation.', o: '' },
  { h: 'Three beats. One campaign.', s: IDAHO_GOLDBACK_OVERARCHING_CONCEPT, o: '' },
  { h: 'Panel one: metal.', s: 'Panel two: merchants. Panel three: your move.', o: '' },
];

const BY_SLUG: Record<string, Row[]> = {
  'value-stack': VALUE_STACK,
  'stat-hero': STAT_HERO,
  headline: HEADLINE,
  'ugc-handheld': UGC_HANDHELD,
  'soft-gradient-product': SOFT_GRADIENT_PRODUCT,
  'price-anchor': PRICE_ANCHOR,
  'deadline-urgency': DEADLINE_URGENCY,
  'split-screen': SPLIT_SCREEN,
  'feature-callout': FEATURE_CALLOUT,
  'big-number': BIG_NUMBER,
  'testimonial-card': TESTIMONIAL_CARD,
  'notification-stack': NOTIFICATION_STACK,
  'press-quote': PRESS_QUOTE,
  'carousel-hint': CAROUSEL_HINT,
  'story-panels': STORY_PANELS,
  '3d-mockup': THREE_D_MOCKUP,
};

export function buildIdgtCopyRowForSlug(slug: string, slotIndex: number): {
  headline: string;
  subheadline: string;
  cta: string;
  offer: string;
  product_service: string;
} {
  const bank = BY_SLUG[slug] ?? HEADLINE;
  const row = pick(bank, slotIndex, slug);
  const product_service = IDGT_PRODUCT_LINES[slotIndex % IDGT_PRODUCT_LINES.length];
  return {
    headline: row.h,
    subheadline: row.s,
    cta: IDGT_FIXED_CTA,
    offer: row.o,
    product_service,
  };
}
