'use client';

// VFF-10 T15: format-pin card shown in Content Lab when the active
// conversation has format_video_id set. Renders a compact reel preview
// + the strategist's anchor descriptor + a Remove pin pill.
//
// Originally specced as a server component; we made it client-driven
// because Content Lab's conversation state is local-only (no server
// prop chain to hand format_video_id through). The component still
// hits the existing admin format detail endpoint, so the source of
// truth stays one helper.

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

interface FormatDetailLite {
  video: {
    id: string;
    platform: string;
    thumbnail_url: string | null;
    title: string | null;
    creator_handle: string | null;
    engagement_hook_descriptor: string | null;
  };
}

export function ContentLabFormatPin({
  videoId,
  conversationId,
  onRemoved,
}: {
  videoId: string;
  conversationId: string;
  // Parent-driven UI clear so the chat can hide the strip immediately.
  onRemoved: () => void;
}) {
  const [detail, setDetail] = useState<FormatDetailLite | null>(null);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/admin/formats/${videoId}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as FormatDetailLite;
        if (!cancelled) setDetail(data);
      } catch {
        // Pin row references a video that disappeared (deleted, dismissed
        // globally, etc.). Don't crash the chat — surface a quiet empty
        // state so the strategist sees the pin is broken and can clear it.
        if (!cancelled) setDetail(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  const remove = useCallback(async () => {
    setRemoving(true);
    try {
      const res = await fetch(
        `/api/admin/nerd-conversations/${conversationId}/format-pin`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('Format pin removed');
      onRemoved();
    } catch (err) {
      toast.error(`Could not remove format pin: ${String(err)}`);
      setRemoving(false);
    }
  }, [conversationId, onRemoved]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 border-b border-nativz-border/40 bg-surface/40 px-4 py-2 text-xs text-text-muted md:px-6">
        <Loader2 size={12} className="animate-spin" />
        Loading pinned format…
      </div>
    );
  }

  if (!detail?.video) {
    return (
      <div className="flex items-center justify-between gap-3 border-b border-nativz-border/40 bg-surface/40 px-4 py-2 text-xs text-text-muted md:px-6">
        <span>Pinned format reference is unavailable.</span>
        <button
          type="button"
          onClick={remove}
          disabled={removing}
          className="rounded-full border border-nativz-border/60 px-2 py-0.5 text-[11px] text-text-primary hover:bg-surface"
        >
          {removing ? 'Removing…' : 'Clear pin'}
        </button>
      </div>
    );
  }

  const v = detail.video;
  const subtitle =
    v.engagement_hook_descriptor?.trim() ||
    v.title?.trim() ||
    (v.creator_handle ? `@${v.creator_handle}` : 'Pinned reference');

  return (
    <div className="flex items-center gap-3 border-b border-nativz-border/40 bg-surface/40 px-4 py-2 md:px-6">
      <div className="relative h-12 w-9 shrink-0 overflow-hidden rounded bg-background">
        {v.thumbnail_url ? (
          <Image
            src={v.thumbnail_url}
            alt=""
            fill
            sizes="36px"
            className="object-cover"
            unoptimized
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-text-muted">
          Pinned format reference
        </p>
        <p className="truncate text-sm text-text-primary">{subtitle}</p>
      </div>
      <Link
        href={`/admin/formats/${v.id}`}
        className="hidden text-xs text-accent-text hover:underline md:inline"
      >
        Open detail
      </Link>
      <button
        type="button"
        onClick={remove}
        disabled={removing}
        className="inline-flex items-center gap-1 rounded-full border border-nativz-border/60 px-2 py-0.5 text-[11px] text-text-primary hover:bg-surface disabled:opacity-50"
      >
        <X size={10} />
        {removing ? 'Removing…' : 'Remove pin'}
      </button>
    </div>
  );
}
