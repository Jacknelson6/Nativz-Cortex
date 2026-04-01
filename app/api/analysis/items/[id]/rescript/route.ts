import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runMoodboardRescript } from '@/lib/analysis/moodboard-rescript-internal';

const rescriptSchema = z.object({
  client_id: z.string().uuid().optional(),
  brand_voice: z.string().optional(),
  product: z.string().optional(),
  target_audience: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * POST /api/analysis/items/[id]/rescript
 *
 * AI-rescript a moodboard video for a specific brand. Uses the item's hook, transcript,
 * and winning elements as a structural template, then rewrites the spoken word script
 * for the target brand. Saves the rescript and replication_brief to the item.
 *
 * @auth Required (any authenticated user)
 * @param id - Moodboard item UUID
 * @body client_id - Client UUID for brand voice context (optional)
 * @body brand_voice - Brand voice override (optional)
 * @body product - Product or service being promoted (optional)
 * @body target_audience - Target audience description (optional)
 * @body notes - Additional adaptation notes (optional)
 * @returns {{ rescript: { script, client_id, brand_voice, product, target_audience, generated_at } }}
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = rescriptSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const adminClient = createAdminClient();
    const result = await runMoodboardRescript(adminClient, id, user, parsed.data);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
    }

    return NextResponse.json({ rescript: result.rescript });
  } catch (error) {
    console.error('POST /api/analysis/items/[id]/rescript error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
