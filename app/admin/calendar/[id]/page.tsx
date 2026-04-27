'use client';

import { useCallback, useEffect, useRef, useState, use } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle,
  CheckCircle2,
  Copy,
  Eye,
  Hash,
  History,
  Link2,
  Loader2,
  MessageSquare,
  Pencil,
  RefreshCw,
  Save,
  Send,
  Trash2,
  Type,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import type {
  CaptionVariantPlatform,
  CaptionVariants,
  ContentDrop,
  ContentDropVideo,
  DropStatus,
  DropVideoStatus,
} from '@/lib/types/calendar';

const PLATFORM_LABEL: Record<CaptionVariantPlatform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  facebook: 'Facebook',
};

const POLL_MS = 3000;
const IN_FLIGHT_DROP: DropStatus[] = ['ingesting', 'analyzing', 'generating'];
const IN_FLIGHT_VIDEO: DropVideoStatus[] = ['pending', 'downloading', 'analyzing', 'caption_pending'];

type ReviewStatus = 'approved' | 'changes_requested' | 'comment';
type CommentStatus = ReviewStatus | 'caption_edit';

interface DropComment {
  id: string;
  review_link_id: string;
  author_name: string;
  content: string;
  status: CommentStatus;
  created_at: string;
  caption_before: string | null;
  caption_after: string | null;
}

interface DropResponse {
  drop: ContentDrop;
  videos: ContentDropVideo[];
  commentsByPostId: Record<string, DropComment[]>;
  variantPlatforms: CaptionVariantPlatform[];
}

interface ShareLinkRow {
  id: string;
  url: string;
  post_count: number;
  created_at: string;
  last_viewed_at: string | null;
  expires_at: string;
  revoked: boolean;
}

function latestReview(comments: DropComment[]): 'approved' | 'changes_requested' | null {
  for (let i = comments.length - 1; i >= 0; i--) {
    const c = comments[i];
    if (c.status === 'approved' || c.status === 'changes_requested') return c.status;
  }
  return null;
}

