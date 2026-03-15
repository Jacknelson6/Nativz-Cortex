'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  AlertCircle, ChevronLeft, ChevronRight, CheckCircle,
  AlertTriangle, MessageSquare, Clock, Film,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface SharedPost {
  id: string;
  status: string;
  scheduled_at: string | null;
  caption: string;
  hashtags: string[];
  post_type: string;
  cover_image_url: string | null;
  thumbnail_url: string | null;
  platforms: { platform: string; username: string }[];
  review_status: string;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  facebook: 'Facebook',
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-zinc-500/20', text: 'text-zinc-400', label: 'Draft' },
  scheduled: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Scheduled' },
  published: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'Published' },
  failed: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Failed' },
};

export default function SharedCalendarPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const [token, setToken] = useState('');
  const [clientName, setClientName] = useState('');
  const [posts, setPosts] = useState<SharedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedPost, setSelectedPost] = useState<SharedPost | null>(null);

  // Comment form
  const [authorName, setAuthorName] = useState('');
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    params.then(p => setToken(p.token));
  }, [params]);

  useEffect(() => {
    if (!token) return;
    async function fetchData() {
      try {
        const res = await fetch(`/api/scheduler/share?token=${token}`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? 'Failed to load');
        }
        const data = await res.json();
        setClientName(data.client_name);
        setPosts(data.posts ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [token]);

  // Calendar logic
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleString('default', { month: 'long' });

  const cells = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    let startOffset = firstDay.getDay() - 1;
    if (startOffset < 0) startOffset = 6;
    const totalCells = startOffset + lastDay.getDate();
    const rows = Math.ceil(totalCells / 7);

    const result: { date: Date; dateStr: string; inMonth: boolean }[] = [];
    for (let i = 0; i < rows * 7; i++) {
      const date = new Date(year, month, 1 - startOffset + i);
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      result.push({ date, dateStr, inMonth: date.getMonth() === month });
    }
    return result;
  }, [year, month]);

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const postsByDate: Record<string, SharedPost[]> = {};
  posts.forEach(p => {
    if (!p.scheduled_at) return;
    const d = new Date(p.scheduled_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!postsByDate[key]) postsByDate[key] = [];
    postsByDate[key].push(p);
  });

  async function handleSubmitFeedback(postId: string, status: 'approved' | 'changes_requested' | 'comment') {
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
      const res = await fetch('/api/scheduler/share/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          share_token: token,
          post_id: postId,
          author_name: authorName.trim(),
          content: commentText.trim() || (status === 'approved' ? 'Approved' : 'Changes requested'),
          status,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to submit');
      }

      setCommentText('');
      toast.success(
        status === 'approved' ? 'Post approved!' :
        status === 'changes_requested' ? 'Changes requested' :
        'Comment added'
      );

      // Update local review status (and promote draft → scheduled on approval)
      setPosts(prev => prev.map(p => {
        if (p.id !== postId) return p;
        const updated = { ...p, review_status: status === 'comment' ? p.review_status : status };
        if (status === 'approved' && p.status === 'draft') {
          updated.status = 'scheduled';
        }
        return updated;
      }));
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

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-text-primary">{error}</h1>
          <p className="text-sm text-text-muted mt-1">This review link may have expired or been deactivated.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-nativz-border bg-surface px-6 py-4">
        <h1 className="text-lg font-semibold text-text-primary">{clientName} — Content calendar</h1>
        <p className="text-sm text-text-muted mt-0.5">
          Review scheduled posts and leave feedback. {posts.length} post{posts.length !== 1 ? 's' : ''} total.
        </p>
      </div>

      <div className="flex">
        {/* Calendar */}
        <div className="flex-1 flex flex-col">
          {/* Nav */}
          <div className="flex items-center gap-2 px-6 py-3 border-b border-nativz-border">
            <Button size="sm" variant="ghost" onClick={() => setCurrentDate(new Date())}>
              Today
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCurrentDate(new Date(year, month - 1, 1))}>
              <ChevronLeft size={16} />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCurrentDate(new Date(year, month + 1, 1))}>
              <ChevronRight size={16} />
            </Button>
            <h2 className="text-base font-semibold text-text-primary">
              {monthName} {year}
            </h2>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-nativz-border">
            {WEEKDAYS.map(d => (
              <div key={d} className="px-2 py-1.5 text-xs font-medium text-text-muted text-center">
                {d}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div className="flex-1 grid grid-cols-7 auto-rows-fr">
            {cells.map(({ date, dateStr, inMonth }) => {
              const dayPosts = postsByDate[dateStr] ?? [];
              const isToday = dateStr === today;

              return (
                <div
                  key={dateStr}
                  className={`
                    border-b border-r border-nativz-border p-1 min-h-[90px]
                    ${!inMonth ? 'opacity-30' : ''}
                    ${isToday ? 'bg-accent-surface/10' : ''}
                  `}
                >
                  <span className={`text-xs font-medium ${isToday ? 'text-accent-text' : 'text-text-secondary'}`}>
                    {date.getDate()}
                  </span>
                  <div className="mt-0.5 space-y-0.5">
                    {dayPosts.slice(0, 3).map(post => {
                      const ss = STATUS_STYLES[post.status] ?? STATUS_STYLES.draft;
                      const time = post.scheduled_at
                        ? new Date(post.scheduled_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                        : '';
                      return (
                        <button
                          key={post.id}
                          onClick={() => setSelectedPost(post)}
                          className={`w-full flex items-center gap-1 rounded px-1 py-0.5 text-left transition-colors cursor-pointer hover:bg-surface-hover ${
                            selectedPost?.id === post.id ? 'ring-1 ring-accent-text' : ''
                          }`}
                        >
                          {post.thumbnail_url ? (
                            <img src={post.thumbnail_url} alt="" className="w-5 h-5 rounded object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-5 h-5 rounded bg-surface-hover flex-shrink-0 flex items-center justify-center">
                              <Film size={10} className="text-text-muted" />
                            </div>
                          )}
                          <span className="text-[10px] text-text-secondary truncate">{time}</span>
                          {post.review_status === 'approved' && (
                            <CheckCircle size={10} className="text-emerald-400 flex-shrink-0 ml-auto" />
                          )}
                          {post.review_status === 'changes_requested' && (
                            <AlertTriangle size={10} className="text-amber-400 flex-shrink-0 ml-auto" />
                          )}
                        </button>
                      );
                    })}
                    {dayPosts.length > 3 && (
                      <span className="text-[10px] text-text-muted">+{dayPosts.length - 3} more</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Post detail sidebar */}
        <div className="w-96 border-l border-nativz-border bg-surface flex flex-col overflow-y-auto">
          {selectedPost ? (
            <PostDetail
              post={selectedPost}
              authorName={authorName}
              commentText={commentText}
              submitting={submitting}
              onAuthorNameChange={setAuthorName}
              onCommentTextChange={setCommentText}
              onSubmit={(status) => handleSubmitFeedback(selectedPost.id, status)}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center">
                <MessageSquare size={32} className="text-text-muted mx-auto mb-2" />
                <p className="text-sm text-text-muted">Select a post to review</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PostDetail({
  post,
  authorName,
  commentText,
  submitting,
  onAuthorNameChange,
  onCommentTextChange,
  onSubmit,
}: {
  post: SharedPost;
  authorName: string;
  commentText: string;
  submitting: boolean;
  onAuthorNameChange: (v: string) => void;
  onCommentTextChange: (v: string) => void;
  onSubmit: (status: 'approved' | 'changes_requested' | 'comment') => void;
}) {
  const ss = STATUS_STYLES[post.status] ?? STATUS_STYLES.draft;

  return (
    <div className="flex flex-col h-full">
      {/* Post info */}
      <div className="p-4 border-b border-nativz-border">
        <div className="flex items-center gap-2 mb-3">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ss.bg} ${ss.text}`}>
            {ss.label}
          </span>
          {post.review_status === 'approved' && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-500/20 text-emerald-400">
              <CheckCircle size={10} /> Approved
            </span>
          )}
          {post.review_status === 'changes_requested' && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-400">
              <AlertTriangle size={10} /> Changes requested
            </span>
          )}
        </div>

        {/* Platforms */}
        {post.platforms.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {post.platforms.map((p, i) => (
              <span key={i} className="text-xs bg-surface-hover rounded-full px-2 py-0.5 text-text-secondary">
                {PLATFORM_LABELS[p.platform] ?? p.platform} @{p.username}
              </span>
            ))}
          </div>
        )}

        {/* Schedule */}
        {post.scheduled_at && (
          <div className="flex items-center gap-1 text-xs text-text-muted mb-3">
            <Clock size={12} />
            {new Date(post.scheduled_at).toLocaleString([], {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </div>
        )}

        {/* Thumbnail */}
        {post.thumbnail_url && (
          <div className="rounded-lg overflow-hidden bg-surface-hover mb-3 aspect-[9/16] max-w-[200px]">
            <img src={post.thumbnail_url} alt="" className="w-full h-full object-cover" />
          </div>
        )}

        {/* Caption */}
        <div className="mb-3">
          <h3 className="text-xs font-medium text-text-muted mb-1">Caption</h3>
          <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
            {post.caption || 'No caption yet'}
          </p>
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

      {/* Feedback form */}
      <div className="p-4 mt-auto">
        {post.status === 'draft' && post.review_status !== 'approved' && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 mb-3">
            <p className="text-xs text-amber-400">
              This post is a draft. Approving it will schedule it for publishing.
            </p>
          </div>
        )}
        <h3 className="text-xs font-medium text-text-muted mb-2">Leave feedback</h3>

        <input
          value={authorName}
          onChange={(e) => onAuthorNameChange(e.target.value)}
          placeholder="Your name"
          className="w-full rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted mb-2 focus:outline-none focus:ring-1 focus:ring-accent-text"
        />

        <textarea
          value={commentText}
          onChange={(e) => onCommentTextChange(e.target.value)}
          placeholder="Add a comment (optional for approve/reject)"
          rows={2}
          className="w-full rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted mb-3 focus:outline-none focus:ring-1 focus:ring-accent-text resize-none"
        />

        <div className="flex items-center gap-2">
          <Button
            onClick={() => onSubmit('approved')}
            disabled={submitting}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <CheckCircle size={12} />
            Approve
          </Button>
          <Button
            onClick={() => onSubmit('changes_requested')}
            disabled={submitting}
            size="sm"
            variant="ghost"
            className="text-amber-400 hover:text-amber-300"
          >
            <AlertTriangle size={12} />
            Changes
          </Button>
          <Button
            onClick={() => onSubmit('comment')}
            disabled={submitting || !commentText.trim()}
            size="sm"
            variant="ghost"
          >
            <MessageSquare size={12} />
            Comment
          </Button>
        </div>
      </div>
    </div>
  );
}
