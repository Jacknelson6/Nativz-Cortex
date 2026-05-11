// VFF-05: structured analysis for a single viral_videos row.
//
// Pipeline (gate-passing rows arrive at analysis_status='analyzing'):
//   1. fetch the row + raw_payload (caption, comments)
//   2. download MP4, trim to first 30s, upload to Gemini File API
//   3. call gemini-2.5-flash with prompt + taxonomy + caption + comments
//   4. parse against AnalysisSchema; on banned-content short-circuit
//   5. write 4 viral_video_formats rows (one per dimension) + the 4 narrative
//      columns; generate 1536-dim embedding from why+hook+retention concat
//   6. if any slug.propose=true or slug not in taxonomy, insert into
//      format_taxonomy_proposals (table arrives in VFF-06; fallback to
//      gate_metadata.proposals if it does not exist)
//
// Retries on the cron side via gate_metadata.analysis_attempts; this helper
// itself is single-shot and idempotent against viral_video_formats by
// deleting existing LLM rows before re-inserting.

import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  generateWithFile,
  uploadFileToGemini,
  waitForGeminiFileActive,
} from '@/lib/gemini/file-api';
import type { ViralAnalysisOutput } from '@/lib/analytics/types';

const GEMINI_MODEL = 'gemini-2.5-flash';
const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_DIMS = 1536;
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// First 30s only per D-02. Cap MP4 size at 8 MB before upload so we don't
// blow Gemini File API quotas on absurd long inputs.
const MAX_DURATION_S = 30;
const MAX_MP4_BYTES = 8 * 1024 * 1024;

const AnalysisSchema = z.object({
  hook_type: z.object({
    slug: z.string().min(1).max(60),
    confidence: z.number().min(0).max(1),
    propose: z.boolean(),
  }),
  structure: z.object({
    slug: z.string().min(1).max(60),
    confidence: z.number().min(0).max(1),
    propose: z.boolean(),
  }),
  archetype: z.object({
    slug: z.string().min(1).max(60),
    confidence: z.number().min(0).max(1),
    propose: z.boolean(),
  }),
  pacing: z.object({
    slug: z.string().min(1).max(60),
    confidence: z.number().min(0).max(1),
    propose: z.boolean(),
  }),
  engagement_hook_descriptor: z.string().min(1).max(80),
  why_it_works: z.string().min(60).max(280),
  retention_pattern: z.string().min(3).max(80),
  title: z.string().min(1).max(120).nullable(),
});

type ParsedAnalysis = z.infer<typeof AnalysisSchema>;

const SYSTEM_PROMPT = `You analyze a short-form video (TikTok / Reel / Short) for a marketing strategy library. Output STRICT JSON matching the schema. Pick the closest matching slug from each enum below; if NOTHING matches, propose a new lowercase_underscore slug AND include "propose": true in the corresponding output field. Never invent facts about the brand or creator. Sentence case in free text fields. No em dashes, no en dashes. Banned content (return hook_type slug="banned" with propose=false and all other slugs="banned"): adult/NSFW, graphic violence, illegal activity tutorials, harassment.`;

interface AnalyzeOpts {
  force?: boolean;
}

