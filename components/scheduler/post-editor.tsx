'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Trash2, Sparkles, Bookmark,
  ChevronDown, Users, UserPlus, Image, Share2,
  Play, Pause, Volume2, VolumeX,
  CheckCircle2, AlertCircle, ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlassButton } from '@/components/ui/glass-button';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import type { CalendarPost, ConnectedProfile, MediaItem } from './types';
import { STATUS_CONFIG, PLATFORM_ICONS, DEFAULT_POSTING_TIME } from './types';
import type { PostStatus, SocialPlatform } from '@/lib/types/scheduler';
import {
  mergeCaptionAndHashtags,
  splitMergedCaption,
} from '@/lib/scheduler/caption-hashtags';

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
  /** Admin escape hatch: bypass the drop-post approval gate for the open
   *  post and flip it from draft to scheduled. Optional, hidden if not
   *  passed. */
  onForcePublish?: (postId: string) => Promise<void>;
  /** 'admin' (default) shows delete + share-for-review. 'viewer' hides
   *  destructive + admin-only affordances; viewers can still edit
   *  caption, tags, collaborators and reschedule. */
  mode?: 'admin' | 'viewer';
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
  // Per-platform overrides (migrations 218 + 258). Snake_case to match the
  // API schema directly — `handleSavePost` spreads this body straight into
  // the POST/PUT payload without re-mapping. Nulls mean "use the
  // publisher's default"; explicit nulls clear the field on PUT.
  first_comment?: string | null;
  instagram_share_to_feed?: boolean | null;
  instagram_content_type?: 'feed' | 'reels' | 'story' | null;
  facebook_content_type?: 'feed' | 'reel' | 'story' | null;
  facebook_page_id?: string | null;
  linkedin_document_title?: string | null;
  linkedin_organization_urn?: string | null;
  linkedin_disable_link_preview?: boolean | null;
  youtube_title?: string | null;
  youtube_description?: string | null;
  youtube_tags?: string[] | null;
  youtube_privacy?: 'public' | 'unlisted' | 'private' | null;
  youtube_made_for_kids?: boolean | null;
  tiktok_allow_comment?: boolean | null;
  tiktok_allow_duet?: boolean | null;
  tiktok_allow_stitch?: boolean | null;
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
  onForcePublish,
  mode = 'admin',
}: PostEditorProps) {
  const isAdmin = mode === 'admin';
  const [caption, setCaption] = useState('');
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
  const [publishMode, setPublishMode] = useState<'draft' | 'schedule'>('draft');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [taggedPeople, setTaggedPeople] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [collaborators, setCollaborators] = useState<string[]>([]);
  const [collabInput, setCollabInput] = useState('');
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [showPlatformSettings, setShowPlatformSettings] = useState(false);

  // Per-platform override state (migrations 218 + 258). Each field mirrors
  // the snake_case API schema; null = "publisher default". `firstComment`
  // is shared across IG/FB/LI/YT (TikTok doesn't accept it).
  const [firstComment, setFirstComment] = useState<string>('');
  // Instagram
  const [igContentType, setIgContentType] = useState<'feed' | 'reels' | 'story' | ''>('');
  const [igShareToFeed, setIgShareToFeed] = useState<boolean | null>(null);
  // Facebook
  const [fbContentType, setFbContentType] = useState<'feed' | 'reel' | 'story' | ''>('');
  const [fbPageId, setFbPageId] = useState<string>('');
  // LinkedIn
  const [liDocTitle, setLiDocTitle] = useState<string>('');
  const [liOrgUrn, setLiOrgUrn] = useState<string>('');
  const [liDisableLinkPreview, setLiDisableLinkPreview] = useState<boolean>(false);
  // YouTube
  const [ytTitle, setYtTitle] = useState<string>('');
  const [ytDescription, setYtDescription] = useState<string>('');
  const [ytTagsInput, setYtTagsInput] = useState<string>('');
  const [ytPrivacy, setYtPrivacy] = useState<'public' | 'unlisted' | 'private' | ''>('');
  const [ytMadeForKids, setYtMadeForKids] = useState<boolean>(false);
  // TikTok
  const [ttAllowComment, setTtAllowComment] = useState<boolean | null>(null);
  const [ttAllowDuet, setTtAllowDuet] = useState<boolean | null>(null);
  const [ttAllowStitch, setTtAllowStitch] = useState<boolean | null>(null);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [forcing, setForcing] = useState(false);
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

  const { confirm: confirmForce, dialog: forceDialog } = useConfirm({
    title: 'Force publish (skip approval)',
    description:
      'This bypasses the share-link approval gate and flips the post to scheduled. The post will publish at its scheduled time. Use sparingly.',
    confirmLabel: 'Force publish',
    variant: 'danger',
  });

  // Get the video URL for playback
  const videoUrl = post?.media?.[0]?.late_media_url ?? defaultMedia?.late_media_url ?? null;
  const videoMime = post?.media?.[0]?.mime_type ?? defaultMedia?.mime_type ?? null;
  const isVideo = videoMime?.startsWith('video/') ?? false;
  const thumbnailUrl = post?.thumbnail_url ?? post?.cover_image_url ?? defaultMedia?.thumbnail_url ?? null;
  // For carousel/image posts, render every asset in order. Single-image
  // posts get a 1-element list; carousels get N (capped at 10 by IG/FB).
  const imageAssets = !isVideo
    ? (post?.media ?? [])
        .map((m) => m.late_media_url)
        .filter((u): u is string => !!u)
    : [];
  const isCarousel = imageAssets.length > 1;

  // Initialize from existing post or defaults
  useEffect(() => {
    if (post) {
      // Hashtags are stored in their own DB column for Zernio, but the
      // textarea presents them inline so admins read the same blob the
      // client will see on the share link. We re-split on save.
      setCaption(
        mergeCaptionAndHashtags({ caption: post.caption, hashtags: post.hashtags }),
      );
      setSelectedProfiles(post.platforms.map(p => p.profile_id));
      setPublishMode(post.status === 'draft' ? 'draft' : 'schedule');
      setCoverImageUrl(post.cover_image_url ?? null);
      setTaggedPeople(post.tagged_people ?? []);
      setCollaborators(post.collaborator_handles ?? []);
      // Per-platform overrides — hydrate from the row, fall back to '' / null
      // so the user sees "publisher default" until they explicitly set one.
      setFirstComment(post.first_comment ?? '');
      setIgContentType(post.instagram_content_type ?? '');
      setIgShareToFeed(post.instagram_share_to_feed ?? null);
      setFbContentType(post.facebook_content_type ?? '');
      setFbPageId(post.facebook_page_id ?? '');
      setLiDocTitle(post.linkedin_document_title ?? '');
      setLiOrgUrn(post.linkedin_organization_urn ?? '');
      setLiDisableLinkPreview(post.linkedin_disable_link_preview ?? false);
      setYtTitle(post.youtube_title ?? '');
      setYtDescription(post.youtube_description ?? '');
      setYtTagsInput((post.youtube_tags ?? []).join(', '));
      setYtPrivacy(post.youtube_privacy ?? '');
      setYtMadeForKids(post.youtube_made_for_kids ?? false);
      setTtAllowComment(post.tiktok_allow_comment ?? null);
      setTtAllowDuet(post.tiktok_allow_duet ?? null);
      setTtAllowStitch(post.tiktok_allow_stitch ?? null);
      if (post.scheduled_at) {
        const d = new Date(post.scheduled_at);
        setScheduledDate(d.toISOString().split('T')[0]);
        setScheduledTime(d.toTimeString().slice(0, 5));
      }
    } else {
      setCaption('');
      setSelectedProfiles(profiles.map(p => p.id));
      setPublishMode('schedule');
      setTaggedPeople([]);
      setCollaborators([]);
      setCoverImageUrl(null);
      setSelectingCover(false);
      setIsPlaying(false);
      // Reset all overrides to "publisher default"
      setFirstComment('');
      setIgContentType('');
      setIgShareToFeed(null);
      setFbContentType('');
      setFbPageId('');
      setLiDocTitle('');
      setLiOrgUrn('');
      setLiDisableLinkPreview(false);
      setYtTitle('');
      setYtDescription('');
      setYtTagsInput('');
      setYtPrivacy('');
      setYtMadeForKids(false);
      setTtAllowComment(null);
      setTtAllowDuet(null);
      setTtAllowStitch(null);

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
  // Once a post has gone out (or is mid-flight), the caption is frozen on
  // the platforms — editing it here would silently drift from the live
  // copy. Mirror the published-lock UX from the share-link surfaces so the
  // admin modal tells the same story.
  const isPublished =
    postStatus === 'published' ||
    postStatus === 'publishing' ||
    postStatus === 'partially_failed';

  async function handleSave(asDraft: boolean) {
    setSaving(true);
    try {
      let scheduled_at: string | null = null;
      if (scheduledDate && scheduledTime) {
        scheduled_at = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
      }

      // Per-platform overrides — only include a platform's fields when at
      // least one profile of that platform is currently selected. Sending
      // null for a field on PUT clears it; sending undefined leaves it
      // untouched. We send null when the user touched the field then
      // emptied it (e.g. cleared a YouTube title), and undefined when no
      // profile of that platform is selected at all.
      const selected = profiles.filter(p => selectedProfiles.includes(p.id));
      const has = (platform: SocialPlatform) =>
        selected.some(p => p.platform === platform);

      const trimOrNull = (s: string): string | null => (s.trim() ? s.trim() : null);
      const ytTagsArray = ytTagsInput
        .split(',')
        .map(t => t.trim().replace(/^#/, ''))
        .filter(Boolean);

      const overrides: Partial<PostEditorData> = {
        // Shared — applies to whichever platform supports it (IG/FB/LI/YT,
        // not TikTok). Stored once; the publisher fans it out per-platform.
        first_comment: trimOrNull(firstComment),
      };

      if (has('instagram')) {
        overrides.instagram_content_type = igContentType || null;
        overrides.instagram_share_to_feed = igShareToFeed;
      }
      if (has('facebook')) {
        overrides.facebook_content_type = fbContentType || null;
        overrides.facebook_page_id = trimOrNull(fbPageId);
      }
      if (has('linkedin')) {
        overrides.linkedin_document_title = trimOrNull(liDocTitle);
        overrides.linkedin_organization_urn = trimOrNull(liOrgUrn);
        overrides.linkedin_disable_link_preview = liDisableLinkPreview;
      }
      if (has('youtube')) {
        overrides.youtube_title = trimOrNull(ytTitle);
        overrides.youtube_description = trimOrNull(ytDescription);
        overrides.youtube_tags = ytTagsArray.length ? ytTagsArray : null;
        overrides.youtube_privacy = ytPrivacy || null;
        overrides.youtube_made_for_kids = ytMadeForKids;
      }
      if (has('tiktok')) {
        overrides.tiktok_allow_comment = ttAllowComment;
        overrides.tiktok_allow_duet = ttAllowDuet;
        overrides.tiktok_allow_stitch = ttAllowStitch;
      }

      // Pull hashtags back out of the merged textarea so the publisher
      // gets the split fields it expects.
      const { captionText, hashtags: parsedHashtags } = splitMergedCaption(caption);

      await onSave({
        id: post?.id,
        caption: captionText,
        hashtags: parsedHashtags,
        scheduled_at,
        status: asDraft ? 'draft' : 'scheduled',
        platform_profile_ids: selectedProfiles,
        media_ids: post?.media.map(m => m.id) ?? (defaultMedia ? [defaultMedia.id] : []),
        cover_image_url: coverImageUrl,
        tagged_people: taggedPeople,
        collaborator_handles: collaborators,
        ...overrides,
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

  async function handleForcePublish() {
    if (!post || !onForcePublish) return;
    const ok = await confirmForce();
    if (!ok) return;
    setForcing(true);
    try {
      await onForcePublish(post.id);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to force publish');
    } finally {
      setForcing(false);
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
    googlebusiness: 1500,
  };
  const activeLimit = Math.min(
    ...profiles
      .filter(p => selectedProfiles.includes(p.id))
      .map(p => charLimits[p.platform] ?? 5000)
  ) || 2200;

  // Select Cover mode
  if (selectingCover && videoUrl) {
    return (
      <Dialog
        open
        onClose={() => setSelectingCover(false)}
        title=""
        maxWidth="xl"
        bodyClassName="p-0 flex flex-col overflow-hidden"
      >
        <div className="flex items-center px-5 py-3 border-b border-nativz-border pr-14">
          <h2 className="text-base font-semibold text-text-primary">Select cover frame</h2>
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
      </Dialog>
    );
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title=""
        maxWidth="2xl"
        bodyClassName="p-0 flex flex-col max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center px-5 py-3 border-b border-nativz-border shrink-0 pr-14">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-text-primary">
              {isEditing ? 'Edit post' : 'Create post'}
            </h2>
            {isEditing && (
              <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
            )}
          </div>
        </div>

        {/* Publish results — visible once a publish has been attempted.
            Per-platform status with success/failure + reason so the team
            can see exactly which legs succeeded and which broke without
            digging into the database. */}
        {post && (post.status === 'partially_failed' || post.status === 'failed' || post.status === 'published') && post.platforms.some(p => p.status) && (
          <div className="px-5 py-3 border-b border-nativz-border bg-surface-hover/30 shrink-0">
            <p className="text-[11px] font-medium text-text-muted mb-2 uppercase tracking-wide">
              Publish results
            </p>
            <ul className="space-y-1.5">
              {post.platforms.map(p => {
                const ok = p.status === 'published';
                const failed = p.status === 'failed';
                return (
                  <li key={p.profile_id} className="flex items-start gap-2 text-xs">
                    {ok ? (
                      <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                    ) : failed ? (
                      <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
                    ) : (
                      <div className="w-3.5 h-3.5 mt-0.5 shrink-0 rounded-full border border-text-muted" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-text-primary">
                          {PLATFORM_ICONS[p.platform]}
                        </span>
                        {p.username && (
                          <span className="text-text-muted">@{p.username}</span>
                        )}
                        <span className={`text-[10px] uppercase tracking-wide ${ok ? 'text-emerald-400' : failed ? 'text-red-400' : 'text-text-muted'}`}>
                          {ok ? 'Posted' : failed ? 'Failed' : (p.status ?? 'pending')}
                        </span>
                        {ok && p.external_post_url && (
                          <a
                            href={p.external_post_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-[10px] text-accent-text hover:underline"
                          >
                            View <ExternalLink size={9} />
                          </a>
                        )}
                      </div>
                      {failed && p.failure_reason && (
                        <p className="mt-0.5 text-[11px] text-red-400/80 break-words">
                          {p.failure_reason}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Content — two-column layout */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col md:flex-row">
            {/* Left: Video / image preview */}
            {(videoUrl || thumbnailUrl || imageAssets.length > 0) && (
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
                ) : isCarousel ? (
                  <div className="w-full space-y-2">
                    <div className="rounded-xl overflow-hidden bg-black flex items-center justify-center">
                      <img src={imageAssets[0]} alt="" className="max-h-[50vh] w-auto rounded-xl" />
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {imageAssets.map((url, idx) => (
                        <div
                          key={url}
                          className="relative shrink-0 w-14 h-14 rounded-md overflow-hidden bg-black ring-1 ring-nativz-border"
                        >
                          <img src={url} alt="" className="w-full h-full object-cover" />
                          <span className="absolute bottom-0.5 right-0.5 px-1 rounded-sm bg-black/60 text-[9px] font-medium text-white">
                            {idx + 1}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-text-muted text-center">
                      Carousel · {imageAssets.length} images
                    </p>
                  </div>
                ) : imageAssets[0] ? (
                  <div className="w-full rounded-xl overflow-hidden bg-black flex items-center justify-center">
                    <img src={imageAssets[0]} alt="" className="max-h-[55vh] w-auto rounded-xl" />
                  </div>
                ) : thumbnailUrl ? (
                  <div className="w-full rounded-xl overflow-hidden bg-black flex items-center justify-center">
                    <img src={thumbnailUrl} alt="" className="max-h-[55vh] w-auto rounded-xl" />
                  </div>
                ) : null}

                {/* Select Cover (cover is shown via video poster above) */}
                {isVideo && videoUrl && (
                  <div className="w-full mt-3 flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={handleSelectCover} className="flex-1">
                      <Image size={12} />
                      {coverImageUrl ? 'Change cover' : 'Select cover'}
                    </Button>
                    {coverImageUrl && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setCoverImageUrl(null)}
                        className="text-text-muted"
                      >
                        <X size={12} />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Right: Form fields */}
            <div className="flex-1 min-w-0">
              {/* Profile selector — each chip toggles whether this post
                  publishes to that connected account. Once the post has
                  shipped (any status past 'scheduled'), legs are frozen
                  and the chips become read-only so we don't accidentally
                  drop a leg's published state on save. */}
              <div className="px-5 py-3 border-b border-nativz-border">
                <label className="text-xs font-medium text-text-muted mb-1.5 block">Post to</label>
                <div className="flex flex-wrap gap-2">
                  {profiles.length === 0 ? (
                    <p className="text-xs text-text-muted">No accounts connected.</p>
                  ) : (
                    profiles.map(profile => {
                      const selected = selectedProfiles.includes(profile.id);
                      return (
                        <button
                          key={profile.id}
                          onClick={() => !isPublished && toggleProfile(profile.id)}
                          disabled={isPublished}
                          aria-pressed={selected}
                          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs border transition-colors ${
                            isPublished ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
                          } ${
                            selected
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
                      );
                    })
                  )}
                </div>
                {!isPublished && profiles.length > 0 && (
                  <p className="mt-1.5 text-[10px] text-text-muted">
                    Toggle a chip to add or remove this account from the post. Legs that already published stay locked.
                  </p>
                )}
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
                  readOnly={isPublished}
                  disabled={isPublished}
                  className={`w-full rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-text resize-none ${
                    isPublished ? 'opacity-60 cursor-not-allowed' : ''
                  }`}
                />
                {isPublished ? (
                  <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
                    <CheckCircle2 size={14} className="shrink-0" />
                    <span>Published. Caption is locked once a post goes live.</span>
                  </div>
                ) : (
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
                )}
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

                {/* Platform settings (per-platform routing + first comment) */}
                {(() => {
                  const selectedPlatforms = profiles
                    .filter(p => selectedProfiles.includes(p.id))
                    .map(p => p.platform);
                  const has = (platform: SocialPlatform) => selectedPlatforms.includes(platform);
                  const supportsFirstComment = has('instagram') || has('facebook') || has('linkedin') || has('youtube');
                  // Drop overrides for any platform that's no longer selected so
                  // the panel header count + saved payload stay in sync.
                  const hasOverrides =
                    (supportsFirstComment && firstComment.trim() !== '') ||
                    (has('instagram') && (igContentType !== '' || igShareToFeed !== null)) ||
                    (has('facebook') && (fbContentType !== '' || fbPageId.trim() !== '')) ||
                    (has('linkedin') && (liDocTitle.trim() !== '' || liOrgUrn.trim() !== '' || liDisableLinkPreview)) ||
                    (has('youtube') && (ytTitle.trim() !== '' || ytDescription.trim() !== '' || ytTagsInput.trim() !== '' || ytPrivacy !== '' || ytMadeForKids)) ||
                    (has('tiktok') && (ttAllowComment !== null || ttAllowDuet !== null || ttAllowStitch !== null));
                  return (
                    <div className="mt-3">
                      <button
                        onClick={() => setShowPlatformSettings(!showPlatformSettings)}
                        className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary cursor-pointer"
                      >
                        <ChevronDown size={12} className={`transition-transform ${showPlatformSettings ? 'rotate-180' : ''}`} />
                        Platform settings
                        {hasOverrides && (
                          <span className="ml-1 inline-flex items-center rounded-full bg-accent-surface px-1.5 py-0.5 text-[10px] text-accent-text">
                            Customised
                          </span>
                        )}
                      </button>

                      {showPlatformSettings && (
                        <div className="mt-3 space-y-4">
                          {selectedProfiles.length === 0 && (
                            <p className="text-xs text-text-muted">Select an account above to customise platform settings.</p>
                          )}

                          {supportsFirstComment && (
                            <div>
                              <label className="text-xs font-medium text-text-muted mb-1 block">First comment</label>
                              <textarea
                                value={firstComment}
                                onChange={(e) => setFirstComment(e.target.value)}
                                placeholder="Posted as the first comment after publish (IG, FB, LI, YT)."
                                rows={2}
                                className="w-full rounded-lg border border-nativz-border bg-transparent px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-text resize-none"
                              />
                              <p className="mt-1 text-[10px] text-text-muted">Stories drop the first comment automatically.</p>
                            </div>
                          )}

                          {has('instagram') && (
                            <div className="rounded-lg border border-nativz-border p-3 space-y-2">
                              <p className="text-xs font-medium text-text-secondary">Instagram</p>
                              <div>
                                <label className="text-[10px] uppercase tracking-wide text-text-muted block mb-1">Content type</label>
                                <div className="flex gap-1">
                                  {(['', 'feed', 'reels', 'story'] as const).map(opt => (
                                    <button
                                      key={opt || 'auto'}
                                      onClick={() => setIgContentType(opt)}
                                      className={`px-2 py-1 text-xs rounded-md border transition-colors cursor-pointer ${
                                        igContentType === opt
                                          ? 'border-accent-text bg-accent-surface text-accent-text'
                                          : 'border-nativz-border text-text-muted hover:text-text-secondary'
                                      }`}
                                    >
                                      {opt === '' ? 'Auto' : opt === 'reels' ? 'Reels' : opt === 'story' ? 'Story' : 'Feed'}
                                    </button>
                                  ))}
                                </div>
                                <p className="mt-1 text-[10px] text-text-muted">Auto picks reels for video, feed for image, carousel for multi-image.</p>
                              </div>
                              {igContentType === 'reels' && (
                                <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={igShareToFeed ?? true}
                                    onChange={(e) => setIgShareToFeed(e.target.checked)}
                                    className="accent-accent-text"
                                  />
                                  Share reel to feed
                                </label>
                              )}
                            </div>
                          )}

                          {has('facebook') && (
                            <div className="rounded-lg border border-nativz-border p-3 space-y-2">
                              <p className="text-xs font-medium text-text-secondary">Facebook</p>
                              <div>
                                <label className="text-[10px] uppercase tracking-wide text-text-muted block mb-1">Content type</label>
                                <div className="flex gap-1">
                                  {(['', 'feed', 'reel', 'story'] as const).map(opt => (
                                    <button
                                      key={opt || 'auto'}
                                      onClick={() => setFbContentType(opt)}
                                      className={`px-2 py-1 text-xs rounded-md border transition-colors cursor-pointer ${
                                        fbContentType === opt
                                          ? 'border-accent-text bg-accent-surface text-accent-text'
                                          : 'border-nativz-border text-text-muted hover:text-text-secondary'
                                      }`}
                                    >
                                      {opt === '' ? 'Auto' : opt === 'reel' ? 'Reel' : opt === 'story' ? 'Story' : 'Feed'}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <label className="text-[10px] uppercase tracking-wide text-text-muted block mb-1">Page ID (optional)</label>
                                <input
                                  value={fbPageId}
                                  onChange={(e) => setFbPageId(e.target.value)}
                                  placeholder="Override the default Facebook page"
                                  className="w-full rounded-lg border border-nativz-border bg-transparent px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-text"
                                />
                              </div>
                            </div>
                          )}

                          {has('linkedin') && (
                            <div className="rounded-lg border border-nativz-border p-3 space-y-2">
                              <p className="text-xs font-medium text-text-secondary">LinkedIn</p>
                              <div>
                                <label className="text-[10px] uppercase tracking-wide text-text-muted block mb-1">Organization URN (optional)</label>
                                <input
                                  value={liOrgUrn}
                                  onChange={(e) => setLiOrgUrn(e.target.value)}
                                  placeholder="urn:li:organization:123456"
                                  className="w-full rounded-lg border border-nativz-border bg-transparent px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-text font-mono"
                                />
                                <p className="mt-1 text-[10px] text-text-muted">Posts to a company page instead of the personal profile.</p>
                              </div>
                              <div>
                                <label className="text-[10px] uppercase tracking-wide text-text-muted block mb-1">Document title (PDF posts)</label>
                                <input
                                  value={liDocTitle}
                                  onChange={(e) => setLiDocTitle(e.target.value)}
                                  placeholder="Title shown above the document"
                                  className="w-full rounded-lg border border-nativz-border bg-transparent px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-text"
                                />
                              </div>
                              <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={liDisableLinkPreview}
                                  onChange={(e) => setLiDisableLinkPreview(e.target.checked)}
                                  className="accent-accent-text"
                                />
                                Disable link preview
                              </label>
                            </div>
                          )}

                          {has('youtube') && (
                            <div className="rounded-lg border border-nativz-border p-3 space-y-2">
                              <p className="text-xs font-medium text-text-secondary">YouTube</p>
                              <div>
                                <label className="text-[10px] uppercase tracking-wide text-text-muted block mb-1">Title (optional)</label>
                                <input
                                  value={ytTitle}
                                  onChange={(e) => setYtTitle(e.target.value)}
                                  placeholder="Defaults to first line of caption"
                                  maxLength={100}
                                  className="w-full rounded-lg border border-nativz-border bg-transparent px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-text"
                                />
                                <p className="mt-1 text-[10px] text-text-muted">{ytTitle.length}/100</p>
                              </div>
                              <div>
                                <label className="text-[10px] uppercase tracking-wide text-text-muted block mb-1">Description (optional)</label>
                                <textarea
                                  value={ytDescription}
                                  onChange={(e) => setYtDescription(e.target.value)}
                                  placeholder="Defaults to caption"
                                  rows={3}
                                  className="w-full rounded-lg border border-nativz-border bg-transparent px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-text resize-none"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] uppercase tracking-wide text-text-muted block mb-1">Tags (optional)</label>
                                <input
                                  value={ytTagsInput}
                                  onChange={(e) => setYtTagsInput(e.target.value)}
                                  placeholder="comma, separated, tags"
                                  className="w-full rounded-lg border border-nativz-border bg-transparent px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-text"
                                />
                                <p className="mt-1 text-[10px] text-text-muted">Defaults to caption hashtags.</p>
                              </div>
                              <div>
                                <label className="text-[10px] uppercase tracking-wide text-text-muted block mb-1">Privacy</label>
                                <div className="flex gap-1">
                                  {(['', 'public', 'unlisted', 'private'] as const).map(opt => (
                                    <button
                                      key={opt || 'auto'}
                                      onClick={() => setYtPrivacy(opt)}
                                      className={`px-2 py-1 text-xs rounded-md border transition-colors cursor-pointer ${
                                        ytPrivacy === opt
                                          ? 'border-accent-text bg-accent-surface text-accent-text'
                                          : 'border-nativz-border text-text-muted hover:text-text-secondary'
                                      }`}
                                    >
                                      {opt === '' ? 'Auto' : opt.charAt(0).toUpperCase() + opt.slice(1)}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={ytMadeForKids}
                                  onChange={(e) => setYtMadeForKids(e.target.checked)}
                                  className="accent-accent-text"
                                />
                                Made for kids
                              </label>
                            </div>
                          )}

                          {has('tiktok') && (
                            <div className="rounded-lg border border-nativz-border p-3 space-y-2">
                              <p className="text-xs font-medium text-text-secondary">TikTok</p>
                              {([
                                { label: 'Allow comments', value: ttAllowComment, set: setTtAllowComment },
                                { label: 'Allow duet', value: ttAllowDuet, set: setTtAllowDuet },
                                { label: 'Allow stitch', value: ttAllowStitch, set: setTtAllowStitch },
                              ] as const).map(({ label, value, set }) => (
                                <div key={label} className="flex items-center justify-between gap-2">
                                  <span className="text-xs text-text-secondary">{label}</span>
                                  <div className="flex gap-1">
                                    {([
                                      { v: null, l: 'Auto' },
                                      { v: true, l: 'On' },
                                      { v: false, l: 'Off' },
                                    ] as const).map(opt => (
                                      <button
                                        key={String(opt.v)}
                                        onClick={() => set(opt.v)}
                                        className={`px-2 py-1 text-[10px] rounded-md border transition-colors cursor-pointer ${
                                          value === opt.v
                                            ? 'border-accent-text bg-accent-surface text-accent-text'
                                            : 'border-nativz-border text-text-muted hover:text-text-secondary'
                                        }`}
                                      >
                                        {opt.l}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-nativz-border shrink-0">
          <div className="flex items-center gap-2">
            {isAdmin && isEditing && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="cursor-pointer p-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                <Trash2 size={16} />
              </button>
            )}
            {isAdmin && isEditing && (
              <Button size="sm" variant="ghost" onClick={handleShareForReview}>
                <Share2 size={12} />
                Share for review
              </Button>
            )}
            {isAdmin && isEditing && postStatus === 'draft' && onForcePublish && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleForcePublish}
                disabled={forcing}
                className="text-amber-400 hover:text-amber-300"
              >
                <AlertCircle size={12} />
                {forcing ? 'Approving...' : 'Force publish'}
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
              disabled={saving || selectedProfiles.length === 0 || isPublished}
            >
              {saving ? 'Saving...' : publishMode === 'draft' ? 'Save as draft' : 'Schedule post'}
            </GlassButton>
          </div>
        </div>
      </Dialog>
      {deleteDialog}
      {forceDialog}
    </>
  );
}
