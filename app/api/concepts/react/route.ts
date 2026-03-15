import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const reactSchema = z.object({
  title: z.string().min(1).max(500),
  hook: z.string().max(1000).optional(),
  format: z.string().max(100).optional(),
  virality: z.enum(['low', 'medium', 'high', 'viral_potential']).optional(),
  why_it_works: z.string().max(2000).optional(),
  topic_name: z.string().max(300).optional(),
  client_id: z.string().uuid().nullable().optional(),
  search_id: z.string().uuid().optional(),
  reaction: z.enum(['approved', 'starred', 'revision_requested']).nullable(),
  feedback: z.string().max(2000).optional().nullable(),
});

/**
 * POST /api/concepts/react
 *
 * Save a client reaction (approve, star, or request revision) to an AI-generated content idea.
 * Upserts the reaction into content_ideas — updates the existing row if the idea title matches,
 * otherwise inserts a new record.
 *
 * @auth Required (any authenticated user)
 * @body title - Idea title used to match/create the content_ideas record (required)
 * @body reaction - Reaction type: 'approved' | 'starred' | 'revision_requested' | null (required)
 * @body hook - Optional hook text
 * @body format - Optional video format label
 * @body virality - Optional virality estimate: 'low' | 'medium' | 'high' | 'viral_potential'
 * @body why_it_works - Optional explanation text
 * @body topic_name - Optional topic name label
 * @body client_id - Optional client UUID (null for generic ideas)
 * @body search_id - Optional source search UUID
 * @body feedback - Optional free-text feedback (nullable)
 * @returns {{ id: string, reaction: string }} Created (201) or updated record ID + reaction
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = reactSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const {
      title, hook, format, virality, why_it_works,
      topic_name, client_id, reaction, feedback,
    } = parsed.data;

    const adminClient = createAdminClient();

    // Try to find an existing content_ideas row for this video idea
    let query = adminClient
      .from('content_ideas')
      .select('id, client_reaction')
      .eq('title', title)
      .eq('source', 'ai');

    if (client_id) {
      query = query.eq('client_id', client_id);
    } else {
      query = query.is('client_id', null);
    }

    const { data: existing } = await query.limit(1).single();

    if (existing) {
      // Update existing row
      const updateData: Record<string, unknown> = {
        client_reaction: reaction,
        updated_at: new Date().toISOString(),
      };
      if (feedback !== undefined) {
        updateData.client_feedback = feedback;
      }

      const { error: updateError } = await adminClient
        .from('content_ideas')
        .update(updateData)
        .eq('id', existing.id);

      if (updateError) {
        console.error('Error updating reaction:', updateError);
        return NextResponse.json({ error: 'Failed to save reaction' }, { status: 500 });
      }

      return NextResponse.json({ id: existing.id, reaction });
    }

    // Create new content_ideas row
    const { data: idea, error: insertError } = await adminClient
      .from('content_ideas')
      .insert({
        title,
        description: why_it_works || '',
        target_emotion: topic_name || 'trending',
        suggested_format: format || 'short-form video',
        source_insight: hook || '',
        estimated_virality: virality || null,
        source: 'ai',
        client_id: client_id || null,
        client_reaction: reaction,
        client_feedback: feedback || null,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Error creating concept:', insertError);
      return NextResponse.json({ error: 'Failed to save reaction' }, { status: 500 });
    }

    return NextResponse.json({ id: idea.id, reaction }, { status: 201 });
  } catch (error) {
    console.error('POST /api/concepts/react error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
