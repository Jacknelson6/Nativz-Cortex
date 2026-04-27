import { cn } from '@/lib/utils';
import { TikTokMark } from '@/components/integrations/tiktok-mark';
import { FacebookMark } from '@/components/integrations/facebook-mark';
import { InstagramMark } from '@/components/integrations/instagram-mark';
import { YouTubeMark } from '@/components/integrations/youtube-mark';
import { LinkedInMark } from '@/components/integrations/linkedin-mark';
import type { SocialPlatform } from '@/lib/types/reporting';

/**
 * Brand-faithful monochrome silhouette in a single ink color. Use anywhere
 * we want to flag a platform inline without dragging a chromatic pill or
 * full-color brand mark into the layout. Inherits color via `colorClass`
 * so it sits naturally inside muted/secondary text contexts.
 */
export function PlatformGlyph({
  platform,
  size = 22,
  colorClass = 'text-text-secondary',
}: {
  platform: SocialPlatform;
  size?: number;
  colorClass?: string;
}) {
  const className = cn('shrink-0', colorClass);
  switch (platform) {
    case 'tiktok':
      return <TikTokMark variant="mono" size={size} className={className} />;
    case 'instagram':
      return <InstagramMark variant="mono" size={size} className={className} />;
    case 'facebook':
      return <FacebookMark variant="mono" size={size} className={className} />;
    case 'youtube':
      return <YouTubeMark variant="mono" size={size} className={className} />;
    case 'linkedin':
      return <LinkedInMark variant="mono" size={size} className={className} />;
    default:
      return null;
  }
}
