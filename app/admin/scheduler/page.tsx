'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { CalendarView } from '@/components/scheduler/calendar-view';
import { MediaLibrary } from '@/components/scheduler/media-library';
import { PostEditor, type PostEditorData } from '@/components/scheduler/post-editor';
import { useSchedulerData } from '@/components/scheduler/hooks/use-scheduler-data';
import type { CalendarPost, CalendarViewMode, MediaItem, ClientOption } from '@/components/scheduler/types';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ConnectAccountDialog } from '@/components/scheduler/connect-account-dialog';
import { Plus, PanelLeft, Loader2, Link2 } from 'lucide-react';
import { toast } from 'sonner';

export default function SchedulerPage() {
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
  } = useSchedulerData();

  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showMedia, setShowMedia] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
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

  async function handleDeletePost(postId: string) {
    const res = await fetch(`/api/scheduler/posts/${postId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete');
    toast.success('Post deleted');
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 size={24} className="animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-nativz-border bg-surface">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-text-primary">Scheduler</h1>
          <Select
            id="scheduler-client"
            value={selectedClientId ?? ''}
            onChange={(e) => setSelectedClientId(e.target.value || null)}
            options={clients.map((c) => ({ value: c.id, label: c.name }))}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showMedia ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setShowMedia(!showMedia)}
          >
            <PanelLeft size={14} />
            Media
          </Button>
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
        {/* Media library panel */}
        {showMedia && selectedClientId && (
          <MediaLibrary
            clientId={selectedClientId}
            media={media}
            loading={mediaLoading}
            onUploadComplete={() => selectedClientId && fetchMedia(selectedClientId, showUnusedOnly)}
            showUnusedOnly={showUnusedOnly}
            onToggleUnused={() => setShowUnusedOnly(!showUnusedOnly)}
          />
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
        />
      )}
    </div>
  );
}
