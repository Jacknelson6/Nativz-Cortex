/**
 * Demo `topic_search` row for UI (synthetic SERP + optional Apify TikTok). Not production research.
 *
 *   npx tsx scripts/seed-goldback-topic-search.ts
 *   GOLDBACK_UPDATE_MATCHING=1 npx tsx scripts/seed-goldback-topic-search.ts   # replace all rows whose query is QUERY or a legacy string (same client)
 *   GOLDBACK_TOPIC_SEARCH_ID=<uuid> …   # optional: update only this row (with GOLDBACK_UPDATE_MATCHING=1)
 *   GOLDBACK_DEMO_SYNTHETIC_ONLY=1 …   # skip Apify
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY (and optional APIFY_API_KEY) in .env.local
 */
import { loadEnvLocal } from './load-env-local';
import { createAdminClient } from '@/lib/supabase/admin';
import { gatherTikTokData, type TikTokSearchVideo } from '@/lib/tiktok/search';
import {
  IDAHO_GOLDBACK_OVERARCHING_CONCEPT,
  IDAHO_GOLDBACK_POSITIONING,
  IDGT_PRODUCT_LINES,
} from './data/goldback-idaho-gtm-pools';
import type { SerpData } from '@/lib/serp/types';
import type {
  TopicSearchAIResponse,
  TrendingTopic,
  TopicSource,
  VideoIdea,
  EmotionBreakdown,
  ContentBreakdown,
} from '@/lib/types/search';
import { computeMetricsFromSerp } from '@/lib/utils/compute-metrics';

loadEnvLocal();

/** Display name / search query shown in the topic search UI (stable test label for UI work). */
export const QUERY = 'Spendable gold currency';

/** TikTok ingest label — Idaho GTM–aligned (not necessarily identical to QUERY). */
const TIKTOK_QUERY_LABEL = 'Goldback Idaho spendable 24k gold currency';

/** Previous query strings — matched when updating an existing seeded row. */
const LEGACY_QUERIES = [
  'Goldback spendable gold currency & sound money (Goldback.com)',
  'Goldback spendable gold currency',
] as const;

/** Demo seed version for platform_data (bump when GTM copy changes). */
const DEMO_COPY_VERSION = '2026-03-topic-vs-brand-split';

const TARGET_TIKTOK = 200;
const TARGET_REDDIT = 200;
const TARGET_WEB = 45;

const SUBREDDITS = [
  'Silverbugs',
  'Gold',
  'Economics',
  'preppers',
  'Utah',
  'coins',
  'personalfinance',
  'libertarian',
  'PreciousMetals',
  'Bullion',
  'GoldandSilver',
  'homestead',
  'bugout',
  'Wallstreetsilver',
];

const REDDIT_SNIPPETS = [
  'Gem State series dropped — Idaho-first art and the same 24K standard; checking who takes them near Boise.',
  'Picked up a few 1/1000 Goldbacks for the novelty — easier to explain to family than ounces.',
  'Are Goldbacks actually liquid or do dealers lowball? My LCS said they treat them like generic.',
  'Inflation hedge vs stack weight: I like small denom gold for barter scenarios.',
  'Utah vendor accepted Goldback — surprised how smooth the transaction was.',
  'Compared to ASE premiums, spendable gold feels expensive per gram but the use-case is different.',
  'Anyone using these for gifts? Parents finally "got" why I stack after seeing a note.',
  'Tax and reporting threads get heated fast — everyone says talk to a pro.',
  'Counterfeit concerns: what do you check first on a Goldback?',
  'Stacking sound money content keeps surfacing Goldback next to constitutional silver.',
  'Thread split on beginners: worth the premium for education or stick to rounds?',
  'Florida HB 999 / state sales tax on metals — people want plain-English breakdowns.',
  'Gold vs Bitcoin for inflation — same debate, different comment section every week.',
  'Merchant acceptance: "anyone actually spend these or is it all stackers?"',
];

const THREAD_TITLES = [
  'Gold coins vs bars vs Goldbacks — where does the premium actually go?',
  'Is the "melt value" conversation misleading for spendable gold?',
  'Goldback myths — what have you actually verified yourself?',
  'How to avoid gold scams — what would you tell a newbie?',
  'Private voluntary currency in the US — what are people getting wrong?',
  'Inflation and savings — are people actually moving into small gold?',
  'Bartering with Goldbacks — real experiences only',
  'Gold vs crypto for people who want physical control',
];

/** Short opaque Reddit-style comment ids */
function redditPostId(i: number): string {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  let n = 100000 + i * 977;
  let s = '';
  for (let k = 0; k < 6; k++) {
    s = alphabet[n % alphabet.length] + s;
    n = Math.floor(n / alphabet.length);
  }
  return s;
}

function fmtViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function fakeRedditPost(i: number): SerpData['discussions'][0] {
  const sub = SUBREDDITS[i % SUBREDDITS.length];
  const body = REDDIT_SNIPPETS[i % REDDIT_SNIPPETS.length];
  const pid = redditPostId(i);
  const slug = body
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .slice(0, 48) || 'discussion';
  const titled = i < THREAD_TITLES.length ? THREAD_TITLES[i] : `${sub}: small-denom gold and spendability — discussion`;
  return {
    title: titled,
    url: `https://www.reddit.com/r/${sub}/comments/${pid}/${slug}/`,
    description: body,
    forum: `r/${sub}`,
    answers: 12 + (i % 80),
    topComment:
      i % 3 === 0
        ? 'I keep a few in the wallet for the conversation alone. Not my whole stack.'
        : i % 3 === 1
          ? 'Premiums are real — I treat it like a usable product, not a spot bet.'
          : 'If your goal is ounces per dollar, coins win. If your goal is spendable education, this works.',
  };
}

