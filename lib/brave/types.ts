// Brave Search API response types
// Docs: https://api.search.brave.com/app#/web/get-web-search

export interface BraveWebSearchResponse {
  query: {
    original: string;
    altered?: string;
  };
  web?: {
    results: BraveWebResult[];
  };
  discussions?: {
    results: BraveDiscussion[];
  };
  videos?: {
    results: BraveVideo[];
  };
}

export interface BraveWebResult {
  title: string;
  url: string;
  description: string;
  age?: string;
  extra_snippets?: string[];
}

export interface BraveDiscussion {
  title: string;
  url: string;
  description: string;
  age?: string;
  forum_name?: string;
  num_answers?: number;
  score?: string;
  question?: string;
  top_comment?: string;
}

export interface BraveVideo {
  title: string;
  url: string;
  description: string;
  age?: string;
  thumbnail?: {
    src: string;
  };
  meta_url?: {
    hostname: string;
  };
  views?: string;
  creator?: string;
  duration?: string;
}

export interface BraveSearchOptions {
  count?: number;
  freshness?: string;
  country?: string;
  search_lang?: string;
  result_filter?: string;
  extra_snippets?: boolean;
}

// Aggregated SERP data we pass to the AI prompt
export interface BraveSerpData {
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
