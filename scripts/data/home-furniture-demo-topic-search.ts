/**
 * Rich fake topic-search payload for "Home furniture" — used by seed-demo-home-furniture-topic-search.ts.
 */
import type { PlatformSource, SearchPlatform, TopicSource } from '@/lib/types/search';

export const DEMO_QUERY = 'Home furniture';

export const DEMO_SUMMARY = `Home furniture conversation in the last quarter clusters around **three tensions**: affordability vs longevity, **room-specific “hero” pieces** (sectionals, dining tables, storage beds) vs full-room makeovers, and **rental-friendly** upgrades vs investment buys. TikTok and Shorts still drive discovery—fast before/afters, “IKEA hack” reveals, and dupe hunts for West Elm–style silhouettes—while Reddit and Quora carry longer decision threads (fabric durability, pet-proof fabrics, mattress-in-a-box fatigue). Sentiment skews **cautiously optimistic**: people want aspirational rooms but anchor claims in budget, delivery timelines, and return policies. Emerging angles include **modular sectionals** for small apartments, **solid wood dining** as a “buy once” story, **accent lighting + rugs** as the highest-ROI refresh path, and **sustainable materials** (FSC, low-VOC finishes) as a trust signal—not a lecture. For video, hooks that pair a **specific pain** (“open floor plan with zero storage”) with a **single visual payoff** (hidden storage ottoman reveal) outperform generic room tours.`;

function src(
  url: string,
  title: string,
  type: 'web' | 'discussion' | 'video',
  relevance: string,
  platform?: SearchPlatform,
): TopicSource {
  return { url, title, type, relevance, platform };
}

