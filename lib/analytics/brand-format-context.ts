// VFF-02: Brand-aware ingestion context helpers.
//
// One row per active brand drives the Viral Format Finder ingestion +
// ranking pipelines. Auto-extracted nightly via LLM; strategist can
// override seeds/exclusions/creators from the brand profile editor.
//
// Read by VFF-03 (scraping), VFF-04 (gating), VFF-08 (ranking).

import { z } from 'zod';
import { createOpenRouterRichCompletion } from '@/lib/ai/openrouter-rich';
import { createAdminClient } from '@/lib/supabase/admin';
import type {
  BrandFormatContext,
  BrandFormatContextSource,
  BrandFormatReferenceCreatorHandles,
} from '@/lib/analytics/types';

const GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const EMBED_DIMS = 1536;
const MAX_SEED_TERMS_API = 25;
const MAX_EXTRACTION_TERMS = 20;

export const ExtractionSchema = z.object({
  seed_terms: z.array(z.string().min(1).max(60)).max(MAX_EXTRACTION_TERMS),
  tone_descriptors: z.array(z.string().min(1).max(60)).max(8),
  reference_creator_handles: z.object({
    tiktok: z.array(z.string().min(1).max(60)).max(10),
    instagram: z.array(z.string().min(1).max(60)).max(10),
    youtube: z.array(z.string().min(1).max(60)).max(10),
  }),
  pillar_weights: z.record(z.string(), z.number().min(0).max(1)),
});

export type ExtractionResult = z.infer<typeof ExtractionSchema>;

interface ClientRow {
  id: string;
  name: string | null;
  industry?: string | null;
  services?: unknown;
  caption_notes?: string | null;
}

function buildUserPrompt(client: ClientRow, pillars: string[]): string {
  const services = Array.isArray(client.services)
    ? (client.services as unknown[]).map(String).join(', ')
    : '';
  return [
    `Brand name: ${client.name ?? '(unknown)'}`,
    `Industry: ${client.industry ?? '(unknown)'}`,
    `Services: ${services || '(none)'}`,
    `Caption notes (style guide): ${client.caption_notes ?? '(none)'}`,
    `Recent topic-plan pillars (most recent first): ${
      pillars.length > 0 ? pillars.join(', ') : '(none)'
    }`,
    '',
    'Return STRICT JSON matching this shape:',
    '{',
    '  "seed_terms": [up to 20 short-form video search terms, ranked best to worst],',
    '  "tone_descriptors": [up to 8 adjectives that describe the brand voice],',
    '  "reference_creator_handles": {',
    '    "tiktok": [up to 10 handles WITHOUT @],',
    '    "instagram": [up to 10 handles WITHOUT @],',
    '    "youtube": [up to 10 channel names or @handles]',
    '  },',
    '  "pillar_weights": { "<pillar name>": 0..1 }',
    '}',
  ].join('\n');
}

const SYSTEM_PROMPT =
  'You build a short-form video format research brief for one brand. The brief feeds a discovery pipeline that scrapes TikTok, Instagram Reels, and YouTube Shorts. Output STRICT JSON matching the schema. Sentence case. No em dashes, no en dashes, use commas or periods. Do not invent facts about the brand; if a field is unknown, return an empty array.';

export async function callExtraction(
  client: ClientRow,
  pillars: string[],
): Promise<ExtractionResult> {
  const completion = await createOpenRouterRichCompletion({
    feature: 'vff_brand_format_context',
    temperature: 0.2,
    maxTokens: 1200,
    modelPreference: ['anthropic/claude-sonnet-4.5'],
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(client, pillars) },
    ],
  });
  const text = completion.text.trim();
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd < 0) {
    throw new Error('Extraction returned no JSON object');
  }
  const raw = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  return ExtractionSchema.parse(raw);
}

export async function embedSeedSignal(text: string): Promise<number[] | null> {
  const apiKey = process.env.GOOGLE_AI_STUDIO_KEY ?? process.env.GOOGLE_AI_STUDIO_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `${GEMINI_API_URL}/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${GEMINI_EMBEDDING_MODEL}`,
          content: { parts: [{ text: text.slice(0, 4000) }] },
          outputDimensionality: EMBED_DIMS,
        }),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      embedding?: { values?: number[] };
    };
    return data.embedding?.values ?? null;
  } catch {
    return null;
  }
}

function normalizeCreatorHandles(
  raw: unknown,
): BrandFormatReferenceCreatorHandles {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  const pick = (k: 'tiktok' | 'instagram' | 'youtube'): string[] => {
    const v = obj[k];
    return Array.isArray(v) ? v.map(String).slice(0, 20) : [];
  };
  return {
    tiktok: pick('tiktok'),
    instagram: pick('instagram'),
    youtube: pick('youtube'),
  };
}

