import type { PlatformNormalizer, SocialPlatform } from '@/lib/types/reporting';
import { instagramNormalizer } from './instagram';
import { facebookNormalizer } from './facebook';
import { tiktokNormalizer } from './tiktok';
import { youtubeNormalizer } from './youtube';

const normalizers: Record<SocialPlatform, PlatformNormalizer> = {
  instagram: instagramNormalizer,
  facebook: facebookNormalizer,
  tiktok: tiktokNormalizer,
  youtube: youtubeNormalizer,
};

export function getNormalizer(platform: SocialPlatform): PlatformNormalizer {
  return normalizers[platform];
}
