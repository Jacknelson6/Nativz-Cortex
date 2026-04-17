/**
 * Shared types for the TikTok Shop creator insights feature.
 * Field names mirror what the two Apify actors return so we can log the
 * raw payload on first run and refine as we see drift in practice.
 */

// ---------------------------------------------------------------------------
// Phase 1 — affiliate product scraper (george.the.developer/…)
// ---------------------------------------------------------------------------

export interface AffiliateProduct {
  productUrl: string;
  productId: string | null;
  name: string;
  price: number | null;
  priceDisplay: string | null;
  salesCount: number;
  rating: number | null;
  thumbnailUrl: string | null;
  affiliates: AffiliateCreator[];
}

export interface AffiliateCreator {
  username: string;
  nickname: string | null;
  followers: number;
  isVerified: boolean;
  hasCommission: boolean;
}

// ---------------------------------------------------------------------------
// Phase 2 — creator enrichment (lemur/tiktok-shop-creators)
// ---------------------------------------------------------------------------

export interface CreatorDemographic {
  label: string;
  pct: number;
}

export interface CreatorStats {
  gmv: {
    total: number;
    video: number;
    live: number;
  };
  unitsSold30d: number;
  gpm: number;
  commissionRange: string | null;
  brandCollabs: number;
  promotedProducts: number;
  performanceScore: number;
  engagementRate: {
    video: number;
    live: number;
  };
  avgViews: {
    video: number;
    live: number;
  };
  contentFrequency: {
    video: number;
    live: number;
  };
  demographics: {
    age: CreatorDemographic[];
    gender: CreatorDemographic[];
    location: CreatorDemographic[];
  };
  categoryIds: string[];
}

export interface CreatorEnrichment {
  username: string;
  nickname: string | null;
  avatarUrl: string | null;
  region: string | null;
  bio: string | null;
  profileUrl: string;
  stats: CreatorStats;
  /** Raw lemur payload for debugging + forward-compat field access. */
  raw: unknown;
}

// ---------------------------------------------------------------------------
// Ranked creator (what the UI renders)
// ---------------------------------------------------------------------------

import type { AccountType } from './account-type';
import type { CreatorCategory } from './taxonomy';

export interface RankedCreator {
  username: string;
  nickname: string | null;
  avatarUrl: string | null;
  followers: number;
  region: string | null;
  /** Overall 0-100 blend of Traffic + E-commerce Potential. */
  compositeScore: number;
  /**
   * Reach metric — 0-100. Tracks how many eyeballs this creator puts
   * on each post (engagement × followers) combined with posting
   * cadence. Mirrors FastMoss's "Traffic Index".
   */
  trafficIndex: number;
  /**
   * Conversion metric — 0-100. Tracks how effectively this creator
   * turns reach into GMV (GMV × GPM × performance score × brand
   * collabs). Mirrors FastMoss's "Ecommerce Potential Index".
   */
  ecommercePotentialIndex: number;
  /** How many products from this search the creator appears on. */
  categoryProductCount: number;
  /** Derived label — creator / brand_store / agency_operated / unknown. */
  accountType: AccountType;
  /** Human-readable category labels from the lemur enrichment, if any. */
  categories: CreatorCategory[];
  stats: CreatorStats | null;
  /** Products (from Phase 1) this creator promotes — name + price + sales. */
  products: {
    name: string;
    price: number | null;
    priceDisplay: string | null;
    salesCount: number;
    rating: number | null;
    productUrl: string;
  }[];
}

export interface SearchResults {
  products: AffiliateProduct[];
  creators: RankedCreator[];
  /**
   * Regional GMV-share context for the top category observed in this
   * search. Shown as a chip on the results page. Null when we don't
   * have a benchmark for the market or none of the categories match.
   */
  primaryBenchmark?: {
    countryCode: string;
    category: CreatorCategory;
    /** 0-1 share of regional TikTok Shop GMV. */
    gmvShare: number;
    note?: string;
  } | null;
}
