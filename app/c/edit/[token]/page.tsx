'use client';

import Image from 'next/image';
import { use, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  Clock,
  Download,
  FileVideo,
  Film,
  Loader2,
  Play,
} from 'lucide-react';
import { useBrandMode } from '@/components/layout/brand-mode-provider';

/**
 * Public review page for an editing project.
 *
 * Visually mirrors the calendar share page (/c/[token]) so the brand
 * experience stays consistent: brand-aware logo header, font-display
 * client-name title, status pill row, branded card chrome. The
 * differences from /c/[token] are intentional: editing projects have
 * no calendar grid, no captions, no tagged people, no schedule. Only
 * the cuts and an optional brief.
 *
 * Anyone with the link can view; the API logs one view row on first
 * paint with the optional `as` query param so we can later say
 * "Sarah opened this twice."
 */

interface SharedVideo {
  id: string;
  filename: string | null;
  public_url: string | null;
  drive_file_id: string | null;
  mime_type: string | null;
  duration_s: number | null;
  thumbnail_url: string | null;
  version: number | null;
  position: number | null;
  created_at: string;
}

interface SharedProject {
  id: string;
  name: string;
  brief: string | null;
  shoot_date: string | null;
  project_type: string;
}

interface SharedClient {
  name: string | null;
  slug: string | null;
  logo_url: string | null;
  agency: string | null;
}

interface SharedPayload {
  project: SharedProject;
  client: SharedClient;
  videos: SharedVideo[];
  expires_at: string;
}

export default function EditingProjectSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [data, setData] = useState<SharedPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const storedName =
          typeof window !== 'undefined'
            ? window.localStorage
                .getItem(`cortex_edit_share_name_${token}`)
                ?.trim() ?? ''
            : '';
        const qs = storedName ? `?as=${encodeURIComponent(storedName)}` : '';
        const res = await fetch(`/api/editing/share/${token}${qs}`);
        const json = await res.json();
        if (!res.ok) {
          throw new Error(
            typeof json.error === 'string' ? friendlyError(json.error) : 'Failed to load',
          );
        }
        if (!cancelled) setData(json as SharedPayload);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const activeVideo = useMemo(
    () =>
      data?.videos.find((v) => v.id === activeVideoId) ?? null,
    [data, activeVideoId],
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent-text" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-status-danger" />
          <h1 className="text-lg font-semibold text-text-primary">
            {error ?? 'Link not found'}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            This share link may have expired or been deactivated.
          </p>
        </div>
      </div>
    );
  }

  const expiresLabel = new Date(data.expires_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const cutCount = data.videos.length;
  const clientName = data.client.name ?? 'Review';
  const projectName = data.project.name;

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <header className="border-b border-nativz-border bg-surface px-4 py-5 sm:px-6 sm:py-7">
        <div className="mx-auto max-w-5xl">
          <div className="mb-4 flex items-center sm:mb-5">
            <ShareHeaderLogo />
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display text-xl font-semibold tracking-tight text-text-primary sm:text-3xl">
                {clientName} {DASH} {projectName}
              </h1>
              <p className="mt-2 text-sm text-text-secondary sm:text-base">
                {cutCount} {cutCount === 1 ? 'cut' : 'cuts'} to review
                {data.project.shoot_date
                  ? ` · shot ${formatShoot(data.project.shoot_date)}`
                  : ''}
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2 text-[13px] sm:text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-surface/40 px-2.5 py-1 text-accent-text">
              <Film size={14} /> {cutCount} {cutCount === 1 ? 'cut' : 'cuts'}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-hover px-2.5 py-1 text-text-muted">
              <Clock size={14} /> link expires {expiresLabel}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        {data.project.brief ? (
          <section className="rounded-xl border border-nativz-border bg-surface p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Project brief
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
              {data.project.brief}
            </p>
            {data.project.shoot_date ? (
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-text-muted">
                <CalendarDays size={12} />
                Shot {formatShoot(data.project.shoot_date)}
              </p>
            ) : null}
          </section>
        ) : null}

        {cutCount === 0 ? (
          <div className="rounded-xl border border-dashed border-nativz-border bg-surface p-12 text-center">
            <FileVideo className="mx-auto h-10 w-10 text-text-muted" />
            <p className="mt-3 text-sm text-text-secondary">
              The team hasn{APOS}t uploaded any cuts yet.
            </p>
          </div>
        ) : (
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.videos.map((v, idx) => (
              <VideoTile
                key={v.id}
                index={idx}
                video={v}
                clientLogo={data.client.logo_url}
                onPlay={() => setActiveVideoId(v.id)}
              />
            ))}
          </section>
        )}
      </main>

      {activeVideo ? (
        <VideoModal video={activeVideo} onClose={() => setActiveVideoId(null)} />
      ) : null}
    </div>
  );
}