export const trendingTopics = [
  {
    name: 'Modular sectionals & “apartment scale” layouts',
    resonance: 'viral' as const,
    sentiment: 0.52,
    total_engagement: 2_400_000,
    posts_overview:
      'Creators stage **reconfigurable sectionals** in real apartments—emphasizing depth measurements, chaise swap, and fabric swatches in natural light. Fast cuts between “floor plan sketch → pieces in place” keep completion high.',
    comments_overview:
      'Threads split between **true modular** vs marketing labels; audiences ask for pet-claw resistance and cushion firmness. High save rate on posts that show real room dimensions.',
    sources: [
      src('https://www.tiktok.com/tag/modularsectional', 'TikTok #modularsectional', 'video', 'Layout and scale demos', 'tiktok'),
      src('https://www.reddit.com/r/HomeDecorating/', 'r/HomeDecorating layout advice', 'discussion', 'Small-space sectional debates', 'reddit'),
      src('https://example.com/small-space-sofa-guide', 'Small-space sofa buying guide', 'web', 'Editorial measurements & pitfalls', 'web'),
    ],
    video_ideas: [
      {
        title: 'Measure once: sectional that fits a 10×12 living room',
        hook: 'Tape on the floor first — then the sofa lands exactly where the sketch said.',
        format: 'tutorial_pov',
        virality: 'high' as const,
        why_it_works: 'Pain-specific + single payoff; commenters tag friends in similar floor plans.',
        script_outline: ['Hook: wrong sofa ghost story', 'Tape template', 'Module map', 'Reveal sit test', 'CTA: save the measure list'],
        cta: 'Save for your next move',
      },
      {
        title: 'Pet test: which fabric survived a weekend with two cats',
        hook: 'Same frame — three swatches — one winner.',
        format: 'comparison',
        virality: 'viral_potential' as const,
        why_it_works: 'Pet owners are high-intent; side-by-side macro shows wear honestly.',
      },
    ],
  },
  {
    name: 'Dining tables: solid wood “buy once” vs budget dupes',
    resonance: 'high' as const,
    sentiment: 0.41,
    total_engagement: 1_100_000,
    posts_overview:
      '**Oak / walnut** tables anchor “investment” storytelling; budget content leads with **finish care** and leg room specs. Short videos favor overhead “tablescape” shots and chair pull-out tests.',
    comments_overview:
      'Debates on veneer vs solid; “seats how many comfortably” drives replies. Sustainability mentions lift positive sentiment when paired with sourcing detail.',
    sources: [
      src('https://www.youtube.com/results?search_query=solid+wood+dining+table', 'YouTube solid wood table tours', 'video', 'Long-form trust builders', 'youtube'),
      src('https://www.tiktok.com/tag/diningtable', 'TikTok #diningtable', 'video', 'Aesthetic + dupe energy', 'tiktok'),
    ],
    video_ideas: [
      {
        title: 'The 60-second “chair knee clearance” test',
        hook: 'If your knees hit — your guests will too.',
        format: 'quick_tip',
        virality: 'high' as const,
        why_it_works: 'One actionable test; works for renters and buyers alike.',
      },
    ],
  },
  {
    name: 'Storage beds & ottomans — hidden volume as a flex',
    resonance: 'high' as const,
    sentiment: 0.48,
    total_engagement: 890_000,
    posts_overview:
      'Lift-up beds and storage ottomans win when **capacity is shown in real items** (seasonal clothes, gear bins), not abstract liters.',
    comments_overview:
      '“Where did you get the bins?” and warranty questions dominate. Skepticism when lift mechanisms look flimsy—slow-mo close helps.',
    sources: [src('https://www.tiktok.com/tag/storagebed', 'TikTok #storagebed', 'video', 'Lift mechanism demos', 'tiktok')],
    video_ideas: [
      {
        title: 'Pack an entire closet into one ottoman (honest capacity)',
        hook: 'We counted — here’s what actually fit.',
        format: 'reveal',
        virality: 'high' as const,
        why_it_works: 'Concrete count beats adjectives; strong save rate.',
      },
    ],
  },
  {
    name: 'IKEA hacks & “designer dupe” carpentry',
    resonance: 'viral' as const,
    sentiment: 0.55,
    total_engagement: 3_200_000,
    posts_overview:
      'Billy upgrades, Besta wall units, and **trim/moulding overlays** remain evergreen; Shorts reward **before/price-after** framing.',
    comments_overview:
      'Skill-level fights are common; creators who list tools and time win trust. “Renter-safe” notes reduce backlash.',
    sources: [
      src('https://www.tiktok.com/tag/ikeahack', 'TikTok #ikeahack', 'video', 'Hack velocity', 'tiktok'),
      src('https://example.com/renter-friendly-shelves', 'Renter-friendly shelving ideas', 'web', 'Editorial roundup', 'web'),
    ],
    video_ideas: [
      {
        title: 'IKEA Besta → built-in look: tools, time, and total cost',
        hook: 'No fake “$50 total” — here’s the real receipt.',
        format: 'build_vlog',
        virality: 'viral_potential' as const,
        why_it_works: 'Transparency reduces skepticism; cost overlay retains viewers.',
      },
    ],
  },
  {
    name: 'Accent chairs as the “one swap” room refresh',
    resonance: 'medium' as const,
    sentiment: 0.36,
    total_engagement: 420_000,
    posts_overview:
      'Single-chair replacements test color palettes without committing to a full set; creators pair **fabric cards** with wall paint.',
    comments_overview:
      'Color-matching questions; users share paint codes in comments when creators pin them.',
    sources: [src('https://www.tiktok.com/tag/accentchair', 'TikTok #accentchair', 'video', 'Refresh stories', 'tiktok')],
    video_ideas: [
      {
        title: 'One chair, three rug pairings — vote in comments',
        hook: 'Same room — which vibe wins?',
        format: 'interactive',
        virality: 'medium' as const,
        why_it_works: 'Poll-style engagement without leaving the platform.',
      },
    ],
  },
  {
    name: 'Outdoor furniture: weatherproof + small patio math',
    resonance: 'high' as const,
    sentiment: 0.44,
    total_engagement: 760_000,
    posts_overview:
      'Bistro sets and sectional **depth for balconies** trend in spring; creators show **rain test** clips for cushions.',
    comments_overview:
      'Rust vs aluminum frames; storage for cushions is the top pain.',
    sources: [
      src('https://www.youtube.com/results?search_query=small+patio+furniture', 'YouTube small patio setups', 'video', 'Measurement-led', 'youtube'),
    ],
    video_ideas: [
      {
        title: 'Will this sectional fit a 6×8 balcony? Template + real tape',
        hook: 'If the tape lies, your toes will know.',
        format: 'pov_measure',
        virality: 'high' as const,
        why_it_works: 'Specific footprint + outdoor constraints = high saves.',
      },
    ],
  },
  {
    name: 'Kids & pets: performance fabrics and washable covers',
    resonance: 'high' as const,
    sentiment: 0.33,
    total_engagement: 540_000,
    posts_overview:
      '**Crypton / performance weave** keywords spike; creators run spill tests and claw simulations—authenticity beats claims.',
    comments_overview:
      'Brand callouts and warranty stories; some skepticism on sponsored tests.',
    sources: [src('https://www.reddit.com/r/furniture/', 'r/furniture fabric threads', 'discussion', 'Real owner experience', 'reddit')],
    video_ideas: [
      {
        title: 'Spill test 3 fabrics — same coffee, same couch frame',
        hook: 'We timed the stain window.',
        format: 'lab_style',
        virality: 'medium' as const,
        why_it_works: 'Controlled demo + disclosure builds credibility.',
      },
    ],
  },
  {
    name: 'Lighting & rugs: highest ROI “stage the room” combo',
    resonance: 'medium' as const,
    sentiment: 0.49,
    total_engagement: 610_000,
    posts_overview:
      'Layered lighting tutorials and **rug size rules** (front legs on / all legs on) remain top educational formats.',
    comments_overview:
      'Users ask for links and bulb temps; warm vs daylight debates in comments.',
    sources: [src('https://example.com/rug-size-guide', 'Rug size guide', 'web', 'Sizing diagrams', 'web')],
    video_ideas: [
      {
        title: 'Wrong rug size vs right — same furniture, 30 seconds',
        hook: 'If your rug is floating, your room is too.',
        format: 'split_screen',
        virality: 'high' as const,
        why_it_works: 'Visual rule-of-thumb is instantly shareable.',
      },
    ],
  },
];

