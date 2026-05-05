import type { SupabaseClient } from '@supabase/supabase-js';
import type { SocialPlatform } from '@/lib/posting/types';
import {
  CANONICAL_RATIOS,
  planAutoCrop,
  computeCenterCrop,
} from '@/lib/posting/auto-crop-image';
import { getPostingService } from '@/lib/posting';

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

  const slides: SlideEntry[] = [];
  for (const m of carouselRows) {
    let dims: { width: number | null; height: number | null };
    const sourceUrl = m.late_media_url ?? m.storage_path ?? null;
    if (m.width != null && m.height != null) {
      dims = { width: m.width, height: m.height };
    } else {
      if (!sourceUrl) {
        slides.push({ mediaId: m.id, sourceUrl, width: null, height: null });
        continue;
      }
      const probed = await probeImageDimensions(sourceUrl);
      if (probed) {
        dims = probed;
        await admin
          .from('scheduler_media')
          .update({ width: probed.width, height: probed.height })
          .eq('id', m.id);
      } else {
        slides.push({ mediaId: m.id, sourceUrl, width: null, height: null });
        continue;
      }
    }

    // Hard-rescue: only fires when source ratio is *outside* IG's 0.75-1.91
    // bounds (strict mode skips the soft-snap). Without this, Zernio rejects
    // the IG leg with a deterministic 400 and we burn 3 retries plus a
    // posting health alert before the post is marked failed. Soft-snap stays
    // client-side so we don't silently re-crop legacy artwork the user has
    // already approved.
    if (dims.width != null && dims.height != null) {
      const plan = planAutoCrop(dims.width, dims.height, { strict: true });
      if (plan && sourceUrl) {
        const rescued = await rescueCropOnZernio({
          admin,
          mediaId: m.id,
          sourceUrl,
          sourceWidth: dims.width,
          sourceHeight: dims.height,
          targetRatio: plan.targetRatio,
        });
        if (rescued) dims = rescued;
      }
    }

    slides.push({ mediaId: m.id, sourceUrl, width: dims.width, height: dims.height });
  }

  // Carousel mixed-aspect rescue. IG accepts mixed-ratio carousels but Zernio
  // (and several IG client SDKs) reject them when slides differ by more than
  // a small tolerance — the post fails with "media aspect ratios must match".
  // Snap every slide to the dominant canonical ratio (4:5 / 1:1 / 1.91:1) so
  // the carousel ships uniform.
  await alignCarouselToDominantRatio(admin, slides);

  return validateCarouselForPlatform(
    'instagram',
    slides.map((s) => ({ width: s.width, height: s.height })),
  );
}

type SlideEntry = {
  mediaId: string;
  sourceUrl: string | null;
  width: number | null;
  height: number | null;
};

/**
 * Carousel slides with mismatched aspect ratios cause IG/Zernio to reject the
 * whole post. Bucket each slide by its closest canonical ratio (4:5, 1:1,
 * 1.91:1), pick the dominant bucket (ties broken by 1:1), and re-crop every
 * non-matching slide to that ratio. No-op when slides already share a bucket
 * or fewer than two slides have known dims.
 */
async function alignCarouselToDominantRatio(
  admin: SupabaseClient,
  slides: SlideEntry[],
): Promise<void> {
  const sized = slides.filter(
    (s): s is SlideEntry & { width: number; height: number } =>
      s.width != null && s.height != null,
  );
  if (sized.length < 2) return;

  const buckets = new Map<number, number>();
  for (const s of sized) {
    const ratio = s.width / s.height;
    const bucket = closestCanonicalRatio(ratio);
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }
  if (buckets.size <= 1) return;

  let dominant = 1;
  let bestCount = -1;
  for (const [ratio, count] of buckets) {
    if (count > bestCount || (count === bestCount && ratio === 1)) {
      dominant = ratio;
      bestCount = count;
    }
  }

  for (const slide of slides) {
    if (slide.width == null || slide.height == null || !slide.sourceUrl) continue;
    const sourceRatio = slide.width / slide.height;
    if (Math.abs(sourceRatio - dominant) / dominant < 0.02) continue;
    const rescued = await rescueCropOnZernio({
      admin,
      mediaId: slide.mediaId,
      sourceUrl: slide.sourceUrl,
      sourceWidth: slide.width,
      sourceHeight: slide.height,
      targetRatio: dominant,
    });
    if (rescued) {
      slide.width = rescued.width;
      slide.height = rescued.height;
    }
  }
}

function closestCanonicalRatio(ratio: number): number {
  let best = CANONICAL_RATIOS[0].value;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const c of CANONICAL_RATIOS) {
    const delta = Math.abs(c.value - ratio);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = c.value;
    }
  }
  return best;
}

/**
 * Download the image, sharp-extract a center crop to the planned ratio,
 * re-upload via Zernio's presign endpoint, and persist the new URL + dims
 * onto the scheduler_media row. Returns the new dims on success, null on
 * any failure (callers fall through to the original dims, which means
 * the IG pre-flight will surface the existing aspect issue).
 */
async function rescueCropOnZernio(args: {
  admin: SupabaseClient;
  mediaId: string;
  sourceUrl: string;
  sourceWidth: number;
  sourceHeight: number;
  targetRatio: number;
}): Promise<{ width: number; height: number } | null> {
  try {
    const res = await fetch(args.sourceUrl);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());

    const crop = computeCenterCrop(args.sourceWidth, args.sourceHeight, args.targetRatio);
    const sharp = (await import('sharp')).default;
    const cropped = await sharp(buf)
      .extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height })
      .jpeg({ quality: 92 })
      .toBuffer();

    const filename = `auto-cropped-${args.mediaId}-${Date.now()}.jpg`;
    const service = getPostingService();
    const { uploadUrl, publicUrl } = await service.getMediaUploadUrl('image/jpeg', filename);

    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: new Uint8Array(cropped),
    });
    if (!putRes.ok) return null;

    await args.admin
      .from('scheduler_media')
      .update({
        late_media_url: publicUrl,
        width: crop.width,
        height: crop.height,
        mime_type: 'image/jpeg',
      })
      .eq('id', args.mediaId);

    return { width: crop.width, height: crop.height };
  } catch {
    return null;
  }
}
