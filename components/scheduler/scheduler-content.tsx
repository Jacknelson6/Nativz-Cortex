'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams, useRouter } from 'next/navigation';
import { CalendarView } from '@/components/scheduler/calendar-view';
import { MediaLibrary } from '@/components/scheduler/media-library';
import type { PostEditorData } from '@/components/scheduler/post-editor';
import { useSchedulerData } from '@/components/scheduler/hooks/use-scheduler-data';
import type { CalendarPost, CalendarViewMode, MediaItem, ClientOption } from '@/components/scheduler/types';
import { Button } from '@/components/ui/button';
import { Plus, Link2, Share2, Wand2, Send, FolderInput } from 'lucide-react';
import { useConfirm } from '@/components/ui/confirm-dialog';

const PostEditor = dynamic(() => import('@/components/scheduler/post-editor').then(m => ({ default: m.PostEditor })));
const ConnectAccountDialog = dynamic(() => import('@/components/scheduler/connect-account-dialog').then(m => ({ default: m.ConnectAccountDialog })));
const SharePostsDialog = dynamic(() => import('@/components/scheduler/share-posts-dialog').then(m => ({ default: m.SharePostsDialog })));
const AutoScheduleDialog = dynamic(() => import('@/components/scheduler/auto-schedule-dialog').then(m => ({ default: m.AutoScheduleDialog })));
const NewDropDialog = dynamic(() => import('@/components/scheduler/new-drop-dialog').then(m => ({ default: m.NewDropDialog })));
import { toast } from 'sonner';

/**
 * Returns the inclusive YYYY-MM-DD bounds of the visible Monday-start
 * month grid for a given date. Mirrors the cell math in
 * `calendar-view.tsx` so the fetch window covers spillover days from the
 * previous and next month — otherwise a post on (e.g.) May 1 disappears
 * from the cell that's still visible while April is selected.
 */
function getMonthGridRange(currentDate: Date): { start: string; end: string } {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Monday-start offset: Sunday (0) → 6, Mon (1) → 0, etc.
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;

  const totalCells = startOffset + lastDay.getDate();
  const rows = Math.ceil(totalCells / 7);

  const gridStart = new Date(year, month, 1 - startOffset);
  const gridEnd = new Date(year, month, 1 - startOffset + rows * 7 - 1);

  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  return { start: fmt(gridStart), end: fmt(gridEnd) };
}

/**
 * Scheduler shell — same component for admin + viewer.
 *
 * `mode='admin'` is the original surface (auto schedule, new post, drive
 * imports, share-for-review, post delete, media library).
 *
 * `mode='viewer'` strips automation + creation affordances per the
 * Content section spec: viewers can browse the calendar, open posts,
 * edit captions / tags / collaborators, and reschedule by drag — but
 * they cannot create, delete, share, or run autoscheduler tools.
 */