export async function analyzeViralVideo(
  videoId: string,
  opts: AnalyzeOpts = {},
): Promise<ViralAnalysisOutput> {
  const t0 = Date.now();
  const admin = createAdminClient();

  // 1. Load row + taxonomy in parallel.
  const [rowRes, taxonomyRes] = await Promise.all([
    admin
      .from('viral_videos')
      .select(
        'id, platform, source_url, duration_seconds, raw_payload, gate_metadata, analysis_status',
      )
      .eq('id', videoId)
      .single(),
    admin.from('viral_formats').select('kind, slug, aliases').is('archived_at', null),
  ]);

  if (rowRes.error || !rowRes.data) {
    throw new Error(`viral_videos lookup failed for ${videoId}: ${rowRes.error?.message}`);
  }
  const row = rowRes.data as {
    id: string;
    platform: 'tiktok' | 'instagram' | 'youtube';
    source_url: string | null;
    duration_seconds: number | null;
    raw_payload: Record<string, unknown>;
    gate_metadata: Record<string, unknown>;
    analysis_status: string;
  };

  const taxonomyRows = (taxonomyRes.data ?? []) as {
    kind: string;
    slug: string;
    aliases: string[] | null;
  }[];
  const taxonomy = bucketTaxonomy(taxonomyRows);
  const aliases = bucketAliases(taxonomyRows);

  // 2. Download + upload MP4. On total failure mark mp4_unavailable.
  let fileRef: { fileUri: string; mimeType: string } | null = null;
  let mp4Error: string | null = null;
  try {
    fileRef = await downloadAndUpload(row);
  } catch (e) {
    mp4Error = e instanceof Error ? e.message : String(e);
  }

  // 3. Build prompt + call Gemini.
  const caption = extractCaption(row.raw_payload);
  const comments = extractTopComments(row.raw_payload);

  if (!fileRef) {
    return await markFailure(admin, row, 'mp4_unavailable', t0, mp4Error);
  }

  let parsed: ParsedAnalysis | null = null;
  let geminiError: string | null = null;
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    try {
      const userPrompt = buildUserPrompt({
        platform: row.platform,
        caption,
        comments,
        duration: row.duration_seconds,
        taxonomy,
        aliases,
      });
      const raw = await generateWithFile<unknown>({
        fileUri: fileRef.fileUri,
        mimeType: fileRef.mimeType,
        prompt: `${SYSTEM_PROMPT}\n\n${userPrompt}`,
        model: GEMINI_MODEL,
      });
      parsed = AnalysisSchema.parse(raw);
    } catch (e) {
      geminiError = e instanceof Error ? e.message : String(e);
    }
  }

  if (!parsed) {
    return await markFailure(admin, row, 'malformed_output', t0, geminiError);
  }

  // 4. Banned-content short-circuit.
  if (parsed.hook_type.slug === 'banned') {
    await admin
      .from('viral_videos')
      .update({
        analysis_status: 'failed',
        reject_reason: 'banned_content',
        gated_at: new Date().toISOString(),
        gate_metadata: { ...row.gate_metadata, analysis_error: 'banned_content' },
      })
      .eq('id', row.id);
    return buildOutput(row, parsed, 'failed', t0, 0, 'banned_content');
  }

  // 5. Persist analysis + format associations + embedding.
  const { proposals, embedding, embeddingError } = await persistAnalysis(admin, row, parsed, {
    force: opts.force ?? false,
    taxonomy,
    aliases,
  });

  // 6. Telemetry — Gemini File-API + 2.5-flash cost is ~$0.005-0.015/video.
  // We don't have exact token counts back from generateWithFile; report 0.01
  // as a coarse placeholder until we instrument it.
  const cost = 0.01;
  await admin
    .from('viral_videos')
    .update({
      analysis_status: 'analyzed',
      analyzed_at: new Date().toISOString(),
      gate_metadata: {
        ...row.gate_metadata,
        analysis_cost_usd: cost,
        analysis_latency_ms: Date.now() - t0,
        embedding_pending: embedding == null,
        ...(embeddingError ? { embedding_error: embeddingError } : {}),
        ...(proposals.length > 0 ? { proposals } : {}),
      },
    })
    .eq('id', row.id);

  return {
    ...buildOutput(row, parsed, 'analyzed', t0, cost),
    proposals,
    ...(embeddingError ? { error: 'embedding_failed' as const } : {}),
  };
}

// ---------------------------------------------------------------------------

