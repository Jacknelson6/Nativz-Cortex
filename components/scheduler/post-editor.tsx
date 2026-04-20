'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Trash2, Sparkles, Bookmark,
  ChevronDown, Users, UserPlus, Image, Share2,
  Play, Pause, Volume2, VolumeX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlassButton } from '@/components/ui/glass-button';
import { Badge } from '@/components/ui/badge';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import type { CalendarPost, ConnectedProfile, MediaItem } from './types';
import { STATUS_CONFIG, PLATFORM_ICONS, DEFAULT_POSTING_TIME } from './types';
import type { PostStatus, SocialPlatform } from '@/lib/types/scheduler';

interface PostEditorProps {
  open: boolean;
  onClose: () => void;
  post: CalendarPost | null;
  profiles: ConnectedProfile[];
  clientId?: string | null;
  defaultDate?: Date;
  defaultMedia?: MediaItem;
  defaultPostingTime?: string | null;
  defaultPostingTimezone?: string | null;
  onSave: (data: PostEditorData) => Promise<void>;
  onDelete: (postId: string) => Promise<void>;
}

export interface PostEditorData {
  id?: string;
  caption: string;
  hashtags: string[];
  scheduled_at: string | null;
  status: PostStatus;
  platform_profile_ids: string[];
  media_ids: string[];
  cover_image_url: string | null;
  tagged_people: string[];
  collaborator_handles: string[];
}

