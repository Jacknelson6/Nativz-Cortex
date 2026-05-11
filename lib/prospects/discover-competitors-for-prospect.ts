// SPY-05 T05: prospect-context-aware competitor discovery.
//
// Calls Sonnet 4.5 with the prospect's brand context (bio, niche, captions)
// and the platform we want to benchmark on. Returns up to 5 competitor
// handles with a short rationale each.
//
// Unlike the audit's `discoverCompetitorsByWebsite` (which is
// website-grounded and now retired to no-op), this one returns *handles* on
// a specific platform — that's what the benchmark pipeline needs.

import { z } from 'zod';
import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import { createAdminClient } from '@/lib/supabase/admin';
import { containsBannedTopic } from './initial-analysis-prompts';
import type { ProspectPlatform, ProspectRow, ProspectAnalysisRow } from './types';

export interface DiscoveredCompetitor {
  platform: ProspectPlatform;
  handle: string;
  profile_url: string | null;
  display_name: string | null;
  rationale: string;
}

const DiscoveryOutputSchema = z.object({
  candidates: z
    .array(
      z.object({
        platform: z.enum(['tiktok', 'instagram', 'youtube', 'facebook']),
        handle: z.string().min(1).max(120),
        display_name: z.string().max(200).nullable().optional(),
        rationale: z.string().min(8).max(160),
      }),
    )
    .max(8),
});

const SYSTEM = `You suggest up to 5 short-form video competitors for a brand. For each suggestion include platform, handle (no @ prefix), and a one-sentence rationale (max 140 chars, no em dash). Pick brands that compete on attention not just product (similar audience, similar format mix, similar scale).

Banned: politics, religion, health claims, weight loss, competitor disparagement. If you can't find good picks, return an empty candidates array — never invent handles you aren't confident exist.

Return strict JSON, shape: { "candidates": [{ "platform": "tiktok"|"instagram"|"youtube"|"facebook", "handle": "string", "display_name": "string|null", "rationale": "string" }] }`;

function buildUserPrompt(opts: {
  brandName: string;
  platform: ProspectPlatform;
  bio: string | null;
  niche: string | null;
  recentCaptions: string[];
  themes: string[];
  followers: number | null;
}): string {
  const captionsBlock = opts.recentCaptions.length
    ? opts.recentCaptions
        .slice(0, 8)
        .map((c, i) => `${i + 1}. ${c.replace(/\s+/g, ' ').slice(0, 180)}`)
        .join('\n')
    : '(no recent captions)';
  return `Prospect: ${opts.brandName}
Platform: ${opts.platform}
Niche: ${opts.niche ?? '(unknown)'}
Followers: ${opts.followers ?? '(unknown)'}
Bio: ${opts.bio ?? '(empty)'}
Top recurring comment themes: ${opts.themes.join(', ') || '(none)'}
Recent captions:
${captionsBlock}

Return up to 5 competitors on the SAME platform (${opts.platform}) at a similar scale. Order most-similar first.`;
}

function profileUrlFor(platform: ProspectPlatform, handle: string): string {
  const h = handle.replace(/^@+/, '');
  switch (platform) {
    case 'tiktok':
      return `https://www.tiktok.com/@${h}`;
    case 'instagram':
      return `https://www.instagram.com/${h}/`;
    case 'youtube':
      return `https://www.youtube.com/@${h}`;
    case 'facebook':
      return `https://www.facebook.com/${h}`;
    default:
      return `https://${platform}.com/${h}`;
  }
}

export async function discoverCompetitorsForProspect(
  prospectId: string,
): Promise<{ candidates: DiscoveredCompetitor[]; cost_cents: number }> {
  const admin = createAdminClient();

  const { data: prospect } = await admin
    .from('prospects')
    .select('id, brand_name, primary_platform, primary_handle, niche')
    .eq('id', prospectId)
    .maybeSingle();
  if (!prospect) {
    return { candidates: [], cost_cents: 0 };
  }

  const typed = prospect as Pick<
    ProspectRow,
    'id' | 'brand_name' | 'primary_platform' | 'primary_handle' | 'niche'
  >;

  // Latest succeeded/partial analysis seeds the prompt with bio/captions/themes.
  const { data: analysis } = await admin
    .from('prospect_analyses')
    .select('*')
    .eq('prospect_id', prospectId)
    .in('status', ['succeeded', 'partial'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const a = (analysis ?? null) as ProspectAnalysisRow | null;
  const platform: ProspectPlatform = (typed.primary_platform ?? a?.platform ?? 'tiktok') as ProspectPlatform;

  const captions = ((a?.raw_captions ?? []) as unknown[])
    .map((c) => (typeof c === 'string' ? c : ''))
    .filter((s) => s.length > 0);

  const rawProfile = (a?.raw_profile ?? {}) as { followers?: number | null; bio?: string | null };
  const followers = typeof rawProfile.followers === 'number' ? rawProfile.followers : null;
  const bio = typeof rawProfile.bio === 'string' && rawProfile.bio ? rawProfile.bio : a?.bio_assessment?.hook ?? null;

  const prompt = buildUserPrompt({
    brandName: typed.brand_name,
    platform,
    bio,
    niche: typed.niche,
    recentCaptions: captions,
    themes: a?.comment_signal?.recurring_themes ?? [],
    followers,
  });

  const res = await createCompletion({
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: prompt },
    ],
    maxTokens: 700,
    jsonMode: true,
    feature: 'prospect_benchmark_discovery',
  });

  let parsed: z.infer<typeof DiscoveryOutputSchema> | null = null;
  try {
    const raw = parseAIResponseJSON<unknown>(res.text);
    const safe = DiscoveryOutputSchema.safeParse(raw);
    if (safe.success) parsed = safe.data;
  } catch {
    parsed = null;
  }

  const candidates: DiscoveredCompetitor[] = (parsed?.candidates ?? [])
    .map((c) => {
      const handle = c.handle.replace(/^@+/, '').trim();
      const rationale = containsBannedTopic(c.rationale) ? 'Filtered rationale.' : c.rationale;
      return {
        platform: c.platform as ProspectPlatform,
        handle,
        display_name: c.display_name ?? null,
        profile_url: profileUrlFor(c.platform as ProspectPlatform, handle),
        rationale,
      };
    })
    // De-dupe on (platform, handle) and skip the prospect itself.
    .filter((c, i, arr) => {
      const key = `${c.platform}:${c.handle.toLowerCase()}`;
      if (arr.findIndex((x) => `${x.platform}:${x.handle.toLowerCase()}` === key) !== i) return false;
      if (typed.primary_handle && c.handle.toLowerCase() === typed.primary_handle.toLowerCase()) return false;
      return true;
    })
    .slice(0, 5);

  return { candidates, cost_cents: Math.round(res.estimatedCost * 100) };
}
