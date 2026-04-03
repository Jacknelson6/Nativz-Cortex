import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertUserCanAccessTopicSearch } from '@/lib/api/topic-search-access';
import {
  findPlatformSourceInSearch,
  runTopicSourceRescript,
} from '@/lib/search/topic-source-ai';
import type { SearchPlatform } from '@/lib/types/search';

export const maxDuration = 120;

const bodySchema = z.object({
  platform: z.enum(['reddit', 'youtube', 'tiktok', 'web', 'quora']),
  source_id: z.string().min(1),
  client_id: z.string().uuid().optional(),
  brand_voice: z.string().optional(),
  product: z.string().optional(),
  target_audience: z.string().optional(),
  notes: z.string().optional(),
  idea_generation_id: z.string().uuid().optional(),
});

/**
 * POST /api/search/[id]/sources/rescript
 *
 * Brand rescript of a topic-search platform source transcript.
 * Uses search.client_id when body client_id is omitted and the search has a client.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: searchId } = await params;
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
    }

    const { platform, source_id, idea_generation_id, ...rest } = parsed.data;
    const admin = createAdminClient();

    const access = await assertUserCanAccessTopicSearch(admin, user.id, searchId);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status === 404 ? 404 : 403 },
      );
    }
    const search = access.search as { id: string; platform_data: unknown; client_id: string | null };

    const source = findPlatformSourceInSearch(
      search.platform_data,
      platform as SearchPlatform,
      source_id,
    );
    if (!source) {
      return NextResponse.json({ error: 'Source not found on this search' }, { status: 404 });
    }

    const effectiveClientId = rest.client_id ?? search.client_id ?? undefined;
    if (!effectiveClientId && !rest.brand_voice?.trim()) {
      return NextResponse.json(
        { error: 'Select a client or provide brand voice context for analysis.' },
        { status: 400 },
      );
    }

    let ideaContext: string | null = null;
    if (idea_generation_id) {
      const { data: gen } = await admin
        .from('idea_generations')
        .select('ideas, concept')
        .eq('id', idea_generation_id)
        .eq('search_id', searchId)
        .maybeSingle();

      if (gen?.ideas) {
        const ideas = gen.ideas as { title?: string; why_it_works?: string[]; content_pillar?: string }[];
        const lines = Array.isArray(ideas)
          ? ideas
              .slice(0, 12)
              .map((i, idx) => `${idx + 1}. ${i.title ?? 'Untitled'} (${i.content_pillar ?? 'pillar'})`)
              .join('\n')
          : '';
        ideaContext = [gen.concept ? `Concept: ${gen.concept}` : '', lines].filter(Boolean).join('\n');
      }
    }

    const result = await runTopicSourceRescript(
      admin,
      {
        source,
        client_id: effectiveClientId,
        brand_voice: rest.brand_voice,
        product: rest.product,
        target_audience: rest.target_audience,
        notes: rest.notes,
        ideaContext,
      },
      user,
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
    }

    return NextResponse.json({ rescript: result.rescript, script: result.script });
  } catch (error) {
    console.error('POST /api/search/[id]/sources/rescript error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
