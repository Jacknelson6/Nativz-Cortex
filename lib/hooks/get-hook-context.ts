import hookTemplatesData from './hook-templates.json';
import { createAdminClient } from '@/lib/supabase/admin';

export interface HookContextOptions {
  /** Search ID to pull scraped hook patterns from */
  searchId?: string;
  /** Max number of static templates to include (random sample) */
  maxTemplates?: number;
  /** Specific categories to draw from (omit for all) */
  categories?: string[];
}

interface HookTemplatesJson {
  total: number;
  categories: Record<string, string[]>;
}

const templates = hookTemplatesData as HookTemplatesJson;

/**
 * Get a curated set of hook templates + any scraped hooks from a topic search.
 * Returns a formatted context block ready to inject into an idea generation prompt.
 */
export async function getHookContext(options: HookContextOptions = {}): Promise<string | null> {
  const { searchId, maxTemplates = 30, categories } = options;
  const parts: string[] = [];

  // 1. Static hook templates (random sample from requested categories)
  const availableCategories = categories ?? Object.keys(templates.categories);
  const allTemplateHooks: string[] = [];

  for (const cat of availableCategories) {
    const hooks = templates.categories[cat];
    if (hooks) allTemplateHooks.push(...hooks);
  }

  if (allTemplateHooks.length > 0) {
    // Sample randomly so the LLM sees variety across generations
    const sampled = sampleArray(allTemplateHooks, maxTemplates);
    parts.push(
      `## Hook templates (proven patterns — adapt to brand/topic)\n${sampled.map((h, i) => `${i + 1}. ${h}`).join('\n')}`,
    );
  }

  // 2. Scraped hooks from topic search (if provided)
  if (searchId) {
    try {
      const admin = createAdminClient();
      const { data: scrapedHooks } = await admin
        .from('topic_search_hooks')
        .select('pattern, video_count, avg_views, avg_outlier_score')
        .eq('search_id', searchId)
        .order('avg_views', { ascending: false })
        .limit(15);

      if (scrapedHooks && scrapedHooks.length > 0) {
        const hookLines = scrapedHooks.map(
          (h) => `- "${h.pattern}" (${h.video_count} videos, ${formatNumber(h.avg_views)} avg views, ${h.avg_outlier_score?.toFixed(1) ?? '?'}x outlier)`,
        );
        parts.push(
          `## Trending hooks from real videos (high-performing patterns found in scraped data)\n${hookLines.join('\n')}`,
        );
      }
    } catch (err) {
      console.error('[get-hook-context] Failed to fetch scraped hooks:', err);
    }
  }

  if (parts.length === 0) return null;

  return `<hook_inspiration>\nUse these hook patterns as inspiration for video ideas. Adapt the templates to fit the brand, topic, and audience. The trending hooks from real videos are especially valuable — they're proven to perform.\n\n${parts.join('\n\n')}\n</hook_inspiration>`;
}

/** Get all available hook categories and their counts */
export function getHookCategories(): { name: string; count: number }[] {
  return Object.entries(templates.categories).map(([name, hooks]) => ({
    name,
    count: hooks.length,
  }));
}

/** Get total number of hook templates */
export function getHookTemplateCount(): number {
  return templates.total;
}

function sampleArray<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return [...arr];
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, n);
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