export const metrics = {
  web_results_found: 56,
  discussions_found: 34,
  videos_found: 142,
  total_sources: 232,
  total_video_views: 94_000_000,
  total_discussion_replies: 62_000,
  overall_sentiment: 0.43,
  conversation_intensity: 'very_high' as const,
  topic_score: 84,
  content_opportunities: trendingTopics.reduce((n, t) => n + t.video_ideas.length, 0),
  trending_topics_count: trendingTopics.length,
  sources_analyzed: 228,
};

export const emotions = [
  { emotion: 'Aspiration', percentage: 26, color: '#5ba3e6' },
  { emotion: 'Price sensitivity', percentage: 22, color: '#f59e0b' },
  { emotion: 'Curiosity', percentage: 20, color: '#a855f7' },
  { emotion: 'Skepticism', percentage: 16, color: '#94a3b8' },
  { emotion: 'Excitement', percentage: 10, color: '#22c55e' },
  { emotion: 'Overwhelm', percentage: 6, color: '#ef4444' },
];

export const content_breakdown = {
  intentions: [
    { name: 'Research before purchase', percentage: 38, engagement_rate: 0.11 },
    { name: 'Style inspiration', percentage: 27, engagement_rate: 0.13 },
    { name: 'DIY / hack savings', percentage: 18, engagement_rate: 0.14 },
    { name: 'Problem solving (small room, pets, kids)', percentage: 17, engagement_rate: 0.1 },
  ],
  categories: [
    { name: 'Living room seating', percentage: 28, engagement_rate: 0.12 },
    { name: 'Dining & kitchen furniture', percentage: 22, engagement_rate: 0.11 },
    { name: 'Bedroom & storage', percentage: 20, engagement_rate: 0.1 },
    { name: 'Outdoor & patio', percentage: 15, engagement_rate: 0.09 },
    { name: 'Accent & décor', percentage: 15, engagement_rate: 0.13 },
  ],
  formats: [
    { name: 'Short vertical demo / POV', percentage: 32, engagement_rate: 0.15 },
    { name: 'Before/after reveal', percentage: 24, engagement_rate: 0.14 },
    { name: 'Talking head + B-roll', percentage: 18, engagement_rate: 0.09 },
    { name: 'Listicle / “3 mistakes”', percentage: 14, engagement_rate: 0.11 },
    { name: 'Long-form room tour', percentage: 12, engagement_rate: 0.08 },
  ],
};

