import * as cheerio from 'cheerio';

export interface QuickMetadata {
  title: string | null;
  thumbnail_url: string | null;
  author_name: string | null;
  author_handle: string | null;
  stats: { views: number; likes: number; comments: number; shares: number } | null;
  music: string | null;
  duration: number | null;
  hashtags: string[];
  video_url: string | null;
}

export async function fetchTikTokMetadata(url: string): Promise<QuickMetadata> {
  const result: QuickMetadata = {
    title: null,
    thumbnail_url: null,
    author_name: null,
    author_handle: null,
    stats: null,
    music: null,
    duration: null,
    hashtags: [],
    video_url: null,
  };

  const tikwmPromise = fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`, {
    signal: AbortSignal.timeout(6000),
  })
    .then(async (res) => {
      if (!res.ok) return null;
      const json = await res.json();
      if (json.code !== 0 || !json.data) return null;
      return json.data;
    })
    .catch(() => null);

  const oembedPromise = fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, {
    signal: AbortSignal.timeout(5000),
  })
    .then(async (res) => {
      if (!res.ok) return null;
      return res.json();
    })
    .catch(() => null);

  const scrapePromise = fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(5000),
  })
    .then(async (res) => {
      if (!res.ok) return null;
      return res.text();
    })
    .catch(() => null);

  const [tikwmData, oembedData, htmlText] = await Promise.all([tikwmPromise, oembedPromise, scrapePromise]);

  if (tikwmData) {
    const d = tikwmData;
    result.title = d.title || null;
    result.thumbnail_url = d.cover || d.origin_cover || null;
    result.author_name = d.author?.nickname || null;
    result.author_handle = d.author?.unique_id || null;
    result.duration = d.duration || null;
    result.music = d.music_info?.title ?? d.music ?? null;
    result.video_url = d.play || null;
    const s = d.statistics ?? {};
    result.stats = {
      views: s.playCount ?? d.play_count ?? 0,
      likes: s.diggCount ?? d.digg_count ?? 0,
      comments: s.commentCount ?? d.comment_count ?? 0,
      shares: s.shareCount ?? d.share_count ?? 0,
    };
    const hashtagMatches = (d.title || '').match(/#\w+/g);
    result.hashtags = hashtagMatches ? hashtagMatches.map((h: string) => h.replace('#', '')) : [];
  }

  if (oembedData) {
    result.title = result.title || oembedData.title || null;
    result.thumbnail_url = result.thumbnail_url || oembedData.thumbnail_url || null;
    result.author_name = result.author_name || oembedData.author_name || null;
    result.author_handle = result.author_handle || oembedData.author_unique_id || null;
  }

  if (htmlText) {
    try {
      const $ = cheerio.load(htmlText);

      let universalData: Record<string, unknown> | null = null;
      $('script#__UNIVERSAL_DATA_FOR_REHYDRATION__').each((_i, el) => {
        try {
          universalData = JSON.parse($(el).html() || '');
        } catch {
          /* ignore */
        }
      });

      if (universalData) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const scope = (universalData as any)?.['__DEFAULT_SCOPE__'];
          const videoDetail = scope?.['webapp.video-detail']?.['itemInfo']?.['itemStruct'];
          if (videoDetail) {
            result.author_name = result.author_name || videoDetail.author?.nickname || null;
            result.author_handle = result.author_handle || videoDetail.author?.uniqueId || null;
            result.duration = result.duration || videoDetail.video?.duration || null;
            result.title = result.title || videoDetail.desc || null;
            result.thumbnail_url =
              result.thumbnail_url || videoDetail.video?.cover || videoDetail.video?.originCover || null;
            const s = videoDetail.stats;
            if (s && !result.stats) {
              result.stats = {
                views: s.playCount || 0,
                likes: s.diggCount || 0,
                comments: s.commentCount || 0,
                shares: s.shareCount || 0,
              };
            }
            if (videoDetail.music?.title) {
              result.music = result.music || videoDetail.music.title;
            }
            if (!result.hashtags.length && videoDetail.textExtra) {
              result.hashtags = videoDetail.textExtra
                .filter((t: { hashtagName?: string }) => t.hashtagName)
                .map((t: { hashtagName: string }) => t.hashtagName);
            }
          }
        } catch {
          /* structure may change */
        }
      }

      if (!result.thumbnail_url) {
        result.thumbnail_url = $('meta[property="og:image"]').attr('content') || null;
      }
      if (!result.title) {
        const ogDesc = $('meta[property="og:description"]').attr('content');
        const ogTitle = $('meta[property="og:title"]').attr('content');
        result.title = ogDesc || ogTitle || null;
      }
    } catch {
      /* HTML parsing failed */
    }
  }

  return result;
}

export interface GatheredQuickFields {
  quickTitle: string | null;
  quickThumbnail: string | null;
  detectedPlatform: string | null;
  authorName: string | null;
  authorHandle: string | null;
  stats: { views: number; likes: number; comments: number; shares: number } | null;
  music: string | null;
  duration: number | null;
  hashtags: string[];
  videoUrl: string | null;
}

/**
 * Fetches platform metadata for a moodboard item URL (same logic as POST /api/analysis/items).
 */
export async function gatherQuickMetadataForItemUrl(
  url: string,
  itemType: 'video' | 'image' | 'website',
): Promise<GatheredQuickFields> {
  let quickTitle: string | null = null;
  let quickThumbnail: string | null = null;
  let detectedPlatform: string | null = null;
  let authorName: string | null = null;
  let authorHandle: string | null = null;
  let stats: { views: number; likes: number; comments: number; shares: number } | null = null;
  let music: string | null = null;
  let duration: number | null = null;
  let hashtags: string[] = [];
  let videoUrl: string | null = null;
  const urlLower = url.toLowerCase();

  try {
    if (urlLower.includes('tiktok.com')) {
      detectedPlatform = 'tiktok';
      const meta = await fetchTikTokMetadata(url);
      quickTitle = quickTitle || meta.title;
      quickThumbnail = meta.thumbnail_url;
      authorName = meta.author_name;
      authorHandle = meta.author_handle;
      stats = meta.stats;
      music = meta.music;
      duration = meta.duration;
      hashtags = meta.hashtags;
      videoUrl = meta.video_url;
    } else if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
      detectedPlatform = 'youtube';
      try {
        const oembedRes = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
          { signal: AbortSignal.timeout(5000) },
        );
        if (oembedRes.ok) {
          const oembed = await oembedRes.json();
          quickTitle = quickTitle || oembed.title || null;
          quickThumbnail = oembed.thumbnail_url || null;
          authorName = oembed.author_name || null;
        }
      } catch {
        /* youtube oembed failed */
      }
    } else if (urlLower.includes('instagram.com/reel') || urlLower.includes('instagram.com/p/')) {
      detectedPlatform = 'instagram';

      try {
        const oembedRes = await fetch(
          `https://api.instagram.com/oembed?url=${encodeURIComponent(url)}&omitscript=true`,
          { signal: AbortSignal.timeout(4000) },
        );
        if (oembedRes.ok) {
          const oembed = await oembedRes.json();
          quickTitle = quickTitle || oembed.title || null;
          quickThumbnail = oembed.thumbnail_url || null;
          authorName = oembed.author_name || null;
        }
      } catch {
        /* Instagram oEmbed failed */
      }

      if (!quickThumbnail) {
        try {
          const res = await fetch(url, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              'Cache-Control': 'no-cache',
              Pragma: 'no-cache',
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(7000),
          });

          if (res.ok) {
            const html = await res.text();
            const $ = cheerio.load(html);

            quickThumbnail = quickThumbnail || $('meta[property="og:image"]').attr('content') || null;
            const ogTitle = $('meta[property="og:title"]').attr('content') || null;
            const ogDesc = $('meta[property="og:description"]').attr('content');

            if (ogTitle && ogTitle.includes('Instagram:')) {
              const parts = ogTitle.split(': ');
              if (parts.length > 1) {
                authorName = authorName || parts[0].replace(' on Instagram', '');
                if (!quickTitle) {
                  quickTitle = parts.slice(1).join(': ').replace(/^["']|["']$/g, '');
                }
              }
            }

            if (!quickTitle || quickTitle === 'Instagram') {
              quickTitle = ogTitle || ogDesc || null;
            }

            if (!authorName) {
              authorName = $('meta[name="author"]').attr('content') || null;
            }
          }
        } catch (err) {
          console.error('Instagram HTML scrape failed:', err);
        }
      }
    } else if (
      urlLower.includes('facebook.com/reel') ||
      urlLower.includes('fb.watch') ||
      urlLower.includes('facebook.com/watch') ||
      urlLower.includes('facebook.com/share/v/')
    ) {
      detectedPlatform = 'facebook';
      try {
        const oembedRes = await fetch(
          `https://www.facebook.com/plugins/video/oembed.json?url=${encodeURIComponent(url)}`,
          { signal: AbortSignal.timeout(5000) },
        );
        if (oembedRes.ok) {
          const oembed = await oembedRes.json();
          quickTitle = quickTitle || oembed.title || null;
          quickThumbnail = oembed.thumbnail_url || null;
          authorName = oembed.author_name || null;
        }
      } catch {
        /* facebook oembed failed */
      }

      if (!quickThumbnail) {
        try {
          const res = await fetch(url, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              Accept: 'text/html,application/xhtml+xml',
              'Accept-Language': 'en-US,en;q=0.9',
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(5000),
          });
          if (res.ok) {
            const html = await res.text();
            const $ = cheerio.load(html);
            quickThumbnail = quickThumbnail || $('meta[property="og:image"]').attr('content') || null;
            quickTitle =
              quickTitle ||
              $('meta[property="og:description"]').attr('content') ||
              $('meta[property="og:title"]').attr('content') ||
              null;
          }
        } catch {
          /* scrape failed */
        }
      }
    } else if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) {
      detectedPlatform = 'twitter';
    } else if (itemType === 'website') {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const html = await res.text();
          const $ = cheerio.load(html);
          quickTitle = quickTitle || $('meta[property="og:title"]').attr('content') || $('title').text() || null;
          quickThumbnail = quickThumbnail || $('meta[property="og:image"]').attr('content') || null;
        }
      } catch {
        /* website scrape failed */
      }
    }
  } catch {
    /* Metadata fetch failed */
  }

  return {
    quickTitle,
    quickThumbnail,
    detectedPlatform,
    authorName,
    authorHandle,
    stats,
    music,
    duration,
    hashtags,
    videoUrl,
  };
}
