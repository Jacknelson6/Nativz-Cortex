export type TrendReportCadence = 'weekly' | 'biweekly' | 'monthly';

export interface TrendReportMention {
  url: string;
  title: string;
  snippet: string;
  engine: string;
  source_domain: string;
  publishedDate: string | null;
  matchedBrands: string[];
  matchedKeywords: string[];
  sentimentGuess: 'positive' | 'neutral' | 'negative' | 'mixed' | 'unknown';
}

export interface TrendReportBrandBucket {
  brand_name: string;
  mention_count: number;
  top_urls: string[];
}

export interface TrendReportKeywordBucket {
  keyword: string;
  mention_count: number;
  top_urls: string[];
}

export interface TrendReportFindings {
  total_mentions: number;
  brand_buckets: TrendReportBrandBucket[];
  keyword_buckets: TrendReportKeywordBucket[];
  top_mentions: TrendReportMention[];
  themes: string[];
}

export interface TrendReportData {
  subscription_id: string;
  subscription_name: string;
  client_id: string | null;
  client_name: string;
  client_agency: 'nativz' | 'anderson' | string;
  organization_id: string | null;

  topic_query: string;
  keywords: string[];
  brand_names: string[];
  platforms: string[];

  cadence: TrendReportCadence;
  period_start: string;
  period_end: string;

  summary: string;
  findings: TrendReportFindings;

  generated_at: string;
}
