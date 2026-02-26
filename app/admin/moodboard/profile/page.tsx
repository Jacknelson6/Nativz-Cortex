'use client';

import { useState, useEffect, useCallback } from 'react';
import { UserSearch, ChevronDown, ChevronRight, Eye, Heart, MessageCircle, Clock, Loader2, CheckSquare, Square, FolderPlus, ExternalLink } from 'lucide-react';
import { GlassButton } from '@/components/ui/glass-button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import type { MoodboardBoard } from '@/lib/types/moodboard';

interface PostData {
  url: string;
  title: string;
  thumbnail: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  duration: number;
  hashtags: string[];
  engagement: number;
  formatGroup?: string;
}

interface ProfileData {
  name: string;
  handle: string;
  avatar: string | null;
  bio: string | null;
  followers: number | null;
  following: number | null;
  likes: number | null;
  videos: number | null;
}

interface FormatGroup {
  posts: PostData[];
  avgEngagement: number;
  avgViews: number;
}

interface ExtractResult {
  profile: ProfileData;
  posts: PostData[];
  formatGroups: Record<string, FormatGroup>;
  platform: string;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

function formatLabel(key: string): string {
  return key.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ProfileExtractPage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
  const [boards, setBoards] = useState<MoodboardBoard[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const fetchBoards = useCallback(async () => {
    try {
      const res = await fetch('/api/moodboard/boards');
      if (res.ok) {
        const data = await res.json();
        setBoards(data);
        if (data.length > 0 && !selectedBoardId) {
          setSelectedBoardId(data[0].id);
        }
      }
    } catch {
      // Boards fetch optional
    }
  }, [selectedBoardId]);

  useEffect(() => {
    fetchBoards();
  }, [fetchBoards]);

  async function handleExtract() {
    if (!url.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    setSelectedPosts(new Set());

    try {
      const res = await fetch('/api/moodboard/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to extract profile');
        return;
      }
      setResult(data);
      toast.success(`Found ${data.posts.length} posts from @${data.profile.handle}`);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function toggleGroup(group: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(group) ? next.delete(group) : next.add(group);
      return next;
    });
  }

  function togglePost(postUrl: string) {
    setSelectedPosts((prev) => {
      const next = new Set(prev);
      next.has(postUrl) ? next.delete(postUrl) : next.add(postUrl);
      return next;
    });
  }

  function selectAll() {
    if (!result) return;
    setSelectedPosts(new Set(result.posts.map((p) => p.url)));
  }

  async function handleSaveToBoard() {
    if (!selectedBoardId || selectedPosts.size === 0 || !result) return;
    setSaving(true);

    const selected = result.posts.filter((p) => selectedPosts.has(p.url));
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < selected.length; i++) {
      const post = selected[i];
      const col = i % 5;
      const row = Math.floor(i / 5);

      try {
        const res = await fetch('/api/moodboard/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            board_id: selectedBoardId,
            url: post.url,
            type: 'video',
            title: post.title || null,
            position_x: col * 260,
            position_y: row * 420,
            width: 240,
          }),
        });
        if (res.ok) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }

    setSaving(false);
    if (successCount > 0) {
      toast.success(`Added ${successCount} videos to board`);
    }
    if (failCount > 0) {
      toast.error(`Failed to add ${failCount} videos`);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
          <UserSearch size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-white">Profile extract</h1>
          <p className="text-sm text-white/50">Analyze a creator&apos;s top content by format</p>
        </div>
      </div>

      {/* Input */}
      <Card padding="md">
        <div className="flex gap-3">
          <input
            type="url"
            placeholder="Paste a TikTok profile URL (e.g. tiktok.com/@username)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleExtract()}
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
          />
          <GlassButton onClick={handleExtract} disabled={loading || !url.trim()}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <UserSearch size={16} />}
            {loading ? 'Extracting...' : 'Extract'}
          </GlassButton>
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </Card>