const nowIso = new Date().toISOString();

function demoPlatformSource(platform: SearchPlatform, i: number): PlatformSource {
  const base = `https://www.${platform === 'web' ? 'example.com' : platform + '.com'}/demo-home-furniture-${i}`;
  return {
    platform,
    id: `demo-hf-${platform}-${i}`,
    url: base,
    title:
      platform === 'tiktok'
        ? `POV: measuring a sectional for a ${10 + i}×${12 + i} living room`
        : platform === 'youtube'
          ? `Dining table wood types explained in 8 minutes`
          : `Buyer’s guide: storage beds ${2024 + (i % 2)}`,
    content:
      'Comments ask about fabric codes, return windows, and assembly time. Creators who show real dimensions and lighting get higher saves.',
    author: `creator_${i}`,
    engagement: { views: 120_000 + i * 9000, likes: 4000 + i * 200, comments: 180 + i * 10, shares: 90 },
    createdAt: nowIso,
    comments: [
      {
        id: `c-${i}-1`,
        text: 'Finally someone shows leg room with chairs tucked in.',
        author: 'alex_p',
        likes: 42,
        createdAt: nowIso,
      },
      {
        id: `c-${i}-2`,
        text: 'Would this fabric hold up with two dogs?',
        author: 'sam_r',
        likes: 28,
        createdAt: nowIso,
      },
    ],
    thumbnailUrl: null,
    transcript: null,
  };
}

export const platform_data = {
  stats: [
    {
      platform: 'tiktok' as const,
      post_count: 980,
      comment_count: 312_000,
      avg_sentiment: 0.46,
      top_hashtags: ['homefurniture', 'sectional', 'ikeahack', 'diningtable', 'storagetok'],
    },
    {
      platform: 'youtube' as const,
      post_count: 210,
      comment_count: 88_000,
      avg_sentiment: 0.4,
      top_channels: ['Home short tours', 'Woodworking shorts'],
    },
    {
      platform: 'reddit' as const,
      post_count: 410,
      comment_count: 54_000,
      avg_sentiment: 0.28,
      top_subreddits: ['HomeDecorating', 'furniture', 'InteriorDesign'],
    },
    { platform: 'web' as const, post_count: 72, comment_count: 0, avg_sentiment: 0.35 },
  ],
  sourceCount: 12,
  sources: [
    demoPlatformSource('tiktok', 1),
    demoPlatformSource('tiktok', 2),
    demoPlatformSource('youtube', 3),
    demoPlatformSource('reddit', 4),
    demoPlatformSource('web', 5),
  ] as PlatformSource[],
  demo: true,
};

export const serp_data = {
  webResults: [
    {
      title: '2026 home furniture trends: modular, honest materials, rental-smart',
      url: 'https://example.com/home-furniture-trends-2026',
      description: 'Retailers emphasize configurable seating, visible wood grain, and clearer return policies.',
    },
    {
      title: 'How TikTok changed furniture discovery',
      url: 'https://example.com/tiktok-furniture-discovery',
      description: 'Short demos beat static catalogs; measurement overlays reduce returns.',
    },
    {
      title: 'Small-space furniture: what shoppers actually measure first',
      url: 'https://example.com/small-space-furniture-measure',
      description: 'Depth, walkway width, and cord exits matter more than style keywords.',
    },
  ],
  discussions: [
    {
      title: 'Sectional vs two sofas for open floor plans?',
      url: 'https://reddit.com/r/HomeDecorating/comments/demo-hf-1',
      description: 'Users trade floor plans and pet considerations.',
      forum: 'HomeDecorating',
      answers: 156,
      topComment: 'Tape the footprint before you order — saved me once.',
    },
    {
      title: 'Is “performance fabric” worth it?',
      url: 'https://reddit.com/r/furniture/comments/demo-hf-2',
      description: 'Real owners compare spills and pilling after 6 months.',
      forum: 'furniture',
      answers: 89,
      topComment: 'Worth it if kids eat on the couch daily.',
    },
  ],
  videos: [
    {
      title: 'Full living room layout in a 12×14 — real measurements',
      url: 'https://youtube.com/watch?v=demo-hf-layout',
      description: 'Walkthrough with tape template and rug sizing callouts.',
      platform: 'YouTube',
      views: '2.1M',
      creator: 'RoomScale Studio',
      duration: '1:02',
    },
    {
      title: 'Storage bed lift — what fits vs marketing claims',
      url: 'https://youtube.com/watch?v=demo-hf-bed',
      description: 'Bins, season swap, and weight test.',
      platform: 'YouTube',
      views: '890K',
      creator: 'Sleep & Space',
      duration: '0:58',
    },
  ],
};

