'use client';

import { useState } from 'react';
import { UserSearch, ChevronDown, ChevronRight, Eye, Heart, MessageCircle, Share2, Clock, Loader2, CheckSquare, Square } from 'lucide-react';
import { GlassButton } from '@/components/ui/glass-button';
import { Card } from '@/components/ui/card';

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

  function togglePost(url: string) {
    setSelectedPosts((prev) => {
      const next = new Set(prev);
      next.has(url) ? next.delete(url) : next.add(url);
      return next;
    });
  }

  function selectAll() {
    if (!result) return;
    setSelectedPosts(new Set(result.posts.map((p) => p.url)));
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
          <UserSearch size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-white">Profile Extract</h1>
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
      {result && (
        <>
          {/* Creator Header */}
          <Card padding="none">
            <div className="relative overflow-hidden rounded-xl">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600/30 via-purple-600/20 to-pink-600/30" />
              <div className="relative flex items-center gap-5 p-6">
                {result.profile.avatar ? (
                  <img
                    src={result.profile.avatar}
                    alt={result.profile.name}
                    className="h-20 w-20 rounded-full border-2 border-white/20 object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 text-2xl font-bold text-white">
                    {result.profile.name[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-white">{result.profile.name}</h2>
                  <p className="text-sm text-white/50">@{result.profile.handle}</p>
                  {result.profile.bio && <p className="mt-1 text-sm text-white/60 line-clamp-2">{result.profile.bio}</p>}
                </div>
                <div className="flex gap-6 text-center">
                  {result.profile.followers != null && (
                    <div>
                      <p className="text-lg font-semibold text-white">{formatNumber(result.profile.followers)}</p>
                      <p className="text-xs text-white/40">Followers</p>
                    </div>
                  )}
                  {result.profile.likes != null && (
                    <div>
                      <p className="text-lg font-semibold text-white">{formatNumber(result.profile.likes)}</p>
                      <p className="text-xs text-white/40">Likes</p>
                    </div>
                  )}
                  {result.profile.videos != null && (
                    <div>
                      <p className="text-lg font-semibold text-white">{formatNumber(result.profile.videos)}</p>
                      <p className="text-xs text-white/40">Videos</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <GlassButton onClick={selectAll}>Select All ({result.posts.length})</GlassButton>
            {selectedPosts.size > 0 && (
              <GlassButton onClick={() => setSelectedPosts(new Set())}>
                Clear ({selectedPosts.size})
              </GlassButton>
            )}
            <div className="flex-1" />
            <p className="text-sm text-white/40">{result.posts.length} posts analyzed</p>
          </div>

          {/* Format Groups */}
          {Object.entries(result.formatGroups)
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
                        className="group relative cursor-pointer overflow-hidden rounded-lg border border-white/5 bg-white/5 transition-all hover:border-blue-500/30"
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
      )}
    </div>
  );
}
