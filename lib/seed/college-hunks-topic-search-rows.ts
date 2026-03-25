/**
 * Rich synthetic topic_search payloads (junk removal + moving angles).
 * Offline fill for UI: no live SERP/API calls; stored shape matches a completed multi-platform run.
 */
import type { BraveSerpData } from '@/lib/brave/types';
import type {
  ContentBreakdown,
  ConversationTheme,
  EmotionBreakdown,
  PlatformBreakdown,
  TopicSearchAIResponse,
  TopicSource,
  TrendingTopic,
  VideoIdea,
} from '@/lib/types/search';
import type { PlatformSource } from '@/lib/types/search';
import { computeMetricsFromSerp } from '@/lib/utils/compute-metrics';

export const CHHJ_QUERY_JUNK = 'Junk removal and donation pickup trends';
export const CHHJ_QUERY_MOVING = 'Stress-free local moving services';

const TARGET_VIDEOS = 220;
const TARGET_DISCUSSIONS = 140;
const TARGET_WEB = 55;

function fmtViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function redditId(i: number): string {
  const a = '0123456789abcdefghijklmnopqrstuvwxyz';
  let n = 100000 + i * 991;
  let s = '';
  for (let k = 0; k < 6; k++) {
    s = a[n % a.length] + s;
    n = Math.floor(n / a.length);
  }
  return s;
}

function src(url: string, title: string, type: 'web' | 'discussion' | 'video', relevance: string, platform?: TopicSource['platform']): TopicSource {
  return { url, title, type, relevance, platform };
}

function vi(partial: VideoIdea): VideoIdea {
  return {
    format: 'pov',
    virality: 'medium',
    script_outline: ['Hook', 'Problem', 'Proof', 'Tip', 'CTA'],
    cta: 'Save for your content calendar',
    ...partial,
  };
}

const JUNK_SUBS = ['Declutter', 'minimalism', 'HomeImprovement', 'moving', 'BuyItForLife', 'personalfinance', 'HomeMaintenance', 'ZeroWaste'];
const MOVE_SUBS = ['moving', 'MovingOut', 'Apartmentliving', 'HomeBuying', 'FirstTimeHomeBuyer', 'Relocation', 'Militarymove', 'VanLife'];

function fakeDiscussion(i: number, theme: 'junk' | 'moving'): BraveSerpData['discussions'][0] {
  const subs = theme === 'junk' ? JUNK_SUBS : MOVE_SUBS;
  const sub = subs[i % subs.length];
  const pid = redditId(i);
  const junkBodies = [
    'We booked a haul-away for the garage — half went to donation, rest recycled. Way less guilt than a dumpster.',
    'Quote spread was wild: one flat truck fee, another by volume. Ask what happens to usable furniture.',
    'Estate cleanout tip: photograph everything before the crew arrives — saves disputes.',
    'Anyone else feel weird about strangers touching sentimental stuff? We labeled “donate” vs “trash” bins.',
    'Donation center turned us away for upholstered items — plan B was a charity pickup the junk company coordinated.',
  ];
  const moveBodies = [
    'Day-before checklist saved us: utilities, parking permit for the truck, elevator reservation.',
    'Hired loaders for 3 hours — worth it vs arguing with friends who “might show up.”',
    'Label boxes by room + unload order. Unpack kitchen first; sleep matters.',
    'Insurance rider for the move: read the fine print on who packs what.',
    'Stress spike hit at 9pm — we paused, ate, then finished. Do not skip meals.',
  ];
  const bodies = theme === 'junk' ? junkBodies : moveBodies;
  const body = bodies[i % bodies.length];
  const slug = body.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40) || 'thread';
  return {
    title:
      theme === 'junk'
        ? `${sub}: donation-first junk removal — what actually changed your bill?`
        : `${sub}: local move without the meltdown — what worked?`,
    url: `https://www.reddit.com/r/${sub}/comments/${pid}/${slug}/`,
    description: body,
    forum: `r/${sub}`,
    answers: 8 + (i % 120),
    topComment:
      i % 2 === 0
        ? 'We filmed a quick walkthrough before they touched anything — game changer for insurance.'
        : 'Get the weight/volume estimate in writing before they start loading.',
  };
}

