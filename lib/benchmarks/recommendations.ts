// ─── Creative Benchmarks 2026 — Vertical Recommendations ─────────────────────
// Maps client industries to benchmark verticals and returns top ad format recs.
// Source: $1.3B in tracked ad spend, 578,750 creatives, 6,015 advertisers

// ─── Types ───────────────────────────────────────────────────────────────────

export type BenchmarkVertical =
  | 'Health & Wellness'
  | 'Fashion & Apparel'
  | 'Beauty & Personal Care'
  | 'Home & Lifestyle'
  | 'Technology'
  | 'Food & Nutrition'
  | 'Fitness & Sports'
  | 'Entertainment & Media'
  | 'Finance'
  | 'Education'
  | 'Travel & Hospitality'
  | 'Professional Services'
  | 'Automotive'
  | 'Parenting & Family'
  | 'Pets'
  | 'Other';

export interface VisualStyleRec {
  name: string;
  hitRatePct: number;
  spendUseRatio: number;
}

export interface HookRec {
  name: string;
  hitRatePct: number;
}

export interface AssetTypeRec {
  name: string;
  hitRatePct: number;
}

export interface VerticalRecommendations {
  vertical: BenchmarkVertical;
  visualStyles: VisualStyleRec[];
  hooks: HookRec[];
  assetTypes: AssetTypeRec[];
}

// ─── Fuzzy industry → vertical mapping ───────────────────────────────────────

const VERTICAL_KEYWORDS: Record<BenchmarkVertical, string[]> = {
  'Health & Wellness': ['health', 'wellness', 'supplement', 'vitamin', 'medical', 'pharma', 'healthcare', 'mental health', 'therapy', 'holistic', 'nutrition', 'naturopath'],
  'Fashion & Apparel': ['fashion', 'apparel', 'clothing', 'wear', 'style', 'boutique', 'shoes', 'accessori', 'jewelry', 'luxury', 'streetwear'],
  'Beauty & Personal Care': ['beauty', 'skincare', 'cosmetic', 'makeup', 'hair', 'personal care', 'grooming', 'fragrance', 'salon', 'spa'],
  'Home & Lifestyle': ['home', 'interior', 'furniture', 'decor', 'garden', 'lifestyle', 'living', 'household', 'kitchen', 'cleaning'],
  'Technology': ['tech', 'software', 'saas', 'app', 'digital', 'ai', 'cyber', 'cloud', 'hardware', 'electronics', 'gadget'],
  'Food & Nutrition': ['food', 'restaurant', 'dining', 'meal', 'snack', 'beverage', 'drink', 'coffee', 'catering', 'bakery', 'fast-casual', 'fast casual', 'cuisine'],
  'Fitness & Sports': ['fitness', 'sport', 'gym', 'workout', 'athletic', 'training', 'exercise', 'crossfit', 'yoga', 'pilates', 'martial'],
  'Entertainment & Media': ['entertainment', 'media', 'streaming', 'gaming', 'game', 'music', 'film', 'movie', 'podcast', 'content creator', 'influencer'],
  'Finance': ['finance', 'fintech', 'banking', 'insurance', 'invest', 'crypto', 'trading', 'wealth', 'accounting', 'tax', 'mortgage', 'loan'],
  'Education': ['education', 'edtech', 'learning', 'school', 'university', 'course', 'tutoring', 'training', 'academy', 'certification'],
  'Travel & Hospitality': ['travel', 'hotel', 'hospitality', 'tourism', 'resort', 'airline', 'vacation', 'booking', 'destination'],
  'Professional Services': ['consulting', 'professional', 'legal', 'law firm', 'agency', 'marketing agency', 'accounting firm', 'staffing', 'recruitment', 'hr'],
  'Automotive': ['auto', 'car', 'vehicle', 'motor', 'driving', 'dealership', 'ev', 'electric vehicle', 'truck'],
  'Parenting & Family': ['parent', 'baby', 'child', 'kid', 'family', 'maternity', 'toddler', 'infant', 'mom', 'dad'],
  'Pets': ['pet', 'dog', 'cat', 'animal', 'veterinary', 'vet', 'grooming pet'],
  'Other': [],
};

function matchVertical(industry: string): BenchmarkVertical {
  const lower = industry.toLowerCase();

  let bestMatch: BenchmarkVertical = 'Other';
  let bestScore = 0;

  for (const [vertical, keywords] of Object.entries(VERTICAL_KEYWORDS) as [BenchmarkVertical, string[]][]) {
    if (vertical === 'Other') continue;
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        // Longer keyword matches are stronger signals
        score += kw.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = vertical;
    }
  }

  return bestMatch;
}

// ─── Per-vertical visual style data (CH-010) ─────────────────────────────────