function SchedulerInner({
  initialClients,
  initialClientId,
  mode,
}: {
  initialClients: ClientOption[];
  initialClientId: string | null;
  mode: 'admin' | 'viewer';
}) {
  const isAdmin = mode === 'admin';
  const searchParams = useSearchParams();
  const router = useRouter();
  const {
    clients,
    selectedClientId,
    posts,
    setPosts,
    media,
    profiles,
    mediaLoading,
    fetchPosts,
    fetchMedia,
    fetchProfiles,
    refresh,
  } = useSchedulerData(initialClients, initialClientId);

  // Show toast and clean URL after OAuth callback redirect
  useEffect(() => {
    const connected = searchParams.get('connected');
    if (connected) {
      toast.success(`${connected.charAt(0).toUpperCase() + connected.slice(1)} connected`);
      router.replace('/calendar', { scroll: false });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showConnect, setShowConnect] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showAutoSchedule, setShowAutoSchedule] = useState(false);
  const [showNewDrop, setShowNewDrop] = useState(false);
  const [showUnusedOnly, setShowUnusedOnly] = useState(false);

  // Post editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<CalendarPost | null>(null);
  const [defaultDate, setDefaultDate] = useState<Date | undefined>();
  const [defaultMedia, setDefaultMedia] = useState<MediaItem | undefined>();

  // Selected client
  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) ?? null,
    [clients, selectedClientId],
  );

  // Fetch data when client or date range changes
  useEffect(() => {
    if (!selectedClientId) return;
    const { start, end } = getMonthGridRange(currentDate);
    fetchPosts(selectedClientId, start, end);
    fetchMedia(selectedClientId, showUnusedOnly);
    fetchProfiles(selectedClientId);
  }, [selectedClientId, currentDate, fetchPosts, fetchMedia, fetchProfiles, showUnusedOnly]);

  function handlePostClick(post: CalendarPost) {
    setEditingPost(post);
    setDefaultDate(undefined);
    setDefaultMedia(undefined);
    setEditorOpen(true);
  }

  function handleDateClick(date: Date) {
    // Empty-cell click creates a new post — admin-only.
    if (!isAdmin) return;
    setEditingPost(null);
    setDefaultDate(date);
    setDefaultMedia(undefined);
    setEditorOpen(true);
  }

  function handleDropMedia(date: Date, mediaItem: MediaItem) {
    // Drag-from-library → new post is also admin-only. Viewers don't have
    // the library shown at all, so this is just defence in depth.
    if (!isAdmin) return;
    setEditingPost(null);
    setDefaultDate(date);
    setDefaultMedia(mediaItem);
    setEditorOpen(true);
  }

  async function handleSavePost(data: PostEditorData) {
    if (!selectedClientId) return;
    const method = data.id ? 'PATCH' : 'POST';
    const url = data.id
      ? `/api/scheduler/posts/${data.id}`
      : '/api/scheduler/posts';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, client_id: selectedClientId }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? 'Failed to save post');
    }

    toast.success(data.id ? 'Post updated' : 'Post created');
    const { start, end } = getMonthGridRange(currentDate);
    fetchPosts(selectedClientId, start, end);
  }

  function handleShareCalendar() {
    if (!selectedClientId || posts.length === 0) {
      toast.error(posts.length === 0 ? 'No posts to share' : 'Select a client first');
      return;
    }
    setShowShare(true);
  }

  function handleMediaClick(mediaItem: MediaItem) {
    setEditingPost(null);
    setDefaultDate(new Date());
    setDefaultMedia(mediaItem);
    setEditorOpen(true);
  }

  async function handleMediaDelete(mediaId: string) {
    try {
      const res = await fetch(`/api/scheduler/media/${mediaId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to delete');
      }
      toast.success('Media deleted');
      if (selectedClientId) fetchMedia(selectedClientId, showUnusedOnly);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete media');
    }
  }

  function handleAutoScheduleComplete() {
    if (!selectedClientId) return;
    const { start, end } = getMonthGridRange(currentDate);
    fetchPosts(selectedClientId, start, end);
    fetchMedia(selectedClientId, showUnusedOnly);
  }

  async function handleDeletePost(postId: string) {
    const res = await fetch(`/api/scheduler/posts/${postId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete');
    toast.success('Post deleted');
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }

  const draftCount = posts.filter((p) => p.status === 'draft').length;

  const { confirm: confirmPublishDrafts, dialog: publishDraftsDialog } = useConfirm({
    title: 'Publish all drafts',
    description: `Set ${draftCount} draft post${draftCount === 1 ? '' : 's'} to auto-publish? They will be published at their scheduled times.`,
    confirmLabel: 'Publish all',
  });

  async function handlePublishAllDrafts() {
    if (!selectedClientId || draftCount === 0) return;
    const ok = await confirmPublishDrafts();
    if (!ok) return;
    try {
      const res = await fetch('/api/scheduler/posts/publish-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: selectedClientId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to publish drafts');
      }
      const data = await res.json();
      toast.success(data.message);
      const { start, end } = getMonthGridRange(currentDate);
      refresh(start, end);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to publish drafts');
    }
  }

  // Initial data load is covered by the route-level loading.tsx skeleton,
  // so we render the full shell immediately and let the calendar populate
  // in place — no in-component spinner that would show as a second loading
  // state after the skeleton.

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-nativz-border bg-surface">
        <div className="flex items-center gap-3">
          <h1 className="ui-section-title">Availability</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-background p-0.5">
            {(['month', 'week', 'list'] as CalendarViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === mode
                    ? 'bg-surface-hover text-text-primary'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
          {isAdmin && draftCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePublishAllDrafts}
            >
              <Send size={14} />
              Publish {draftCount} draft{draftCount === 1 ? '' : 's'}
            </Button>
          )}
          {isAdmin && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAutoSchedule(true)}
                disabled={!selectedClientId}
              >
                <Wand2 size={14} />
                Auto schedule
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleShareCalendar}
                disabled={!selectedClientId}
              >
                <Share2 size={14} />
                Share
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowConnect(true)}
                disabled={!selectedClientId}
              >
                <Link2 size={14} />
                Connect
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowNewDrop(true)}
                disabled={!selectedClientId}
              >
                <FolderInput size={14} />
                From Drive
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setEditingPost(null);
                  setDefaultDate(new Date());
                  setDefaultMedia(undefined);
                  setEditorOpen(true);
                }}
              >
                <Plus size={14} />
                New post
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar: media library + client selector — admin only.
            Viewers don't upload or manage source media; they only see the
            scheduled posts the team has captioned for them. */}
        {isAdmin && (
          <div className="flex flex-col w-72 border-r border-nativz-border bg-surface">
            {selectedClientId ? (
              <MediaLibrary
                clientId={selectedClientId}
                media={media}
                profiles={profiles}
                loading={mediaLoading}
                onUploadComplete={() => selectedClientId && fetchMedia(selectedClientId, showUnusedOnly)}
                showUnusedOnly={showUnusedOnly}
                onToggleUnused={() => setShowUnusedOnly(!showUnusedOnly)}
                onMediaClick={handleMediaClick}
                onMediaDelete={handleMediaDelete}
              />
            ) : (
              <div className="flex-1" />
            )}
          </div>
        )}

        {/* Calendar */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <CalendarView
            viewMode={viewMode}
            posts={posts}
            currentDate={currentDate}
            onDateChange={setCurrentDate}
            onPostClick={handlePostClick}
            onDateClick={handleDateClick}
            onDropMedia={handleDropMedia}
          />
        </div>
      </div>

      {/* Post editor slide-over */}
      <PostEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        post={editingPost}
        profiles={profiles}
        clientId={selectedClientId}
        defaultDate={defaultDate}
        defaultMedia={defaultMedia}
        defaultPostingTime={selectedClient?.default_posting_time}
        defaultPostingTimezone={selectedClient?.default_posting_timezone}
        onSave={handleSavePost}
        onDelete={handleDeletePost}
        mode={mode}
      />

      {isAdmin && showConnect && selectedClientId && (
        <ConnectAccountDialog
          open={showConnect}
          onClose={() => setShowConnect(false)}
          clientId={selectedClientId}
          profiles={profiles}
        />
      )}

      {isAdmin && showShare && selectedClientId && (
        <SharePostsDialog
          open={showShare}
          onClose={() => setShowShare(false)}
          clientId={selectedClientId}
          clientName={selectedClient?.name ?? 'Client'}
          posts={posts}
        />
      )}

      {isAdmin && showAutoSchedule && selectedClientId && (
        <AutoScheduleDialog
          open={showAutoSchedule}
          onClose={() => setShowAutoSchedule(false)}
          clientId={selectedClientId}
          clientName={selectedClient?.name ?? 'Client'}
          profiles={profiles}
          media={media}
          onComplete={handleAutoScheduleComplete}
        />
      )}

      {isAdmin && showNewDrop && (
        <NewDropDialog
          open={showNewDrop}
          onClose={() => setShowNewDrop(false)}
          clientId={selectedClientId}
          onCreated={(id) => {
            setShowNewDrop(false);
            toast.success('Content calendar created — analysing content…');
            router.push(`/calendar/${id}`);
          }}
        />
      )}

      {isAdmin && publishDraftsDialog}
    </div>
  );
}

export function SchedulerContent({
  initialClients,
  initialClientId = null,
  mode = 'admin',
}: {
  initialClients: ClientOption[];
  initialClientId?: string | null;
  mode?: 'admin' | 'viewer';
}) {
  // fallback={null} so a CSR bailout on useSearchParams doesn't paint a
  // second spinner after the route-level loading.tsx skeleton.
  return (
    <Suspense fallback={null}>
      <SchedulerInner
        initialClients={initialClients}
        initialClientId={initialClientId}
        mode={mode}
      />
    </Suspense>
  );
}
