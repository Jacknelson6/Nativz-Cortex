import * as cheerio from 'cheerio';
import type { VideoFrame } from '@/lib/types/moodboard';

export interface TikTokMetadata {
  title: string;
  description: string;
  thumbnail_url: string;
  author_name: string;
  author_handle: string;
  duration: number;
  stats: {
    plays: number;
    likes: number;
    comments: number;
    shares: number;
  };
  video_url: string | null;
  music: string | null;
}

interface TikWMResponse {
  code: number;
  data: {
    title: string;
    cover: string;
    play: string;
    duration: number;
    music: string;
    music_info?: { title: string; author: string };
    author: { unique_id: string; nickname: string; avatar: string };
    statistics?: { diggCount: number; commentCount: number; shareCount: number; playCount: number };
    // Alternative stats location
    digg_count?: number;
    comment_count?: number;
    share_count?: number;
    play_count?: number;
  };
}

/**
 * Primary: Use tikwm.com API for TikTok metadata + video URL
 */
async function fetchViaTikWM(url: string): Promise<TikTokMetadata | null> {
  try {
    const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;

    const json = (await res.json()) as TikWMResponse;
    if (json.code !== 0 || !json.data) return null;

    const d = json.data;
    const stats = d.statistics ?? {
      playCount: d.play_count ?? 0,
      diggCount: d.digg_count ?? 0,
      commentCount: d.comment_count ?? 0,
      shareCount: d.share_count ?? 0,
    };

    return {
      title: d.title || '',
      description: d.title || '',
      thumbnail_url: d.cover || '',
      author_name: d.author?.nickname || '',
      author_handle: d.author?.unique_id || '',
      duration: d.duration || 0,
      stats: {
        plays: stats.playCount ?? 0,
        likes: stats.diggCount ?? 0,
        comments: stats.commentCount ?? 0,
        shares: stats.shareCount ?? 0,
      },
      video_url: d.play || null,
      music: d.music_info?.title ?? d.music ?? null,
    };
  } catch (e) {
    console.error('TikWM API error:', e);
    return null;
  }
}

/**
 * Fallback: Scrape TikTok page HTML for og: tags and __UNIVERSAL_DATA_FOR_REHYDRATION__
 */
async function fetchViaHTMLScrape(url: string): Promise<TikTokMetadata | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    const ogImage = $('meta[property="og:image"]').attr('content') || '';
    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    const ogDescription = $('meta[property="og:description"]').attr('content') || '';

    // Try to parse __UNIVERSAL_DATA_FOR_REHYDRATION__
    let universalData: Record<string, unknown> | null = null;
    $('script#__UNIVERSAL_DATA_FOR_REHYDRATION__').each((_i, el) => {
      try {
        universalData = JSON.parse($(el).html() || '');
      } catch { /* ignore */ }
    });

    // Extract from universal data if available
    let authorName = '';
    let authorHandle = '';
    let duration = 0;
    let stats = { plays: 0, likes: 0, comments: 0, shares: 0 };

    if (universalData) {
      try {
        // Navigate the nested structure - TikTok changes this frequently
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const defaultScope = (universalData as any)?.['__DEFAULT_SCOPE__'];
        const videoDetail = defaultScope?.['webapp.video-detail']?.['itemInfo']?.['itemStruct'];
        if (videoDetail) {
          authorName = videoDetail.author?.nickname || '';
          authorHandle = videoDetail.author?.uniqueId || '';
          duration = videoDetail.video?.duration || 0;
          const s = videoDetail.stats;
          if (s) {
            stats = {
              plays: s.playCount || 0,
              likes: s.diggCount || 0,
              comments: s.commentCount || 0,
              shares: s.shareCount || 0,
            };
          }
        }
      } catch { /* structure might change */ }
    }

    // Parse author from og:title if needed (format: "Author on TikTok")
    if (!authorName && ogTitle) {
      const match = ogTitle.match(/^(.+?)(?:\s+on\s+TikTok|\s*[-|])/i);
      if (match) authorName = match[1].trim();
    }

    if (!ogImage && !ogTitle) return null;

    return {
      title: ogDescription || ogTitle || '',
      description: ogDescription || '',
      thumbnail_url: ogImage,
      author_name: authorName,
      author_handle: authorHandle,
      duration,
      stats,
      video_url: null,
      music: null,
    };
  } catch (e) {
    console.error('TikTok HTML scrape error:', e);
    return null;
  }
}

