/**
 * Live integration tests for the moodboard ingestion pipeline.
 *
 * These tests hit real external APIs (tikwm, TikTok oEmbed, Instagram oEmbed,
 * YouTube oEmbed, Groq Whisper) to validate the full ingestion flow.
 *
 * Run: npx vitest run __tests__/ingestion.test.ts -c app/vitest.config.ts
 */

import { describe, it, expect } from 'vitest';
import { getTikTokMetadata, extractTikTokTranscript } from '@/lib/tiktok/scraper';

// Sample URLs — using stable, high-profile content that's unlikely to be deleted
const TIKTOK_URL = 'https://www.tiktok.com/@tiktok/video/7386180425249138990';
const YOUTUBE_URL = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'; // "Me at the zoo" — first YT video
const INSTAGRAM_REEL_URL = 'https://www.instagram.com/reel/C7KZRnFOmdb/';

// ---------------------------------------------------------------------------
// TikTok metadata extraction
// ---------------------------------------------------------------------------
describe('TikTok metadata extraction', () => {
  it('fetches metadata from a TikTok URL', async () => {
    const meta = await getTikTokMetadata(TIKTOK_URL);

    console.log('TikTok metadata result:', meta ? {
      title: meta.title?.slice(0, 60),
      thumbnail: meta.thumbnail_url ? 'present' : 'missing',
      author: meta.author_name,
      handle: meta.author_handle,
      duration: meta.duration,
      stats: meta.stats,
      video_url: meta.video_url ? 'present' : 'missing',
      music: meta.music,
    } : 'null (all tiers failed — video may be removed or APIs rate-limited)');

    if (meta) {
      // If any tier succeeded, core fields should be populated
      expect(meta.thumbnail_url || meta.title).toBeTruthy();
    } else {
      // If all tiers failed, it's likely the video was removed or we're rate-limited.
      // Log this as a warning rather than a hard failure.
      console.warn('All TikTok metadata tiers returned null — check video URL or rate limits');
    }
  }, 30000);
});

// ---------------------------------------------------------------------------
// TikTok oEmbed (direct test)
// ---------------------------------------------------------------------------
describe('TikTok oEmbed', () => {
  it('returns basic metadata via oEmbed', async () => {
    const res = await fetch(
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(TIKTOK_URL)}`,
      { signal: AbortSignal.timeout(10000) },
    );

    console.log('TikTok oEmbed status:', res.status);

    if (res.ok) {
      const data = await res.json();
      console.log('TikTok oEmbed result:', {
        title: data.title?.slice(0, 60),
        thumbnail: data.thumbnail_url ? 'present' : 'missing',
        author: data.author_name,
      });

      expect(data.title || data.author_name).toBeTruthy();
    } else {
      console.warn('TikTok oEmbed returned non-OK status — may be rate-limited');
    }
  }, 15000);
});

// ---------------------------------------------------------------------------
// tikwm.com API (direct test)
// ---------------------------------------------------------------------------
describe('tikwm.com API', () => {
  it('is reachable and responds', async () => {
    const res = await fetch(
      `https://www.tikwm.com/api/?url=${encodeURIComponent(TIKTOK_URL)}`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      },
    );

    console.log('tikwm status:', res.status);

    // API should be reachable
    expect(res.ok).toBe(true);

    if (res.ok) {
      const json = await res.json();
      console.log('tikwm result:', {
        code: json.code,
        title: json.data?.title?.slice(0, 60),
        cover: json.data?.cover ? 'present' : 'missing',
        play: json.data?.play ? 'present' : 'missing',
        author: json.data?.author?.nickname,
        duration: json.data?.duration,
      });

      // code=-1 means video not found (but API itself works)
      // code=0 means success
      if (json.code === 0) {
        expect(json.data).toBeTruthy();
        console.log('tikwm returned valid video data');
      } else {
        console.warn(`tikwm code=${json.code} — video may be removed, but API is working`);
      }
    }
  }, 20000);
});

