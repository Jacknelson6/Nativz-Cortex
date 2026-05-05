import type { SupabaseClient } from '@supabase/supabase-js';
import type { SocialPlatform } from '@/lib/posting/types';

export interface AspectRule {
  min: number;
  max: number;
  description: string;
}

// Instagram feed images: 4:5 (0.8) to 1.91:1. Zernio echoes 0.75 as the floor,
// so we keep the looser bound to match its server-side check exactly. Outside
// this range Zernio returns a hard 400 — we'd retry 3 times and email a noisy
// "posting health alert" before giving up.
//
// Other platforms either accept arbitrary ratios (Facebook, LinkedIn) or apply
// platform-side cropping (TikTok image posts). We only enforce Instagram here
// because that's the only ratio that produces a deterministic Zernio reject.
const PLATFORM_IMAGE_ASPECT: Partial<Record<SocialPlatform, AspectRule>> = {
  instagram: { min: 0.75, max: 1.91, description: '0.75 to 1.91 (4:5 to 1.91:1)' },
};

export interface ImageAspectIssue {
  platform: SocialPlatform;
  ratio: number;
  width: number;
  height: number;
  rule: AspectRule;
  reason: string;
}

/**
 * Evaluate one image (width x height) against a platform's aspect rule.
 * Returns null if the platform has no rule, the dimensions are missing, or the
 * ratio is in range. Returns a populated issue otherwise.
 */
export function checkImageAspect(
  platform: SocialPlatform,
  width: number | null | undefined,
  height: number | null | undefined,
): ImageAspectIssue | null {
  const rule = PLATFORM_IMAGE_ASPECT[platform];
  if (!rule) return null;
  if (!width || !height) return null;
  const ratio = width / height;
  if (ratio >= rule.min && ratio <= rule.max) return null;
  const ratioStr = ratio.toFixed(2);
  const reason =
    ratio < rule.min
      ? `Image is ${width}x${height} (aspect ${ratioStr}:1, too tall). ${platform} feed requires ${rule.description}.`
      : `Image is ${width}x${height} (aspect ${ratioStr}:1, too wide). ${platform} feed requires ${rule.description}.`;
  return { platform, ratio, width, height, rule, reason };
}

/**
 * Validate every image in a carousel against a platform rule. Returns the
 * first violation (if any), since a single bad image fails the whole post.
 */
export function validateCarouselForPlatform(
  platform: SocialPlatform,
  images: { width: number | null; height: number | null }[],
): ImageAspectIssue | null {
  for (const img of images) {
    const issue = checkImageAspect(platform, img.width, img.height);
    if (issue) return issue;
  }
  return null;
}

/**
 * Server-side dimension probe for an image URL. Sharp reads only the leading
 * bytes needed to decode the metadata header, so this stays cheap even for
 * 5MB+ source files. Returns null on any failure (network, unsupported format,
 * corrupt file) so callers can decide whether to skip the gate or fail the
 * post — we'd rather let Zernio reject a corrupt image than block a publish
 * because our probe couldn't read it.
 */
export async function probeImageDimensions(
  url: string,
): Promise<{ width: number; height: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const sharp = (await import('sharp')).default;
    const meta = await sharp(buf).metadata();
    if (!meta.width || !meta.height) return null;
    return { width: meta.width, height: meta.height };
  } catch {
    return null;
  }
}

/**
 * Pre-flight an image/carousel post against Instagram's aspect-ratio rule.
 *
 * Loads every linked scheduler_media row, probes any image with NULL
 * dimensions via Sharp, backfills the dims so future runs skip the probe,
 * then checks the carousel against the IG rule. Returns the first violation
 * or null when everything's in range.
 *
 * Both publish paths (cron sweep + approval-driven `publishScheduledPost`)
 * call this before handing the post to Zernio. Without it, Zernio returns
 * a hard 400 and we burn 3 retry attempts plus a "posting health alert"
 * email before the post is marked failed. Pre-rejecting the IG leg keeps
 * the retry quota for transient failures and lets the other platforms
 * (TikTok, Facebook, LinkedIn) publish uninterrupted.
 *
 * Only checks if `postType` is 'image' or 'carousel'. Returns null for
 * video/reel posts (Instagram applies its own crop on Reels). Returns null
 * if no media rows are attached, which lets the caller surface a clearer
 * error elsewhere instead of misattributing the failure to aspect ratio.
 */
export async function preflightInstagramAspectForPost(
  admin: SupabaseClient,
  postId: string,
  postType: string | null,
): Promise<ImageAspectIssue | null> {
  const isImagePost = postType === 'image' || postType === 'carousel';
  if (!isImagePost) return null;

  const { data: mediaRows } = await admin
    .from('scheduled_post_media')
    .select(
      'sort_order, scheduler_media:media_id (id, width, height, late_media_url, storage_path)',
    )
    .eq('post_id', postId)
    .order('sort_order');

  type MediaJoinRow = {
    scheduler_media:
      | {
          id: string;
          width: number | null;
          height: number | null;
          late_media_url: string | null;
          storage_path: string | null;
        }
      | {
          id: string;
          width: number | null;
          height: number | null;
          late_media_url: string | null;
          storage_path: string | null;
        }[]
      | null;
  };
  const carouselRows = ((mediaRows ?? []) as MediaJoinRow[])
    .map((r) =>
      Array.isArray(r.scheduler_media) ? r.scheduler_media[0] : r.scheduler_media,
    )
    .filter(
      (
        m,
      ): m is {
        id: string;
        width: number | null;
        height: number | null;
        late_media_url: string | null;
        storage_path: string | null;
      } => m != null,
    );

  if (carouselRows.length === 0) return null;

  const carousel: { width: number | null; height: number | null }[] = [];
  for (const m of carouselRows) {
    if (m.width != null && m.height != null) {
      carousel.push({ width: m.width, height: m.height });
      continue;
    }
    const url = m.late_media_url ?? m.storage_path ?? null;
    if (!url) {
      carousel.push({ width: null, height: null });
      continue;
    }
    const probed = await probeImageDimensions(url);
    if (probed) {
      carousel.push(probed);
      await admin
        .from('scheduler_media')
        .update({ width: probed.width, height: probed.height })
        .eq('id', m.id);
    } else {
      carousel.push({ width: null, height: null });
    }
  }

  return validateCarouselForPlatform('instagram', carousel);
}