const JUNK_TT = [
  'POV: your garage finally fits the car again',
  'Donation pile vs landfill — how we sorted a whole house in one day',
  'What junk crews actually charge for (volume vs time)',
  'Estate cleanout: the label system that kept peace in the family',
  'Hot take: dumpsters are not always cheaper',
  'Before/after: basement hoard to empty slab',
  'Questions to ask before you sign the haul-away quote',
  'Recycling vs donation — what most people get wrong',
];

const MOVE_TT = [
  'Moving day timeline that actually worked (hour by hour)',
  'Packing hack: color tape by room + unload order',
  'How we avoided the “friends canceled” disaster',
  'First apartment solo move — mistakes I will not repeat',
  'Stress-free is a myth — here is what we controlled instead',
  'Truck size: the one measurement people skip',
  'Kids + move: the script we used at bedtime',
  'Utility cutoff dates — the spreadsheet row that saved us',
];

function buildVideos(theme: 'junk' | 'moving'): BraveSerpData['videos'] {
  const hooks = theme === 'junk' ? JUNK_TT : MOVE_TT;
  const out: BraveSerpData['videos'] = [];
  const platforms = ['tiktok', 'youtube', 'tiktok', 'youtube', 'tiktok'] as const;
  for (let i = 0; i < TARGET_VIDEOS; i++) {
    const hook = hooks[i % hooks.length];
    const plat = platforms[i % platforms.length];
    const handle = theme === 'junk' ? `haulaway_${(i % 60) + 1}` : `movecrew_${(i % 60) + 1}`;
    const base = 8000 + ((i * 133) % 2_400_000);
    if (plat === 'tiktok') {
      out.push({
        title: hook,
        url: `https://www.tiktok.com/@${handle}/video/${7120000000000 + i}`,
        description: `${hook} #moving #junkremoval #tips #home`,
        platform: 'tiktok',
        views: fmtViews(base),
        creator: handle.replace(/_/g, ' '),
      });
    } else {
      const vid = `x${i.toString(36)}${(i * 7919).toString(36)}`.replace(/[^a-z0-9]/gi, 'a').slice(0, 11);
      out.push({
        title: `${hook} — full breakdown`,
        url: `https://www.youtube.com/watch?v=${vid}`,
        description: `Longer walkthrough: planning, costs, and what we would do differently next time.`,
        platform: 'youtube',
        views: fmtViews(base * 1.4),
        creator: `${theme === 'junk' ? 'Home' : 'Move'} Notes ${(i % 24) + 1}`,
      });
    }
  }
  return out;
}

function buildDiscussions(theme: 'junk' | 'moving'): BraveSerpData['discussions'] {
  const d: BraveSerpData['discussions'] = [];
  for (let i = 0; i < TARGET_DISCUSSIONS; i++) d.push(fakeDiscussion(i, theme));
  return d;
}

function buildWeb(theme: 'junk' | 'moving'): BraveSerpData['webResults'] {
  const junkSeeds: BraveSerpData['webResults'] = [
    { title: 'Donation pickup and reuse — what charities accept', url: 'https://www.example.org/guides/donation-pickup', description: 'Guidance on scheduling pickups and preparing items for reuse networks.' },
    { title: 'Junk removal pricing models explained', url: 'https://www.example.org/research/pricing-models', description: 'Flat rate vs volume vs labor time — how quotes are typically structured.' },
    { title: 'Estate cleanouts: a practical checklist', url: 'https://www.example.org/lifestyle/estate-cleanout', description: 'Room-by-room priorities when clearing a home quickly.' },
  ];
  const moveSeeds: BraveSerpData['webResults'] = [
    { title: 'Local moving services — planning hub', url: 'https://www.example.org/move/planning', description: 'Timelines, permits, and coordination points for metro moves.' },
    { title: 'Packing strategies that reduce damage', url: 'https://www.example.org/move/packing', description: 'Materials, box labeling, and load order for common household moves.' },
    { title: 'Moving stress: what the research says', url: 'https://www.example.org/wellness/moving-stress', description: 'Habit and scheduling tactics tied to smoother move weeks.' },
  ];
  const seeds = theme === 'junk' ? junkSeeds : moveSeeds;
  const out: BraveSerpData['webResults'] = [...seeds];
  const rot = [
    { title: 'Home organization trends', url: 'https://www.example.org/trends/home-org', description: 'Consumer interest in decluttering and responsible disposal.' },
    { title: 'Housing and mobility survey notes', url: 'https://www.example.org/data/housing-mobility', description: 'Regional commentary on moving frequency and service demand.' },
  ];
  while (out.length < TARGET_WEB) {
    const i = out.length;
    const r = rot[i % rot.length];
    out.push({
      title: `${r.title} (${2019 + (i % 6)})`,
      url: `${r.url}#ref=${i}`,
      description: r.description,
    });
  }
  return out.slice(0, TARGET_WEB);
}