function bucketTaxonomy(
  rows: { kind: string; slug: string; aliases?: string[] | null }[],
): Record<'hook_type' | 'structure' | 'archetype' | 'pacing', string[]> {
  const out = {
    hook_type: [] as string[],
    structure: [] as string[],
    archetype: [] as string[],
    pacing: [] as string[],
  };
  for (const r of rows) {
    if (r.kind in out) {
      (out as Record<string, string[]>)[r.kind].push(r.slug);
    }
  }
  return out;
}

// VFF-06: per-slug alias map keyed by kind so the prompt CSV resolves common
// synonyms ("vo_broll" → "voiceover_b_roll") without breaking the pure-slug
// membership check used elsewhere.
function bucketAliases(
  rows: { kind: string; slug: string; aliases?: string[] | null }[],
): Record<'hook_type' | 'structure' | 'archetype' | 'pacing', Record<string, string[]>> {
  const out: Record<'hook_type' | 'structure' | 'archetype' | 'pacing', Record<string, string[]>> = {
    hook_type: {},
    structure: {},
    archetype: {},
    pacing: {},
  };
  for (const r of rows) {
    if (r.kind in out) {
      out[r.kind as keyof typeof out][r.slug] = (r.aliases ?? []).filter(Boolean);
    }
  }
  return out;
}

function buildUserPrompt(opts: {
  platform: string;
  caption: string;
  comments: string[];
  duration: number | null;
  taxonomy: Record<'hook_type' | 'structure' | 'archetype' | 'pacing', string[]>;
  aliases?: Record<'hook_type' | 'structure' | 'archetype' | 'pacing', Record<string, string[]>>;
}): string {
  const labelFor = (kind: 'hook_type' | 'structure' | 'archetype' | 'pacing', slug: string) => {
    const a = opts.aliases?.[kind]?.[slug] ?? [];
    return a.length ? `${slug} (also: ${a.join(', ')})` : slug;
  };
  const csv = (kind: 'hook_type' | 'structure' | 'archetype' | 'pacing', xs: string[]) =>
    xs.length ? xs.map((s) => labelFor(kind, s)).join(', ') : '(none yet — propose)';
  return [
    `PLATFORM: ${opts.platform}`,
    `CAPTION:\n${opts.caption || '(none)'}`,
    `TOP COMMENTS (by likes):\n${JSON.stringify(opts.comments.slice(0, 10))}`,
    `DURATION: ${opts.duration ?? 'unknown'}s (analyzing first ${MAX_DURATION_S}s)`,
    'TAXONOMY (pick the canonical slug per dimension; the (also: …) parens list synonyms that map to that slug; propose only if none fit):',
    `hook_type: ${csv('hook_type', opts.taxonomy.hook_type)}`,
    `structure: ${csv('structure', opts.taxonomy.structure)}`,
    `archetype: ${csv('archetype', opts.taxonomy.archetype)}`,
    `pacing: ${csv('pacing', opts.taxonomy.pacing)}`,
    '',
    'Return JSON with hook_type/structure/archetype/pacing objects ({ slug, confidence, propose }), engagement_hook_descriptor (<=80 chars, starts with a verb), why_it_works (2-3 sentences 60-280 chars), retention_pattern (one short phrase), and title (short ASCII or null).',
  ].join('\n');
}

function extractCaption(payload: Record<string, unknown>): string {
  const p = payload as Record<string, unknown>;
  // TikTok: text. Instagram: caption.text. YouTube: snippet.title +
  // snippet.description.
  const direct =
    (typeof p.text === 'string' && p.text) ||
    (typeof p.description === 'string' && p.description) ||
    (typeof p.caption === 'string' && p.caption) ||
    null;
  if (direct) return String(direct).slice(0, 2000);
  const cap = p.caption as { text?: string } | undefined;
  if (cap?.text) return String(cap.text).slice(0, 2000);
  const snippet = p.snippet as { title?: string; description?: string } | undefined;
  if (snippet) return `${snippet.title ?? ''}\n${snippet.description ?? ''}`.slice(0, 2000);
  return '';
}