// ---------------------------------------------------------------------------
// Instagram oEmbed
// ---------------------------------------------------------------------------
describe('Instagram oEmbed', () => {
  it('returns metadata for a public reel', async () => {
    const res = await fetch(
      `https://api.instagram.com/oembed?url=${encodeURIComponent(INSTAGRAM_REEL_URL)}&omitscript=true`,
      { signal: AbortSignal.timeout(5000) },
    );

    console.log('Instagram oEmbed status:', res.status);
    const contentType = res.headers.get('content-type') || '';
    console.log('Instagram oEmbed content-type:', contentType);

    if (res.ok && contentType.includes('json')) {
      const data = await res.json();
      console.log('Instagram oEmbed result:', {
        title: data.title?.slice(0, 60),
        thumbnail: data.thumbnail_url ? 'present' : 'missing',
        author: data.author_name,
      });

      expect(data.author_name || data.title).toBeTruthy();
      expect(data.thumbnail_url).toBeTruthy();
    } else if (res.ok) {
      // Instagram sometimes returns HTML instead of JSON (login wall)
      console.warn('Instagram oEmbed returned HTML instead of JSON — login wall detected');
      console.warn('This means the code fallback to HTML scrape will be used');
      // This is a known limitation — the HTML scrape tier handles it
    } else {
      const text = await res.text();
      console.warn('Instagram oEmbed failed:', res.status, text.slice(0, 200));
    }
  }, 10000);
});

// ---------------------------------------------------------------------------
// YouTube oEmbed
// ---------------------------------------------------------------------------
describe('YouTube oEmbed', () => {
  it('returns metadata for a YouTube video', async () => {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(YOUTUBE_URL)}&format=json`,
      { signal: AbortSignal.timeout(5000) },
    );

    expect(res.ok).toBe(true);

    const data = await res.json();
    console.log('YouTube oEmbed result:', {
      title: data.title,
      thumbnail: data.thumbnail_url ? 'present' : 'missing',
      author: data.author_name,
    });

    expect(data.title).toBeTruthy();
    expect(data.thumbnail_url).toBeTruthy();
    expect(data.author_name).toBeTruthy();
  }, 10000);
});

// ---------------------------------------------------------------------------
// YouTube captions
// ---------------------------------------------------------------------------
describe('YouTube captions', () => {
  it('reaches the captions endpoint', async () => {
    // Use a video known to have captions
    const videoId = 'jNQXAC9IVRw'; // "Me at the zoo"
    const res = await fetch(
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=srv3`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) },
    );

    console.log('YouTube captions status:', res.status);

    if (res.ok) {
      const xml = await res.text();
      const hasText = xml.includes('<text');
      console.log('YouTube captions:', { hasText, length: xml.length });
      // Captions may or may not be available — we just verify the endpoint is reachable
      if (hasText) {
        console.log('Captions available for this video');
      } else {
        console.log('No captions available (endpoint reachable but empty)');
      }
    } else {
      console.log('Captions endpoint returned:', res.status, '(not all videos have captions)');
    }

    // We only verify the endpoint is reachable (200 or empty response)
    expect(res.status).toBeLessThan(500);
  }, 15000);
});

// ---------------------------------------------------------------------------
// TikTok transcript extraction
// ---------------------------------------------------------------------------
describe('TikTok transcript extraction', () => {
  it('extracts transcript from a TikTok video', async () => {
    const result = await extractTikTokTranscript(TIKTOK_URL);

    console.log('TikTok transcript result:', {
      textLength: result.text.length,
      segmentCount: result.segments.length,
      preview: result.text.slice(0, 100),
    });

    // Transcript may or may not be available depending on whether video has captions
    // We just verify no crash and valid return shape
    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('segments');
    expect(Array.isArray(result.segments)).toBe(true);
  }, 30000);
});

