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

export interface SubtitleSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptResult {
  text: string;
  segments: SubtitleSegment[];
}

/**
 * Parse WebVTT/SRT subtitle content into plain text and timestamped segments.
 */
function parseSubtitles(content: string): TranscriptResult {
  const segments: SubtitleSegment[] = [];
  const lines = content.split('\n');
  let i = 0;

  // Skip WebVTT header
  if (lines[0]?.trim().startsWith('WEBVTT')) i = 1;

  while (i < lines.length) {
    const line = lines[i]?.trim() ?? '';
    // Look for timestamp lines: "00:00:00.000 --> 00:00:02.000"
    const tsMatch = line.match(
      /(\d{1,2}:)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{1,2}:)?(\d{2}):(\d{2})[.,](\d{3})/,
    );
    if (tsMatch) {
      const parseTime = (h: string | undefined, m: string, s: string, ms: string) => {
        return (parseInt(h || '0') * 3600) + (parseInt(m) * 60) + parseInt(s) + parseInt(ms) / 1000;
      };
      const start = parseTime(tsMatch[1]?.replace(':', ''), tsMatch[2], tsMatch[3], tsMatch[4]);
      const end = parseTime(tsMatch[5]?.replace(':', ''), tsMatch[6], tsMatch[7], tsMatch[8]);

      // Collect text lines until blank line or next timestamp
      const textLines: string[] = [];
      i++;
      while (i < lines.length && lines[i]?.trim() !== '') {
        const tl = lines[i].trim();
        // Skip SRT sequence numbers and timestamp-only lines
        if (!tl.match(/^\d+$/) && !tl.match(/-->/) ) {
          // Strip HTML tags like <c> </c> and WebVTT positioning
          textLines.push(tl.replace(/<[^>]+>/g, '').replace(/\{[^}]+\}/g, '').trim());
        }
        i++;
      }
      const text = textLines.filter(Boolean).join(' ');
      if (text) {
        segments.push({ start, end, text });
      }
    }
    i++;
  }

  // Deduplicate consecutive identical text (TikTok often has overlapping cues)
  const deduped: SubtitleSegment[] = [];
  for (const seg of segments) {
    if (deduped.length === 0 || deduped[deduped.length - 1].text !== seg.text) {
      deduped.push(seg);
    }
  }

  return {
    text: deduped.map((s) => s.text).join(' '),
    segments: deduped,
  };
}

/**
 * Extract subtitles from TikTok's __UNIVERSAL_DATA_FOR_REHYDRATION__ page data.
 * Falls back to tikwm API subtitle data. No Whisper/OpenAI dependency.
 */
export async function extractTikTokTranscript(
  url: string,
  _videoUrl?: string | null,
): Promise<TranscriptResult> {
  const empty: TranscriptResult = { text: '', segments: [] };
  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  // --- Approach 1: Fetch TikTok page and extract embedded subtitle URLs ---
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok) {
      const html = await res.text();
      const $ = cheerio.load(html);
      let universalData: Record<string, unknown> | null = null;
      $('script#__UNIVERSAL_DATA_FOR_REHYDRATION__').each((_i, el) => {
        try { universalData = JSON.parse($(el).html() || ''); } catch { /* ignore */ }
      });

      if (universalData) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const scope = (universalData as any)?.['__DEFAULT_SCOPE__'];
        const itemStruct = scope?.['webapp.video-detail']?.['itemInfo']?.['itemStruct'];
        const video = itemStruct?.video;

        // Try subtitleInfos (array of subtitle objects with Url/UrlExpire)
        const subtitleInfos: Array<{ Url?: string; UrlExpire?: string; Format?: string; LanguageCodeName?: string; url?: string }> =
          video?.subtitleInfos ?? video?.captions ?? video?.subtitleInfo ?? [];

        // Prefer English, otherwise take first available
        const englishSub = subtitleInfos.find((s) =>
          (s.LanguageCodeName || '').toLowerCase().startsWith('en'),
        );
        const subtitle = englishSub ?? subtitleInfos[0];
        const subtitleUrl = subtitle?.Url ?? subtitle?.UrlExpire ?? subtitle?.url;

        if (subtitleUrl) {
          const subRes = await fetch(subtitleUrl, {
            headers: { 'User-Agent': UA },
            signal: AbortSignal.timeout(10000),
          });
          if (subRes.ok) {
            const content = await subRes.text();
            const result = parseSubtitles(content);
            if (result.text) return result;
          }
        }
      }
    }
  } catch (e) {
    console.error('TikTok subtitle extraction (HTML) error:', e);
  }

  // --- Approach 2: Try tikwm API for subtitle data ---
  try {
    const tikwmRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(15000),
    });
    if (tikwmRes.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = (await tikwmRes.json()) as any;
      const data = json?.data;
      // tikwm sometimes includes subtitle_url or subtitles
      const subUrl = data?.subtitle_url ?? data?.subtitles?.[0]?.url;
      if (subUrl) {
        const subRes = await fetch(subUrl, {
          headers: { 'User-Agent': UA },
          signal: AbortSignal.timeout(10000),
        });
        if (subRes.ok) {
          const result = parseSubtitles(await subRes.text());
          if (result.text) return result;
        }
      }
    }
  } catch (e) {
    console.error('TikTok subtitle extraction (tikwm) error:', e);
  }

  return empty;
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
