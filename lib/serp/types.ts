// SearXNG search response types

export interface SerpSearchOptions {
  count?: number;
  timeRange?: string;
  country?: string;
  language?: string;
  categories?: string;
  engines?: string;
}

export interface SerpWebResult {
  title: string;
  url: string;
  description: string;
  age?: string;
  extra_snippets?: string[];
}

export interface SerpDiscussion {
  title: string;
  url: string;
  description: string;
  age?: string;
  forum: string;
  answers?: number;
  topComment?: string;
}

export interface SerpVideo {
  title: string;
  url: string;
  description: string;
  age?: string;
  platform: string;
  views?: string;
  creator?: string;
  duration?: string;
}

// Aggregated SERP data we pass to the AI prompt
export interface SerpData {
  webResults: {
    title: string;
    url: string;
    description: string;
    snippets?: string[];
  }[];
  discussions: {
    title: string;
    url: string;
    description: string;
    forum: string;
    answers?: number;
    topComment?: string;
  }[];
  videos: {
    title: string;
    url: string;
    description: string;
    platform: string;
    views?: string;
    creator?: string;
  }[];
}