function junkTrendingTopics(): TrendingTopic[] {
  return [
    {
      name: 'Donation-first hauling and reuse storytelling',
      resonance: 'high',
      sentiment: 0.42,
      posts_overview:
        'Short-form creators show sort piles, donation receipts, and “before the truck” walkthroughs. Audiences respond to transparent handling and environmental framing more than price alone.',
      comments_overview:
        'Threads debate what qualifies for donation vs recycle; viewers ask for vendor policies in plain language.',
      sources: [
        src('https://www.tiktok.com/tag/donationpickup', 'Short-form donation pickup', 'video', 'High-save cluster', 'tiktok'),
        src('https://www.reddit.com/r/Declutter/', 'r/Declutter', 'discussion', 'Sort-and-donate culture', 'reddit'),
      ],
      video_ideas: [
        vi({ title: 'Three piles: donate, recycle, landfill — filmed in real time', hook: 'No cuts, just labels.', why_it_works: 'Process transparency builds trust and shares.', format: 'pov' }),
        vi({ title: 'Ask your hauler these five questions before you book', hook: 'Question one saves the most money.', why_it_works: 'Search-intent framing; strong save rate.', format: 'listicle' }),
        vi({ title: 'What happens to your couch after pickup', hook: 'Follow the item — respectful, factual.', why_it_works: 'Curiosity loop; commenters tag local orgs.', format: 'explainer' }),
        vi({ title: 'Garage reset in one weekend — donation day arc', hook: 'Hour labels on screen.', why_it_works: 'Series potential; easy stitch.', format: 'vlog' }),
        vi({ title: 'Estate cleanout: the family meeting agenda', hook: 'Emotions first, stuff second.', why_it_works: 'Sensitive topic done with care; long watch.', format: 'talking_head' }),
        vi({ title: 'Hot take: “junk” is often just unmade decisions', hook: 'Timer challenge: ten minutes, one bin.', why_it_works: 'Actionable micro-task; duet bait.', format: 'challenge' }),
      ],
    },
    {
      name: 'Pricing transparency and surprise fees',
      resonance: 'viral',
      sentiment: 0.08,
      posts_overview:
        'Volume-based quotes, stair carries, and same-day windows drive comparison content. Creators film quote screens and redact addresses for privacy.',
      comments_overview:
        'Heavy Q&A on what counts as a “full truck” and how crews handle hazardous items.',
      sources: [
        src('https://www.reddit.com/r/HomeImprovement/', 'r/HomeImprovement', 'discussion', 'Contractor and haul threads', 'reddit'),
        src('https://www.youtube.com/results?search_query=junk+removal+quote', 'YouTube quote walkthroughs', 'video', 'Long-form comparisons', 'youtube'),
      ],
      video_ideas: [
        vi({ title: 'We got three quotes — here is the spreadsheet', hook: 'Same house, three visits.', why_it_works: 'Spreadsheet culture; commenters add cities.', format: 'comparison' }),
        vi({ title: 'Hidden line items in haul-away pricing', hook: 'Pause on each row.', why_it_works: 'Educational; high share among homeowners.', format: 'tutorial' }),
        vi({ title: 'Same-day junk removal — when it is worth the premium', hook: 'Real closing date story.', why_it_works: 'Urgency narrative; local SEO angles.', format: 'storytime' }),
      ],
    },
    {
      name: 'Safety, crews, and trust on site',
      resonance: 'medium',
      sentiment: 0.35,
      posts_overview:
        'POVs of uniformed teams, ID checks, and walkthrough protocols. Parents and seniors especially engage with “who is in my driveway” content.',
      comments_overview:
        'Discussion of background checks, insurance certificates, and photo documentation.',
      sources: [
        src('https://www.reddit.com/r/HomeMaintenance/', 'r/HomeMaintenance', 'discussion', 'Vendor vetting', 'reddit'),
      ],
      video_ideas: [
        vi({ title: 'Day-of walkthrough script (copy this)', hook: 'Thirty seconds, zero awkwardness.', why_it_works: 'Template saves; brand-safe.', format: 'tutorial' }),
        vi({ title: 'Insurance docs — what homeowners should snap before pickup', hook: 'Album folder name matters.', why_it_works: 'Practical; reduces disputes.', format: 'checklist' }),
      ],
    },
    {
      name: 'Eco framing and local regulation notes',
      resonance: 'medium',
      sentiment: 0.28,
      posts_overview:
        'Municipal bulky pickup calendars, mattress disposal rules, and e-waste days show up next to brand content. Educational explainers outperform guilt-based messaging.',
      comments_overview:
        'City-specific comment threads; creators pin regional resources.',
      sources: [
        src('https://www.example.org/local/bulky-pickup', 'Municipal bulky pickup overview', 'web', 'Policy context', 'web'),
      ],
      video_ideas: [
        vi({ title: 'Bulky week vs private haul — five cities compared', hook: 'Your block may differ.', why_it_works: 'Local SEO hooks; save-worthy.', format: 'listicle' }),
        vi({ title: 'Mattress disposal without the fine print surprise', hook: 'Three legal paths.', why_it_works: 'High search intent; clear chapters.', format: 'explainer' }),
      ],
    },
  ];
}

