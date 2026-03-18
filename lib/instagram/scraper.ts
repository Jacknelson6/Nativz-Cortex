import * as cheerio from 'cheerio';

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptResult {
  text: string;
  segments: TranscriptSegment[];
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Extract an Instagram post/reel shortcode from a URL.
 * Supports /p/CODE/, /reel/CODE/, /reels/CODE/, /tv/CODE/
 */
function extractShortcode(url: string): string | null {
  const match = url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  return match?.[1] ?? null;
}

/**
 * Approach 1: Parse Instagram page HTML for og:video meta tag.
 * Instagram sometimes includes the direct video URL in the og:video tag.
 */
async function fetchViaOGMeta(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Mode': 'navigate',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    // Try og:video meta tag
    const ogVideo = $('meta[property="og:video"]').attr('content')
      || $('meta[property="og:video:url"]').attr('content')
      || $('meta[property="og:video:secure_url"]').attr('content');

    if (ogVideo && ogVideo.includes('.mp4')) {
      return ogVideo;
    }

    // Try parsing embedded JSON data from scripts
    const scripts = $('script[type="application/ld+json"]');
    for (let i = 0; i < scripts.length; i++) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const json = JSON.parse($(scripts[i]).html() || '') as any;
        if (json.video?.contentUrl) return json.video.contentUrl;
        if (json.contentUrl && json['@type'] === 'VideoObject') return json.contentUrl;
      } catch { /* ignore */ }
    }

    // Try __additionalDataLoaded or shared_data script patterns
    const allScripts = $('script');
    for (let i = 0; i < allScripts.length; i++) {
      const content = $(allScripts[i]).html() || '';
      // Look for video_url in JSON data embedded in scripts
      const videoUrlMatch = content.match(/"video_url"\s*:\s*"(https?:[^"]+)"/);
      if (videoUrlMatch) {
        return videoUrlMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
      }
    }

    return null;
  } catch (e) {
    console.error('Instagram OG meta fetch error:', e);
    return null;
  }
}

/**
 * Approach 2: Use the Instagram GraphQL API with the shortcode.
 * This queries Instagram's public GraphQL endpoint.
 */
async function fetchViaGraphQL(shortcode: string): Promise<string | null> {
  try {
    // Instagram's GraphQL query for post data
    const queryHash = '9f8827793ef34641b2fb195d4d41151c';
    const variables = JSON.stringify({ shortcode, child_comment_count: 0, fetch_comment_count: 0, parent_comment_count: 0, has_threaded_comments: false });
    const url = `https://www.instagram.com/graphql/query/?query_hash=${queryHash}&variables=${encodeURIComponent(variables)}`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': '*/*',
        'X-IG-App-ID': '936619743392459',
        'X-Requested-With': 'XMLHttpRequest',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await res.json()) as any;
    const media = json?.data?.shortcode_media;
    if (!media) return null;

    // video_url is the direct CDN link
    return media.video_url ?? null;
  } catch (e) {
    console.error('Instagram GraphQL fetch error:', e);
    return null;
  }
}

/**
 * Approach 3: Use Instagram's oEmbed endpoint to get basic info,
 * then try the media page with ?__a=1&__d=dis query.
 */
async function fetchViaMediaEndpoint(shortcode: string): Promise<string | null> {
  try {
    const url = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json',
        'X-IG-App-ID': '936619743392459',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await res.json()) as any;
    const items = json?.items ?? json?.graphql?.shortcode_media ? [json.graphql.shortcode_media] : [];
    const item = items[0];
    if (!item) return null;

    // Various locations where video_url might be
    return item.video_url
      ?? item.video_versions?.[0]?.url
      ?? item.video_dash_manifest ? null : null; // dash manifest not useful
  } catch (e) {
    console.error('Instagram media endpoint error:', e);
    return null;
  }
}

/**
 * Get a direct MP4 CDN URL for an Instagram video/reel.
 * Tries multiple approaches with fallbacks.
 *
 * @param url - Instagram post/reel URL
 * @returns Direct MP4 URL or null if unavailable
 */
export async function getInstagramVideoUrl(url: string): Promise<string | null> {
  const shortcode = extractShortcode(url);

  // Approach 1: OG meta / embedded JSON from page HTML (most reliable for public posts)
  const ogUrl = await fetchViaOGMeta(url);
  if (ogUrl) return ogUrl;

  if (!shortcode) {
    console.error('Could not extract Instagram shortcode from URL:', url);
    return null;
  }

  // Approach 2: GraphQL API
  const gqlUrl = await fetchViaGraphQL(shortcode);
  if (gqlUrl) return gqlUrl;

  // Approach 3: Media endpoint
  const mediaUrl = await fetchViaMediaEndpoint(shortcode);
  if (mediaUrl) return mediaUrl;

  return null;
}

/**
 * Extract a transcript from an Instagram video/reel.
 *
 * Instagram does not provide built-in captions/subtitles via any API,
 * so we download the video and transcribe via Groq Whisper.
 *
 * @param url - Instagram post/reel URL
 * @returns Transcript text and timestamped segments
 */
export async function extractInstagramTranscript(
  url: string,
): Promise<TranscriptResult> {
  const empty: TranscriptResult = { text: '', segments: [] };

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    console.error('GROQ_API_KEY not configured — cannot transcribe Instagram video');
    return empty;
  }

  // Step 1: Get the direct video URL
  const videoUrl = await getInstagramVideoUrl(url);
  if (!videoUrl) {
    console.error('Could not resolve Instagram video URL for:', url);
    return empty;
  }

  // Step 2: Download the video (respect 25MB limit for Whisper)
  try {
    const videoRes = await fetch(videoUrl, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(30000),
    });
    if (!videoRes.ok) {
      console.error('Failed to download Instagram video:', videoRes.status);
      return empty;
    }

    const contentLength = Number(videoRes.headers.get('content-length') || 0);
    if (contentLength > 25 * 1024 * 1024) {
      console.warn('Instagram video too large for Whisper API (>25MB), skipping');
      return empty;
    }

    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

    // Step 3: Transcribe via Groq Whisper
    return await transcribeViaGroqWhisper(videoBuffer, groqKey);
  } catch (e) {
    console.error('Instagram transcript extraction error:', e);
    return empty;
  }
}

/**
 * Transcribe video audio via Groq's Whisper API.
 * Takes a raw video buffer and returns timestamped transcript.
 */
async function transcribeViaGroqWhisper(
  videoBuffer: Buffer,
  apiKey: string,
): Promise<TranscriptResult> {
  const empty: TranscriptResult = { text: '', segments: [] };

  // Build multipart form data
  const boundary = `----GroqWhisper${Date.now()}`;
  const parts: Buffer[] = [];

  // file field
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="video.mp4"\r\nContent-Type: video/mp4\r\n\r\n`
  ));
  parts.push(videoBuffer);
  parts.push(Buffer.from('\r\n'));

  // model field
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3\r\n`
  ));

  // response_format for timestamps
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\nverbose_json\r\n`
  ));

  // language hint
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nen\r\n`
  ));

  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
    signal: AbortSignal.timeout(60000),
  });

  if (!groqRes.ok) {
    console.error('Groq Whisper API error:', groqRes.status, await groqRes.text().catch(() => ''));
    return empty;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await groqRes.json()) as any;
  const text: string = json.text ?? '';
  const segments: TranscriptSegment[] = (json.segments ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s: any) => ({ start: s.start ?? 0, end: s.end ?? 0, text: (s.text ?? '').trim() }),
  );

  return { text, segments };
}
