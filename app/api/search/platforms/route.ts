import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Returns which search platforms are configured (have valid API keys).
 * Used by the search form to show availability indicators.
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({
      web: !!process.env.BRAVE_SEARCH_API_KEY,
      reddit: true, // No API key needed — uses public JSON API
      youtube: !!process.env.YOUTUBE_API_KEY,
      tiktok: !!process.env.APIFY_API_KEY,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