export default function DropDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<DropResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [scheduling, setScheduling] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [generatingShare, setGeneratingShare] = useState(false);
  const [shareLinks, setShareLinks] = useState<ShareLinkRow[]>([]);
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/calendar/drops/${id}`);
    if (!res.ok) return;
    const json: DropResponse = await res.json();
    if (aliveRef.current) setData(json);
  }, [id]);

  const refreshShareLinks = useCallback(async () => {
    const res = await fetch(`/api/calendar/drops/${id}/share`);
    if (!res.ok) return;
    const json: { links: ShareLinkRow[] } = await res.json();
    if (aliveRef.current) setShareLinks(json.links ?? []);
  }, [id]);

  useEffect(() => {
    aliveRef.current = true;
    Promise.all([refresh(), refreshShareLinks()]).finally(() => setLoading(false));
    return () => {
      aliveRef.current = false;
    };
  }, [refresh, refreshShareLinks]);

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
        toast.error(`${json.failed} post(s) failed — see content calendar for details`);
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
      await refreshShareLinks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Share failed');
    } finally {
      setGeneratingShare(false);
    }
  }

  async function handleRevoke(linkId: string) {
    const ok = window.confirm('Revoke this link? Anyone with the URL will get a "link expired" page.');
    if (!ok) return;
    try {
      const res = await fetch(`/api/calendar/drops/${id}/share/${linkId}/revoke`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Revoke failed');
      toast.success('Link revoked');
      await refreshShareLinks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Revoke failed');
    }
  }

  if (loading) {
    return (
      <div className="cortex-page-gutter max-w-6xl mx-auto">
        <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center text-sm text-text-secondary">
          Loading content calendar…
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="cortex-page-gutter max-w-6xl mx-auto">
        <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center">
          <XCircle className="mx-auto mb-3 h-8 w-8 text-text-tertiary" />
          <p className="text-sm text-text-secondary">Content calendar not found.</p>
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
    <div className="cortex-page-gutter max-w-6xl mx-auto space-y-6">
      <Link
        href="/admin/calendar"
        className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={14} /> Calendar
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
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
          {drop.error_detail ?? 'Content calendar failed'}
        </div>
      )}

      <RevisionsPanel videos={videos} commentsByPostId={data.commentsByPostId} />

      <ShareHistoryPanel links={shareLinks} onRevoke={handleRevoke} />

      {videos.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => (
            <VideoCard
              key={v.id}
              dropId={drop.id}
              video={v}
              comments={
                v.scheduled_post_id ? data.commentsByPostId[v.scheduled_post_id] ?? [] : []
              }
              variantPlatforms={data.variantPlatforms ?? []}
              onUpdated={refresh}
            />
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
            Send this link to your client. They can approve or request revisions per post.
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
    <div className="rounded-xl border border-nativz-border bg-surface p-4">
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
  comments: DropComment[];
  variantPlatforms: CaptionVariantPlatform[];
  onUpdated: () => void;
}

type CaptionTab = 'master' | CaptionVariantPlatform;

function VideoCard({ dropId, video, comments, variantPlatforms, onUpdated }: VideoCardProps) {
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(video.draft_caption ?? '');
  const [hashtags, setHashtags] = useState((video.draft_hashtags ?? []).join(' '));
  const [scheduledAt, setScheduledAt] = useState(toLocalDateTime(video.draft_scheduled_at));
  const [variants, setVariants] = useState<CaptionVariants>(video.caption_variants ?? {});
  const [activeTab, setActiveTab] = useState<CaptionTab>('master');
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);

  async function handleRetry() {
    setRetrying(true);
    try {
      const res = await fetch(
        `/api/calendar/drops/${dropId}/videos/${video.id}/retry`,
        { method: 'POST' },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Retry failed');
      toast.success('Retry queued');
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setRetrying(false);
    }
  }

  // Pull live values when polling refreshes the parent — only when not actively editing.
  useEffect(() => {
    if (editing) return;
    setCaption(video.draft_caption ?? '');
    setHashtags((video.draft_hashtags ?? []).join(' '));
    setScheduledAt(toLocalDateTime(video.draft_scheduled_at));
    setVariants(video.caption_variants ?? {});
  }, [
    editing,
    video.draft_caption,
    video.draft_hashtags,
    video.draft_scheduled_at,
    video.caption_variants,
  ]);

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
      const cleanedVariants: CaptionVariants = {};
      for (const platform of variantPlatforms) {
        const value = (variants[platform] ?? '').trim();
        if (value) cleanedVariants[platform] = value;
      }
      const res = await fetch(`/api/calendar/drops/${dropId}/videos/${video.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caption: caption.trim(),
          hashtags: tags,
          scheduledAt: isoScheduled,
          captionVariants: cleanedVariants,
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

  const review = latestReview(comments);

  return (
    <div
      id={video.scheduled_post_id ? `post-${video.scheduled_post_id}` : undefined}
      className="overflow-hidden rounded-xl border border-nativz-border bg-surface scroll-mt-20 transition-shadow"
    >
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
        <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
          <VideoStatusPill status={video.status} />
          {review === 'approved' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[11px] font-medium text-emerald-950">
              <CheckCircle size={10} /> Approved
            </span>
          )}
          {review === 'changes_requested' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/90 px-2 py-0.5 text-[11px] font-medium text-amber-950">
              <AlertTriangle size={10} /> Changes
            </span>
          )}
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
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-2">
            <p className="text-xs text-red-300">{video.error_detail}</p>
            {video.status === 'failed' && (
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="mt-2 inline-flex cursor-pointer items-center gap-1 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-200 transition-colors hover:bg-red-500/20 disabled:opacity-50"
              >
                {retrying ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <RefreshCw size={11} />
                )}
                {retrying ? 'Retrying…' : 'Retry'}
              </button>
            )}
          </div>
        )}

        {editing ? (
          <div className="space-y-2">
            {variantPlatforms.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 rounded-lg border border-nativz-border bg-background p-1">
                <CaptionTabButton
                  active={activeTab === 'master'}
                  onClick={() => setActiveTab('master')}
                  label="Master"
                  filled={Boolean(caption.trim())}
                  disabled={saving}
                />
                {variantPlatforms.map((platform) => (
                  <CaptionTabButton
                    key={platform}
                    active={activeTab === platform}
                    onClick={() => setActiveTab(platform)}
                    label={PLATFORM_LABEL[platform]}
                    filled={Boolean((variants[platform] ?? '').trim())}
                    disabled={saving}
                  />
                ))}
              </div>
            )}
            {activeTab === 'master' ? (
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={5}
                disabled={saving}
                className="block w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                placeholder="Master caption — used wherever no platform override is set."
              />
            ) : (
              <div className="space-y-1.5">
                <textarea
                  value={variants[activeTab] ?? ''}
                  onChange={(e) =>
                    setVariants((prev) => ({ ...prev, [activeTab]: e.target.value }))
                  }
                  rows={5}
                  disabled={saving}
                  className="block w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  placeholder={`${PLATFORM_LABEL[activeTab]} override — leave blank to use master.`}
                />
                <p className="text-[11px] text-text-muted">
                  Empty = falls back to master caption on {PLATFORM_LABEL[activeTab]}.
                </p>
              </div>
            )}
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
            {Object.entries(video.caption_variants ?? {}).some(
              ([, value]) => (value ?? '').trim().length > 0,
            ) && (
              <div className="flex flex-wrap gap-1">
                {variantPlatforms
                  .filter((p) => (video.caption_variants?.[p] ?? '').trim().length > 0)
                  .map((p) => (
                    <span
                      key={p}
                      className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent-text"
                      title={video.caption_variants?.[p] ?? ''}
                    >
                      {PLATFORM_LABEL[p]} override
                    </span>
                  ))}
              </div>
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

      {comments.length > 0 && (
        <div className="border-t border-nativz-border bg-background/40 px-4 py-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-text-muted">
            <MessageSquare size={11} />
            {comments.length} revision{comments.length === 1 ? '' : 's'}
          </div>
          <div className="space-y-2">
            {comments.map((c) => (
              <CommentRow key={c.id} comment={c} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface CaptionTabButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
  filled: boolean;
  disabled: boolean;
}

function CaptionTabButton({ active, onClick, label, filled, disabled }: CaptionTabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
        active
          ? 'bg-accent/15 text-accent-text'
          : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {label}
      {filled && (
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            active ? 'bg-accent' : 'bg-text-muted'
          }`}
        />
      )}
    </button>
  );
}

function CommentRow({ comment }: { comment: DropComment }) {
  const tone =
    comment.status === 'approved'
      ? 'text-emerald-300'
      : comment.status === 'changes_requested'
        ? 'text-amber-300'
        : comment.status === 'caption_edit'
          ? 'text-accent-text'
          : 'text-text-secondary';
  const Icon =
    comment.status === 'approved'
      ? CheckCircle
      : comment.status === 'changes_requested'
        ? AlertTriangle
        : comment.status === 'caption_edit'
          ? Type
          : MessageSquare;
  const time = new Date(comment.created_at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  if (comment.status === 'caption_edit') {
    return (
      <div className="rounded-lg border border-accent-text/25 bg-accent-text/5 px-3 py-2">
        <div className="mb-1 flex items-center gap-1.5 text-[11px]">
          <Icon size={11} className={tone} />
          <span className="font-medium text-text-primary">{comment.author_name}</span>
          <span className="text-text-muted">edited the caption · {time}</span>
        </div>
        {comment.caption_before && (
          <details className="mb-1.5 text-[11px] text-text-muted">
            <summary className="cursor-pointer hover:text-text-secondary">Show previous caption</summary>
            <p className="mt-1 whitespace-pre-wrap rounded border border-nativz-border bg-background/40 px-2 py-1.5 text-text-muted">
              {comment.caption_before || <span className="italic">(empty)</span>}
            </p>
          </details>
        )}
        {comment.caption_after && (
          <p className="whitespace-pre-wrap text-xs text-text-secondary">
            <span className="text-[10px] uppercase tracking-wide text-text-muted">Now: </span>
            {comment.caption_after}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-nativz-border bg-surface px-3 py-2">
      <div className="mb-0.5 flex items-center gap-1.5 text-[11px]">
        <Icon size={11} className={tone} />
        <span className="font-medium text-text-primary">{comment.author_name}</span>
        <span className="text-text-muted">· {time}</span>
      </div>
      <p className="whitespace-pre-wrap text-xs text-text-secondary">{comment.content}</p>
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

interface RevisionEntry {
  comment: DropComment;
  postIndex: number;
  postId: string;
  fileName: string;
}

function RevisionsPanel({
  videos,
  commentsByPostId,
}: {
  videos: ContentDropVideo[];
  commentsByPostId: Record<string, DropComment[]>;
}) {
  const entries: RevisionEntry[] = [];
  videos.forEach((v, idx) => {
    if (!v.scheduled_post_id) return;
    const list = commentsByPostId[v.scheduled_post_id] ?? [];
    for (const comment of list) {
      entries.push({
        comment,
        postIndex: idx + 1,
        postId: v.scheduled_post_id,
        fileName: v.drive_file_name,
      });
    }
  });
  entries.sort((a, b) => b.comment.created_at.localeCompare(a.comment.created_at));

  if (entries.length === 0) return null;

  function scrollToPost(postId: string) {
    const el = document.getElementById(`post-${postId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.add('ring-2', 'ring-accent');
    window.setTimeout(() => el.classList.remove('ring-2', 'ring-accent'), 1500);
  }

  return (
    <section className="rounded-xl border border-nativz-border bg-surface">
      <header className="flex items-center justify-between border-b border-nativz-border px-4 py-3">
        <h2 className="text-sm font-semibold text-text-primary">Revisions</h2>
        <span className="text-xs text-text-muted">
          {entries.length} {entries.length === 1 ? 'item' : 'items'} from reviewers
        </span>
      </header>
      <ul className="max-h-96 divide-y divide-nativz-border overflow-y-auto">
        {entries.map((e) => (
          <li key={e.comment.id}>
            <button
              type="button"
              onClick={() => scrollToPost(e.postId)}
              className="block w-full cursor-pointer px-4 py-3 text-left transition-colors hover:bg-surface-hover"
            >
              <RevisionRow entry={e} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ShareHistoryPanel({
  links,
  onRevoke,
}: {
  links: ShareLinkRow[];
  onRevoke: (linkId: string) => void;
}) {
  return (
    <section className="rounded-xl border border-nativz-border bg-surface">
      <header className="flex items-center justify-between border-b border-nativz-border px-4 py-3">
        <div className="flex items-center gap-2">
          <History size={14} className="text-text-tertiary" />
          <h2 className="text-sm font-semibold text-text-primary">Share links sent</h2>
        </div>
        <span className="text-xs text-text-muted">
          {links.length} {links.length === 1 ? 'link' : 'links'}
        </span>
      </header>
      {links.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-text-muted">
          No share links yet — generate one with the Share button above.
        </p>
      ) : (
        <ul className="divide-y divide-nativz-border">
          {links.map((link) => (
            <li key={link.id}>
              <ShareHistoryRow link={link} onRevoke={onRevoke} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ShareHistoryRow({
  link,
  onRevoke,
}: {
  link: ShareLinkRow;
  onRevoke: (linkId: string) => void;
}) {
  const created = formatRelative(link.created_at);
  const lastViewed = link.last_viewed_at ? formatRelative(link.last_viewed_at) : null;

  function copy() {
    navigator.clipboard
      .writeText(link.url)
      .then(() => toast.success('Copied'))
      .catch(() => toast.error('Copy failed'));
  }

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs">
          {link.revoked ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-300">
              Inactive
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
              Active
            </span>
          )}
          <span className="text-text-secondary">
            {link.post_count} post{link.post_count === 1 ? '' : 's'}
          </span>
          <span className="text-text-muted">· sent {created}</span>
          {lastViewed && (
            <span className="inline-flex items-center gap-1 text-text-muted">
              <Eye size={11} /> last viewed {lastViewed}
            </span>
          )}
        </div>
        <p
          className="mt-1 truncate font-mono text-[11px] text-text-muted"
          title={link.url}
        >
          {link.url}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={copy}
          className="cursor-pointer inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary"
        >
          <Copy size={12} /> Copy
        </button>
        {!link.revoked && (
          <button
            type="button"
            onClick={() => onRevoke(link.id)}
            className="cursor-pointer inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
          >
            <Trash2 size={12} /> Revoke
          </button>
        )}
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const diffMs = Date.now() - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function RevisionRow({ entry }: { entry: RevisionEntry }) {
  const { comment: c, postIndex } = entry;
  const tone =
    c.status === 'approved'
      ? 'text-emerald-300'
      : c.status === 'changes_requested'
        ? 'text-amber-300'
        : c.status === 'caption_edit'
          ? 'text-accent-text'
          : 'text-text-secondary';
  const Icon =
    c.status === 'approved'
      ? CheckCircle
      : c.status === 'changes_requested'
        ? AlertTriangle
        : c.status === 'caption_edit'
          ? Type
          : MessageSquare;
  const label =
    c.status === 'approved'
      ? 'Approved'
      : c.status === 'changes_requested'
        ? 'Revision'
        : c.status === 'caption_edit'
          ? 'Edited caption'
          : 'Comment';
  const time = new Date(c.created_at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="flex items-start gap-3">
      <Icon size={14} className={`mt-0.5 shrink-0 ${tone}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-medium text-text-primary">{c.author_name}</span>
          <span className={tone}>{label}</span>
          <span className="text-text-muted">on Post {postIndex}</span>
          <span className="text-text-muted">·</span>
          <span className="text-text-muted">{time}</span>
        </div>
        {c.status === 'caption_edit'
          ? c.caption_after && (
              <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-text-secondary">
                <span className="text-text-muted">Now: </span>
                {c.caption_after}
              </p>
            )
          : c.content && (
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-text-secondary">
                {c.content}
              </p>
            )}
      </div>
    </div>
  );
}
