import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertUserCanAccessClient } from '@/lib/api/client-access';
import { generateSpokenScript } from '@/lib/ideas/spoken-script';

const scriptSchema = z.object({
  client_id: z.string().uuid(),
  title: z.string().min(1),
  why_it_works: z.union([z.string(), z.array(z.string())]).optional(),
  content_pillar: z.string().optional(),
  reference_video_ids: z.array(z.string().uuid()).optional(),
  idea_entry_id: z.string().uuid().optional(),
  cta: z.string().optional(),
  video_length_seconds: z.number().min(10).max(180).optional(),
  target_word_count: z.number().min(10).max(500).optional(),
  hook_strategies: z.array(z.string()).optional(),
});

/**
 * POST /api/ideas/generate-script
 *
 * Generate a spoken-word video script for a given idea using Claude AI. Uses the client's
 * brand profile, target audience, and optional reference video transcripts as style guides.
 * Calibrates word count to target video length (default 60s ≈ 130 wpm). Saves the resulting
 * script to the idea_scripts table.
 *
 * @auth Required (any authenticated user)
 * @body client_id - Client UUID for brand context (required)
 * @body title - Video idea title (required)
 * @body why_it_works - Reason bullets (string or string array)
 * @body content_pillar - Content pillar/category name
 * @body reference_video_ids - Reference video UUIDs to match style and tone
 * @body idea_entry_id - Optional idea submission UUID to link the script to
 * @body cta - Desired call-to-action for the script ending
 * @body video_length_seconds - Target video length in seconds (10-180, default: 60)
 * @body target_word_count - Explicit word count override (10-500)
 * @body hook_strategies - Hook style keys (negative | curiosity | controversial | story | authority | question | listicle | fomo | tutorial)
 * @returns {{ script: string, scriptId: string | null, usage: TokenUsage, estimatedCost: number }}
 */
export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = scriptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { client_id, title, why_it_works, content_pillar, reference_video_ids, idea_entry_id, cta, video_length_seconds, target_word_count, hook_strategies } = parsed.data;
  const admin = createAdminClient();

  // Org-scope check
  const access = await assertUserCanAccessClient(admin, user.id, client_id);
  if (!access.allowed) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { scriptText, usage, estimatedCost } = await generateSpokenScript({
      admin,
      clientId: client_id,
      title,
      why_it_works,
      content_pillar,
      reference_video_ids,
      cta,
      video_length_seconds,
      target_word_count,
      hook_strategies,
      userId: user.id,
      userEmail: user.email ?? undefined,
    });

    const { data: savedScript } = await admin
      .from('idea_scripts')
      .insert({
        idea_entry_id: idea_entry_id ?? null,
        client_id,
        title,
        script_text: scriptText,
        reference_context: {
          reference_video_ids: reference_video_ids ?? [],
          why_it_works: why_it_works ?? null,
          content_pillar: content_pillar ?? null,
        },
      })
      .select()
      .single();

    return NextResponse.json({
      script: scriptText,
      scriptId: savedScript?.id ?? null,
      usage,
      estimatedCost,
    });
  } catch (err) {
    console.error('Script generation error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate script' },
      { status: 500 },
    );
  }
}
