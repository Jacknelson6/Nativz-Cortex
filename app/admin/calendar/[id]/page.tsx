'use client';

import { useCallback, useEffect, useRef, useState, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Copy,
  Hash,
  Link2,
  Loader2,
  Pencil,
  Save,
  Send,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import type {
  ContentDrop,
  ContentDropVideo,
  DropStatus,
  DropVideoStatus,
} from '@/lib/types/calendar';

const POLL_MS = 3000;
const IN_FLIGHT_DROP: DropStatus[] = ['ingesting', 'analyzing', 'generating'];
const IN_FLIGHT_VIDEO: DropVideoStatus[] = ['pending', 'downloading', 'analyzing', 'caption_pending'];

interface DropResponse {
  drop: ContentDrop;
  videos: ContentDropVideo[];
}

export default function DropDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<DropResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [scheduling, setScheduling] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [generatingShare, setGeneratingShare] = useState(false);
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/calendar/drops/${id}`);
    if (!res.ok) return;
    const json: DropResponse = await res.json();
    if (aliveRef.current) setData(json);
  }, [id]);

  useEffect(() => {
    aliveRef.current = true;
    refresh().finally(() => setLoading(false));
    return () => {
      aliveRef.current = false;
    };
  }, [refresh]);

  useEffect(() => {
    if (!data) return;
    const dropInFlight = IN_FLIGHT_DROP.includes(data.drop.status);
    if (!dropInFlight) return;
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [data, refresh]);

  async function handleSchedule() {
    setScheduling(true);
    try {
      const res = await fetch(`/api/calendar/drops/${id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Schedule failed');
      toast.success(`Scheduled ${json.scheduled ?? 0} post(s)`);
      if (json.failed > 0) {
        toast.error(`${json.failed} post(s) failed — see drop for details`);
      }
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Schedule failed');
    } finally {
      setScheduling(false);
    }
  }

  async function handleShare() {
    setGeneratingShare(true);
    try {
      const res = await fetch(`/api/calendar/drops/${id}/share`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Share failed');
      setShareUrl(json.url);
      setShowShare(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Share failed');
    } finally {
      setGeneratingShare(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center text-sm text-text-secondary">
          Loading drop…
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center">
          <XCircle className="mx-auto mb-3 h-8 w-8 text-text-tertiary" />
          <p className="text-sm text-text-secondary">Drop not found.</p>
          <Link
            href="/admin/calendar"
            className="mt-3 inline-flex items-center gap-1 text-sm text-accent-text hover:underline"
          >
            <ArrowLeft size={14} /> Back to calendar
          </Link>
        </div>
      </div>
    );
  }

  const { drop, videos } = data;
  const ready = drop.status === 'ready';
  const scheduled = drop.status === 'scheduled';
  const failed = drop.status === 'failed';
  const inFlight = IN_FLIGHT_DROP.includes(drop.status);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <Link
        href="/admin/calendar"
        className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={14} /> Calendar
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-text-primary">
            <CalendarDays className="h-6 w-6 text-text-tertiary" />
            {drop.start_date} → {drop.end_date}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            {drop.processed_videos}/{drop.total_videos} videos · default {drop.default_post_time} UTC
          </p>
          {drop.error_detail && (
            <p className="mt-2 text-xs text-red-400">{drop.error_detail}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <DropStatusBadge status={drop.status} />
          {ready && (
            <Button onClick={handleSchedule} disabled={scheduling}>
              {scheduling ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {scheduling ? 'Scheduling…' : 'Schedule batch'}
            </Button>
          )}
          {scheduled && (
            <Button variant="secondary" onClick={handleShare} disabled={generatingShare}>
              {generatingShare ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
              {generatingShare ? 'Generating…' : 'Share with client'}
            </Button>
          )}
        </div>
      </header>

      {inFlight && <ProgressBar drop={drop} videos={videos} />}

      {failed && videos.length === 0 && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-sm text-red-300">
          {drop.error_detail ?? 'Drop failed'}
        </div>
      )}

      {videos.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => (
            <VideoCard key={v.id} dropId={drop.id} video={v} onUpdated={refresh} />
          ))}
        </div>
      )}

      <Dialog
        open={showShare}
        onClose={() => setShowShare(false)}
        title="Client share link"
        maxWidth="lg"
      >
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">
            Send this link to your client. They can comment, approve, or request changes per post.
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-nativz-border bg-background px-3 py-2">
            <Link2 size={14} className="shrink-0 text-text-muted" />
            <input
              readOnly
              value={shareUrl ?? ''}
              className="flex-1 bg-transparent text-xs text-text-primary focus:outline-none"
            />
            <button
              onClick={() => {
                if (shareUrl) navigator.clipboard.writeText(shareUrl).then(() => toast.success('Copied'));
              }}
              className="cursor-pointer rounded-md p-1 text-text-muted hover:bg-surface-hover hover:text-text-primary"
              aria-label="Copy"
            >
              <Copy size={14} />
            </button>
          </div>
          <p className="text-xs text-text-muted">Expires in 30 days.</p>
        </div>
      </Dialog>
    </div>
  );
}

function ProgressBar({ drop, videos }: { drop: ContentDrop; videos: ContentDropVideo[] }) {
  const stage = drop.status;
  const total = videos.length || drop.total_videos;
  const done = videos.filter(
    (v) => v.status === 'ready' || v.status === 'failed' || !IN_FLIGHT_VIDEO.includes(v.status),
  ).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="mb-6 rounded-xl border border-nativz-border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between text-xs text-text-secondary">
        <span className="font-medium text-text-primary capitalize">{stage}</span>
        <span>
          {done}/{total} ({pct}%)
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-background">
        <div
          className="h-full bg-accent transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

const VIDEO_STATUS_LABEL: Record<DropVideoStatus, string> = {
  pending: 'Queued',
  downloading: 'Downloading',
  analyzing: 'Analysing',
  caption_pending: 'Captioning',
  ready: 'Ready',
  failed: 'Failed',
};

const VIDEO_STATUS_TONE: Record<DropVideoStatus, string> = {
  pending: 'bg-surface-hover text-text-secondary',
  downloading: 'bg-blue-500/10 text-blue-300',
  analyzing: 'bg-blue-500/10 text-blue-300',
  caption_pending: 'bg-blue-500/10 text-blue-300',
  ready: 'bg-amber-500/10 text-amber-300',
  failed: 'bg-red-500/10 text-red-300',
};

function VideoStatusPill({ status }: { status: DropVideoStatus }) {
  const inFlight = IN_FLIGHT_VIDEO.includes(status);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${VIDEO_STATUS_TONE[status]}`}
    >
      {inFlight && <Loader2 size={10} className="animate-spin" />}
      {VIDEO_STATUS_LABEL[status]}
    </span>
  );
}

interface VideoCardProps {
  dropId: string;
  video: ContentDropVideo;
  onUpdated: () => void;
}

function VideoCard({ dropId, video, onUpdated }: VideoCardProps) {
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(video.draft_caption ?? '');
  const [hashtags, setHashtags] = useState((video.draft_hashtags ?? []).join(' '));
  const [scheduledAt, setScheduledAt] = useState(toLocalDateTime(video.draft_scheduled_at));
  const [saving, setSaving] = useState(false);

  // Pull live values when polling refreshes the parent — only when not actively editing.
  useEffect(() => {
    if (editing) return;
    setCaption(video.draft_caption ?? '');
    setHashtags((video.draft_hashtags ?? []).join(' '));
    setScheduledAt(toLocalDateTime(video.draft_scheduled_at));
  }, [editing, video.draft_caption, video.draft_hashtags, video.draft_scheduled_at]);

  const score = video.caption_score;
  const ready = video.status === 'ready';
  const scheduled = !!video.scheduled_post_id;
  const editable = ready && !scheduled;

  async function handleSave() {
    setSaving(true);
    try {
      const tags = hashtags
        .split(/\s+/)
        .map((t) => t.replace(/^#/, '').trim())
        .filter(Boolean);
      const isoScheduled = scheduledAt ? new Date(scheduledAt).toISOString() : undefined;
      const res = await fetch(`/api/calendar/drops/${dropId}/videos/${video.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caption: caption.trim(),
          hashtags: tags,
          scheduledAt: isoScheduled,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Save failed');
      setEditing(false);
      toast.success('Saved');
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
      <div className="relative aspect-[9/16] w-full bg-background">
        {video.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnail_url}
            alt={video.drive_file_name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-text-muted">
            No thumbnail
          </div>
        )}
        <div className="absolute right-2 top-2">
          <VideoStatusPill status={video.status} />
        </div>
        {scheduled && (
          <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[11px] font-medium text-emerald-950">
            <CheckCircle2 size={10} /> Scheduled
          </div>
        )}
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-xs text-text-muted" title={video.drive_file_name}>
            {video.drive_file_name}
          </p>
          {typeof score === 'number' && (
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                score >= 80
                  ? 'bg-emerald-500/10 text-emerald-300'
                  : score >= 60
                    ? 'bg-amber-500/10 text-amber-300'
                    : 'bg-red-500/10 text-red-300'
              }`}
            >
              {score}/100
            </span>
          )}
        </div>

        {video.error_detail && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/5 p-2 text-xs text-red-300">
            {video.error_detail}
          </p>
        )}

        {editing ? (
          <div className="space-y-2">
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={5}
              disabled={saving}
              className="block w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="Caption…"
            />
            <div className="flex items-center gap-2 rounded-lg border border-nativz-border bg-background px-3 py-2">
              <Hash size={12} className="shrink-0 text-text-muted" />
              <input
                value={hashtags}
                onChange={(e) => setHashtags(e.target.value)}
                disabled={saving}
                className="flex-1 bg-transparent text-xs text-text-primary placeholder-text-muted focus:outline-none"
                placeholder="hashtag1 hashtag2 hashtag3"
              />
            </div>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              disabled={saving}
              className="block w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-xs text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {video.draft_caption ? (
              <p className="whitespace-pre-line text-sm text-text-primary">
                {video.draft_caption}
              </p>
            ) : (
              <p className="text-xs italic text-text-muted">No caption yet.</p>
            )}
            {(video.draft_hashtags ?? []).length > 0 && (
              <p className="text-xs text-text-secondary">
                {(video.draft_hashtags ?? []).map((h) => `#${h}`).join(' ')}
              </p>
            )}
            <div className="flex items-center justify-between gap-2 pt-1">
              <p className="text-xs text-text-muted">
                {video.draft_scheduled_at ? formatScheduled(video.draft_scheduled_at) : 'Unscheduled'}
              </p>
              {editable && (
                <button
                  onClick={() => setEditing(true)}
                  className="cursor-pointer inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                >
                  <Pencil size={12} /> Edit
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const DROP_STATUS_LABEL: Record<DropStatus, string> = {
  ingesting: 'Ingesting',
  analyzing: 'Analysing',
  generating: 'Captioning',
  ready: 'Ready',
  scheduled: 'Scheduled',
  failed: 'Failed',
};

const DROP_STATUS_TONE: Record<DropStatus, string> = {
  ingesting: 'bg-blue-500/10 text-blue-300',
  analyzing: 'bg-blue-500/10 text-blue-300',
  generating: 'bg-blue-500/10 text-blue-300',
  ready: 'bg-amber-500/10 text-amber-300',
  scheduled: 'bg-emerald-500/10 text-emerald-300',
  failed: 'bg-red-500/10 text-red-300',
};

function DropStatusBadge({ status }: { status: DropStatus }) {
  const inFlight = IN_FLIGHT_DROP.includes(status);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${DROP_STATUS_TONE[status]}`}
    >
      {inFlight && <Loader2 size={10} className="animate-spin" />}
      {DROP_STATUS_LABEL[status]}
    </span>
  );
}

function toLocalDateTime(iso: string | null): string {
  if (!iso) return '';
  // datetime-local expects YYYY-MM-DDTHH:MM (no TZ suffix). Convert from UTC ISO.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}`;
}

function formatScheduled(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toUTCString().replace(' GMT', ' UTC');
}