function movingTrendingTopics(): TrendingTopic[] {
  return [
    {
      name: 'Hour-by-hour moving day timelines',
      resonance: 'viral',
      sentiment: 0.51,
      posts_overview:
        'Creators post “6am to 6pm” reels with truck arrival, load order, and pizza breaks. Audiences treat these as reusable templates for local moves.',
      comments_overview:
        'Viewers swap elevator booking tips and parking permit links by city.',
      sources: [
        src('https://www.tiktok.com/tag/movingday', 'Moving day POVs', 'video', 'Viral format cluster', 'tiktok'),
        src('https://www.reddit.com/r/moving/', 'r/moving', 'discussion', 'Logistics Q&A', 'reddit'),
      ],
      video_ideas: [
        vi({ title: 'Our moving day shot list (steal this)', hook: 'Twelve shots, one phone.', why_it_works: 'Template content; easy stitch.', format: 'tutorial' }),
        vi({ title: 'Kids on moving day — the script we used', hook: 'Age six and age twelve versions.', why_it_works: 'Emotional resonance; family demo.', format: 'storytime' }),
        vi({ title: 'Truck pack order: what goes last comes out first', hook: 'Diagram on screen.', why_it_works: 'Saves beat likes for this niche.', format: 'explainer' }),
        vi({ title: 'When the crew is late — the 15-minute buffer plan', hook: 'Coffee is not optional.', why_it_works: 'Relatable conflict; calm brand voice.', format: 'pov' }),
        vi({ title: 'Apartment move: elevator reservation screenshot tutorial', hook: 'Blur the address.', why_it_works: 'Urban movers search this exact phrase.', format: 'screenshot' }),
        vi({ title: 'Move week sleep schedule (yes, really)', hook: 'Protect sleep, protect the truck.', why_it_works: 'Wellness crossover; unexpected angle.', format: 'listicle' }),
      ],
    },
    {
      name: 'Packing systems and label discipline',
      resonance: 'high',
      sentiment: 0.44,
      posts_overview:
        'Color tape, QR inventory lists, and “open first” boxes dominate Shorts. The winning pattern is show the system, not the brand.',
      comments_overview:
        'Debates on plastic bins vs boxes; links to sustainable tape brands.',
      sources: [
        src('https://www.youtube.com/results?search_query=packing+hacks+move', 'Packing hack compilations', 'video', 'Evergreen search', 'youtube'),
      ],
      video_ideas: [
        vi({ title: 'One box rule that stopped arguments', hook: 'Kitchen + bathroom only.', why_it_works: 'Conflict reduction hook; couples tag.', format: 'talking_head' }),
        vi({ title: 'Labeling for unload — what movers wish you did', hook: 'Arrow up, room name, fragility.', why_it_works: 'Pro-am collaboration angle.', format: 'interview' }),
        vi({ title: 'Packing party in 90 minutes — timer on screen', hook: 'Music genre by room.', why_it_works: 'Entertainment + utility.', format: 'challenge' }),
      ],
    },
    {
      name: 'Stress, conflict, and partner dynamics',
      resonance: 'high',
      sentiment: 0.12,
      posts_overview:
        'Honest posts about snapping at partners mid-move outperform fake “stress-free” promises. Therapists and organizers stitch these with regulation tips.',
      comments_overview:
        'Heavy “you are not alone” threads; resources for taking breaks.',
      sources: [
        src('https://www.reddit.com/r/MovingOut/', 'r/MovingOut', 'discussion', 'Emotional support', 'reddit'),
      ],
      video_ideas: [
        vi({ title: 'Stress-free is a myth — here is the alternative', hook: 'Name the feeling, then the next step.', why_it_works: 'Authenticity trend; lower bounce.', format: 'talking_head' }),
        vi({ title: 'The two-hour rule: nobody packs hangry', hook: 'Sandwich ASMR optional.', why_it_works: 'Memorable rule; shareable clip.', format: 'short' }),
      ],
    },
    {
      name: 'Insurance, valuables, and documentation',
      resonance: 'medium',
      sentiment: 0.22,
      posts_overview:
        'Photo inventories, riders, and “who packed the box” liability explainers circulate during peak lease turnover.',
      comments_overview:
        'Lawyers and movers debate PBO cartons; viewers want checklists.',
      sources: [
        src('https://www.example.org/move/insurance-basics', 'Move insurance basics', 'web', 'Risk framing', 'web'),
      ],
      video_ideas: [
        vi({ title: 'Photo inventory in ten minutes — room by room', hook: 'Tripod height matters.', why_it_works: 'Practical; reduces claim friction.', format: 'tutorial' }),
        vi({ title: 'What “full value” did not cover in our move', hook: 'One surprise clause.', why_it_works: 'Cautionary tale; high engagement.', format: 'storytime' }),
      ],
    },
    {
      name: 'Local movers vs national brands — trust signals',
      resonance: 'medium',
      sentiment: 0.31,
      posts_overview:
        'Review literacy, crew introductions, and franchise consistency are recurring themes. Community tie-ins perform well in mid-market metros.',
      comments_overview:
        'Users compare referral chains vs app marketplaces; authenticity cues matter.',
      sources: [
        src('https://www.reddit.com/r/FirstTimeHomeBuyer/', 'r/FirstTimeHomeBuyer', 'discussion', 'Vendor selection', 'reddit'),
      ],
      video_ideas: [
        vi({ title: 'Five trust signals we looked for in a local crew', hook: 'Number three is underrated.', why_it_works: 'Checklist saves; B2C trust.', format: 'listicle' }),
        vi({ title: 'Franchise vs independent — one honest tradeoff each', hook: 'No sponsor, just criteria.', why_it_works: 'Neutral frame; comment debate.', format: 'comparison' }),
      ],
    },
  ];
}