const TT_HOOK_TITLES = [
  'Why I keep a fractional gold note in my wallet',
  'Sound money in 30 seconds — no politics',
  'Goldback vs cash: what strangers actually say',
  'Small gold for barter — realistic or overhyped?',
  'Utah spend: POV at checkout',
  'Premium explained without the attitude',
  'What $20 in spendable gold buys',
  'Inflation clip that actually landed with my parents',
  'LCS reaction to voluntary gold currency',
  'Half Goldback transaction — filmed start to finish',
  'Stackers react to spendable gold TikTok',
  'Macro shot: light through the note',
];

function tikTokToSerpVideo(v: {
  id: string;
  desc: string;
  author: { uniqueId: string; nickname: string };
  stats: { playCount: number };
}): SerpData['videos'][0] {
  return {
    title: v.desc.slice(0, 120) || 'TikTok video',
    url: `https://www.tiktok.com/@${v.author.uniqueId}/video/${v.id}`,
    description: v.desc,
    platform: 'tiktok',
    views: fmtViews(v.stats.playCount || 0),
    creator: v.author.nickname || v.author.uniqueId,
  };
}

function padTikTokVideos(real: SerpData['videos']): SerpData['videos'] {
  const out = [...real];
  while (out.length < TARGET_TIKTOK) {
    const i = out.length;
    const title = TT_HOOK_TITLES[i % TT_HOOK_TITLES.length];
    const handle = `soundmoney_${(i % 55) + 1}`;
    out.push({
      title,
      url: `https://www.tiktok.com/@${handle}/video/${7000000000000 + i}`,
      description: `${title}. #goldback #idaho #gemstate #gold #soundmoney #silver #preciousmetals`,
      platform: 'tiktok',
      views: fmtViews(10_000 + ((i * 137) % 900_000)),
      creator: handle.replace(/_/g, ' '),
    });
  }
  return out.slice(0, TARGET_TIKTOK);
}

/** Fully synthetic TikTok rows for UI demos — no Apify (coverUrl null; thumbnails optional in UI). */
function mockTikTokVideosForDemo(count: number): TikTokSearchVideo[] {
  return Array.from({ length: count }, (_, i) => {
    const title = TT_HOOK_TITLES[i % TT_HOOK_TITLES.length];
    const handle = `idaho_gold_${(i % 40) + 1}`;
    return {
      id: `demo-tt-${i}`,
      desc: `${title} · ${IDAHO_GOLDBACK_OVERARCHING_CONCEPT} #goldback #idaho #soundmoney #gemstate`,
      author: { uniqueId: handle, nickname: `Demo creator ${i + 1}` },
      stats: {
        playCount: 12_000 + i * 900,
        diggCount: 400 + (i % 200),
        commentCount: 22 + (i % 80),
        shareCount: 8 + (i % 40),
      },
      createTime: Math.floor(Date.now() / 1000) - i * 4200,
      music: null,
      hashtags: ['goldback', 'idaho', 'soundmoney', 'gemstate', 'gold'],
      videoUrl: null,
      coverUrl: null,
      top_comments: [],
      transcript: null,
    };
  });
}

const WEB_SEEDS: SerpData['webResults'] = [
  {
    title: 'Goldback — spendable 24K gold currency',
    url: 'https://www.goldback.com/',
    description: `${IDGT_PRODUCT_LINES[1]} Denominations, merchant network, and series details on goldback.com.`,
  },
  {
    title: 'What Is Commodity Money? | Definition & Examples',
    url: 'https://www.investopedia.com/terms/c/commodity-money.asp',
    description: 'How commodity-backed and physical media of exchange are discussed in economics education.',
  },
  {
    title: 'Precious metals and inflation hedges — investor overview',
    url: 'https://www.kitco.com/news/',
    description: 'Market commentary and retail precious metals context.',
  },
  {
    title: 'United States Mint — gold coin programs',
    url: 'https://www.usmint.gov/',
    description: 'Official U.S. coin products; frequent comparison point in gold content discussions.',
  },
  {
    title: 'Sales tax on precious metals by state (overview)',
    url: 'https://www.taxfoundation.org/',
    description: 'Policy explainers referenced when threads discuss state treatment of bullion purchases.',
  },
];

function buildWebResults(): SerpData['webResults'] {
  const rows = [...WEB_SEEDS];
  const wikiRot = [
    { title: 'Inflation', url: 'https://en.wikipedia.org/wiki/Inflation', description: 'General reference for inflation discussions tied to savings and hedging.' },
    { title: 'Commodity money', url: 'https://en.wikipedia.org/wiki/Commodity_money', description: 'Conceptual background for physical and commodity-linked media of exchange.' },
    { title: 'Gold as an investment', url: 'https://en.wikipedia.org/wiki/Gold_as_an_investment', description: 'Overview of gold as a retail and institutional asset class.' },
    { title: 'Sales taxes in the United States', url: 'https://en.wikipedia.org/wiki/Sales_taxes_in_the_United_States', description: 'Context for state-level treatment of retail purchases, often cited in metals threads.' },
    { title: 'Sound money', url: 'https://en.wikipedia.org/wiki/Sound_money', description: 'Historical and political economy framing adjacent to voluntary currency debates.' },
    { title: 'Bullion coin', url: 'https://en.wikipedia.org/wiki/Bullion_coin', description: 'Comparison baseline when threads contrast rounds with other gold products.' },
  ];
  while (rows.length < TARGET_WEB) {
    const i = rows.length;
    const w = wikiRot[i % wikiRot.length];
    rows.push({
      title: `${w.title} — reference (${2024 + (i % 2)})`,
      url: w.url,
      description: w.description,
    });
  }
  return rows.slice(0, TARGET_WEB);
}

