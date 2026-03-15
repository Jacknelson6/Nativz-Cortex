import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

const CreateCaptionSchema = z.object({
  client_id: z.string().uuid(),
  title: z.string().min(1),
  caption_text: z.string().default(''),
  hashtags: z.array(z.string()).default([]),
});

/**
 * POST /api/scheduler/saved-captions
 *
 * Save a caption template (title, text, hashtags) to the client's saved captions
 * library. Saved captions are used as style reference by AI caption improvement.
 *
 * @auth Required (any authenticated user)
 * @body client_id - Client UUID (required)
 * @body title - Caption template name (required)
 * @body caption_text - Caption body text (optional)
 * @body hashtags - Array of hashtags without # prefix (optional)
 * @returns {{ caption: SavedCaption }}
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = CreateCaptionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('saved_captions')
      .insert({
        client_id: parsed.data.client_id,
        created_by: user.id,
        title: parsed.data.title,
        caption_text: parsed.data.caption_text,
        hashtags: parsed.data.hashtags,
      })
      .select()
      .single();

    if (error) {
      console.error('Create saved caption error:', error);
      return NextResponse.json({ error: 'Failed to save caption' }, { status: 500 });
    }

    return NextResponse.json({ caption: data });
  } catch (error) {
    console.error('POST /api/scheduler/saved-captions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/scheduler/saved-captions
 *
 * List all saved caption templates for a client, ordered by creation date descending.
 *
 * @auth Required (any authenticated user)
 * @query client_id - Client UUID (required)
 * @returns {{ captions: SavedCaption[] }}
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clientId = new URL(request.url).searchParams.get('client_id');
    if (!clientId) {
      return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('saved_captions')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('List saved captions error:', error);
      return NextResponse.json({ error: 'Failed to load captions' }, { status: 500 });
    }

    return NextResponse.json({ captions: data ?? [] });
  } catch (error) {
    console.error('GET /api/scheduler/saved-captions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/scheduler/saved-captions
 *
 * Permanently delete a saved caption template by ID.
 *
 * @auth Required (any authenticated user)
 * @query id - Saved caption UUID (required)
 * @returns {{ success: true }}
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const captionId = new URL(request.url).searchParams.get('id');
    if (!captionId) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from('saved_captions')
      .delete()
      .eq('id', captionId);

    if (error) {
      console.error('Delete saved caption error:', error);
      return NextResponse.json({ error: 'Failed to delete caption' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/scheduler/saved-captions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