const VISUAL_STYLES: Record<BenchmarkVertical, VisualStyleRec[]> = {
  'Health & Wellness': [
    { name: 'Before / after', hitRatePct: 12.4, spendUseRatio: 1.6 },
    { name: 'UGC / creator-led', hitRatePct: 9.8, spendUseRatio: 1.3 },
    { name: 'Testimonial / review', hitRatePct: 8.2, spendUseRatio: 1.1 },
    { name: 'Product demo / showcase', hitRatePct: 7.1, spendUseRatio: 0.9 },
    { name: 'Lifestyle / aspirational', hitRatePct: 5.5, spendUseRatio: 0.8 },
  ],
  'Fashion & Apparel': [
    { name: 'Lifestyle / aspirational', hitRatePct: 11.2, spendUseRatio: 1.5 },
    { name: 'UGC / creator-led', hitRatePct: 10.1, spendUseRatio: 1.4 },
    { name: 'Product demo / showcase', hitRatePct: 8.8, spendUseRatio: 1.2 },
    { name: 'Meme / trend-jacking', hitRatePct: 6.3, spendUseRatio: 1.1 },
    { name: 'Behind-the-scenes', hitRatePct: 5.0, spendUseRatio: 0.9 },
  ],
  'Beauty & Personal Care': [
    { name: 'Before / after', hitRatePct: 13.1, spendUseRatio: 1.7 },
    { name: 'UGC / creator-led', hitRatePct: 10.5, spendUseRatio: 1.4 },
    { name: 'Tutorial / how-to', hitRatePct: 8.9, spendUseRatio: 1.2 },
    { name: 'Testimonial / review', hitRatePct: 7.6, spendUseRatio: 1.0 },
    { name: 'Product demo / showcase', hitRatePct: 6.2, spendUseRatio: 0.9 },
  ],
  'Home & Lifestyle': [
    { name: 'Before / after', hitRatePct: 10.8, spendUseRatio: 1.5 },
    { name: 'Product demo / showcase', hitRatePct: 9.4, spendUseRatio: 1.2 },
    { name: 'UGC / creator-led', hitRatePct: 8.1, spendUseRatio: 1.1 },
    { name: 'Lifestyle / aspirational', hitRatePct: 7.3, spendUseRatio: 1.0 },
    { name: 'Behind-the-scenes', hitRatePct: 4.8, spendUseRatio: 0.8 },
  ],
  'Technology': [
    { name: 'Product demo / showcase', hitRatePct: 11.5, spendUseRatio: 1.5 },
    { name: 'Text-heavy / educational', hitRatePct: 9.2, spendUseRatio: 1.3 },
    { name: 'UGC / creator-led', hitRatePct: 7.8, spendUseRatio: 1.0 },
    { name: 'Comparison / vs', hitRatePct: 7.1, spendUseRatio: 1.2 },
    { name: 'Testimonial / review', hitRatePct: 5.9, spendUseRatio: 0.9 },
  ],
  'Food & Nutrition': [
    { name: 'UGC / creator-led', hitRatePct: 10.2, spendUseRatio: 1.4 },
    { name: 'Behind-the-scenes', hitRatePct: 9.1, spendUseRatio: 1.3 },
    { name: 'Product demo / showcase', hitRatePct: 8.4, spendUseRatio: 1.1 },
    { name: 'Before / after', hitRatePct: 6.8, spendUseRatio: 1.0 },
    { name: 'Lifestyle / aspirational', hitRatePct: 5.5, spendUseRatio: 0.9 },
  ],
  'Fitness & Sports': [
    { name: 'Before / after', hitRatePct: 13.8, spendUseRatio: 1.8 },
    { name: 'UGC / creator-led', hitRatePct: 11.2, spendUseRatio: 1.5 },
    { name: 'Testimonial / review', hitRatePct: 8.5, spendUseRatio: 1.1 },
    { name: 'Product demo / showcase', hitRatePct: 6.9, spendUseRatio: 0.9 },
    { name: 'Meme / trend-jacking', hitRatePct: 5.1, spendUseRatio: 1.0 },
  ],
  'Entertainment & Media': [
    { name: 'UGC / creator-led', hitRatePct: 11.8, spendUseRatio: 1.5 },
    { name: 'Behind-the-scenes', hitRatePct: 9.6, spendUseRatio: 1.3 },
    { name: 'Meme / trend-jacking', hitRatePct: 8.2, spendUseRatio: 1.2 },
    { name: 'Lifestyle / aspirational', hitRatePct: 6.4, spendUseRatio: 0.9 },
    { name: 'Product demo / showcase', hitRatePct: 5.1, spendUseRatio: 0.8 },
  ],
  'Finance': [
    { name: 'Testimonial / review', hitRatePct: 10.4, spendUseRatio: 1.4 },
    { name: 'Text-heavy / educational', hitRatePct: 9.1, spendUseRatio: 1.3 },
    { name: 'UGC / creator-led', hitRatePct: 7.5, spendUseRatio: 1.0 },
    { name: 'Before / after', hitRatePct: 6.8, spendUseRatio: 1.1 },
    { name: 'Comparison / vs', hitRatePct: 5.3, spendUseRatio: 0.9 },
  ],
  'Education': [
    { name: 'Text-heavy / educational', hitRatePct: 12.1, spendUseRatio: 1.6 },
    { name: 'UGC / creator-led', hitRatePct: 8.9, spendUseRatio: 1.2 },
    { name: 'Product demo / showcase', hitRatePct: 7.4, spendUseRatio: 1.0 },
    { name: 'Testimonial / review', hitRatePct: 6.8, spendUseRatio: 1.1 },
    { name: 'Before / after', hitRatePct: 5.2, spendUseRatio: 0.9 },
  ],
  'Travel & Hospitality': [
    { name: 'Lifestyle / aspirational', hitRatePct: 12.6, spendUseRatio: 1.7 },
    { name: 'UGC / creator-led', hitRatePct: 9.8, spendUseRatio: 1.3 },
    { name: 'Before / after', hitRatePct: 7.9, spendUseRatio: 1.1 },
    { name: 'Product demo / showcase', hitRatePct: 6.5, spendUseRatio: 0.9 },
    { name: 'Behind-the-scenes', hitRatePct: 4.7, spendUseRatio: 0.8 },
  ],
  'Professional Services': [
    { name: 'Testimonial / review', hitRatePct: 11.3, spendUseRatio: 1.5 },
    { name: 'Text-heavy / educational', hitRatePct: 9.7, spendUseRatio: 1.4 },
    { name: 'UGC / creator-led', hitRatePct: 7.2, spendUseRatio: 1.0 },
    { name: 'Comparison / vs', hitRatePct: 6.1, spendUseRatio: 1.1 },
    { name: 'Product demo / showcase', hitRatePct: 5.4, spendUseRatio: 0.9 },
  ],
  'Automotive': [
    { name: 'Product demo / showcase', hitRatePct: 12.2, spendUseRatio: 1.6 },
    { name: 'Lifestyle / aspirational', hitRatePct: 9.5, spendUseRatio: 1.3 },
    { name: 'UGC / creator-led', hitRatePct: 8.1, spendUseRatio: 1.1 },
    { name: 'Behind-the-scenes', hitRatePct: 6.3, spendUseRatio: 1.0 },
    { name: 'Comparison / vs', hitRatePct: 5.0, spendUseRatio: 0.9 },
  ],
  'Parenting & Family': [
    { name: 'UGC / creator-led', hitRatePct: 12.8, spendUseRatio: 1.7 },
    { name: 'Testimonial / review', hitRatePct: 9.4, spendUseRatio: 1.3 },
    { name: 'Before / after', hitRatePct: 7.6, spendUseRatio: 1.1 },
    { name: 'Product demo / showcase', hitRatePct: 6.9, spendUseRatio: 1.0 },
    { name: 'Behind-the-scenes', hitRatePct: 5.2, spendUseRatio: 0.9 },
  ],
  'Pets': [
    { name: 'UGC / creator-led', hitRatePct: 13.5, spendUseRatio: 1.8 },
    { name: 'Behind-the-scenes', hitRatePct: 10.1, spendUseRatio: 1.4 },
    { name: 'Product demo / showcase', hitRatePct: 8.3, spendUseRatio: 1.1 },
    { name: 'Testimonial / review', hitRatePct: 6.7, spendUseRatio: 1.0 },
    { name: 'Before / after', hitRatePct: 5.4, spendUseRatio: 0.9 },
  ],
  // Overall CH-009 fallback
  'Other': [
    { name: 'Offer-first banner', hitRatePct: 8.6, spendUseRatio: 1.3 },
    { name: 'Unboxing', hitRatePct: 9.8, spendUseRatio: 1.3 },
    { name: 'Product demo / showcase', hitRatePct: 8.1, spendUseRatio: 1.0 },
    { name: 'Testimonial / review', hitRatePct: 6.5, spendUseRatio: 1.0 },
    { name: 'Celebrity', hitRatePct: 5.9, spendUseRatio: 2.1 },
  ],
};

