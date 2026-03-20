// lib/serper/client.ts — Google SERP data via Serper.dev
//
// Provides Google search results including "People Also Ask" questions,
// which are gold for content ideation. Also returns organic results,
// related searches, and knowledge graph data.

export interface SerperOrganicResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
  date?: string;
  sitelinks?: { title: string; link: string }[];
}

export interface SerperPeopleAlsoAsk {
  question: string;
  snippet: string;
  title: string;
  link: string;
}

export interface SerperRelatedSearch {
  query: string;
}

export interface SerperKnowledgeGraph {
  title?: string;
  type?: string;
  description?: string;
  descriptionSource?: string;
  attributes?: Record<string, string>;
}

export interface SerperSearchResult {
  organic: SerperOrganicResult[];
  peopleAlsoAsk: SerperPeopleAlsoAsk[];
  relatedSearches: SerperRelatedSearch[];
  knowledgeGraph: SerperKnowledgeGraph | null;
  searchParameters: { q: string; gl?: string; hl?: string; num?: number };
}

function getApiKey(): string | null {
  return process.env.SERPER_API_KEY || null;
}

const TIME_RANGE_MAP: Record<string, string> = {
  last_7_days: 'qdr:w',
  last_30_days: 'qdr:m',
  last_3_months: 'qdr:m3',
  last_6_months: 'qdr:m6',
  last_year: 'qdr:y',
};

/**
 * Search Google via Serper.dev API.
 * Returns organic results, People Also Ask, related searches, and knowledge graph.
 */
export async function searchGoogle(
  query: string,
  options: {
    timeRange?: string;
    country?: string;
    language?: string;
    num?: number;
  } = {},
): Promise<SerperSearchResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('Serper search skipped — SERPER_API_KEY not configured');
    return { organic: [], peopleAlsoAsk: [], relatedSearches: [], knowledgeGraph: null, searchParameters: { q: query } };
  }

  try {
    const body: Record<string, unknown> = {
      q: query,
      num: options.num ?? 20,
    };

    if (options.country && options.country !== 'all') body.gl = options.country;
    if (options.language && options.language !== 'all') body.hl = options.language;
    if (options.timeRange && TIME_RANGE_MAP[options.timeRange]) {
      body.tbs = TIME_RANGE_MAP[options.timeRange];
    }

    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.error('Serper API error:', res.status, await res.text());
      return { organic: [], peopleAlsoAsk: [], relatedSearches: [], knowledgeGraph: null, searchParameters: { q: query } };
    }

    const data = await res.json();

    return {
      organic: (data.organic ?? []).map((r: Record<string, unknown>) => ({
        title: (r.title as string) ?? '',
        link: (r.link as string) ?? '',
        snippet: (r.snippet as string) ?? '',
        position: (r.position as number) ?? 0,
        date: (r.date as string) ?? undefined,
        sitelinks: r.sitelinks ?? undefined,
      })),
      peopleAlsoAsk: (data.peopleAlsoAsk ?? []).map((r: Record<string, unknown>) => ({
        question: (r.question as string) ?? '',
        snippet: (r.snippet as string) ?? '',
        title: (r.title as string) ?? '',
        link: (r.link as string) ?? '',
      })),
      relatedSearches: (data.relatedSearches ?? []).map((r: Record<string, unknown>) => ({
        query: (r.query as string) ?? '',
      })),
      knowledgeGraph: data.knowledgeGraph ? {
        title: data.knowledgeGraph.title,
        type: data.knowledgeGraph.type,
        description: data.knowledgeGraph.description,
        descriptionSource: data.knowledgeGraph.descriptionSource,
        attributes: data.knowledgeGraph.attributes,
      } : null,
      searchParameters: { q: query, gl: options.country, hl: options.language, num: options.num },
    };
  } catch (err) {
    console.error('Serper search error:', err);
    return { organic: [], peopleAlsoAsk: [], relatedSearches: [], knowledgeGraph: null, searchParameters: { q: query } };
  }
}

/**
 * Gather Google SERP data for the platform router.
 * Returns normalized PlatformSource-compatible data + People Also Ask questions.
 */
export async function gatherSerperData(
  query: string,
  timeRange: string,
  volume: string = 'medium',
): Promise<{
  results: SerperSearchResult;
  peopleAlsoAsk: SerperPeopleAlsoAsk[];
  relatedSearches: string[];
}> {
  const num = volume === 'deep' ? 30 : volume === 'medium' ? 20 : 10;

  const results = await searchGoogle(query, { timeRange, num });

  return {
    results,
    peopleAlsoAsk: results.peopleAlsoAsk,
    relatedSearches: results.relatedSearches.map(r => r.query),
  };
}