function src(url: string, title: string, type: 'web' | 'discussion' | 'video', relevance: string, platform?: 'tiktok' | 'reddit' | 'web'): TopicSource {
  return { url, title, type, relevance, platform };
}

function videoIdea(partial: VideoIdea): VideoIdea {
  return {
    format: 'pov',
    virality: 'medium',
    script_outline: ['Hook', 'Context', 'Proof point', 'Example', 'CTA'],
    cta: 'Save for your next gold content batch',
    ...partial,
  };
}

function buildTrendingTopics(): TrendingTopic[] {
  return [
    {
      name: 'Gold premiums and product comparisons',
      resonance: 'viral',
      sentiment: 0.18,
      posts_overview:
        'Creators and forums compare coins, bars, and spendable gold on cost-per-gram, usability, and resale. Side-by-side math and “what you get for the premium” clips outperform abstract sound-money rhetoric.',
      comments_overview:
        'Heavy debate between stackers optimizing metal per dollar and buyers optimizing explainability and spend scenarios.',
      sources: [
        src('https://www.goldback.com/', 'Goldback', 'web', 'Primary brand context', 'web'),
        src('https://www.reddit.com/r/Silverbugs/', 'r/Silverbugs', 'discussion', 'Premium debates', 'reddit'),
        src('https://www.tiktok.com/tag/goldback', 'TikTok #goldback', 'video', 'Short-form explainers', 'tiktok'),
      ],
      video_ideas: [
        videoIdea({
          title: 'Gold coins, gold bars, Goldbacks — same budget, honest breakdown',
          hook: 'Three products, one frame — where does the dollar buy metal vs usability?',
          why_it_works: 'Comparison format earns saves; comments argue the spreadsheet.',
          format: 'listicle',
        }),
        videoIdea({
          title: 'What “premium” actually pays for in spendable gold',
          hook: 'Premium is not a dirty word — here is the line item version.',
          why_it_works: 'Defuses knee-jerk skepticism; pairs with long-form educational pages.',
          format: 'myth_bust',
        }),
        videoIdea({
          title: 'Melt value vs what people pay at the register',
          hook: 'If you only watch spot, you are optimizing the wrong checkout.',
          why_it_works: 'Strong commercial intent; sparks stacker replies.',
          format: 'hot_take',
        }),
        videoIdea({
          title: 'Fractional gold for everyday spending — three rules before you buy',
          hook: 'Search-driven question answered without a sales pitch.',
          why_it_works: 'Question-led openers match answer-engine and Shorts behavior.',
          format: 'talking_head',
        }),
        videoIdea({
          title: 'One receipt: premium vs spot on a single small gold note',
          hook: 'Pause on the line items — here is what each dollar bought.',
          why_it_works: 'Concrete artifact beats abstract premium talk; easy screenshot.',
          format: 'pov',
        }),
        videoIdea({
          title: 'Stitch this: “Just buy rounds” — 45-second honest response',
          hook: 'Agree where they are right, then name the use case they skipped.',
          why_it_works: 'Duet bait from stacker TikTok; stays respectful.',
          format: 'reaction',
        }),
      ],
    },
    {
      name: 'Trust, verification, and scams',
      resonance: 'high',
      sentiment: 0.31,
      posts_overview:
        'Myth-busts, scam warnings, security features, and “is this legal?” threads cluster together. Verification macros, merchant credibility, and calm expert tone outperform hype.',
      comments_overview:
        'Users swap red flags, LCS anecdotes, and requests for primary sources; threads that cite process win trust.',
      sources: [
        src('https://www.reddit.com/r/Gold/', 'r/Gold', 'discussion', 'Verification culture', 'reddit'),
        src('https://www.goldback.com/', 'Goldback', 'web', 'Official positioning', 'web'),
      ],
      video_ideas: [
        videoIdea({
          title: 'Six Goldback claims — rapid-fire true/false',
          hook: 'Claim one hits before the one-second mark.',
          why_it_works: 'Fast cuts suit TikTok completion; each claim can link to a deeper article.',
          format: 'listicle',
        }),
        videoIdea({
          title: 'Gold scam red flags — plain English',
          hook: 'If they rush settlement, you walk.',
          why_it_works: 'Shareable safety content; builds authority for the brand channel.',
          format: 'tutorial',
        }),
        videoIdea({
          title: 'How people verify gold at home — macro POV',
          hook: 'Phone light, one note, watch the surface behavior.',
          why_it_works: 'Visual proof drives stitches from “is it real” searches.',
          format: 'pov',
        }),
        videoIdea({
          title: 'Addressing the hardest criticisms — ranked by seriousness',
          hook: 'No dodging — worst objection first.',
          why_it_works: 'Commenters add nuance; part two fuel.',
          format: 'hot_take',
        }),
        videoIdea({
          title: 'Counterfeit fear vs real verification — split the difference',
          hook: 'Two minutes: what actually moves the needle at home.',
          why_it_works: 'Reduces panic-watching; pairs with security education.',
          format: 'tutorial',
        }),
        videoIdea({
          title: 'What a trustworthy merchant sounds like on a phone call',
          hook: 'Three phrases that calm buyers — three that should make you pause.',
          why_it_works: 'Audio-forward format; highly saveable.',
          format: 'talking_head',
        }),
      ],
    },
    {
      name: 'Inflation, policy, and savings',
      resonance: 'high',
      sentiment: 0.24,
      posts_overview:
        'Inflation explainers, state tax treatment of metals, capital gains vocabulary, and “timing” questions appear across Reddit and web. Short hooks that cite jurisdiction and date perform better than blanket advice.',
      comments_overview:
        'Policy threads polarize; creators who anchor “check your state / your advisor” reduce backlash.',
      sources: [src('https://www.reddit.com/r/Economics/', 'r/Economics', 'discussion', 'Macro discussion', 'reddit')],
      video_ideas: [
        videoIdea({
          title: 'How inflation shows up in a normal grocery run',
          hook: 'Same paycheck — different cart. One number to watch.',
          why_it_works: 'Relatable B-roll; bridges to savings and hedging topics.',
          format: 'before_after',
        }),
        videoIdea({
          title: 'State sales tax on precious metals — thirty-second map mindset',
          hook: 'Why your cousin in another state sees a different receipt.',
          why_it_works: 'High search intent; time-sensitive when legislatures move.',
          format: 'listicle',
        }),
        videoIdea({
          title: 'Capital gains on gold — vocabulary only, not tax advice',
          hook: 'Three terms to bring to your CPA.',
          why_it_works: 'Pushes depth to long-form while staying responsible.',
          format: 'tutorial',
        }),
        videoIdea({
          title: 'Physical gold and access — layering liquidity without fear-mongering',
          hook: 'Question from search: portability, education, habits.',
          why_it_works: 'Sensitive topic needs calm delivery and clear disclaimers.',
          format: 'talking_head',
        }),
        videoIdea({
          title: 'Insurance or investment? Pick a lane before you write the script',
          hook: 'Mixed metaphors confuse viewers — here is a clean frame.',
          why_it_works: 'Helps compliance-minded messaging; strong comment debate.',
          format: 'hot_take',
        }),
        videoIdea({
          title: 'After a CPI print: what people search about gold for 48 hours',
          hook: 'Search trend curve — one takeaway for content timing.',
          why_it_works: 'Timely; positions the brand as plugged into behavior.',
          format: 'listicle',
        }),
      ],
    },
    {
      name: 'Spending Goldbacks in real life',
      resonance: 'viral',
      sentiment: 0.4,
      posts_overview:
        'Merchant POVs, barter stories, map-driven “where to spend,” and skeptic takes on real-world use drive the highest engagement. Receipts and location context beat studio monologues.',
      comments_overview:
        '“Where do I spend?” dominates; replies that link maps or specific merchant types get upvoted.',
      sources: [
        src('https://www.goldback.com/', 'Goldback', 'web', 'Spendability story', 'web'),
        src('https://www.tiktok.com/tag/goldback', 'TikTok', 'video', 'Checkout and POV clips', 'tiktok'),
      ],
      video_ideas: [
        videoIdea({
          title: 'Six ways people use Goldbacks — filmed at the counter',
          hook: 'First way is the smallest believable spend.',
          why_it_works: 'Bingeable series; each clip is a standalone hook.',
          format: 'street_interview',
        }),
        videoIdea({
          title: 'Are people actually spending them? Receipts only.',
          hook: 'No theory — hand the camera to the cashier moment.',
          why_it_works: 'Converts skeptics; highly shareable.',
          format: 'pov',
        }),
        videoIdea({
          title: 'Spendable gold in one sentence — street answers',
          hook: 'Five strangers, one tight definition.',
          why_it_works: 'Human proof for commercial keywords.',
          format: 'street_interview',
        }),
        videoIdea({
          title: 'Starter purchase ideas under two hundred dollars',
          hook: 'Menu-style options — no flex, just clarity.',
          why_it_works: 'Captures beginner funnel from search.',
          format: 'listicle',
        }),
        videoIdea({
          title: 'Merchant map speedrun — three stops, three spend sizes',
          hook: 'Map open, timer on — can we show variety before the beat drops?',
          why_it_works: 'Showcases utility density; native to Shorts pacing.',
          format: 'pov',
        }),
        videoIdea({
          title: 'Making change with fractional gold — the awkward moment as the hook',
          hook: 'If the pause is real, the audience stays.',
          why_it_works: 'Human friction beats polish; invites “what would you do” comments.',
          format: 'storytime',
        }),
      ],
    },
    {
      name: 'Gold, silver, and alternatives to crypto',
      resonance: 'high',
      sentiment: 0.2,
      posts_overview:
        'Gold vs Bitcoin inflation narratives, silver product lines, and “non-crypto” physical options surface in parallel. Respectful comparison and two-wallet framing reduce flame wars.',
      comments_overview:
        'Crypto-native viewers want nuance; metal stackers want receipts and premiums acknowledged.',
      sources: [
        src('https://www.reddit.com/r/Wallstreetsilver/', 'r/Wallstreetsilver', 'discussion', 'Silver narrative', 'reddit'),
      ],
      video_ideas: [
        videoIdea({
          title: 'Gold vs Bitcoin for inflation — tradeoffs in one minute',
          hook: 'Two wallets, one storm — no forced winner.',
          why_it_works: 'Comment volume driver; respectful framing keeps shares up.',
          format: 'comparison',
        }),
        videoIdea({
          title: 'Five reasons people choose voluntary currency',
          hook: 'Reason one: choice.',
          why_it_works: 'Positive framing; works across platforms.',
          format: 'listicle',
        }),
        videoIdea({
          title: 'Small silver notes — why the story feels familiar now',
          hook: 'If you understood spendable gold, here is the sequel beat.',
          why_it_works: 'Product-line narrative for existing fans.',
          format: 'storytime',
        }),
        videoIdea({
          title: 'Staying liquid in dollars while building a physical layer',
          hook: 'Two-layer plan from a common search question.',
          why_it_works: 'Practical; pairs with educational hub pages.',
          format: 'tutorial',
        }),
        videoIdea({
          title: 'Paper hands vs physical metal — meme energy without insulting anyone',
          hook: 'We are roasting behaviors, not people.',
          why_it_works: 'Shares well in finance Tok; keep it playful.',
          format: 'comedy_voiceover',
        }),
        videoIdea({
          title: 'Energy, custody, and friction — one honest crypto vs gold comparison',
          hook: 'Same question list for both columns; no victory lap.',
          why_it_works: 'Nuance reduces flame wars; positions education over tribalism.',
          format: 'comparison',
        }),
      ],
    },
    {
      name: 'Local acceptance and voluntary use',
      resonance: 'high',
      sentiment: 0.33,
      posts_overview:
        'Threads highlight where spendable gold actually clears — coffee, services, trade shows — and what training staff need. “Voluntary” framing reduces defensive reactions.',
      comments_overview:
        'Locals share merchant names; outsiders ask for proof; pin comments with maps or categories win.',
      sources: [
        src('https://www.goldback.com/', 'Goldback', 'web', 'Acceptance story', 'web'),
        src('https://www.reddit.com/r/Utah/', 'r/Utah', 'discussion', 'Regional chatter', 'reddit'),
      ],
      video_ideas: [
        videoIdea({
          title: '“Do you take these?” — polite ask, real reactions',
          hook: 'Eye contact, clear question, no debate in the aisle.',
          why_it_works: 'Relatable tension; works as a repeatable series.',
          format: 'street_interview',
        }),
        videoIdea({
          title: 'What cashiers wish customers knew before paying in gold',
          hook: '30 seconds from someone who actually rings people up.',
          why_it_works: 'Humanizes merchants; reduces awkward checkout myths.',
          format: 'talking_head',
        }),
        videoIdea({
          title: 'Voluntary currency in one line — why wording matters',
          hook: 'Same fact, two sentences — only one starts a fight.',
          why_it_works: 'Shareable script for advocates and staff.',
          format: 'tutorial',
        }),
      ],
    },
    {
      name: 'Gifting, heirs, and family education',
      resonance: 'medium',
      sentiment: 0.45,
      posts_overview:
        'Gold as a gift outperforms abstract “invest in gold” talk for relatives who glaze over spot charts. Heirloom framing and “first note” unboxings trend in comments.',
      comments_overview:
        'Parents ask how to explain to kids; adult children ask how to broach the topic without sounding preachy.',
      sources: [
        src('https://www.reddit.com/r/personalfinance/', 'r/personalfinance', 'discussion', 'Family money talk', 'reddit'),
      ],
      video_ideas: [
        videoIdea({
          title: 'Gift wrap vs education — how to hand someone their first spendable gold',
          hook: 'Open with the ribbon, end with one sentence they will repeat.',
          why_it_works: 'Holiday and birthday timing; high save rate.',
          format: 'tutorial',
        }),
        videoIdea({
          title: 'Explain spendable gold to your parents in under a minute',
          hook: 'Analogies they already trust — then one visual.',
          why_it_works: 'Cross-generational shares; comment tag storms.',
          format: 'talking_head',
        }),
        videoIdea({
          title: 'Kids and gold: what to show, what to skip',
          hook: 'Safety and curiosity first — flex second.',
          why_it_works: 'Responsible tone builds brand trust.',
          format: 'listicle',
        }),
      ],
    },
    {
      name: 'Coin shops, dealers, and resale',
      resonance: 'high',
      sentiment: 0.12,
      posts_overview:
        'LCS culture drives liquidity narratives: bid/ask spreads, “what dealers say,” and how spendable products are categorized. Transparency beats rumor.',
      comments_overview:
        'Dealers jump in with process; stackers argue categories; neutral explainers get bookmarked.',
      sources: [
        src('https://www.reddit.com/r/coins/', 'r/coins', 'discussion', 'Dealer and hobby overlap', 'reddit'),
      ],
      video_ideas: [
        videoIdea({
          title: 'What to ask at the counter before you buy or sell',
          hook: 'Three questions — no attitude required.',
          why_it_works: 'Practical; reduces first-timer anxiety.',
          format: 'listicle',
        }),
        videoIdea({
          title: 'Dealer POV: how we think about spendable gold vs rounds',
          hook: 'Role-play or real guest — either way, specifics.',
          why_it_works: 'Authority transfer; commenters verify with their LCS.',
          format: 'interview',
        }),
        videoIdea({
          title: 'Spreads and categories — vocabulary that saves you money',
          hook: 'If you only know “spot,” you are negotiating with one hand tied.',
          why_it_works: 'Educational SEO energy in short form.',
          format: 'tutorial',
        }),
      ],
    },
    {
      name: 'Security, storage, and everyday carry',
      resonance: 'medium',
      sentiment: 0.27,
      posts_overview:
        'Wallet carry, travel, and “how much is too much in pocket” debates. Balance security theater with practical habits.',
      comments_overview:
        'Split between minimalists and preppers; clips that show real wallets and routines perform best.',
      sources: [
        src('https://www.reddit.com/r/EDC/', 'r/EDC', 'discussion', 'Everyday carry overlap', 'reddit'),
      ],
      video_ideas: [
        videoIdea({
          title: 'EDC upgrade: where a small gold note fits (and where it does not)',
          hook: 'Flat lay first — then the one thing I removed.',
          why_it_works: 'EDC TikTok is its own algorithm; cross-audience pull.',
          format: 'pov',
        }),
        videoIdea({
          title: 'Traveling with physical gold — myths vs what people actually do',
          hook: 'Disclaimer up front; habits second.',
          why_it_works: 'High search curiosity; keep legal disclaimers visible.',
          format: 'talking_head',
        }),
        videoIdea({
          title: 'Safe vs pocket — two sensible setups for different lifestyles',
          hook: 'Pick your lane; we are not shaming either.',
          why_it_works: 'Reduces all-or-nothing fights in comments.',
          format: 'comparison',
        }),
      ],
    },
    {
      name: 'Sound money storytelling without preaching',
      resonance: 'medium',
      sentiment: 0.19,
      posts_overview:
        'Audiences tune out lectures; they engage with stories about purchasing power, family history, and “one moment gold clicked.” Personal narrative outperforms ideology.',
      comments_overview:
        'Storytime tags and “what changed your mind” prompts drive long threads.',
      sources: [
        src('https://www.tiktok.com/tag/soundmoney', 'TikTok #soundmoney', 'video', 'Narrative cluster', 'tiktok'),
      ],
      video_ideas: [
        videoIdea({
          title: 'The moment I cared about purchasing power — 60 seconds',
          hook: 'Specific receipt, specific year — no manifesto.',
          why_it_works: 'Emotional hook; easy stitch format.',
          format: 'storytime',
        }),
        videoIdea({
          title: 'Sound money explained with one grocery cart',
          hook: 'Same items, two eras — one on-screen total.',
          why_it_works: 'Visual metaphor travels without jargon.',
          format: 'before_after',
        }),
        videoIdea({
          title: 'Invite a skeptic — respectful Q&A, no winning the argument',
          hook: 'They ask three questions; you answer in plain English.',
          why_it_works: 'Commenters nominate the next skeptic.',
          format: 'street_interview',
        }),
      ],
    },
    {
      name: 'Creator angles for gold brands',
      resonance: 'low',
      sentiment: 0.52,
      posts_overview:
        'Behind-the-scenes minting-adjacent education, ASMR foil/light tests, “day in the life” at merchants, and data-driven myth series — formats that repeat without fatiguing the feed.',
      comments_overview:
        'Creators ask for b-roll kits and talking points; brands that supply constraints get better UGC.',
      sources: [
        src('https://www.tiktok.com/tag/goldback', 'TikTok #goldback', 'video', 'Creator cluster', 'tiktok'),
      ],
      video_ideas: [
        videoIdea({
          title: 'B-roll pack: 10 gold macros every editor wants',
          hook: 'No voiceover — just textures people loop.',
          why_it_works: 'Other creators download mindset; brand gets credited.',
          format: 'tutorial',
        }),
        videoIdea({
          title: 'Myth Monday — one claim, one source on screen',
          hook: 'Title is the claim; pinned comment is the link.',
          why_it_works: 'Series hook; builds trust over weeks.',
          format: 'listicle',
        }),
        videoIdea({
          title: 'Duets welcome: respond to “gold is only for rich people”',
          hook: 'Start by agreeing with the emotion, not the fact.',
          why_it_works: 'Algorithm loves duet chains; stay kind.',
          format: 'reaction',
        }),
      ],
    },
  ];
}

