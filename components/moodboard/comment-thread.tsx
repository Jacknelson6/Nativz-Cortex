'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Send, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface Comment {
  id: string;
  item_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  users?: { full_name: string; avatar_url: string | null } | null;
}

interface CommentThreadProps {
  itemId: string;
  onClose: () => void;
  onCountChange: (count: number) => void;
}

export function CommentThread({ itemId, onClose, onCountChange }: CommentThreadProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchComments();
  }, [itemId]);

  async function fetchComments() {
    try {
      const res = await fetch(`/api/moodboard/comments?item_id=${itemId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setComments(data);
      onCountChange(data.length);
    } catch {
      toast.error('Failed to load comments');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/moodboard/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId, content: newComment.trim() }),
      });

      if (!res.ok) throw new Error();
      const comment = await res.json();
      setComments((prev) => [...prev, comment]);
      setNewComment('');
      onCountChange(comments.length + 1);

      // Scroll to bottom
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 100);
    } catch {
      toast.error('Failed to post comment');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(commentId: string) {
    try {
      const res = await fetch(`/api/moodboard/comments/${commentId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      onCountChange(comments.length - 1);
    } catch {
      toast.error('Failed to delete comment');
    }
  }

  function formatTime(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-sm border-l border-nativz-border bg-surface shadow-elevated flex flex-col animate-fade-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-nativz-border shrink-0">
          <h3 className="text-sm font-semibold text-text-primary">
            Comments {comments.length > 0 && `(${comments.length})`}
          </h3>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={16} className="animate-spin text-text-muted" />
            </div>
          )}

          {!loading && comments.length === 0 && (
            <p className="text-sm text-text-muted text-center py-8">No comments yet</p>
          )}

          {comments.map((comment) => (
            <div key={comment.id} className="group">
              <div className="flex items-start gap-2.5">
                {/* Avatar */}
                <div className="shrink-0 w-7 h-7 rounded-full bg-accent-surface flex items-center justify-center text-[10px] font-bold text-accent-text">
                  {comment.users?.full_name?.[0]?.toUpperCase() || '?'}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-text-primary">
                      {comment.users?.full_name || 'Unknown'}
                    </span>
                    <span className="text-[10px] text-text-muted">{formatTime(comment.created_at)}</span>
                    <button
                      onClick={() => handleDelete(comment.id)}
                      className="cursor-pointer opacity-0 group-hover:opacity-100 rounded p-0.5 text-text-muted hover:text-red-400 transition-all"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                  <p className="text-sm text-text-secondary mt-0.5 whitespace-pre-wrap">{comment.content}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="shrink-0 px-4 py-3 border-t border-nativz-border">
          <div className="flex items-center gap-2">
            <input
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Write a comment..."
              className="flex-1 rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30"
              disabled={submitting}
            />
            <Button type="submit" size="sm" disabled={!newComment.trim() || submitting}>
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