/**
 * Last resort: TikTok oEmbed API
 */
async function fetchViaOEmbed(url: string): Promise<TikTokMetadata | null> {
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      title: data.title || '',
      description: data.title || '',
      thumbnail_url: data.thumbnail_url || '',
      author_name: data.author_name || '',
      author_handle: data.author_unique_id || '',
      duration: 0,
      stats: { plays: 0, likes: 0, comments: 0, shares: 0 },
      video_url: null,
      music: null,
    };
  } catch {
    return null;
  }
}

/**
 * Get TikTok metadata using tikwm API (primary), HTML scrape (fallback), oEmbed (last resort)
 */
export async function getTikTokMetadata(url: string): Promise<TikTokMetadata | null> {
  // Try tikwm first (best: gives video URL + full metadata)
  const tikwm = await fetchViaTikWM(url);
  if (tikwm && tikwm.thumbnail_url) return tikwm;

  // HTML scrape fallback
  const scraped = await fetchViaHTMLScrape(url);
  if (scraped && scraped.thumbnail_url) return scraped;

  // oEmbed last resort
  return fetchViaOEmbed(url);
}

/**
 * Extract transcript from TikTok video using OpenAI Whisper API
 * Downloads video, sends audio to Whisper for transcription
 */
export async function extractTikTokTranscript(videoUrl: string): Promise<string> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey || !videoUrl) return '';

  try {
    // Download video to memory
    const videoRes = await fetch(videoUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(30000),
    });
    if (!videoRes.ok) return '';

    const videoBuffer = await videoRes.arrayBuffer();
    // Limit to 25MB (Whisper API limit)
    if (videoBuffer.byteLength > 25 * 1024 * 1024) return '';

    const formData = new FormData();
    formData.append('file', new Blob([videoBuffer], { type: 'video/mp4' }), 'tiktok.mp4');
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'text');

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}` },
      body: formData,
      signal: AbortSignal.timeout(60000),
    });

    if (!whisperRes.ok) {
      console.error('Whisper API error:', whisperRes.status, await whisperRes.text());
      return '';
    }

    return (await whisperRes.text()).trim();
  } catch (e) {
    console.error('Transcript extraction error:', e);
    return '';
  }
}

/**
 * Extract key frames from video URL using canvas-based approach
 * Since we're on Vercel (no ffmpeg), we store the thumbnail + generate timestamps
 * Returns frame references that the frontend can use
 */
export async function extractKeyFrameReferences(
  videoUrl: string,
  duration: number,
  thumbnailUrl: string,
): Promise<VideoFrame[]> {
  // On Vercel, we can't run ffmpeg. Instead, create frame references
  // at regular intervals that the frontend can seek to.
  // The main thumbnail serves as the primary frame.
  if (!duration || duration <= 0) {
    return thumbnailUrl
      ? [{ url: thumbnailUrl, timestamp: 0, label: 'Cover' }]
      : [];
  }

  const frames: VideoFrame[] = [];
  const interval = Math.max(3, Math.floor(duration / 5)); // ~5 frames max

  for (let t = 0; t < duration; t += interval) {
    frames.push({
      url: thumbnailUrl, // Use thumbnail as placeholder; frontend can seek video
      timestamp: t,
      label: t === 0 ? 'Intro' : `${t}s`,
    });
  }

  return frames;
}