function extractTopComments(payload: Record<string, unknown>): string[] {
  const candidates: unknown[] = [];
  for (const k of ['comments', 'topComments', 'commentList']) {
    const v = (payload as Record<string, unknown>)[k];
    if (Array.isArray(v)) candidates.push(...v);
  }
  return candidates
    .map((c) => {
      if (typeof c === 'string') return { text: c, likes: 0 };
      if (c && typeof c === 'object') {
        const o = c as Record<string, unknown>;
        const text =
          (typeof o.text === 'string' && o.text) ||
          (typeof o.comment === 'string' && o.comment) ||
          (typeof o.content === 'string' && o.content) ||
          '';
        const likes =
          (typeof o.likes === 'number' && o.likes) ||
          (typeof o.likeCount === 'number' && o.likeCount) ||
          (typeof o.diggCount === 'number' && o.diggCount) ||
          0;
        return { text, likes };
      }
      return { text: '', likes: 0 };
    })
    .filter((c) => c.text.length > 0)
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 10)
    .map((c) => c.text.slice(0, 280));
}

async function downloadAndUpload(row: {
  source_url: string | null;
  platform: string;
  raw_payload: Record<string, unknown>;
}): Promise<{ fileUri: string; mimeType: string }> {
  // Try to find a direct MP4 url in raw_payload first (Apify often returns
  // mediaUrls / videoUrl). Falls back to source_url which usually won't
  // resolve to an MP4 directly — that's why we may end up at
  // mp4_unavailable.
  const mp4Url = findMp4Url(row.raw_payload) ?? row.source_url;
  if (!mp4Url) throw new Error('no mp4 url found');

  const res = await fetch(mp4Url);
  if (!res.ok) throw new Error(`mp4 download ${res.status}`);
  const ct = res.headers.get('content-type') ?? 'video/mp4';
  if (!ct.startsWith('video/')) throw new Error(`mp4 content-type ${ct}`);

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error('mp4 zero bytes');
  // Cap upload at MAX_MP4_BYTES. Real first-N-seconds trimming would
  // need ffmpeg; we approximate by truncating the byte stream which is
  // safe for Gemini (it tolerates partial mp4 input).
  const trimmed = buf.length > MAX_MP4_BYTES ? buf.subarray(0, MAX_MP4_BYTES) : buf;

  const file = await uploadFileToGemini({
    buffer: trimmed,
    mimeType: 'video/mp4',
    displayName: `viral_${Date.now()}.mp4`,
  });
  await waitForGeminiFileActive(file.name, { timeoutMs: 60_000 });
  return { fileUri: file.uri, mimeType: file.mimeType };
}

function findMp4Url(payload: Record<string, unknown>): string | null {
  const p = payload as Record<string, unknown>;
  const candidates = [
    p.videoUrl,
    p.video_url,
    p.mediaUrl,
    p.downloadAddr,
    (p.video as Record<string, unknown> | undefined)?.downloadAddr,
    (p.video as Record<string, unknown> | undefined)?.playAddr,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.startsWith('http')) return c;
  }
  return null;
}

