// VFF-08 T02: platform-tinted fallback for missing thumbnails.
// Used by FormatCard when both thumbnail_storage_url and
// thumbnail_source_url are null, OR when the <img> errors at
// runtime. Visually distinct from a broken image and signals
// platform without text.

import { PLATFORM_BG, PLATFORM_LOGOMARK, type Platform } from '@/lib/branding/platform-tokens';

type Props = {
  platform: Platform;
};

export function FormatCardFallback({ platform }: Props) {
  return (
    <div
      className={`absolute inset-0 flex items-center justify-center ${PLATFORM_BG[platform]}`}
      aria-hidden
    >
      {PLATFORM_LOGOMARK[platform]}
    </div>
  );
}