export function PostEditor({
  open,
  onClose,
  post,
  profiles,
  clientId,
  defaultDate,
  defaultMedia,
  defaultPostingTime,
  onSave,
  onDelete,
}: PostEditorProps) {
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
  const [publishMode, setPublishMode] = useState<'draft' | 'schedule'>('draft');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [taggedPeople, setTaggedPeople] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [collaborators, setCollaborators] = useState<string[]>([]);
  const [collabInput, setCollabInput] = useState('');
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [selectingCover, setSelectingCover] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const coverVideoRef = useRef<HTMLVideoElement>(null);

  const { confirm: confirmDelete, dialog: deleteDialog } = useConfirm({
    title: 'Delete post',
    description: 'Delete this post? This cannot be undone.',
    confirmLabel: 'Delete',
    variant: 'danger',
  });

  // Get the video URL for playback
  const videoUrl = post?.media?.[0]?.late_media_url ?? defaultMedia?.late_media_url ?? null;
  const videoMime = post?.media?.[0]?.mime_type ?? defaultMedia?.mime_type ?? null;
  const isVideo = videoMime?.startsWith('video/') ?? false;
  const thumbnailUrl = post?.thumbnail_url ?? post?.cover_image_url ?? defaultMedia?.thumbnail_url ?? null;

  // Initialize from existing post or defaults
  useEffect(() => {
    if (post) {
      setCaption(post.caption ?? '');
      setHashtags(post.hashtags ?? []);
      setSelectedProfiles(post.platforms.map(p => p.profile_id));
      setPublishMode(post.status === 'draft' ? 'draft' : 'schedule');
      setCoverImageUrl(post.cover_image_url ?? null);
      if (post.scheduled_at) {
        const d = new Date(post.scheduled_at);
        setScheduledDate(d.toISOString().split('T')[0]);
        setScheduledTime(d.toTimeString().slice(0, 5));
      }
    } else {
      setCaption('');
      setHashtags([]);
      setSelectedProfiles(profiles.map(p => p.id));
      setPublishMode('schedule');
      setTaggedPeople([]);
      setCollaborators([]);
      setCoverImageUrl(null);
      setSelectingCover(false);
      setIsPlaying(false);

      if (defaultDate) {
        setScheduledDate(defaultDate.toISOString().split('T')[0]);
        setScheduledTime(defaultPostingTime ?? DEFAULT_POSTING_TIME);
      }
    }
  }, [post, defaultDate, defaultPostingTime, profiles]);

  // Reset video state when modal closes
  useEffect(() => {
    if (!open) {
      setIsPlaying(false);
      setSelectingCover(false);
    }
  }, [open]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  }, []);

  if (!open) return null;

  const isEditing = !!post;
  const postStatus = post?.status ?? 'draft';
  const statusConfig = STATUS_CONFIG[postStatus];

  async function handleSave(asDraft: boolean) {
    setSaving(true);
    try {
      let scheduled_at: string | null = null;
      if (scheduledDate && scheduledTime) {
        scheduled_at = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
      }

      await onSave({
        id: post?.id,
        caption,
        hashtags,
        scheduled_at,
        status: asDraft ? 'draft' : 'scheduled',
        platform_profile_ids: selectedProfiles,
        media_ids: post?.media.map(m => m.id) ?? (defaultMedia ? [defaultMedia.id] : []),
        cover_image_url: coverImageUrl,
        tagged_people: taggedPeople,
        collaborator_handles: collaborators,
      });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!post) return;
    const ok = await confirmDelete();
    if (!ok) return;
    setDeleting(true);
    try {
      await onDelete(post.id);
      onClose();
    } catch {
      toast.error('Failed to delete post');
    } finally {
      setDeleting(false);
    }
  }

  async function handleImproveCaption() {
    setAiLoading(true);
    try {
      const res = await fetch('/api/scheduler/ai/improve-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caption,
          client_id: clientId ?? post?.client_id,
        }),
      });
      if (!res.ok) throw new Error('AI request failed');
      const data = await res.json();
      if (data.improved_caption) {
        const clean = data.improved_caption
          .replace(/\*\*/g, '')
          .replace(/\*/g, '')
          .replace(/^#+\s/gm, '')
          .replace(/^---+$/gm, '')
          .replace(/`/g, '');
        setCaption(clean);
        toast.success('Caption improved');
      }
    } catch {
      toast.error('Failed to improve caption');
    } finally {
      setAiLoading(false);
    }
  }



  async function handleShareForReview() {
    if (!post?.id) {
      toast.error('Save the post first to generate a share link');
      return;
    }
    try {
      const res = await fetch('/api/scheduler/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: post.id }),
      });
      if (!res.ok) throw new Error('Failed to create link');
      const data = await res.json();
      await navigator.clipboard.writeText(data.url);
      toast.success('Review link copied to clipboard');
    } catch {
      toast.error('Failed to generate share link');
    }
  }

  function handleSelectCover() {
    setSelectingCover(true);
    // Pause the main video if playing
    if (videoRef.current && !videoRef.current.paused) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }

  function handleCaptureCover() {
    const video = coverVideoRef.current;
    if (!video) return;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { toast.error('Failed to capture frame'); return; }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setCoverImageUrl(dataUrl);
      setSelectingCover(false);
      toast.success('Cover image selected');
    } catch {
      toast.error('Failed to capture frame');
    }
  }

  function addTag(type: 'tag' | 'collab') {
    const input = type === 'tag' ? tagInput : collabInput;
    const handle = input.trim().replace(/^@/, '');
    if (!handle) return;
    if (type === 'tag') {
      if (!taggedPeople.includes(handle)) setTaggedPeople(prev => [...prev, handle]);
      setTagInput('');
    } else {
      if (!collaborators.includes(handle)) setCollaborators(prev => [...prev, handle]);
      setCollabInput('');
    }
  }

  function toggleProfile(id: string) {
    setSelectedProfiles(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  }

  const charLimits: Record<SocialPlatform, number> = {
    instagram: 2200,
    facebook: 63206,
    tiktok: 2200,
    youtube: 5000,
    linkedin: 3000,
  };
  const activeLimit = Math.min(
    ...profiles
      .filter(p => selectedProfiles.includes(p.id))
      .map(p => charLimits[p.platform] ?? 5000)
  ) || 2200;

  // Select Cover mode
  if (selectingCover && videoUrl) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60" onClick={() => setSelectingCover(false)} />
        <div className="relative bg-surface rounded-2xl border border-nativz-border shadow-2xl w-full max-w-xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-nativz-border">
            <h2 className="text-base font-semibold text-text-primary">Select cover frame</h2>
            <button onClick={() => setSelectingCover(false)} className="cursor-pointer p-1 rounded-lg hover:bg-surface-hover text-text-muted">
              <X size={18} />
            </button>
          </div>
          <div className="p-5">
            <p className="text-xs text-text-muted mb-3">
              Scrub through the video to find the perfect frame, then click &ldquo;Use this frame&rdquo;.
            </p>
            <div className="rounded-xl overflow-hidden bg-black flex items-center justify-center">
              <video
                ref={coverVideoRef}
                src={videoUrl}
                className="max-h-[50vh] w-auto"
                controls
                muted
                preload="auto"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-nativz-border">
            <Button variant="ghost" size="sm" onClick={() => setSelectingCover(false)}>Cancel</Button>
            <GlassButton onClick={handleCaptureCover}>Use this frame</GlassButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Center modal */}
      <div className="relative bg-surface rounded-2xl border border-nativz-border shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-nativz-border shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-text-primary">
              {isEditing ? 'Edit post' : 'Create post'}
            </h2>
            {isEditing && (
              <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
            )}
          </div>
          <button onClick={onClose} className="cursor-pointer p-1 rounded-lg hover:bg-surface-hover text-text-muted">
            <X size={18} />
          </button>
        </div>

        {/* Content — two-column layout */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col md:flex-row">
            {/* Left: Video preview */}
            {(videoUrl || thumbnailUrl) && (
              <div className="md:w-[45%] shrink-0 p-5 flex flex-col items-center justify-start border-b md:border-b-0 md:border-r border-nativz-border">
                {isVideo && videoUrl ? (
                  <div className="relative w-full rounded-xl overflow-hidden bg-black flex items-center justify-center group">
                    <video
                      ref={videoRef}
                      src={videoUrl}
                      poster={coverImageUrl ?? thumbnailUrl ?? undefined}
                      className="max-h-[55vh] w-auto rounded-xl"
                      loop
                      muted={isMuted}
                      playsInline
                      preload="metadata"
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onClick={togglePlay}
                    />
                    {/* Play/Pause overlay */}
                    <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}>
                      <button
                        onClick={togglePlay}
                        className="cursor-pointer w-12 h-12 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm hover:bg-black/70 transition-colors"
                      >
                        {isPlaying ? <Pause size={20} className="text-white" /> : <Play size={20} className="text-white ml-0.5" />}
                      </button>
                    </div>
                    {/* Mute toggle */}
                    <button
                      onClick={() => setIsMuted(!isMuted)}
                      className="cursor-pointer absolute bottom-2 right-2 p-1.5 rounded-full bg-black/50 backdrop-blur-sm text-white hover:bg-black/70 transition-colors"
                    >
                      {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    </button>
                  </div>
                ) : thumbnailUrl ? (
                  <div className="w-full rounded-xl overflow-hidden bg-black flex items-center justify-center">
                    <img src={thumbnailUrl} alt="" className="max-h-[55vh] w-auto rounded-xl" />
                  </div>
                ) : null}

                {/* Select Cover + Cover preview */}
                <div className="w-full mt-3 space-y-2">
                  {isVideo && videoUrl && (
                    <Button size="sm" variant="ghost" onClick={handleSelectCover} className="w-full">
                      <Image size={12} />
                      {coverImageUrl ? 'Change cover' : 'Select cover'}
                    </Button>
                  )}
                  {coverImageUrl && (
                    <div className="relative">
                      <img src={coverImageUrl} alt="Cover" className="w-full rounded-lg border border-nativz-border" />
                      <button
                        onClick={() => setCoverImageUrl(null)}
                        className="cursor-pointer absolute top-1 right-1 p-0.5 rounded-full bg-black/60 text-white hover:bg-black/80"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Right: Form fields */}
            <div className="flex-1 min-w-0">
              {/* Profile selector */}
              <div className="px-5 py-3 border-b border-nativz-border">
                <label className="text-xs font-medium text-text-muted mb-1.5 block">Post to</label>
                <div className="flex flex-wrap gap-2">
                  {profiles.length === 0 ? (
                    <p className="text-xs text-text-muted">No accounts connected.</p>
                  ) : (
                    profiles.map(profile => (
                      <button
                        key={profile.id}
                        onClick={() => toggleProfile(profile.id)}
                        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs border transition-colors cursor-pointer ${
                          selectedProfiles.includes(profile.id)
                            ? 'border-accent-text bg-accent-surface text-accent-text'
                            : 'border-nativz-border text-text-muted hover:border-text-secondary'
                        }`}
                      >
                        {profile.avatar_url ? (
                          <img src={profile.avatar_url} alt="" className="w-4 h-4 rounded-full" />
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-surface-hover" />
                        )}
                        <span>{profile.username}</span>
                        <span className="text-[10px] opacity-60">{PLATFORM_ICONS[profile.platform]}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Publish mode + date/time */}
              <div className="px-5 py-3 border-b border-nativz-border flex flex-wrap items-center gap-3">
                <div className="flex items-center rounded-lg border border-nativz-border overflow-hidden">
                  <button
                    onClick={() => setPublishMode('schedule')}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                      publishMode === 'schedule' ? 'bg-accent-surface text-accent-text' : 'text-text-muted hover:text-text-secondary'
                    }`}
                  >
                    Auto publish
                  </button>
                  <button
                    onClick={() => setPublishMode('draft')}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                      publishMode === 'draft' ? 'bg-accent-surface text-accent-text' : 'text-text-muted hover:text-text-secondary'
                    }`}
                  >
                    Draft
                  </button>
                </div>
                <DateTimePicker
                  date={scheduledDate}
                  time={scheduledTime}
                  onDateChange={setScheduledDate}
                  onTimeChange={setScheduledTime}
                />
              </div>

              {/* Caption */}
              <div className="px-5 py-3 border-b border-nativz-border">
                <label className="text-xs font-medium text-text-muted mb-1.5 block">Caption</label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Write your caption..."
                  rows={5}
                  className="w-full rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-text resize-none"
                />
                <div className="flex items-center justify-between mt-1.5">
                  <button
                    onClick={handleImproveCaption}
                    disabled={aiLoading}
                    className="flex items-center gap-1 text-xs text-accent-text hover:text-accent-text/80 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles size={12} />
                    {aiLoading ? 'Improving...' : caption ? 'Improve this caption' : 'Generate caption'}
                  </button>
                  <span className={`text-[10px] ${caption.length > activeLimit ? 'text-red-400' : 'text-text-muted'}`}>
                    {caption.length}/{activeLimit}
                  </span>
                </div>
              </div>

              {/* Saved captions + more options */}
              <div className="px-5 py-3">
                <div className="flex gap-2 mb-3">
                  <Button size="sm" variant="ghost">
                    <Bookmark size={12} />
                    Saved captions
                  </Button>
                </div>

                <button
                  onClick={() => setShowMoreOptions(!showMoreOptions)}
                  className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary cursor-pointer"
                >
                  <ChevronDown size={12} className={`transition-transform ${showMoreOptions ? 'rotate-180' : ''}`} />
                  More options
                </button>

                {showMoreOptions && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="flex items-center gap-1 text-xs text-text-muted mb-1">
                        <Users size={12} /> Tag people
                      </label>
                      <div className="flex flex-wrap gap-1 mb-1">
                        {taggedPeople.map(h => (
                          <span key={h} className="inline-flex items-center gap-0.5 rounded-full bg-surface-hover px-2 py-0.5 text-xs text-text-secondary">
                            @{h}
                            <button onClick={() => setTaggedPeople(prev => prev.filter(t => t !== h))} className="cursor-pointer hover:text-red-400">
                              <X size={10} />
                            </button>
                          </span>
                        ))}
                      </div>
                      <input
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag('tag'))}
                        placeholder="@handle"
                        className="w-full rounded-lg border border-nativz-border bg-transparent px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-text"
                      />
                    </div>

                    <div>
                      <label className="flex items-center gap-1 text-xs text-text-muted mb-1">
                        <UserPlus size={12} /> Invite collaborator
                      </label>
                      <div className="flex flex-wrap gap-1 mb-1">
                        {collaborators.map(h => (
                          <span key={h} className="inline-flex items-center gap-0.5 rounded-full bg-surface-hover px-2 py-0.5 text-xs text-text-secondary">
                            @{h}
                            <button onClick={() => setCollaborators(prev => prev.filter(t => t !== h))} className="cursor-pointer hover:text-red-400">
                              <X size={10} />
                            </button>
                          </span>
                        ))}
                      </div>
                      <input
                        value={collabInput}
                        onChange={(e) => setCollabInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag('collab'))}
                        placeholder="@handle"
                        className="w-full rounded-lg border border-nativz-border bg-transparent px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-text"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-nativz-border shrink-0">
          <div className="flex items-center gap-2">
            {isEditing && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="cursor-pointer p-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                <Trash2 size={16} />
              </button>
            )}
            {isEditing && (
              <Button size="sm" variant="ghost" onClick={handleShareForReview}>
                <Share2 size={12} />
                Share for review
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {publishMode === 'draft' && (
              <span className="text-[10px] text-text-muted">
                Won&apos;t publish until approved or manually set to publish
              </span>
            )}
            <GlassButton
              onClick={() => handleSave(publishMode === 'draft')}
              disabled={saving || selectedProfiles.length === 0}
            >
              {saving ? 'Saving...' : publishMode === 'draft' ? 'Save as draft' : 'Schedule post'}
            </GlassButton>
          </div>
        </div>
      </div>
      {deleteDialog}
    </div>
  );
}
