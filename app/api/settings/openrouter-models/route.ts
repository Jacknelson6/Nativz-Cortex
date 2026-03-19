import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
  contextLength: number;
  inputModalities: string[];
  outputModalities: string[];
  promptPrice: number;   // per 1M tokens
  completionPrice: number; // per 1M tokens
  isFree: boolean;
}

// In-memory cache (10 min TTL) — models list rarely changes
let cached: OpenRouterModel[] | null = null;
let cachedAt = 0;
const CACHE_TTL = 10 * 60 * 1000;

/**
 * GET /api/settings/openrouter-models
 *
 * Fetch all OpenRouter models with pricing and capability info.
 * Cached server-side for 10 minutes to avoid hammering the API.
 *
 * @auth Required (any authenticated user)
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL) {
    return NextResponse.json({ models: cached });
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: 600 },
    });

    if (!res.ok) {
      throw new Error(`OpenRouter API error: ${res.status}`);
    }

    const json = await res.json();
    const raw = json.data ?? [];

    const models: OpenRouterModel[] = raw.map((m: Record<string, unknown>) => {
      const arch = m.architecture as { input_modalities?: string[]; output_modalities?: string[] } | undefined;
      const pricing = m.pricing as { prompt?: string; completion?: string } | undefined;
      const promptPerToken = parseFloat(pricing?.prompt ?? '0');
      const completionPerToken = parseFloat(pricing?.completion ?? '0');

      // OpenRouter uses -1 as sentinel for "variable pricing" (auto-router models)
      const isVariable = promptPerToken < 0 || completionPerToken < 0;

      return {
        id: m.id as string,
        name: (m.name as string) || (m.id as string),
        description: (m.description as string) || '',
        contextLength: (m.context_length as number) || 0,
        inputModalities: arch?.input_modalities ?? ['text'],
        outputModalities: arch?.output_modalities ?? ['text'],
        promptPrice: isVariable ? -1 : promptPerToken * 1_000_000,
        completionPrice: isVariable ? -1 : completionPerToken * 1_000_000,
        isFree: !isVariable && promptPerToken === 0 && completionPerToken === 0,
      };
    });

    // Sort: free models first, then by name
    models.sort((a, b) => {
      if (a.isFree !== b.isFree) return a.isFree ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    cached = models;
    cachedAt = now;

    return NextResponse.json({ models });
  } catch (err) {
    console.error('Failed to fetch OpenRouter models:', err);
    // Return cached data if available, even if stale
    if (cached) return NextResponse.json({ models: cached });
    return NextResponse.json({ error: 'Failed to fetch models' }, { status: 502 });
  }
}
