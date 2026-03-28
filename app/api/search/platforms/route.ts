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
      web: true, // SearXNG (self-hosted) + Google SERP (via Serper) combined
      reddit: true, // SearXNG to find threads + scrapes for content
      youtube: !!process.env.YOUTUBE_API_KEY,
      tiktok: !!process.env.APIFY_API_KEY,
      quora: true, // SearXNG for Quora threads
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