function emotionsFor(theme: 'junk' | 'moving'): EmotionBreakdown[] {
  return theme === 'junk'
    ? [
        { emotion: 'Relief', percentage: 28, color: '#34d399' },
        { emotion: 'Curiosity', percentage: 24, color: '#5ba3e6' },
        { emotion: 'Skepticism', percentage: 18, color: '#94a3b8' },
        { emotion: 'Guilt', percentage: 14, color: '#a78bfa' },
        { emotion: 'Excitement', percentage: 16, color: '#e6a55b' },
      ]
    : [
        { emotion: 'Anxiety', percentage: 26, color: '#f59e0b' },
        { emotion: 'Hope', percentage: 22, color: '#34d399' },
        { emotion: 'Exhaustion', percentage: 20, color: '#94a3b8' },
        { emotion: 'Relief', percentage: 18, color: '#5ba3e6' },
        { emotion: 'Pride', percentage: 14, color: '#e879f9' },
      ];
}

function contentBreakdown(theme: 'junk' | 'moving'): ContentBreakdown {
  return theme === 'junk'
    ? {
        intentions: [
          { name: 'Learn pricing and what is included', percentage: 34, engagement_rate: 0.12 },
          { name: 'Compare donation vs landfill outcomes', percentage: 26, engagement_rate: 0.14 },
          { name: 'Find trustworthy crews', percentage: 22, engagement_rate: 0.11 },
          { name: 'Entertainment and before/after', percentage: 18, engagement_rate: 0.1 },
        ],
        categories: [
          { name: 'Home and garage', percentage: 32, engagement_rate: 0.13 },
          { name: 'Estates and transitions', percentage: 24, engagement_rate: 0.11 },
          { name: 'Sustainability', percentage: 22, engagement_rate: 0.12 },
          { name: 'Local services', percentage: 22, engagement_rate: 0.1 },
        ],
        formats: [
          { name: 'POV walkthroughs', percentage: 30, engagement_rate: 0.14 },
          { name: 'Explainers and checklists', percentage: 28, engagement_rate: 0.12 },
          { name: 'Before/after reveals', percentage: 24, engagement_rate: 0.13 },
          { name: 'Comparisons and reviews', percentage: 18, engagement_rate: 0.1 },
        ],
      }
    : {
        intentions: [
          { name: 'Reduce stress and mistakes', percentage: 36, engagement_rate: 0.13 },
          { name: 'Plan logistics and timing', percentage: 28, engagement_rate: 0.12 },
          { name: 'Pack and protect belongings', percentage: 20, engagement_rate: 0.11 },
          { name: 'Compare movers and options', percentage: 16, engagement_rate: 0.1 },
        ],
        categories: [
          { name: 'Local residential moves', percentage: 34, engagement_rate: 0.13 },
          { name: 'Renters and apartments', percentage: 26, engagement_rate: 0.12 },
          { name: 'Family moves', percentage: 22, engagement_rate: 0.11 },
          { name: 'DIY vs pro labor', percentage: 18, engagement_rate: 0.1 },
        ],
        formats: [
          { name: 'Day-in-the-life and timelines', percentage: 32, engagement_rate: 0.14 },
          { name: 'Tips and packing systems', percentage: 28, engagement_rate: 0.12 },
          { name: 'Storytime and honest stress', percentage: 22, engagement_rate: 0.11 },
          { name: 'Comparisons', percentage: 18, engagement_rate: 0.1 },
        ],
      };
}

