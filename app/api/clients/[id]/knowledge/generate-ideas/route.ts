import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateVideoIdeas } from '@/lib/knowledge/idea-generator';

const ideaSchema = z.object({
  concept: z.string().optional(),
  count: z.number().min(1).max(20).default(10),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = ideaSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { id: clientId } = await params;
    const { concept, count } = parsed.data;

    const ideas = await generateVideoIdeas({ clientId, concept, count });

    return NextResponse.json({ ideas });
  } catch (error) {
    console.error('POST /api/clients/[id]/knowledge/generate-ideas error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