async function resolveClientId(admin: ReturnType<typeof createAdminClient>): Promise<string | null> {
  const envId = process.env.GOLDBACK_CLIENT_ID?.trim();
  if (envId) return envId;

  const { data: bySlug } = await admin.from('clients').select('id').ilike('slug', '%goldback%').limit(1).maybeSingle();
  if (bySlug?.id) return bySlug.id;

  const { data: byName } = await admin.from('clients').select('id').ilike('name', '%goldback%').limit(1).maybeSingle();
  return byName?.id ?? null;
}

export function buildGoldbackSearchRow(args: {
  clientId: string;
  realVideos: SerpData['videos'];
  ttVideosRaw: TikTokSearchVideo[];
  ttVolume: string;
  completedAt: string;
  tiktokQueryLabel: string;
  syntheticOnly: boolean;
}) {
  const { clientId, realVideos, ttVideosRaw, ttVolume, completedAt, tiktokQueryLabel, syntheticOnly } = args;

  const discussions: SerpData['discussions'] = [];
  for (let i = 0; i < TARGET_REDDIT; i++) discussions.push(fakeRedditPost(i));

  const serpData: SerpData = {
    webResults: buildWebResults(),
    discussions,
    videos: padTikTokVideos(realVideos),
  };

  const trendingTopics = buildTrendingTopics();
  const emotions: EmotionBreakdown[] = [
    { emotion: 'Curiosity', percentage: 32, color: '#5ba3e6' },
    { emotion: 'Skepticism', percentage: 22, color: '#94a3b8' },
    { emotion: 'Trust', percentage: 18, color: '#34d399' },
    { emotion: 'Excitement', percentage: 16, color: '#e6a55b' },
    { emotion: 'Nostalgia', percentage: 12, color: '#a78bfa' },
  ];

  const content_breakdown: ContentBreakdown = {
    intentions: [
      { name: 'Learn how spendable gold works', percentage: 38, engagement_rate: 0.11 },
      { name: 'Compare premiums and products', percentage: 27, engagement_rate: 0.13 },
      { name: 'Entertainment and debate', percentage: 21, engagement_rate: 0.09 },
      { name: 'Preparedness and barter', percentage: 14, engagement_rate: 0.1 },
    ],
    categories: [
      { name: 'Precious metals', percentage: 36, engagement_rate: 0.12 },
      { name: 'Economics and inflation', percentage: 24, engagement_rate: 0.1 },
      { name: 'Local commerce', percentage: 18, engagement_rate: 0.11 },
      { name: 'Prepping and homestead', percentage: 22, engagement_rate: 0.09 },
    ],
    formats: [
      { name: 'Explainers and comparisons', percentage: 34, engagement_rate: 0.12 },
      { name: 'POV and shop visit', percentage: 26, engagement_rate: 0.14 },
      { name: 'Debate and hot take', percentage: 22, engagement_rate: 0.1 },
      { name: 'Unboxing and macro shots', percentage: 18, engagement_rate: 0.11 },
    ],
  };

  const raw_ai_response: TopicSearchAIResponse = {
    summary:
      `**Spendable gold currency** is the space where **sound money** meets **everyday use** — not vault bars alone, but **small denominations** people can compare, trade, and explain without a finance degree. ` +
      `The debate that won’t go away is **premium vs. metal per dollar**: pure stackers optimize spot price; **spendable formats** win when **trust, verification, and merchant reality** matter more than a spreadsheet row. ` +
      `Attention clusters on **counterfeits, dealer spreads, liquidity, and who accepts what** — layered with **checkout POVs**, map-driven discovery, and **plain-English premium math**. ` +
      `What actually travels is **proof-first** content: show the physical form, answer the **“can I use this?”** question, and **demonstrate spendability** in real contexts (register, trade floor, family dinner). ` +
      `Stakeholder read: this is a **movement and education story** before it’s a commodity story — lead with **explainability and use cases**, not just charts.`,
    brand_alignment_notes:
      `For **Idaho Goldback**, this topic ladders to **${IDAHO_GOLDBACK_OVERARCHING_CONCEPT}** as the **campaign spine** and **${IDAHO_GOLDBACK_POSITIONING}** as the **brand promise**. ` +
      `Messaging should **lead with the note** — foil, serials, Gem State artwork — then **answer the premium objection** with **transparent math** and **who accepts it** before skepticism hardens. ` +
      `Keep the voice **neighbor-to-neighbor and Main Street**: **Idaho-first** credibility, not generic precious-metals noise.`,
    overall_sentiment: 0.22,
    conversation_intensity: 'very_high',
    emotions,
    content_breakdown,
    trending_topics: trendingTopics,
    big_movers: [
      {
        name: 'Goldback',
        type: 'brand',
        url: 'https://www.goldback.com/',
        why: `Spendable-note story starts here — ${IDGT_PRODUCT_LINES[0]}`,
        tactics: ['Denomination demos', 'Light-through-foil macro', 'Merchant and map storytelling'],
        takeaway: 'Show the note first, then answer premium objections with transparent math.',
      },
      {
        name: 'Precious metals stackers',
        type: 'creator',
        url: null,
        why: 'They set the tone on premiums, liquidity, and dealer spreads everywhere people argue about metal.',
        tactics: ['Comparison tables', 'LCS vlogs', 'Stitch and duet responses'],
        takeaway: 'Meet the cost-per-gram debate head-on instead of dodging it.',
      },
    ],
    platform_breakdown: [
      {
        platform: 'tiktok',
        post_count: TARGET_TIKTOK,
        comment_count: 12000,
        avg_sentiment: 0.25,
        top_hashtags: ['goldback', 'idaho', 'gemstate', 'gold', 'soundmoney', 'silver', 'preciousmetals'],
      },
      {
        platform: 'reddit',
        post_count: TARGET_REDDIT,
        comment_count: 48000,
        avg_sentiment: 0.08,
        top_subreddits: SUBREDDITS.slice(0, 8),
      },
      { platform: 'web', post_count: TARGET_WEB, comment_count: 0, avg_sentiment: 0.2 },
      { platform: 'youtube', post_count: 0, comment_count: 0, avg_sentiment: 0 },
    ],
    conversation_themes: [
      {
        theme: 'Premium versus utility',
        post_count: 520,
        sentiment: -0.05,
        platforms: ['reddit', 'tiktok'],
        representative_quotes: ['You pay for spendability', 'Maples win on metal per dollar'],
      },
      {
        theme: 'First purchase and education',
        post_count: 410,
        sentiment: 0.42,
        platforms: ['tiktok', 'web'],
        representative_quotes: ['Finally clicked for my parents', 'Started with the smallest note'],
      },
      {
        theme: 'Repurposing long answers as short video',
        post_count: 280,
        sentiment: 0.55,
        platforms: ['web', 'tiktok'],
        representative_quotes: [
          'Turn the explainer into six hooks',
          'Lead with the search question, not the brand',
        ],
      },
    ],
  };

  const metrics = computeMetricsFromSerp(
    serpData,
    raw_ai_response.overall_sentiment,
    raw_ai_response.conversation_intensity,
    trendingTopics,
    TARGET_TIKTOK + TARGET_REDDIT + TARGET_WEB,
  );

  const platformSourcesPreview = ttVideosRaw.slice(0, 40).map((v) => ({
    platform: 'tiktok' as const,
    id: v.id,
    url: `https://www.tiktok.com/@${v.author.uniqueId}/video/${v.id}`,
    title: v.desc.slice(0, 80),
    content: v.desc.slice(0, 500),
    author: v.author.nickname || v.author.uniqueId,
    thumbnailUrl: v.coverUrl ?? undefined,
    videoFormat: 'short' as const,
    engagement: {
      views: v.stats.playCount,
      likes: v.stats.diggCount,
      comments: v.stats.commentCount,
      shares: v.stats.shareCount,
    },
    createdAt: new Date(v.createTime * 1000).toISOString(),
    comments: (v.top_comments ?? []).slice(0, 3).map((c, idx) => ({
      id: `c-${v.id}-${idx}`,
      text: c.text,
      author: c.user,
      likes: c.diggCount,
      createdAt: new Date(c.createTime * 1000).toISOString(),
    })),
    transcript: v.transcript?.slice(0, 500) ?? null,
  }));

  const row = {
    query: QUERY,
    source: 'all',
    time_range: 'last_3_months',
    language: 'all',
    country: 'us',
    client_id: clientId,
    search_mode: 'client_strategy' as const,
    status: 'completed' as const,
    platforms: ['web', 'reddit', 'youtube', 'tiktok'] as string[],
    volume: 'medium' as const,
    search_version: 2,
    summary: raw_ai_response.summary,
    metrics,
    emotions,
    content_breakdown,
    trending_topics: trendingTopics,
    serp_data: serpData,
    raw_ai_response,
    tokens_used: 0,
    estimated_cost: 0,
    completed_at: completedAt,
    processing_started_at: null,
    platform_data: {
      demo: true,
      demoPurpose: 'topic_search_ui_fill',
      demoCopyVersion: DEMO_COPY_VERSION,
      demoSynthetic: syntheticOnly,
      seededBy: 'scripts/seed-goldback-topic-search.ts',
      stats: raw_ai_response.platform_breakdown,
      sourceCount: platformSourcesPreview.length,
      sources: platformSourcesPreview,
      ingestedAt: completedAt,
      tiktokQuery: tiktokQueryLabel,
      nativeTikTokMatches: syntheticOnly ? ttVideosRaw.length : realVideos.length,
    },
  };

  return row;
}