function conversationThemes(theme: 'junk' | 'moving'): ConversationTheme[] {
  return theme === 'junk'
    ? [
        { theme: 'Donation eligibility and logistics', post_count: 620, sentiment: 0.25, platforms: ['reddit', 'tiktok', 'web'], representative_quotes: ['Will they take upholstered items?', 'Charity rejected — plan B was same-day pickup'] },
        { theme: 'Pricing and truck volume', post_count: 540, sentiment: 0.05, platforms: ['youtube', 'web', 'reddit'], representative_quotes: ['Full truck vs quarter load', 'Stair fee surprise'] },
        { theme: 'Environmental responsibility', post_count: 380, sentiment: 0.48, platforms: ['tiktok', 'web'], representative_quotes: ['Landfill guilt', 'Recycle center line'] },
      ]
    : [
        { theme: 'Timeline and buffer planning', post_count: 710, sentiment: 0.33, platforms: ['tiktok', 'youtube', 'reddit'], representative_quotes: ['Crew was late — buffer saved us', 'Elevator booking'] },
        { theme: 'Relationships and stress', post_count: 490, sentiment: 0.1, platforms: ['reddit', 'tiktok'], representative_quotes: ['Snapped at partner', 'Two-hour rule'] },
        { theme: 'Insurance and documentation', post_count: 340, sentiment: 0.2, platforms: ['web', 'reddit'], representative_quotes: ['Photo inventory', 'PBO boxes'] },
      ];
}

