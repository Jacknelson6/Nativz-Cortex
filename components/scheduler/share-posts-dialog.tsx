'use client';

import { useState } from 'react';
import { X, Check, Copy, Link2, Film } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlassButton } from '@/components/ui/glass-button';
import { toast } from 'sonner';
import type { CalendarPost } from './types';

interface SharePostsDialogProps {
  open: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  posts: CalendarPost[];
}

export function SharePostsDialog({
  open,
  onClose,
  clientId,
  clientName,
  posts,
}: SharePostsDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(posts.map(p => p.id))
  );
  const [generating, setGenerating] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  if (!open) return null;

  const sortedPosts = [...posts].sort((a, b) => {
    if (!a.scheduled_at || !b.scheduled_at) return 0;
    return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
  });

  function togglePost(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === posts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(posts.map(p => p.id)));
    }
  }

  async function handleGenerate() {
    if (selectedIds.size === 0) {
      toast.error('Select at least one post');
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch('/api/scheduler/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          post_ids: Array.from(selectedIds),
          label: `${clientName} content review`,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to create share link');
      }
      const data = await res.json();
      setShareUrl(data.url);
      await navigator.clipboard.writeText(data.url);
      toast.success('Share link copied to clipboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate link');
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    toast.success('Link copied');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-surface rounded-xl border border-nativz-border shadow-xl w-[520px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-nativz-border">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Share for review</h2>
            <p className="text-xs text-text-muted mt-0.5">
              Select which posts to include in the share link
            </p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Select all */}
        <div className="flex items-center justify-between px-5 py-2 border-b border-nativz-border">
          <button
            onClick={toggleAll}
            className="flex items-center gap-2 text-xs text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          >
            <span className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
              selectedIds.size === posts.length
                ? 'bg-accent-text border-accent-text'
                : selectedIds.size > 0
                  ? 'bg-accent-text/50 border-accent-text'
                  : 'border-nativz-border'
            }`}>
              {selectedIds.size > 0 && <Check size={10} className="text-white" />}
            </span>
            {selectedIds.size === posts.length ? 'Deselect all' : 'Select all'}
          </button>
          <span className="text-xs text-text-muted">
            {selectedIds.size} of {posts.length} selected
          </span>
        </div>

        {/* Post list */}
        <div className="flex-1 overflow-y-auto divide-y divide-nativz-border">
          {sortedPosts.map(post => {
            const selected = selectedIds.has(post.id);
            const time = post.scheduled_at
              ? new Date(post.scheduled_at).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })
              : 'No date';

            return (
              <button
                key={post.id}
                onClick={() => togglePost(post.id)}
                className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors cursor-pointer ${
                  selected ? 'bg-accent-surface/5' : 'hover:bg-surface-hover/50'
                }`}
              >
                {/* Checkbox */}
                <span className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                  selected ? 'bg-accent-text border-accent-text' : 'border-nativz-border'
                }`}>
                  {selected && <Check size={10} className="text-white" />}
                </span>

                {/* Thumbnail */}
                {post.thumbnail_url || post.cover_image_url ? (
                  <img
                    src={post.thumbnail_url ?? post.cover_image_url ?? ''}
                    alt=""
                    className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-surface-hover flex-shrink-0 flex items-center justify-center">
                    <Film size={16} className="text-text-muted" />
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary truncate">
                    {post.caption || 'No caption'}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-text-muted">{time}</span>
                    {post.platforms.length > 0 && (
                      <span className="text-xs text-text-muted">
                        {post.platforms.map(p => p.platform.charAt(0).toUpperCase()).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}

          {posts.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-text-muted">
              No posts to share. Create some posts first.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-nativz-border">
          {shareUrl ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 rounded-lg border border-nativz-border bg-background px-3 py-2">
                <Link2 size={14} className="text-text-muted flex-shrink-0" />
                <span className="text-xs text-text-secondary truncate">{shareUrl}</span>
              </div>
              <Button size="sm" variant="secondary" onClick={handleCopy}>
                <Copy size={12} />
                Copy
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShareUrl(null); setSelectedIds(new Set(posts.map(p => p.id))); }}>
                New link
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <GlassButton
                onClick={handleGenerate}
                disabled={generating || selectedIds.size === 0}
              >
                {generating ? 'Generating...' : `Share ${selectedIds.size} post${selectedIds.size !== 1 ? 's' : ''}`}
              </GlassButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
