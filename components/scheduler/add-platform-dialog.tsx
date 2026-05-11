'use client';

import { useMemo, useState } from 'react';
import { Check, Film, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { CalendarPost, ConnectedProfile } from './types';
import { PLATFORM_ICONS } from './types';
import { thumbUrl } from '@/lib/calendar/thumb-url';
import type { SocialPlatform } from '@/lib/types/scheduler';

interface AddPlatformDialogProps {
  open: boolean;
  onClose: () => void;
  posts: CalendarPost[];
  profiles: ConnectedProfile[];
  /**
   * Called after a successful add so the parent can refetch the calendar.
   */
  onComplete: () => void;
}

/**
 * Dialog for fanning a batch of existing posts out to a newly-connected
 * social profile. The headline use case: client signs up with TT/YT/FB,
 * team schedules a month of posts, then client connects IG halfway through
 * the month and we need to push everything onto IG without rebuilding the
 * calendar.
 *
 * Behavior split (handled server-side at /api/scheduler/posts/add-platforms):
 *
 * - Posts that haven't shipped yet → leg gets added in place; cron picks
 *   it up at the originally scheduled time.
 * - Posts that already shipped (any leg published or `late_post_id` set)
 *   → cloned with only the new legs attached, scheduled to fire shortly
 *   after now, spaced an hour apart so we don't mass-fire to IG.
 */
export function AddPlatformDialog({
  open,
  onClose,
  posts,
  profiles,
  onComplete,
}: AddPlatformDialogProps) {
  const [selectedProfileIds, setSelectedProfileIds] = useState<Set<string>>(new Set());
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(() => new Set(posts.map(p => p.id)));
  const [submitting, setSubmitting] = useState(false);

  // Posts sorted oldest-first so the bulk action mirrors the calendar
  // visually — backfill earliest posts to the new platform first.
  const sortedPosts = useMemo(() => {
    return [...posts].sort((a, b) => {
      if (!a.scheduled_at || !b.scheduled_at) return 0;
      return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
    });
  }, [posts]);

  // Build the per-post "already-on-this-platform?" map so the UI can show
  // which posts will actually be touched. A post is eligible only if at
  // least one of the selected profiles isn't already attached.
  const platformsByPost = useMemo(() => {
    const map = new Map<string, Set<SocialPlatform>>();
    for (const post of posts) {
      map.set(post.id, new Set(post.platforms.map(p => p.platform)));
    }
    return map;
  }, [posts]);

  // Posts that are "shipped" — already published or partially published.
  // For these we'll clone instead of in-place add; the dialog surfaces the
  // distinction so users know what to expect (extra rows on the calendar
  // scheduled for shortly after now).
  const shippedPostIds = useMemo(() => {
    return new Set(
      posts
        .filter(p =>
          p.status === 'published' ||
          p.status === 'partially_failed' ||
          p.platforms.some(leg => leg.status === 'published'),
        )
        .map(p => p.id),
    );
  }, [posts]);

  const selectedProfiles = useMemo(
    () => profiles.filter(p => selectedProfileIds.has(p.id)),
    [profiles, selectedProfileIds],
  );

  // Auto-deselect posts that already have every selected profile attached.
  // We don't strip them from the set on every render (would fight the
  // user) — instead we filter at submit time. But for the visible counts
  // we compute the actual touched set:
  const touchableSelectedIds = useMemo(() => {
    if (selectedProfiles.length === 0) return new Set<string>();
    const touched = new Set<string>();
    for (const post of posts) {
      if (!selectedPostIds.has(post.id)) continue;
      const attached = platformsByPost.get(post.id) ?? new Set<SocialPlatform>();
      const willAddSomething = selectedProfiles.some(profile => !attached.has(profile.platform));
      if (willAddSomething) touched.add(post.id);
    }
    return touched;
  }, [posts, selectedPostIds, selectedProfiles, platformsByPost]);

  const inplaceCount = useMemo(
    () => Array.from(touchableSelectedIds).filter(id => !shippedPostIds.has(id)).length,
    [touchableSelectedIds, shippedPostIds],
  );
  const cloneCount = useMemo(
    () => Array.from(touchableSelectedIds).filter(id => shippedPostIds.has(id)).length,
    [touchableSelectedIds, shippedPostIds],
  );

  function toggleProfile(id: string) {
    setSelectedProfileIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePost(id: string) {
    setSelectedPostIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllPosts() {
    if (selectedPostIds.size === posts.length) {
      setSelectedPostIds(new Set());
    } else {
      setSelectedPostIds(new Set(posts.map(p => p.id)));
    }
  }

  async function handleSubmit() {
    if (selectedProfileIds.size === 0) {
      toast.error('Select at least one platform to add');
      return;
    }
    if (touchableSelectedIds.size === 0) {
      toast.error('No posts will be changed — every selected post already has the chosen platform');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/scheduler/posts/add-platforms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_ids: Array.from(touchableSelectedIds),
          social_profile_ids: Array.from(selectedProfileIds),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to add platform');
      }
      const data = (await res.json()) as {
        results: Array<{ post_id: string; mode: 'inplace' | 'cloned' | 'skipped' }>;
      };
      const inplace = data.results.filter(r => r.mode === 'inplace').length;
      const cloned = data.results.filter(r => r.mode === 'cloned').length;
      const skipped = data.results.filter(r => r.mode === 'skipped').length;

      const parts: string[] = [];
      if (inplace > 0) parts.push(`${inplace} added in place`);
      if (cloned > 0) parts.push(`${cloned} cloned for new platform`);
      if (skipped > 0) parts.push(`${skipped} skipped`);
      toast.success(parts.join(' • ') || 'Done');

      onComplete();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add platform');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="" maxWidth="lg" bodyClassName="p-0 flex flex-col max-h-[80vh]">
      <div className="px-5 py-4 pr-14 border-b border-nativz-border">
        <h2 className="text-base font-semibold text-text-primary">Add platform to posts</h2>
        <p className="text-xs text-text-muted mt-0.5">
          Push existing posts to a newly-connected account. Posts that already shipped will be cloned and scheduled to fire shortly.
        </p>
      </div>

      {/* Profile picker */}
      <div className="px-5 py-3 border-b border-nativz-border">
        <label className="text-xs font-medium text-text-muted mb-1.5 block">Add to which platforms?</label>
        {profiles.length === 0 ? (
          <p className="text-xs text-text-muted">No accounts connected for this client.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {profiles.map(profile => {
              const selected = selectedProfileIds.has(profile.id);
              return (
                <button
                  key={profile.id}
                  onClick={() => toggleProfile(profile.id)}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs border transition-colors cursor-pointer ${
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
            })}
          </div>
        )}
      </div>

      {/* Post selector */}
      <div className="flex items-center justify-between px-5 py-2 border-b border-nativz-border">
        <button
          onClick={toggleAllPosts}
          className="flex items-center gap-2 text-xs text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
        >
          <span className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
            selectedPostIds.size === posts.length
              ? 'bg-accent-text border-accent-text'
              : selectedPostIds.size > 0
                ? 'bg-accent-text/50 border-accent-text'
                : 'border-nativz-border'
          }`}>
            {selectedPostIds.size > 0 && <Check size={10} className="text-white" />}
          </span>
          {selectedPostIds.size === posts.length ? 'Deselect all' : 'Select all'}
        </button>
        <span className="text-xs text-text-muted">
          {selectedPostIds.size} of {posts.length} selected
        </span>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-nativz-border">
        {sortedPosts.map(post => {
          const selected = selectedPostIds.has(post.id);
          const time = post.scheduled_at
            ? new Date(post.scheduled_at).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })
            : 'No date';
          const attached = platformsByPost.get(post.id) ?? new Set<SocialPlatform>();
          const isShipped = shippedPostIds.has(post.id);
          const willTouch = touchableSelectedIds.has(post.id);

          return (
            <button
              key={post.id}
              onClick={() => togglePost(post.id)}
              className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors cursor-pointer ${
                selected ? 'bg-accent-surface/5' : 'hover:bg-surface-hover/50'
              }`}
            >
              <span className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                selected ? 'bg-accent-text border-accent-text' : 'border-nativz-border'
              }`}>
                {selected && <Check size={10} className="text-white" />}
              </span>

              {post.thumbnail_url || post.cover_image_url ? (
                <img
                  src={thumbUrl(post.thumbnail_url ?? post.cover_image_url, 80) ?? ''}
                  alt=""
                  className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-surface-hover flex-shrink-0 flex items-center justify-center">
                  <Film size={16} className="text-text-muted" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary truncate">
                  {post.caption || 'No caption'}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-text-muted">{time}</span>
                  {attached.size > 0 && (
                    <span className="text-xs text-text-muted">
                      Already on {Array.from(attached).map(p => PLATFORM_ICONS[p]).join(', ')}
                    </span>
                  )}
                  {selected && !willTouch && selectedProfileIds.size > 0 && (
                    <span className="text-xs text-amber-400">
                      Already has selected platforms
                    </span>
                  )}
                  {selected && willTouch && isShipped && (
                    <span className="text-xs text-accent-text">Will clone</span>
                  )}
                  {selected && willTouch && !isShipped && (
                    <span className="text-xs text-accent-text">Will add in place</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}

        {posts.length === 0 && (
          <div className="px-5 py-8 text-center text-sm text-text-muted">
            No posts in the visible window.
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-t border-nativz-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-text-muted min-w-0">
          {selectedProfileIds.size === 0 ? (
            <>
              <AlertCircle size={12} className="flex-shrink-0" />
              <span>Pick a platform above to preview the impact.</span>
            </>
          ) : (
            <span className="truncate">
              {inplaceCount > 0 && <>{inplaceCount} added in place</>}
              {inplaceCount > 0 && cloneCount > 0 && <> • </>}
              {cloneCount > 0 && <>{cloneCount} cloned (scheduled ~15 min from now, 1 hr apart)</>}
              {inplaceCount === 0 && cloneCount === 0 && <>No posts will change.</>}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || touchableSelectedIds.size === 0 || selectedProfileIds.size === 0}
          >
            {submitting ? 'Adding…' : `Add to ${touchableSelectedIds.size} post${touchableSelectedIds.size === 1 ? '' : 's'}`}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