function platformBreakdown(theme: 'junk' | 'moving'): PlatformBreakdown[] {
  return theme === 'junk'
    ? [
        { platform: 'tiktok', post_count: 11800, comment_count: 92000, avg_sentiment: 0.31, top_hashtags: ['junkremoval', 'donation', 'declutter', 'cleanout', 'hauling'] },
        { platform: 'reddit', post_count: 4200, comment_count: 128000, avg_sentiment: 0.18, top_subreddits: JUNK_SUBS.slice(0, 6) },
        { platform: 'youtube', post_count: 2100, comment_count: 198000, avg_sentiment: 0.26, top_channels: ['Home Field Notes', 'Move & Haul Weekly', 'Garage Reset'] },
        { platform: 'web', post_count: TARGET_WEB, comment_count: 0, avg_sentiment: 0.22 },
      ]
    : [
        { platform: 'tiktok', post_count: 14200, comment_count: 104000, avg_sentiment: 0.36, top_hashtags: ['movingday', 'newhome', 'movingtips', 'packing', 'apartment'] },
        { platform: 'reddit', post_count: 5100, comment_count: 156000, avg_sentiment: 0.21, top_subreddits: MOVE_SUBS.slice(0, 6) },
        { platform: 'youtube', post_count: 2600, comment_count: 224000, avg_sentiment: 0.29, top_channels: ['Move Day Cut', 'Box by Box', 'Lease & Keys'] },
        { platform: 'web', post_count: TARGET_WEB, comment_count: 0, avg_sentiment: 0.24 },
      ];
}

function platformSourcesPreview(theme: 'junk' | 'moving', n: number): PlatformSource[] {
  const out: PlatformSource[] = [];
  const hooks = theme === 'junk' ? JUNK_TT : MOVE_TT;
  const subs = theme === 'junk' ? JUNK_SUBS : MOVE_SUBS;
  for (let i = 0; i < n; i++) {
    const hook = hooks[i % hooks.length];
    const plat = (['tiktok', 'youtube', 'reddit', 'web'] as const)[i % 4];
    const vid = `x${i.toString(36)}${(i * 7919).toString(36)}`.replace(/[^a-z0-9]/gi, 'a').slice(0, 11);
    const sub = subs[i % subs.length];
    let url: string;
    let title = hook;
    let author = `creator_${(i % 50) + 1}`;
    let subreddit: string | undefined;

    if (plat === 'tiktok') {
      url = `https://www.tiktok.com/@${theme}_creator_${i % 40}/video/${7200000000000 + i}`;
    } else if (plat === 'youtube') {
      url = `https://www.youtube.com/watch?v=${vid}`;
      title = `${hook} — full segment`;
    } else if (plat === 'reddit') {
      const pid = redditId(i + 400);
      url = `https://www.reddit.com/r/${sub}/comments/${pid}/thread_${i}/`;
      const slug = sub.toLowerCase();
      title = `r/${sub}: ${hook.slice(0, 60)}…`;
      author = `u/${slug}_local_${i % 30}`;
      subreddit = sub;
    } else {
      url = `https://www.example.org/${theme}/analysis/${i}/signals`;
      title = `Signal brief: ${hook.slice(0, 48)}`;
      author = 'editorial_index';
    }

    out.push({
      platform: plat,
      id: `src-${theme}-${i}`,
      url,
      title,
      content: `${hook}. Cross-platform signal used for pillar planning, creative testing, and calendar sequencing.`,
      author,
      subreddit,
      engagement: {
        views: 5000 + i * 777,
        likes: 120 + (i % 400),
        comments: 10 + (i % 80),
        shares: 2 + (i % 30),
        score: plat === 'reddit' ? 40 + (i % 800) : undefined,
      },
      createdAt: new Date(Date.now() - i * 3600000).toISOString(),
      comments: [
        { id: `c1-${i}`, text: 'Saving this for our closing week.', author: 'viewer_a', likes: 24, createdAt: new Date().toISOString() },
        { id: `c2-${i}`, text: 'We needed the logistics tip.', author: 'viewer_b', likes: 18, createdAt: new Date().toISOString() },
      ],
      transcript: plat === 'youtube' ? 'First 500 chars of transcript placeholder for searchability and quote pulls.' : null,
    });
  }
  return out;
}