export const research_sources = [
  {
    url: 'https://example.com/home-furniture-trends-2026',
    title: '2026 home furniture trends',
    snippet: 'Modular seating and sustainable finishes…',
    subtopic_index: 0,
    platform: 'web' as const,
  },
  {
    url: 'https://www.tiktok.com/tag/modularsectional',
    title: 'TikTok modular sectional',
    snippet: 'User demos and measurement overlays…',
    subtopic_index: 0,
    platform: 'tiktok' as const,
  },
  {
    url: 'https://www.reddit.com/r/HomeDecorating/',
    title: 'r/HomeDecorating',
    snippet: 'Layout threads and product recs…',
    subtopic_index: 1,
    platform: 'reddit' as const,
  },
];

export const pipeline_state = {
  kind: 'llm_v1',
  demo: true,
  seeded: true,
  at: nowIso,
  web_research_mode: 'demo_seed',
  stages: [
    { phase: 'subtopic_research', duration_ms: 12000, tokens: 4200 },
    { phase: 'merge', duration_ms: 8000, tokens: 3100 },
  ],
  totals: { tokens: 15420, estimated_cost: 0.38, subtopics: 3, research_sources: 24 },
};

export const activity_data = Array.from({ length: 14 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (13 - i));
  return {
    date: d.toISOString().slice(0, 10),
    views: 40_000 + i * 4200 + (i % 3) * 1000,
    mentions: 120 + i * 12,
    sentiment: 0.25 + (i % 5) * 0.04,
  };
});

export const synthetic_audiences = {
  intro:
    'Modelled segments from conversational tone and purchase-intent signals in home-furniture content—not survey data.',
  segments: [
    {
      name: 'Budget-conscious optimizer',
      emoji: '📐',
      share_percent: 34,
      ocean: { openness: 58, conscientiousness: 72, extraversion: 42, agreeableness: 61, neuroticism: 38 },
      description:
        'Researches dimensions, return policies, and fabric codes before buying. Responds to **clear specs**, comparison tables, and honest assembly time.',
      interest_tags: ['measurements', 'returns', 'pet-friendly fabric', 'small space'],
      rationale: 'High engagement on “measure twice” content and spill tests.',
    },
    {
      name: 'Aesthetic-first curator',
      emoji: '✨',
      share_percent: 28,
      ocean: { openness: 78, conscientiousness: 55, extraversion: 52, agreeableness: 66, neuroticism: 44 },
      description:
        'Chases cohesive palettes and lighting; willing to splurge on **one hero piece** if the room reads finished on camera.',
      interest_tags: ['rug size', 'accent chair', 'layered lighting', 'color palette'],
      rationale: 'Saves and shares before/afters; asks for paint and rug links.',
    },
    {
      name: 'Hands-on hacker',
      emoji: '🔧',
      share_percent: 22,
      ocean: { openness: 70, conscientiousness: 68, extraversion: 48, agreeableness: 54, neuroticism: 50 },
      description:
        'Wants IKEA hacks, trim overlays, and tool lists. Values **time and materials truth** over viral cost claims.',
      interest_tags: ['IKEA hack', 'DIY trim', 'renter friendly', 'tools'],
      rationale: 'Comments focus on skill level and rental restrictions.',
    },
    {
      name: 'Family & durability realist',
      emoji: '🐕',
      share_percent: 16,
      ocean: { openness: 52, conscientiousness: 76, extraversion: 40, agreeableness: 70, neuroticism: 55 },
      description:
        'Filters everything through kids and pets; prioritizes **washable covers** and scratch reality over showroom shots.',
      interest_tags: ['performance fabric', 'washable covers', 'kids', 'pets'],
      rationale: 'Strong responses to staged spill tests and 6-month follow-ups.',
    },
  ],
};