      {/* Results */}
      {result && (() => {
        const r = result;
        return (
        <>
          {/* Creator Header */}
          <Card padding="none">
            <div className="relative overflow-hidden rounded-xl">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600/30 via-purple-600/20 to-pink-600/30" />
              <div className="relative flex items-center gap-5 p-6">
                {r.profile.avatar ? (
                  <img
                    src={r.profile.avatar}
                    alt={r.profile.name}
                    className="h-20 w-20 rounded-full border-2 border-white/20 object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 text-2xl font-bold text-white">
                    {r.profile.name[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-white">{r.profile.name}</h2>
                    <a
                      href={`https://www.tiktok.com/@${r.profile.handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white/30 hover:text-white/60 transition-colors"
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>
                  <p className="text-sm text-white/50">@{r.profile.handle}</p>
                  {r.profile.bio && <p className="mt-1 text-sm text-white/60 line-clamp-2">{r.profile.bio}</p>}
                </div>
                <div className="flex gap-6 text-center">
                  {r.profile.followers != null && (
                    <div>
                      <p className="text-lg font-semibold text-white">{formatNumber(r.profile.followers)}</p>
                      <p className="text-xs text-white/40">Followers</p>
                    </div>
                  )}
                  {r.profile.likes != null && (
                    <div>
                      <p className="text-lg font-semibold text-white">{formatNumber(r.profile.likes)}</p>
                      <p className="text-xs text-white/40">Likes</p>
                    </div>
                  )}
                  {r.profile.videos != null && (
                    <div>
                      <p className="text-lg font-semibold text-white">{formatNumber(r.profile.videos)}</p>
                      <p className="text-xs text-white/40">Videos</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Actions */}
          <div className="flex items-center gap-3 flex-wrap">
            <GlassButton onClick={selectAll}>Select all ({r.posts.length})</GlassButton>
            {selectedPosts.size > 0 && (
              <GlassButton onClick={() => setSelectedPosts(new Set())}>
                Clear ({selectedPosts.size})
              </GlassButton>
            )}

            {selectedPosts.size > 0 && boards.length > 0 && (
              <div className="flex items-center gap-2 ml-auto">
                <select
                  value={selectedBoardId}
                  onChange={(e) => setSelectedBoardId(e.target.value)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
                >
                  {boards.map((b) => (
                    <option key={b.id} value={b.id} className="bg-gray-900 text-white">
                      {b.name}
                    </option>
                  ))}
                </select>
                <GlassButton onClick={handleSaveToBoard} disabled={saving}>
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <FolderPlus size={16} />}
                  {saving ? 'Saving...' : `Save ${selectedPosts.size} to board`}
                </GlassButton>
              </div>
            )}

            {selectedPosts.size === 0 && (
              <div className="flex-1 text-right">
                <p className="text-sm text-white/40">{r.posts.length} posts analyzed</p>
              </div>
            )}
          </div>

          {/* Format Groups */}
          {Object.entries(r.formatGroups)
            .sort(([, a], [, b]) => b.avgEngagement - a.avgEngagement)
            .map(([groupName, group]) => (
              <Card key={groupName} padding="none">
                {/* Group Header */}
                <button
                  onClick={() => toggleGroup(groupName)}
                  className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-white/5 transition-colors"
                >
                  {collapsedGroups.has(groupName) ? (
                    <ChevronRight size={16} className="text-white/40" />
                  ) : (
                    <ChevronDown size={16} className="text-white/40" />
                  )}
                  <span className="flex h-7 items-center rounded-full bg-gradient-to-r from-blue-500/20 to-purple-500/20 px-3 text-xs font-medium text-blue-300 border border-blue-500/20">
                    {formatLabel(groupName)}
                  </span>
                  <span className="text-xs text-white/40">{group.posts.length} posts</span>
                  <div className="flex-1" />
                  <div className="flex items-center gap-4 text-xs text-white/40">
                    <span className="flex items-center gap-1"><Eye size={12} /> {formatNumber(group.avgViews)} avg</span>
                    <span className="flex items-center gap-1"><Heart size={12} /> {formatNumber(group.avgEngagement)} avg eng</span>
                  </div>
                </button>

                {/* Posts Grid */}
                {!collapsedGroups.has(groupName) && (
                  <div className="grid grid-cols-2 gap-3 px-5 pb-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {group.posts.map((post) => (
                      <div
                        key={post.url}
                        className={`group relative cursor-pointer overflow-hidden rounded-lg border transition-all hover:border-blue-500/30 ${
                          selectedPosts.has(post.url) ? 'border-blue-500/40 bg-blue-500/10' : 'border-white/5 bg-white/5'
                        }`}
                        onClick={() => togglePost(post.url)}
                      >
                        {/* Selection indicator */}
                        <div className="absolute top-2 left-2 z-10">
                          {selectedPosts.has(post.url) ? (
                            <CheckSquare size={18} className="text-blue-400" />
                          ) : (
                            <Square size={18} className="text-white/30 opacity-0 group-hover:opacity-100 transition-opacity" />
                          )}
                        </div>

                        {/* Thumbnail */}
                        <div className="relative aspect-[9/16]">
                          {post.thumbnail ? (
                            <img src={post.thumbnail} alt={post.title} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-white/5 text-white/20 text-xs">No thumb</div>
                          )}
                          {/* Overlay */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                          <div className="absolute bottom-0 left-0 right-0 p-2 space-y-1">
                            <p className="text-xs text-white/80 line-clamp-2 leading-tight">{post.title || 'Untitled'}</p>
                            <div className="flex items-center gap-2 text-[10px] text-white/50">
                              <span className="flex items-center gap-0.5"><Eye size={10} /> {formatNumber(post.views)}</span>
                              <span className="flex items-center gap-0.5"><Heart size={10} /> {formatNumber(post.likes)}</span>
                              <span className="flex items-center gap-0.5"><MessageCircle size={10} /> {formatNumber(post.comments)}</span>
                            </div>
                          </div>
                          {/* Duration badge */}
                          {post.duration > 0 && (
                            <div className="absolute top-2 right-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/70">
                              <Clock size={10} /> {post.duration}s
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
        </>
        );
      })()}
    </div>
  );
}