async function main() {
  const admin = createAdminClient();
  const clientId = await resolveClientId(admin);
  if (!clientId) {
    console.error('No Goldback client found. Set GOLDBACK_CLIENT_ID or add a client with slug/name containing "goldback".');
    process.exit(1);
  }

  const ttVolume = (process.env.GOLDBACK_TIKTOK_VOLUME as 'light' | 'medium' | 'deep') || 'light';
  const syntheticOnly =
    process.env.GOLDBACK_DEMO_SYNTHETIC_ONLY === '1' || process.env.GOLDBACK_DEMO_SYNTHETIC_ONLY === 'true';

  let realVideos: SerpData['videos'];
  let ttVideosRaw: TikTokSearchVideo[];

  if (syntheticOnly) {
    console.log('GOLDBACK_DEMO_SYNTHETIC_ONLY: skipping Apify — synthetic TikTok preview rows only.');
    ttVideosRaw = mockTikTokVideosForDemo(40);
    realVideos = [];
  } else {
    console.log(`Fetching TikTok via Apify (if APIFY_API_KEY set), query="${TIKTOK_QUERY_LABEL}"...`);
    const tt = await gatherTikTokData(TIKTOK_QUERY_LABEL, 'last_3_months', ttVolume);
    ttVideosRaw = tt.videos;
    realVideos = tt.videos.map(tikTokToSerpVideo);
    console.log(`TikTok rows from Apify: ${realVideos.length} (volume=${ttVolume}). SERP video list padded to ${TARGET_TIKTOK}.`);
  }

  const now = new Date().toISOString();
  const row = buildGoldbackSearchRow({
    clientId,
    realVideos,
    ttVideosRaw,
    ttVolume,
    completedAt: now,
    tiktokQueryLabel: TIKTOK_QUERY_LABEL,
    syntheticOnly,
  });

  const updateMatching = process.env.GOLDBACK_UPDATE_MATCHING === '1' || process.env.GOLDBACK_UPDATE_MATCHING === 'true';

  if (updateMatching) {
    const targetId = process.env.GOLDBACK_TOPIC_SEARCH_ID?.trim();

    if (targetId) {
      const { error: uErr } = await admin.from('topic_searches').update(row).eq('id', targetId);
      if (uErr) {
        console.error(uErr);
        process.exit(1);
      }
      console.log('Updated topic search by id:', targetId, row.query);
      console.log(`Open: /finder/${targetId}`);
      return;
    }

    const { data: matches, error: findErr } = await admin
      .from('topic_searches')
      .select('id, query')
      .eq('client_id', clientId)
      .in('query', [QUERY, ...LEGACY_QUERIES]);

    if (findErr) {
      console.error(findErr);
      process.exit(1);
    }

    if (!matches?.length) {
      console.error('No existing search matched (query + client). Inserting new row instead.');
      const { data: inserted, error } = await admin.from('topic_searches').insert(row).select('id, query').single();
      if (error) {
        console.error(error);
        process.exit(1);
      }
      console.log('Inserted topic search:', inserted?.id, inserted?.query);
      console.log(`Open: /finder/${inserted?.id}`);
      return;
    }

    const { error: uErr } = await admin
      .from('topic_searches')
      .update(row)
      .eq('client_id', clientId)
      .in('query', [QUERY, ...LEGACY_QUERIES]);

    if (uErr) {
      console.error(uErr);
      process.exit(1);
    }
    console.log(
      `Updated ${matches.length} topic search(es) for ${row.query}:`,
      matches.map((m) => m.id).join(', '),
    );
    console.log(`Open: /finder/${matches[0]!.id}`);
    return;
  }

  const { data: inserted, error } = await admin.from('topic_searches').insert(row).select('id, query').single();

  if (error) {
    console.error(error);
    process.exit(1);
  }

  console.log('Inserted topic search:', inserted?.id, inserted?.query);
  console.log(`Open: /finder/${inserted?.id}`);
}

main();