export const content_pillars = [
  {
    pillar: 'Proof-first buying',
    description: 'Measurements, clearance, and real-room lighting before brand hype.',
    example_series: '“Tape template Tuesday” — same template across three price tiers',
    frequency: 'Weekly',
  },
  {
    pillar: 'Problem → one payoff',
    description: 'Each video solves one furniture pain (storage, pets, small footprint).',
    example_series: '“One swap Saturday” — rug, chair, or lamp',
    frequency: 'Biweekly',
  },
  {
    pillar: 'Honest hacks',
    description: 'Tool lists, skill level, and renter constraints upfront.',
    example_series: 'IKEA upgrade ladder — 20 min / 2 hr / weekend projects',
    frequency: 'Monthly',
  },
];

export const niche_performance_insights = {
  top_performing_formats: [
    'POV measure + template',
    'Before/after with cost overlay',
    'Spill or claw test on performance fabric',
  ],
  best_posting_times: 'Weeknights 7–10pm local; Sunday midday for planning mindset',
  audience_hooks: [
    'Wrong size ghost story in 5 words',
    'What I’d buy again after 1 year',
    'Pet test same weekend — three fabrics',
  ],
  competitor_gaps:
    'Few creators show **return experience** and **delivery damage** honestly; doing so with a calm tone builds disproportionate trust.',
};

export const brand_alignment_notes =
  'Position the brand as the **specs-forward** choice: lead with dimensions, fabric codes, and realistic timelines—then layer aspiration. Pair hero shots with **one proof moment** (measurement overlay, stain test clip, or owner quote).';

export function buildRawAiResponse() {
  return {
    summary: DEMO_SUMMARY,
    overall_sentiment: 0.43,
    conversation_intensity: 'very_high' as const,
    emotions,
    content_breakdown,
    trending_topics: trendingTopics,
    brand_alignment_notes,
    synthetic_audiences,
    content_pillars,
    niche_performance_insights,
    big_movers: [
      {
        name: 'Modular sectional creators (measurement-led)',
        type: 'creator' as const,
        url: null,
        why: 'Accounts that show **floor plans and tape templates** own comments; aspiration alone underperforms.',
        tactics: ['Hook with a sizing mistake story', 'Split-screen tape vs delivered piece', 'Pin comment with depth/width'],
        takeaway: 'Treat “will it fit” as the headline, style as the subtitle.',
      },
      {
        name: 'Retailers publishing honest delivery & damage policies',
        type: 'company' as const,
        url: null,
        why: 'Transparency on timelines and restock reduces chargeback chatter in comments.',
        tactics: ['FAQ video from support team', 'Real unpack timelapse', 'Clear restock dates'],
        takeaway: 'Trust compounds when ops content matches marketing visuals.',
      },
      {
        name: 'Performance fabric suppliers',
        type: 'product' as const,
        url: null,
        why: 'Spill tests and 6-month follow-ups beat spec sheets for pet/kid segments.',
        tactics: ['Standardized spill clock', 'Macro pilling check', 'Disclose sponsorship loudly'],
        takeaway: 'Controlled demos + disclosure outperform glossy claims.',
      },
    ],
    platform_breakdown: platform_data.stats.map((s) => ({
      platform: s.platform,
      post_count: s.post_count,
      comment_count: s.comment_count,
      avg_sentiment: s.avg_sentiment,
    })),
    conversation_themes: [
      {
        theme: 'Truth in dimensions',
        post_count: 520,
        sentiment: 0.35,
        platforms: ['tiktok', 'web'] as SearchPlatform[],
        representative_quotes: ['Show the depth not just the width', 'Is that wall-to-wall or walkway?'],
      },
      {
        theme: 'Dupe fatigue vs quality',
        post_count: 480,
        sentiment: 0.12,
        platforms: ['tiktok', 'reddit'] as SearchPlatform[],
        representative_quotes: ['Looks great until month three', 'Dupes are fine if you know the tradeoff'],
      },
      {
        theme: 'Pet & kid stress tests',
        post_count: 390,
        sentiment: 0.28,
        platforms: ['tiktok', 'youtube'] as SearchPlatform[],
        representative_quotes: ['We need claws on this swatch', 'Washable cover saved us'],
      },
    ],
  };
}