// ─── Overall hooks (CH-011) ──────────────────────────────────────────────────

const HOOKS: HookRec[] = [
  { name: 'Newness', hitRatePct: 9.2 },
  { name: 'Sale announcement', hitRatePct: 8.7 },
  { name: 'Price anchor', hitRatePct: 8.1 },
  { name: 'Urgency', hitRatePct: 7.6 },
  { name: 'Announcement', hitRatePct: 7.2 },
  { name: 'Offer only', hitRatePct: 6.8 },
  { name: 'FOMO', hitRatePct: 6.4 },
];

// ─── Overall asset types (CH-012) ────────────────────────────────────────────

const ASSET_TYPES: AssetTypeRec[] = [
  { name: 'Text only', hitRatePct: 9.4 },
  { name: 'Product image with text', hitRatePct: 8.8 },
  { name: 'UGC', hitRatePct: 8.2 },
  { name: 'Lifestyle-product image', hitRatePct: 7.5 },
];

// ─── Public API ──────────────────────────────────────────────────────────────

export function getVerticalRecommendations(industry: string): VerticalRecommendations | null {
  if (!industry || !industry.trim()) return null;

  const vertical = matchVertical(industry);
  const visualStyles = VISUAL_STYLES[vertical];

  if (!visualStyles || visualStyles.length === 0) return null;

  return {
    vertical,
    visualStyles: visualStyles.slice(0, 5),
    hooks: HOOKS.slice(0, 5),
    assetTypes: ASSET_TYPES.slice(0, 3),
  };
}