export function buildCollegeHunksTopicSearchRow(args: {
  query: string;
  clientId: string;
  createdBy: string | null;
  completedAt: string;
  theme: 'junk' | 'moving';
}): Record<string, unknown> {
  const { query, clientId, createdBy, completedAt, theme } = args;

  const serpData: BraveSerpData = {
    webResults: buildWeb(theme),
    discussions: buildDiscussions(theme),
    videos: buildVideos(theme),
  };

  const trendingTopics = theme === 'junk' ? junkTrendingTopics() : movingTrendingTopics();
  const emotions = emotionsFor(theme);
  const content_breakdown = contentBreakdown(theme);
  const platform_breakdown = platformBreakdown(theme);
  const conversation_themes = conversationThemes(theme);

  const raw_ai_response: TopicSearchAIResponse = {
    summary:
      theme === 'junk'
        ? `Conversation volume is concentrated in short-form “sort, donate, haul” narratives and long-thread pricing debates. Homeowners respond to donation-first framing, clear truck-volume math, and crew trust signals (uniforms, walkthrough protocols, written quotes). ` +
          `Secondary clusters cover estate transitions, municipal bulky rules, and eco-guilt reduction. Video-native hooks that win saves combine before/after garage resets, quote spreadsheet walkthroughs, and calm expert myth-busting about what haulers can legally take. ` +
          `This landscape spans roughly ${TARGET_VIDEOS} indexed short-form and long-form video references, ${TARGET_DISCUSSIONS} discussion threads, and ${TARGET_WEB} web explainers in the analysis window.`
        : `The “stress-free move” conversation is dominated by hour-by-hour timelines, packing systems, and honest stress posts that outperform polished perfection. Renters and first-time buyers search elevator logistics, parking permits, and sleep-preserving schedules. ` +
          `Insurance documentation and PBO (packed by owner) liability show up alongside partner-conflict content — authenticity beats polish. Strong formats include moving-day shot lists, labeled-box systems, and crew trust comparisons with neutral criteria. ` +
          `Aggregated signal draws on ${TARGET_VIDEOS} video references, ${TARGET_DISCUSSIONS} discussion threads, and ${TARGET_WEB} supporting articles in the window.`,
    overall_sentiment: theme === 'junk' ? 0.26 : 0.33,
    conversation_intensity: 'very_high',
    emotions,
    content_breakdown,
    trending_topics: trendingTopics,
    big_movers: [
      {
        name: theme === 'junk' ? 'Donation-network partnerships' : 'Local crew reputation',
        type: 'company',
        url: 'https://www.example.org/brands/local-services',
        why: 'Frequent comparison point when shoppers evaluate speed vs reuse outcomes.',
        tactics: ['Proof-of-donation clips', 'Written volume tiers', 'Crew introductions on arrival'],
        takeaway: 'Lead with transparent handling and documentation, then price.',
      },
      {
        name: theme === 'junk' ? 'Declutter creators' : 'Move-day vloggers',
        type: 'creator',
        url: null,
        why: 'Set expectations on stress, pacing, and what “full service” means in practice.',
        tactics: ['Timeline overlays', 'Stitch responses', 'City-specific permit tips'],
        takeaway: 'Partner with mid-tier creators for process templates, not hype.',
      },
    ],
    platform_breakdown,
    conversation_themes,
  };

  const metrics = computeMetricsFromSerp(
    serpData,
    raw_ai_response.overall_sentiment,
    raw_ai_response.conversation_intensity,
    trendingTopics,
    TARGET_VIDEOS + TARGET_DISCUSSIONS + TARGET_WEB,
  );

  const sources = platformSourcesPreview(theme, 120);

  return {
    query,
    source: 'all',
    time_range: 'last_3_months',
    language: 'all',
    country: 'us',
    client_id: clientId,
    search_mode: 'general',
    status: 'completed',
    platforms: ['web', 'reddit', 'youtube', 'tiktok'],
    volume: 'deep',
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
    created_by: createdBy,
    platform_data: {
      stats: platform_breakdown,
      sourceCount: sources.length,
      sources,
      ingestedAt: completedAt,
      queryVariant: theme,
    },
  };
}
