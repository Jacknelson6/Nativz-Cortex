'use client';

import Image from 'next/image';
import { use, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Download,
  FileVideo,
  ImageIcon,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useBrandMode } from '@/components/layout/brand-mode-provider';
import {
  buildEditZipFilename,
  downloadAsset,
  stripExt,
  uniqueZipName,
  type DownloadTarget,
} from '@/lib/share/download-helpers';

/**
 * Dedicated download page for an editing-project share link. Mirrors the
 * calendar download page (/c/[token]/download): same focused "grab
 * everything" UX, just sourced from the editing share endpoint.
 *
 * Linked from the Google Chat ping fired to the paid-media team when
 * every video on an editing share link is approved, so the team lands on
 * a download-first surface instead of the full review page.
 */

interface SharedVideo {
  id: string;
  filename: string | null;
  title: string | null;
  public_url: string | null;
  mime_type: string | null;
  thumbnail_url: string | null;
  mux_playback_id: string | null;
  position: number | null;
}

interface SharedPayload {
  project: { id: string; name: string };
  client: { name: string | null };
  videos: SharedVideo[];
}

export default function EditingShareDownloadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [data, setData] = useState<SharedPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/editing/share/${token}`);
        const text = await res.text();
        const json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
        if (!res.ok) {
          const code = json && typeof json.error === 'string' ? json.error : null;
          throw new Error(code ?? `Link unavailable (${res.status})`);
        }
        if (!json) throw new Error('Empty response');
        if (!cancelled) setData(json as unknown as SharedPayload);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

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
        <div className="max-w-sm text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-status-danger" />
          <h1 className="text-lg font-semibold text-text-primary">
            {friendlyError(error)}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            This share link may have expired or been deactivated.
          </p>
        </div>
      </div>
    );
  }

  return <DownloadView data={data} />;
}

function DownloadView({ data }: { data: SharedPayload }) {
  const targets = useMemo(() => buildAllTargets(data.videos), [data.videos]);
  const [downloading, setDownloading] = useState(false);
  const [singleDownloading, setSingleDownloading] = useState<string | null>(null);

  const total = targets.length;
  const clientName = data.client.name ?? 'Project';
  const projectName = data.project.name;

  async function handleDownloadAll() {
    if (downloading) return;
    if (total === 0) {
      toast.error('Nothing to download yet.');
      return;
    }
    setDownloading(true);
    const toastId = toast.loading(`Fetching 0 of ${total}…`);
    let fetched = 0;
    let failed = 0;
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const used = new Set<string>();
      await Promise.all(
        targets.map(async (t) => {
          try {
            const res = await fetch(t.url);
            if (!res.ok) throw new Error(`status ${res.status}`);
            const buf = await res.arrayBuffer();
            const name = uniqueZipName(used, t.filename);
            zip.file(name, buf, { binary: true, compression: 'STORE' });
            fetched++;
          } catch {
            failed++;
          } finally {
            toast.loading(`Fetching ${fetched + failed} of ${total}…`, { id: toastId });
          }
        }),
      );
      if (fetched === 0) {
        toast.error('Could not download any files. Try again.', { id: toastId });
        return;
      }
      toast.loading('Building zip…', { id: toastId });
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      const zipName = buildEditZipFilename(clientName, projectName);
      const objUrl = URL.createObjectURL(blob);
      try {
        const a = document.createElement('a');
        a.href = objUrl;
        a.download = zipName;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        setTimeout(() => URL.revokeObjectURL(objUrl), 1500);
      }
      if (failed === 0) {
        toast.success(`Zipped ${fetched} file${fetched === 1 ? '' : 's'}`, { id: toastId });
      } else {
        toast.error(`Zipped ${fetched}, ${failed} failed.`, { id: toastId });
      }
    } catch {
      toast.error('Could not build zip. Try again.', { id: toastId });
    } finally {
      setDownloading(false);
    }
  }

  async function handleSingleDownload(t: DownloadTarget) {
    if (singleDownloading) return;
    setSingleDownloading(t.filename);
    const toastId = toast.loading('Downloading…');
    try {
      await downloadAsset(t.url, t.filename);
      toast.success('Downloaded', { id: toastId });
    } catch {
      toast.error('Download failed. Try again.', { id: toastId });
    } finally {
      setSingleDownloading(null);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-nativz-border bg-surface/60 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <ShareHeaderLogo />
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <CheckCircle size={14} className="text-emerald-400" />
            Approved
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="rounded-2xl border border-nativz-border bg-surface p-6 sm:p-8">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Creatives ready to run
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-text-primary sm:text-3xl">
            {clientName} &middot; {projectName}
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            {total} approved {total === 1 ? 'file' : 'files'} packaged as one zip.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => void handleDownloadAll()}
              disabled={downloading || total === 0}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-accent-text px-6 py-3 text-sm font-semibold text-white shadow-[var(--shadow-card-hover)] transition-colors hover:bg-accent-text/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {downloading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Download size={16} />
              )}
              {downloading ? 'Preparing zip…' : `Download all (${total})`}
            </button>
            <p className="text-xs text-text-muted sm:ml-3">
              Or grab any single file from the grid below.
            </p>
          </div>
        </div>

        {total === 0 ? (
          <div className="mt-8 rounded-2xl border border-nativz-border bg-surface p-12 text-center">
            <FileVideo size={28} className="mx-auto mb-3 text-text-muted/40" />
            <p className="text-sm text-text-secondary">
              No downloadable cuts on this project yet.
            </p>
          </div>
        ) : (
          <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {targets.map((t) => (
              <li key={t.filename}>
                <button
                  type="button"
                  onClick={() => void handleSingleDownload(t)}
                  disabled={singleDownloading === t.filename}
                  className="group flex w-full flex-col overflow-hidden rounded-xl border border-nativz-border bg-surface text-left transition-colors hover:border-text-muted/40 disabled:opacity-60"
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-background">
                    {t.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={t.thumbnail}
                        alt={t.filename}
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                        loading="lazy"
                      />
                    ) : !t.isImage ? (
                      // No static thumbnail (Supabase-stored MP4s without a
                      // Mux playback ID or a cover image). The <video> tag
                      // with preload="metadata" gets the browser to fetch
                      // the first few KB and paint a keyframe as the poster,
                      // which beats a blank placeholder for any common MP4.
                      <video
                        src={`${t.url}#t=0.5`}
                        muted
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-text-muted/40">
                        <ImageIcon size={28} />
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40">
                      <span className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-lg ring-1 ring-black/20">
                        {singleDownloading === t.filename ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Download size={16} />
                        )}
                        {singleDownloading === t.filename ? 'Downloading…' : 'Download'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    {t.isImage ? (
                      <ImageIcon size={12} className="shrink-0 text-text-muted" />
                    ) : (
                      <FileVideo size={12} className="shrink-0 text-text-muted" />
                    )}
                    <span className="truncate text-xs text-text-secondary">
                      {t.filename}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
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

function friendlyError(raw: string | null): string {
  if (!raw) return 'Link not found';
  const lower = raw.toLowerCase();
  if (lower.includes('not found')) return 'Link not found';
  if (lower.includes('expired')) return 'This link has expired';
  if (lower.includes('revoked')) return 'This link has been revoked';
  return 'Link unavailable';
}

function buildAllTargets(videos: SharedVideo[]): DownloadTarget[] {
  return videos
    .map((v, idx): DownloadTarget | null => {
      const url = getDownloadUrl(v);
      if (!url) return null;
      const isImage = (v.mime_type ?? '').startsWith('image/');
      const muxThumb = v.mux_playback_id
        ? `https://image.mux.com/${v.mux_playback_id}/thumbnail.jpg?width=640&fit_mode=preserve&time=1`
        : null;
      return {
        url,
        filename: getDownloadFilename(v, idx),
        thumbnail: muxThumb ?? v.thumbnail_url ?? (isImage ? v.public_url : null),
        isImage,
      };
    })
    .filter((t): t is DownloadTarget => t !== null);
}

function getDownloadUrl(v: SharedVideo): string | null {
  if (v.mux_playback_id) {
    return `https://stream.mux.com/${v.mux_playback_id}/capped-1080p.mp4`;
  }
  return v.public_url ?? null;
}

function getDownloadFilename(v: SharedVideo, idx: number): string {
  if (v.filename) return v.filename;
  const fromTitle = stripExt(v.title);
  if (fromTitle) {
    const isImage = (v.mime_type ?? '').startsWith('image/');
    return `${fromTitle}.${isImage ? 'png' : 'mp4'}`;
  }
  const isImage = (v.mime_type ?? '').startsWith('image/');
  return `cut-${idx + 1}.${isImage ? 'png' : 'mp4'}`;
}
