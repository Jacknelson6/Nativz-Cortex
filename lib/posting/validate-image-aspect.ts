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
