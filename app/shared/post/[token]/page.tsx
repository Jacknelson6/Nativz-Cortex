'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, AlertCircle, MessageSquare, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface ReviewPost {
  caption: string;
  hashtags: string[];
  scheduled_at: string | null;
  status: string;
  post_type: string;
  thumbnail_url: string | null;
  platforms: { platform: string; username: string }[];
}

interface ReviewComment {
  id: string;
  author_name: string;
  content: string;
  status: 'approved' | 'changes_requested' | 'comment';
  created_at: string;
}

export default function SharedPostReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const [token, setToken] = useState<string>('');
  const [post, setPost] = useState<ReviewPost | null>(null);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [reviewLinkId, setReviewLinkId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authorName, setAuthorName] = useState('');
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    params.then(p => setToken(p.token));
  }, [params]);

  useEffect(() => {
    if (!token) return;
    async function fetchReview() {
      try {
        const res = await fetch(`/api/scheduler/review?token=${token}`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? 'Failed to load review');
        }
        const data = await res.json();
        setPost(data.post);
        setComments(data.comments ?? []);
        setReviewLinkId(data.review_link_id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    }
    fetchReview();
  }, [token]);

  async function handleSubmit(status: 'approved' | 'changes_requested' | 'comment') {
    if (!authorName.trim()) {
      toast.error('Please enter your name');
      return;
    }
    if (status === 'comment' && !commentText.trim()) {
      toast.error('Please enter a comment');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/scheduler/review/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          review_link_id: reviewLinkId,
          author_name: authorName.trim(),
          content: commentText.trim() || (status === 'approved' ? 'Approved' : 'Changes requested'),
          status,
        }),
      });

      if (!res.ok) throw new Error('Failed to submit');
      const data = await res.json();
      setComments(prev => [...prev, data.comment]);
      setCommentText('');
      toast.success(
        status === 'approved' ? 'Post approved!' :
        status === 'changes_requested' ? 'Changes requested' :
        'Comment added'
      );
    } catch {
      toast.error('Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-text border-t-transparent" />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-text-primary">{error ?? 'Post not found'}</h1>
          <p className="text-sm text-text-muted mt-1">This review link may have expired.</p>
        </div>
      </div>
    );
  }

  const platformLabels: Record<string, string> = {
    facebook: 'Facebook',
    instagram: 'Instagram',
    tiktok: 'TikTok',
    youtube: 'YouTube',
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-lg font-semibold text-text-primary mb-1">Post review</h1>
        <p className="text-sm text-text-muted mb-6">
          Review this post and approve or request changes
        </p>

        {/* Post preview */}
        <div className="rounded-xl border border-nativz-border bg-surface p-6 mb-6">
          {/* Platforms + schedule */}
          <div className="flex items-center gap-2 mb-4">
            {post.platforms.map((p, i) => (
              <Badge key={i} variant="info">
                {platformLabels[p.platform] ?? p.platform} — @{p.username}
              </Badge>
            ))}
          </div>

          {post.scheduled_at && (
            <p className="text-xs text-text-muted mb-4">
              Scheduled for {new Date(post.scheduled_at).toLocaleString([], {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </p>
          )}

          {/* Thumbnail */}
          {post.thumbnail_url && (
            <div className="rounded-lg overflow-hidden bg-surface-hover mb-4 aspect-[9/16] max-w-xs mx-auto">
              <img src={post.thumbnail_url} alt="" className="w-full h-full object-cover" />
            </div>
          )}

          {/* Caption */}
          <div className="mb-4">
            <h3 className="text-xs font-medium text-text-muted mb-1">Caption</h3>
            <p className="text-sm text-text-primary whitespace-pre-wrap">{post.caption || 'No caption'}</p>
          </div>

          {/* Hashtags */}
          {post.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {post.hashtags.map(h => (
                <span key={h} className="text-xs text-accent-text">#{h}</span>
              ))}
            </div>
          )}
        </div>

        {/* Comments */}
        {comments.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-text-primary mb-3">Feedback</h3>
            <div className="space-y-3">
              {comments.map(c => (
                <div key={c.id} className="rounded-lg border border-nativz-border bg-surface p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-text-primary">{c.author_name}</span>
                    <Badge
                      variant={c.status === 'approved' ? 'success' : c.status === 'changes_requested' ? 'warning' : 'default'}
                    >
                      {c.status === 'approved' ? 'Approved' : c.status === 'changes_requested' ? 'Changes requested' : 'Comment'}
                    </Badge>
                    <span className="text-[10px] text-text-muted ml-auto">
                      {new Date(c.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm text-text-secondary">{c.content}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Feedback form */}
        <div className="rounded-xl border border-nativz-border bg-surface p-6">
          <h3 className="text-sm font-medium text-text-primary mb-3">Leave feedback</h3>

          <input
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted mb-3 focus:outline-none focus:ring-1 focus:ring-accent-text"
          />

          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a comment (optional for approve/reject)"
            rows={3}
            className="w-full rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted mb-3 focus:outline-none focus:ring-1 focus:ring-accent-text resize-none"
          />

          <div className="flex items-center gap-2">
            <Button
              onClick={() => handleSubmit('approved')}
              disabled={submitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <CheckCircle size={14} />
              Approve
            </Button>
            <Button
              onClick={() => handleSubmit('changes_requested')}
              disabled={submitting}
              variant="ghost"
              className="text-amber-400 hover:text-amber-300"
            >
              <AlertCircle size={14} />
              Request changes
            </Button>
            <Button
              onClick={() => handleSubmit('comment')}
              disabled={submitting || !commentText.trim()}
              variant="ghost"
            >
              <MessageSquare size={14} />
              Comment
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
