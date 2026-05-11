'use client';

// VFF-09 T11: platform-aware embed for the detail view.
// Renders the original platform's iframe so we never re-host video.
// Falls back to thumbnail + "Open on platform" link if the iframe
// errors or load times out (some accounts disallow embedding).

import { useEffect, useRef, useState } from 'react';
import type { Platform } from '@/lib/branding/platform-tokens';
import { FormatCardFallback } from './format-card-fallback';

type Props = {
  platform: Platform;
  source_url: string;
  external_post_id: string | null;
  fallback_thumbnail: string | null;
};

const EMBED_LOAD_TIMEOUT_MS = 6000;

function buildEmbedSrc(platform: Platform, externalId: string | null, sourceUrl: string): string | null {
  if (platform === 'tiktok' && externalId) {
    return `https://www.tiktok.com/embed/v2/${externalId}`;
  }
  if (platform === 'instagram') {
    // The /embed/captioned variant works on reels + posts; the host needs
    // the canonical URL, not an internal id.
    return `${sourceUrl.replace(/\/$/, '')}/embed/captioned`;
  }
  if (platform === 'youtube' && externalId) {
    return `https://www.youtube.com/embed/${externalId}?rel=0`;
  }
  return null;
}

export function FormatVideoPreview({ platform, source_url, external_post_id, fallback_thumbnail }: Props) {
  const [errored, setErrored] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const embedSrc = buildEmbedSrc(platform, external_post_id, source_url);

  useEffect(() => {
    if (!embedSrc || errored || loaded) return;
    timer.current = setTimeout(() => {
      if (!loaded) setErrored(true);
    }, EMBED_LOAD_TIMEOUT_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [embedSrc, errored, loaded]);

  if (!embedSrc || errored) {
    return (
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-md bg-surface">
        {fallback_thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={fallback_thumbnail}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <FormatCardFallback platform={platform} />
        )}
        <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/85 via-black/30 to-transparent p-4">
          <a
            href={source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-accent px-4 py-2 text-xs font-medium text-accent-contrast hover:bg-accent-hover"
          >
            Open on {platformLabel(platform)}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="relative aspect-[9/16] w-full overflow-hidden rounded-md bg-black">
      <iframe
        src={embedSrc}
        title={`${platformLabel(platform)} video embed`}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        className="absolute inset-0 h-full w-full border-0"
      />
    </div>
  );
}

function platformLabel(p: Platform): string {
  return p === 'tiktok' ? 'TikTok' : p === 'instagram' ? 'Instagram' : 'YouTube';
}
