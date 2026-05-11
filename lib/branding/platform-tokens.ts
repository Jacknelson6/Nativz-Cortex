// VFF-08 T01: platform color + logomark tokens.
// Used by FormatCardFallback when a thumbnail is missing, and any
// other surface that needs a platform-tinted block. Hex values
// mirror `--platform-*-mark` CSS vars in `app/globals.css`.

import type { ReactNode } from 'react';
import { createElement } from 'react';

export type Platform = 'tiktok' | 'instagram' | 'youtube';

// Tailwind class names that point at `--platform-*-mark`. Use these
// instead of inline backgrounds so card hover/focus tokens still apply.
export const PLATFORM_BG: Record<Platform, string> = {
  tiktok: 'bg-platform-tiktok',
  instagram: 'bg-platform-instagram',
  youtube: 'bg-platform-youtube',
};

// Centered logomark glyphs. Kept as simple SVG primitives so we don't
// pull in a third-party icon set just for the fallback layer.
export const PLATFORM_LOGOMARK: Record<Platform, ReactNode> = {
  tiktok: createElement(
    'svg',
    { viewBox: '0 0 48 48', fill: 'currentColor', 'aria-hidden': true, className: 'h-10 w-10 text-white' },
    createElement('path', {
      d: 'M30.4 6h-5.5v25.7c0 3-2.4 5.4-5.4 5.4s-5.4-2.4-5.4-5.4 2.4-5.4 5.4-5.4c.5 0 1 .1 1.5.2v-5.6c-.5-.1-1-.1-1.5-.1-6 0-10.9 4.9-10.9 10.9S13.5 42.7 19.5 42.7s10.9-4.9 10.9-10.9V17.6c2.1 1.5 4.7 2.4 7.5 2.4v-5.5c-4.2 0-7.5-3.4-7.5-7.5V6z',
    }),
  ),
  instagram: createElement(
    'svg',
    { viewBox: '0 0 48 48', fill: 'currentColor', 'aria-hidden': true, className: 'h-10 w-10 text-white' },
    createElement('path', {
      d: 'M24 4.3c6.4 0 7.2 0 9.7.1 2.3.1 3.6.5 4.4.8 1.1.4 1.9 1 2.7 1.8s1.3 1.6 1.8 2.7c.3.8.7 2.1.8 4.4.1 2.5.1 3.3.1 9.7s0 7.2-.1 9.7c-.1 2.3-.5 3.6-.8 4.4-.4 1.1-1 1.9-1.8 2.7s-1.6 1.3-2.7 1.8c-.8.3-2.1.7-4.4.8-2.5.1-3.3.1-9.7.1s-7.2 0-9.7-.1c-2.3-.1-3.6-.5-4.4-.8-1.1-.4-1.9-1-2.7-1.8s-1.3-1.6-1.8-2.7c-.3-.8-.7-2.1-.8-4.4-.1-2.5-.1-3.3-.1-9.7s0-7.2.1-9.7c.1-2.3.5-3.6.8-4.4.4-1.1 1-1.9 1.8-2.7s1.6-1.3 2.7-1.8c.8-.3 2.1-.7 4.4-.8 2.5-.1 3.3-.1 9.7-.1zm0 4.3c-6.3 0-7 0-9.5.1-2.1.1-3.2.4-4 .7-1 .4-1.7.9-2.5 1.6s-1.2 1.5-1.6 2.5c-.3.8-.6 1.9-.7 4-.1 2.5-.1 3.2-.1 9.5s0 7 .1 9.5c.1 2.1.4 3.2.7 4 .4 1 .9 1.7 1.6 2.5s1.5 1.2 2.5 1.6c.8.3 1.9.6 4 .7 2.5.1 3.2.1 9.5.1s7 0 9.5-.1c2.1-.1 3.2-.4 4-.7 1-.4 1.7-.9 2.5-1.6s1.2-1.5 1.6-2.5c.3-.8.6-1.9.7-4 .1-2.5.1-3.2.1-9.5s0-7-.1-9.5c-.1-2.1-.4-3.2-.7-4-.4-1-.9-1.7-1.6-2.5s-1.5-1.2-2.5-1.6c-.8-.3-1.9-.6-4-.7-2.5-.1-3.2-.1-9.5-.1zm0 7.3a10.1 10.1 0 1 1 0 20.2 10.1 10.1 0 0 1 0-20.2zm0 16.7a6.6 6.6 0 1 0 0-13.2 6.6 6.6 0 0 0 0 13.2zm12.9-17.1a2.4 2.4 0 1 1-4.8 0 2.4 2.4 0 0 1 4.8 0z',
    }),
  ),
  youtube: createElement(
    'svg',
    { viewBox: '0 0 48 48', fill: 'currentColor', 'aria-hidden': true, className: 'h-10 w-10 text-white' },
    createElement('path', { d: 'M19 16v16l14-8z' }),
  ),
};