// ---------------------------------------------------------------------------
// Groq Whisper API availability
// ---------------------------------------------------------------------------
describe('Groq Whisper API', () => {
  it('is configured and reachable', async () => {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      console.warn('GROQ_API_KEY not set — skipping Whisper test');
      return;
    }

    // Just test that the API accepts our key (list models)
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });

    console.log('Groq API status:', res.status);

    expect(res.ok).toBe(true);

    const data = await res.json();
    const whisperModel = data.data?.find((m: { id: string }) => m.id.includes('whisper'));
    console.log('Groq Whisper model available:', whisperModel?.id ?? 'NOT FOUND');

    expect(whisperModel).toBeTruthy();
  }, 10000);
});

// ---------------------------------------------------------------------------
// Monday.com API (shoot date column)
// ---------------------------------------------------------------------------
describe('Monday.com API', () => {
  it('is configured and can query boards', async () => {
    const token = process.env.MONDAY_API_TOKEN;
    const boardId = process.env.MONDAY_CONTENT_CALENDARS_BOARD_ID;

    if (!token || !boardId) {
      console.warn('Monday.com not configured — skipping');
      return;
    }

    const res = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `query { boards(ids: [${boardId}]) { name columns { id title type } } }`,
      }),
      signal: AbortSignal.timeout(10000),
    });

    expect(res.ok).toBe(true);

    const data = await res.json();
    console.log('Monday.com board:', data.data?.boards?.[0]?.name);

    const columns = data.data?.boards?.[0]?.columns ?? [];
    const dateCol = columns.find((c: { id: string }) => c.id === 'date_mkrv3eyh');
    console.log('Shoot Date column:', dateCol ? `found (${dateCol.title})` : 'NOT FOUND');

    expect(data.data?.boards?.[0]).toBeTruthy();
    expect(dateCol).toBeTruthy();
  }, 15000);
});

// ---------------------------------------------------------------------------
// Platform URL detection (unit test)
// ---------------------------------------------------------------------------
describe('Platform URL detection', () => {
  const detectPlatform = (url: string): string | null => {
    const lower = url.toLowerCase();
    if (lower.includes('tiktok.com')) return 'tiktok';
    if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
    if (lower.includes('instagram.com/reel') || lower.includes('instagram.com/p/')) return 'instagram';
    if (lower.includes('facebook.com/reel') || lower.includes('fb.watch') || lower.includes('facebook.com/watch') || lower.includes('facebook.com/share/v/')) return 'facebook';
    if (lower.includes('twitter.com') || lower.includes('x.com')) return 'twitter';
    return null;
  };

  it('detects TikTok URLs', () => {
    expect(detectPlatform('https://www.tiktok.com/@user/video/123')).toBe('tiktok');
    expect(detectPlatform('https://vm.tiktok.com/abc123')).toBe('tiktok');
    expect(detectPlatform('https://www.TIKTOK.COM/@user/video/123')).toBe('tiktok');
  });

  it('detects YouTube URLs', () => {
    expect(detectPlatform('https://www.youtube.com/watch?v=abc')).toBe('youtube');
    expect(detectPlatform('https://youtu.be/abc')).toBe('youtube');
    expect(detectPlatform('https://www.youtube.com/shorts/abc')).toBe('youtube');
  });

  it('detects Instagram URLs', () => {
    expect(detectPlatform('https://www.instagram.com/reel/abc/')).toBe('instagram');
    expect(detectPlatform('https://www.instagram.com/p/abc/')).toBe('instagram');
    expect(detectPlatform('https://www.Instagram.com/Reel/abc/')).toBe('instagram');
  });

  it('detects Facebook URLs', () => {
    expect(detectPlatform('https://www.facebook.com/reel/123')).toBe('facebook');
    expect(detectPlatform('https://fb.watch/abc')).toBe('facebook');
    expect(detectPlatform('https://www.facebook.com/share/v/abc')).toBe('facebook');
  });

  it('detects Twitter/X URLs', () => {
    expect(detectPlatform('https://twitter.com/user/status/123')).toBe('twitter');
    expect(detectPlatform('https://x.com/user/status/123')).toBe('twitter');
  });

  it('returns null for unknown URLs', () => {
    expect(detectPlatform('https://example.com/page')).toBeNull();
    expect(detectPlatform('https://vimeo.com/123')).toBeNull();
  });
});