function ShareHeaderLogo() {
  const { mode } = useBrandMode();
  if (mode === 'nativz') {
    return (
      <Image
        src="/nativz-logo.png"
        alt="Nativz"
        width={120}
        height={45}
        className="h-5 w-auto sm:h-6"
        priority
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/anderson-logo-dark.svg"
      alt="Anderson Collaborative"
      className="h-5 w-auto sm:h-6"
      loading="eager"
      fetchPriority="high"
      decoding="async"
    />
  );
}

function VideoTile({
  index,
  video,
  clientLogo,
  onPlay,
}: {
  index: number;
  video: SharedVideo;
  clientLogo: string | null;
  onPlay: () => void;
}) {
  const label = stripExt(video.filename) ?? `Cut ${index + 1}`;
  const playable = Boolean(video.public_url);
  return (
    <button
      type="button"
      onClick={onPlay}
      disabled={!playable}
      className="group relative flex aspect-[9/16] flex-col overflow-hidden rounded-xl border border-nativz-border bg-surface text-left transition-colors hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {video.thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={video.thumbnail_url}
          alt={label}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : video.public_url ? (
        // No backend thumbnail worker yet: have the browser paint the
        // first frame as a poster by seeking to 0.1s on metadata load.
        <video
          src={`${video.public_url}#t=0.1`}
          className="absolute inset-0 h-full w-full object-cover"
          preload="metadata"
          muted
          playsInline
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-hover">
          <FileVideo className="h-10 w-10 text-text-muted" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
        {clientLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={clientLogo}
            alt=""
            className="h-3.5 w-3.5 rounded-full object-cover"
          />
        ) : null}
        Cut {index + 1}
      </div>
      <div className="relative mt-auto flex items-end justify-between gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{label}</p>
          {video.duration_s ? (
            <p className="text-xs text-white/70">{formatDuration(video.duration_s)}</p>
          ) : null}
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-contrast transition-transform group-hover:scale-105">
          <Play size={14} fill="currentColor" />
        </span>
      </div>
    </button>
  );
}

function VideoModal({
  video,
  onClose,
}: {
  video: SharedVideo;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!video.public_url) return null;
  const label = stripExt(video.filename) ?? 'Cut';
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-10"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-full w-full max-w-md flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-sm font-medium text-white">{label}</p>
          <div className="flex items-center gap-2">
            <a
              href={video.public_url}
              download={video.filename ?? undefined}
              className="inline-flex items-center gap-1 rounded-md border border-white/30 px-2.5 py-1 text-xs text-white transition-colors hover:bg-white/10"
            >
              <Download size={12} />
              Download
            </a>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="rounded-md border border-white/30 px-2.5 py-1 text-xs text-white transition-colors hover:bg-white/10"
            >
              Close
            </button>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl bg-black">
          <video
            src={video.public_url}
            controls
            autoPlay
            playsInline
            className="aspect-[9/16] max-h-[80vh] w-full bg-black"
          />
        </div>
      </div>
    </div>
  );
}

function stripExt(name: string | null): string | null {
  if (!name) return null;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatShoot(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function friendlyError(code: string): string {
  switch (code) {
    case 'expired':
      return 'This link has expired.';
    case 'revoked':
      return 'This link has been revoked.';
    case 'not_found':
      return 'Link not found.';
    default:
      return 'Failed to load.';
  }
}

// Plain hyphen + ASCII apostrophe used in JSX to keep the file 100%
// free of em/en dashes (see CLAUDE.md). Constants make the intent
// readable and let an audit grep for them.
const DASH = '-';
const APOS = "'";