function clampStringArray(arr: string[] | undefined, max: number): string[] {
  if (!arr) return [];
  return arr
    .map((s) => String(s).trim())
    .filter((s) => s.length > 0)
    .slice(0, max);
}

export interface UpsertPayload {
  client_id: string;
  seed_terms?: string[];
  excluded_terms?: string[];
  reference_creator_handles?: Partial<BrandFormatReferenceCreatorHandles>;
  tone_descriptors?: string[];
  pillar_weights?: Record<string, number>;
  source?: BrandFormatContextSource;
}

export async function upsertBrandFormatContext(
  payload: UpsertPayload,
): Promise<BrandFormatContext | null> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('brand_format_context')
    .select('*')
    .eq('client_id', payload.client_id)
    .maybeSingle();

  const merged = {
    client_id: payload.client_id,
    seed_terms: clampStringArray(
      payload.seed_terms ??
        (existing as { seed_terms?: string[] } | null)?.seed_terms,
      MAX_SEED_TERMS_API,
    ),
    excluded_terms: clampStringArray(
      payload.excluded_terms ??
        (existing as { excluded_terms?: string[] } | null)?.excluded_terms,
      MAX_SEED_TERMS_API,
    ),
    reference_creator_handles: {
      ...((existing as {
        reference_creator_handles?: BrandFormatReferenceCreatorHandles;
      } | null)?.reference_creator_handles ?? {
        tiktok: [],
        instagram: [],
        youtube: [],
      }),
      ...(payload.reference_creator_handles ?? {}),
    },
    tone_descriptors: clampStringArray(
      payload.tone_descriptors ??
        (existing as { tone_descriptors?: string[] } | null)?.tone_descriptors,
      15,
    ),
    pillar_weights:
      payload.pillar_weights ??
      (existing as { pillar_weights?: Record<string, number> } | null)
        ?.pillar_weights ??
      {},
    source: payload.source ?? 'manual',
    last_recomputed_at: new Date().toISOString(),
  };

  // Recompute embedding inline whenever a write lands.
  const embeddingInput = [
    merged.seed_terms.join(', '),
    merged.tone_descriptors.join(', '),
  ]
    .filter(Boolean)
    .join(' | ');
  const embedding = embeddingInput
    ? await embedSeedSignal(embeddingInput)
    : null;

  const { data: written, error } = await admin
    .from('brand_format_context')
    .upsert(
      { ...merged, seed_embedding: embedding },
      { onConflict: 'client_id' },
    )
    .select('*')
    .single();
  if (error || !written) return null;
  return written as unknown as BrandFormatContext;
}

export async function computeBrandFormatContext(
  clientId: string,
): Promise<BrandFormatContext | null> {
  const admin = createAdminClient();
  const { data: client } = await admin
    .from('clients')
    .select('id, name, industry, services, caption_notes')
    .eq('id', clientId)
    .maybeSingle();
  if (!client) return null;

  const { data: plans } = await admin
    .from('topic_plans')
    .select('plan_json, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(3);

  const pillars: string[] = [];
  for (const plan of (plans ?? []) as Array<{ plan_json: unknown }>) {
    const p = plan.plan_json as { pillars?: unknown } | null;
    if (p && Array.isArray(p.pillars)) {
      for (const pillar of p.pillars as unknown[]) {
        const name =
          typeof pillar === 'string'
            ? pillar
            : (pillar as { name?: string } | null)?.name;
        if (name && !pillars.includes(name)) pillars.push(name);
      }
    }
  }

  let extracted: ExtractionResult;
  try {
    extracted = await callExtraction(client as ClientRow, pillars);
  } catch {
    return null;
  }

  return upsertBrandFormatContext({
    client_id: clientId,
    seed_terms: extracted.seed_terms,
    tone_descriptors: extracted.tone_descriptors,
    reference_creator_handles: normalizeCreatorHandles(
      extracted.reference_creator_handles,
    ),
    pillar_weights: extracted.pillar_weights,
    source: 'auto',
  });
}

export async function getBrandFormatSeeds(
  clientId: string,
): Promise<BrandFormatContext | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('brand_format_context')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle();
  return (data as unknown as BrandFormatContext) ?? null;
}

export const __TEST__ = {
  normalizeCreatorHandles,
  clampStringArray,
  MAX_SEED_TERMS_API,
  MAX_EXTRACTION_TERMS,
};