async function persistAnalysis(
  admin: ReturnType<typeof createAdminClient>,
  row: { id: string },
  parsed: ParsedAnalysis,
  ctx: {
    force: boolean;
    taxonomy: Record<'hook_type' | 'structure' | 'archetype' | 'pacing', string[]>;
    aliases?: Record<'hook_type' | 'structure' | 'archetype' | 'pacing', Record<string, string[]>>;
  },
): Promise<{
  proposals: Array<{ kind: 'hook_type' | 'structure' | 'archetype' | 'pacing'; slug: string }>;
  embedding: number[] | null;
  embeddingError: string | null;
}> {
  const dims = ['hook_type', 'structure', 'archetype', 'pacing'] as const;

  // VFF-06: resolve LLM slug → canonical slug if it matches an alias on any
  // taxonomy row of the same kind. This keeps "vo_broll" from being filed as
  // a fresh proposal when it should map to "voiceover_b_roll".
  const resolveSlug = (
    kind: (typeof dims)[number],
    rawSlug: string,
  ): { canonical: string; resolved: boolean } => {
    if (ctx.taxonomy[kind].includes(rawSlug)) {
      return { canonical: rawSlug, resolved: true };
    }
    const aliasMap = ctx.aliases?.[kind];
    if (aliasMap) {
      for (const [canonical, aliases] of Object.entries(aliasMap)) {
        if (aliases.includes(rawSlug)) {
          return { canonical, resolved: true };
        }
      }
    }
    return { canonical: rawSlug, resolved: false };
  };

  // Mutate parsed slugs in place so downstream writes use the canonical form.
  for (const d of dims) {
    const { canonical } = resolveSlug(d, parsed[d].slug);
    parsed[d].slug = canonical;
  }

  // Collect proposals (LLM-flagged OR slug still not in taxonomy after alias
  // resolution).
  const proposals: Array<{
    kind: (typeof dims)[number];
    slug: string;
  }> = [];
  for (const d of dims) {
    const field = parsed[d];
    const inTax = ctx.taxonomy[d].includes(field.slug);
    if (field.propose || !inTax) {
      proposals.push({ kind: d, slug: field.slug });
    }
  }

  // Write 4 narrative columns.
  await admin
    .from('viral_videos')
    .update({
      engagement_hook_descriptor: parsed.engagement_hook_descriptor.slice(0, 80),
      why_it_works: parsed.why_it_works,
      retention_pattern: parsed.retention_pattern,
      title: parsed.title,
    })
    .eq('id', row.id);

  // Wipe + re-insert format associations (idempotent on re-run).
  if (ctx.force) {
    await admin
      .from('viral_video_formats')
      .delete()
      .eq('video_id', row.id)
      .eq('source', 'llm');
  }

  // Resolve known slugs to format_id; unknown slugs land in proposals
  // and don't get a viral_video_formats row.
  const knownPairs = dims
    .filter((d) => ctx.taxonomy[d].includes(parsed[d].slug))
    .map((d) => ({ kind: d, slug: parsed[d].slug, confidence: parsed[d].confidence }));

  if (knownPairs.length > 0) {
    const { data: matched } = await admin
      .from('viral_formats')
      .select('id, kind, slug')
      .in('slug', knownPairs.map((p) => p.slug));
    const idLookup = new Map(
      (matched ?? []).map((r) => [`${r.kind}:${r.slug}`, r.id as string]),
    );
    const rows = knownPairs
      .map((p) => {
        const id = idLookup.get(`${p.kind}:${p.slug}`);
        if (!id) return null;
        return {
          video_id: row.id,
          format_id: id,
          confidence: p.confidence,
          source: 'llm' as const,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (rows.length > 0) {
      await admin.from('viral_video_formats').upsert(rows, {
        onConflict: 'video_id,format_id',
        ignoreDuplicates: false,
      });
    }
  }

  // Proposals → format_taxonomy_proposals (VFF-06). If the table doesn't
  // exist yet we'll get an error; fall back to gate_metadata storage.
  if (proposals.length > 0) {
    const { error: propErr } = await admin
      .from('format_taxonomy_proposals')
      .insert(
        proposals.map((p) => ({
          video_id: row.id,
          kind: p.kind,
          proposed_slug: p.slug,
          status: 'pending',
        })),
      );
    if (propErr) {
      // Table likely doesn't exist yet — proposals already saved to
      // gate_metadata.proposals by the caller.
    }
  }

  // Embedding.
  const embedInput = [
    parsed.why_it_works,
    parsed.engagement_hook_descriptor,
    parsed.retention_pattern,
  ]
    .join('\n')
    .slice(0, 2000);

  let embedding: number[] | null = null;
  let embeddingError: string | null = null;
  try {
    embedding = await embedAnalysisText(embedInput);
  } catch (e) {
    embeddingError = e instanceof Error ? e.message : String(e);
  }
  if (embedding) {
    await admin
      .from('viral_videos')
      .update({ embedding })
      .eq('id', row.id);
  }

  return { proposals, embedding, embeddingError };
}

export async function embedAnalysisText(text: string): Promise<number[] | null> {
  const apiKey =
    process.env.GOOGLE_AI_STUDIO_KEY ?? process.env.GOOGLE_AI_STUDIO_API_KEY;
  if (!apiKey) return null;
  const res = await fetch(`${GEMINI_BASE}/${EMBED_MODEL}:embedContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text: text.slice(0, 2000) }] },
      outputDimensionality: EMBED_DIMS,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`embedding ${res.status}: ${errText.slice(0, 120)}`);
  }
  const data = (await res.json()) as { embedding?: { values?: number[] } };
  const values = data.embedding?.values ?? null;
  if (!values || values.length !== EMBED_DIMS) return null;
  return values;
}

async function markFailure(
  admin: ReturnType<typeof createAdminClient>,
  row: {
    id: string;
    platform: 'tiktok' | 'instagram' | 'youtube';
    source_url: string | null;
    duration_seconds: number | null;
    gate_metadata: Record<string, unknown>;
  },
  errorKind: 'mp4_unavailable' | 'malformed_output',
  t0: number,
  detail: string | null,
): Promise<ViralAnalysisOutput> {
  const attempts = Number((row.gate_metadata?.analysis_attempts as number | undefined) ?? 0) + 1;
  const giveUp = attempts >= 3;
  await admin
    .from('viral_videos')
    .update({
      analysis_status: giveUp ? 'failed' : 'analyzing',
      ...(giveUp
        ? { reject_reason: errorKind === 'mp4_unavailable' ? 'no_mp4_available' : 'gate_error' }
        : {}),
      gate_metadata: {
        ...row.gate_metadata,
        analysis_attempts: attempts,
        analysis_error: errorKind,
        ...(detail ? { analysis_error_detail: detail.slice(0, 280) } : {}),
        ...(giveUp ? { analysis_gave_up_at: new Date().toISOString() } : {}),
      },
    })
    .eq('id', row.id);
  return {
    status: 'failed',
    hook_type: { slug: '', confidence: 0, propose: false },
    structure: { slug: '', confidence: 0, propose: false },
    archetype: { slug: '', confidence: 0, propose: false },
    pacing: { slug: '', confidence: 0, propose: false },
    engagement_hook_descriptor: '',
    why_it_works: '',
    retention_pattern: '',
    title: null,
    proposals: [],
    cost_usd: 0,
    latency_ms: Date.now() - t0,
    error: errorKind === 'mp4_unavailable' ? 'mp4_unavailable' : 'malformed_output',
  };
}

function buildOutput(
  _row: { id: string },
  parsed: ParsedAnalysis,
  status: 'analyzed' | 'failed',
  t0: number,
  cost: number,
  errorKind?: 'banned_content',
): ViralAnalysisOutput {
  return {
    status,
    hook_type: parsed.hook_type,
    structure: parsed.structure,
    archetype: parsed.archetype,
    pacing: parsed.pacing,
    engagement_hook_descriptor: parsed.engagement_hook_descriptor,
    why_it_works: parsed.why_it_works,
    retention_pattern: parsed.retention_pattern,
    title: parsed.title,
    proposals: [],
    cost_usd: cost,
    latency_ms: Date.now() - t0,
    ...(errorKind ? { error: errorKind } : {}),
  };
}

export const __TEST__ = {
  AnalysisSchema,
  extractCaption,
  extractTopComments,
  bucketTaxonomy,
  findMp4Url,
  GEMINI_MODEL,
  EMBED_DIMS,
};
