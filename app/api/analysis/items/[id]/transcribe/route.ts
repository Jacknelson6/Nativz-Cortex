import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runMoodboardTranscribe } from '@/lib/analysis/moodboard-transcribe-internal';

/**
 * POST /api/analysis/items/[id]/transcribe
 *
 * Extract a transcript for a moodboard video item. Supports TikTok (via tikwm + scraper)
 * and YouTube (via timedtext API). If the item has no title or a generic one, AI generates
 * a short catchy title from the transcript. Saves transcript, segments, and title.
 *
 * @auth Required (any authenticated user)
 * @param id - Moodboard item UUID (must be type 'video')
 * @returns {MoodboardItem} Updated item record with transcript
 */
export async function POST(
  _request: NextRequest,
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

    const adminClient = createAdminClient();
    const result = await runMoodboardTranscribe(adminClient, id, user);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
    }

    return NextResponse.json(result.item);
  } catch (error) {
    console.error('POST /api/analysis/items/[id]/transcribe error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
