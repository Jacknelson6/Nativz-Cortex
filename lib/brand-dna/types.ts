import type {
  BrandColor,
  BrandFont,
  BrandLogo,
  BrandScreenshot,
  ProductItem,
  DesignStyle,
  BrandGuidelineMetadata,
} from '@/lib/knowledge/types';

/** A page crawled for Brand DNA extraction — includes raw HTML for CSS/meta parsing */
export interface CrawledPage {
  url: string;
  html: string;
  title: string;
  content: string;
  wordCount: number;
  /** Page classification: homepage, about, product, contact, blog, other */
  pageType: 'homepage' | 'about' | 'product' | 'contact' | 'blog' | 'other';
}

/** Raw data collected from all extractors before compilation */
export interface BrandDNARawData {
  clientName: string;
  websiteUrl: string;
  pages: CrawledPage[];
  colors: BrandColor[];
  fonts: BrandFont[];
  logos: BrandLogo[];
  screenshots: BrandScreenshot[];
  products: ProductItem[];
  designStyle: DesignStyle | null;
  verbalIdentity: {
    tonePrimary: string;
    voiceAttributes: string[];
    messagingPillars: string[];
    vocabularyPatterns: string[];
    avoidancePatterns: string[];
    targetAudienceSummary: string;
    competitivePositioning: string;
  } | null;
  uploadedContent: string | null;
}

/** Compiled Brand DNA document ready to store */
export interface CompiledBrandDNA {
  content: string;
  metadata: BrandGuidelineMetadata;
}

/** Progress callback for the orchestrator */
export type ProgressCallback = (status: string, progressPct: number, stepLabel: string) => Promise<void>;

export { BrandColor, BrandFont, BrandLogo, BrandScreenshot, ProductItem, DesignStyle, BrandGuidelineMetadata };
