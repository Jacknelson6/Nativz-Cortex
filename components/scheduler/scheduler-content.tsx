'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams, useRouter } from 'next/navigation';
import { CalendarView } from '@/components/scheduler/calendar-view';
import { MediaLibrary } from '@/components/scheduler/media-library';
import type { PostEditorData } from '@/components/scheduler/post-editor';
import { useSchedulerData } from '@/components/scheduler/hooks/use-scheduler-data';
import type { CalendarPost, CalendarViewMode, MediaItem, ClientOption } from '@/components/scheduler/types';
import { ComboSelect } from '@/components/ui/combo-select';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, Link2, Share2, Wand2, Send } from 'lucide-react';
import { useConfirm } from '@/components/ui/confirm-dialog';

const PostEditor = dynamic(() => import('@/components/scheduler/post-editor').then(m => ({ default: m.PostEditor })));
const ConnectAccountDialog = dynamic(() => import('@/components/scheduler/connect-account-dialog').then(m => ({ default: m.ConnectAccountDialog })));
const SharePostsDialog = dynamic(() => import('@/components/scheduler/share-posts-dialog').then(m => ({ default: m.SharePostsDialog })));
const AutoScheduleDialog = dynamic(() => import('@/components/scheduler/auto-schedule-dialog').then(m => ({ default: m.AutoScheduleDialog })));
import { toast } from 'sonner';

function SchedulerInner({ initialClients }: { initialClients: ClientOption[] }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const {
    clients,
    selectedClientId,
    setSelectedClientId,
    posts,
    setPosts,
    media,
    profiles,
    loading,
    mediaLoading,
    fetchPosts,
    fetchMedia,
    fetchProfiles,
    refresh,
  } = useSchedulerData(initialClients);

  // Show toast and clean URL after OAuth callback redirect
  useEffect(() => {
    const connected = searchParams.get('connected');
    if (connected) {
      toast.success(`${connected.charAt(0).toUpperCase() + connected.slice(1)} connected`);
      router.replace('/admin/scheduling', { scroll: false });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showConnect, setShowConnect] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showAutoSchedule, setShowAutoSchedule] = useState(false);
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
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
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
    setEditingPost(null);
    setDefaultDate(date);
    setDefaultMedia(undefined);
    setEditorOpen(true);
  }

  function handleDropMedia(date: Date, mediaItem: MediaItem) {
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
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
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
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
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
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
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
          <h1 className="ui-section-title">Scheduling</h1>
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
          {draftCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePublishAllDrafts}
            >
              <Send size={14} />
              Publish {draftCount} draft{draftCount === 1 ? '' : 's'}
            </Button>
          )}
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
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar: media library + client selector */}
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

          {/* Client selector */}
          <div className="p-3 border-t border-nativz-border">
            <ComboSelect
              label="Client"
              value={selectedClientId ?? ''}
              onChange={(val) => setSelectedClientId(val || null)}
              options={clients.map((c) => ({ value: c.id, label: c.name }))}
              placeholder="Select client…"
              dropdownPosition="top"
            />
          </div>
        </div>

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
      />

      {showConnect && selectedClientId && (
        <ConnectAccountDialog
          open={showConnect}
          onClose={() => setShowConnect(false)}
          clientId={selectedClientId}
          profiles={profiles}
        />
      )}

      {showShare && selectedClientId && (
        <SharePostsDialog
          open={showShare}
          onClose={() => setShowShare(false)}
          clientId={selectedClientId}
          clientName={selectedClient?.name ?? 'Client'}
          posts={posts}
        />
      )}

      {showAutoSchedule && selectedClientId && (
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

      {publishDraftsDialog}
    </div>
  );
}

export function SchedulerContent({ initialClients }: { initialClients: ClientOption[] }) {
  // fallback={null} so a CSR bailout on useSearchParams doesn't paint a
  // second spinner after the route-level loading.tsx skeleton.
  return (
    <Suspense fallback={null}>
      <SchedulerInner initialClients={initialClients} />
    </Suspense>
  );
}
