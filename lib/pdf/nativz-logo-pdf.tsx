import React from 'react';
import { Image } from '@react-pdf/renderer';
import { NATIVZ_LOGO_ON_LIGHT_PNG } from '@/lib/brand-logo';

/** Height/width for archived source `docs/archive/offline-assets/nativz-logo-main-smallest.png` (1000×421). Keeps react-pdf from squashing the mark. */
const WORDMARK_HEIGHT_PER_WIDTH = 421 / 1000;

/** Nativz wordmark for white PDF pages (see `NATIVZ_LOGO_ON_LIGHT_PNG` in brand-logo). */
export function NativzLogoPdf({ width }: { width: number }) {
  const height = Math.max(1, Math.round(width * WORDMARK_HEIGHT_PER_WIDTH));
  return (
    <Image
      src={NATIVZ_LOGO_ON_LIGHT_PNG}
      style={{
        width,
        height,
        flexShrink: 0,
      }}
    />
  );
}
