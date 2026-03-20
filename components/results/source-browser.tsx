'use client';

import { useState } from 'react';
import {
  ExternalLink,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  ChevronDown,
  ChevronUp,
  FileText,
  ThumbsUp,
  ArrowUpRight,
} from 'lucide-react';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}
import { Card } from '@/components/ui/card';
import { PlatformIcon, PLATFORM_CONFIG } from '@/components/search/platform-icon';
import type { PlatformSource, PlatformComment, SearchPlatform } from '@/lib/types/search';

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com')) return u.searchParams.get('v');
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
  } catch {
    // ignore
  }
  return null;
}

function engagementScore(source: PlatformSource): number {
  const { views = 0, likes = 0, comments = 0, shares = 0, score = 0 } = source.engagement;
  return views + likes * 10 + comments * 5 + shares * 8 + score * 2;
}

// ── Stat chip ───────────────────────────────────────────────────────────────

function Stat({ icon, value }: { icon: React.ReactNode; value: number }) {
  return (
    <span className="flex items-center gap-1 text-[11px] text-text-muted">
      {icon}
      {formatNumber(value)}
    </span>
  );
}

// ── Collapsible comments ────────────────────────────────────────────────────

function CommentsBlock({ comments, authorPrefix = '@' }: { comments: PlatformComment[]; authorPrefix?: string }) {
  const [open, setOpen] = useState(false);
  if (comments.length === 0) return null;

  const shown = open ? comments : comments.slice(0, 2);

  return (
    <div className="mt-2 space-y-1.5">
      {shown.map((c) => (
        <div key={c.id} className="border-l-2 border-nativz-border pl-2.5 py-0.5">
          <p className="text-[11px] text-text-secondary leading-relaxed">
            <span className="text-text-muted font-medium">{authorPrefix}{c.author}</span>{' '}
            {c.text}
          </p>
          {c.likes > 0 && (
            <span className="text-[10px] text-text-muted">{c.likes} likes</span>
          )}
        </div>
      ))}
      {comments.length > 2 && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-[11px] text-accent-text hover:underline cursor-pointer"
        >
          {open ? 'Show less' : `Show all ${comments.length} comments`}
        </button>
      )}
    </div>
  );
}

// ── Reddit card ─────────────────────────────────────────────────────────────

function RedditCard({ source }: { source: PlatformSource }) {
  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-4 space-y-2">
      {/* Subreddit badge */}
      {source.subreddit && (
        <span className="inline-flex items-center rounded-md bg-orange-500/10 px-2 py-0.5 text-[11px] font-medium text-orange-400">
          r/{source.subreddit}
        </span>
      )}

      {/* Title */}
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-sm font-medium text-text-primary hover:text-accent-text transition-colors line-clamp-2"
      >
        {source.title}
      </a>

      {/* Stats */}
      <div className="flex items-center gap-3">
        {source.engagement.score != null && (
          <Stat icon={<ThumbsUp size={10} />} value={source.engagement.score} />
        )}
        {source.engagement.comments != null && (
          <Stat icon={<MessageCircle size={10} />} value={source.engagement.comments} />
        )}
      </div>

      {/* Selftext */}
      {source.content && (
        <p className="text-xs text-text-secondary line-clamp-3 leading-relaxed">{source.content}</p>
      )}

      {/* Top comments */}
      <CommentsBlock comments={(source.comments ?? []).slice(0, 2)} authorPrefix="u/" />

      {/* Link */}
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[11px] text-accent-text hover:underline mt-1"
      >
        View thread <ArrowUpRight size={10} />
      </a>
    </div>
  );
}

// ── YouTube card ────────────────────────────────────────────────────────────

function YouTubeCard({ source }: { source: PlatformSource }) {
  const [showTranscript, setShowTranscript] = useState(false);
  const videoId = extractVideoId(source.url) ?? source.id;
  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;

  return (
    <div className="rounded-xl border border-nativz-border bg-surface overflow-hidden">
      {/* Thumbnail */}
      <a href={source.url} target="_blank" rel="noopener noreferrer" className="block relative">
        <img
          src={thumbnailUrl}
          alt={source.title}
          className="w-full h-36 object-cover"
          loading="lazy"
        />
      </a>

      <div className="p-4 space-y-2">
        {/* Title */}
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-sm font-medium text-text-primary hover:text-accent-text transition-colors line-clamp-2"
        >
          {source.title}
        </a>

        {/* Channel name */}
        {source.author && (
          <p className="text-[11px] text-text-muted">{source.author}</p>
        )}

        {/* Stats */}
        <div className="flex items-center gap-3">
          {source.engagement.views != null && (
            <Stat icon={<Eye size={10} />} value={source.engagement.views} />
          )}
          {source.engagement.likes != null && (
            <Stat icon={<Heart size={10} />} value={source.engagement.likes} />
          )}
          {source.engagement.comments != null && (
            <Stat icon={<MessageCircle size={10} />} value={source.engagement.comments} />
          )}
        </div>

        {/* Top comment */}
        <CommentsBlock comments={(source.comments ?? []).slice(0, 1)} />

        {/* Transcript snippet */}
        {source.transcript && (
          <>
            <button
              type="button"
              onClick={() => setShowTranscript(!showTranscript)}
              className="flex items-center gap-1.5 text-[11px] text-accent-text hover:underline cursor-pointer"
            >
              <FileText size={10} />
              {showTranscript ? 'Hide transcript' : 'Show transcript'}
              {showTranscript ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>
            {showTranscript && (
              <p className="text-[11px] text-text-secondary leading-relaxed max-h-32 overflow-y-auto border-l-2 border-nativz-border pl-2.5">
                {source.transcript}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── TikTok card ─────────────────────────────────────────────────────────────

function TikTokCard({ source }: { source: PlatformSource }) {
  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-4 space-y-2">
      {/* Creator */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-primary">
          {source.author && (
            <span className="text-text-muted">@{source.author}</span>
          )}
        </span>
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-text hover:underline"
        >
          <ExternalLink size={12} />
        </a>
      </div>

      {/* Description */}
      {source.content && (
        <p className="text-xs text-text-secondary line-clamp-3 leading-relaxed">{source.content}</p>
      )}
      {!source.content && source.title && (
        <p className="text-xs text-text-secondary line-clamp-3 leading-relaxed">{source.title}</p>
      )}

      {/* Stats */}
      <div className="flex items-center gap-3 flex-wrap">
        {source.engagement.views != null && (
          <Stat icon={<Eye size={10} />} value={source.engagement.views} />
        )}
        {source.engagement.likes != null && (
          <Stat icon={<Heart size={10} />} value={source.engagement.likes} />
        )}
        {source.engagement.comments != null && (
          <Stat icon={<MessageCircle size={10} />} value={source.engagement.comments} />
        )}
        {source.engagement.shares != null && (
          <Stat icon={<Share2 size={10} />} value={source.engagement.shares} />
        )}
      </div>

      {/* Top comments */}
      <CommentsBlock comments={(source.comments ?? []).slice(0, 2)} />
    </div>
  );
}

// ── Quora card ──────────────────────────────────────────────────────────────

function QuoraCard({ source }: { source: PlatformSource }) {
  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-4 space-y-2">
      {/* Question title */}
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-sm font-medium text-text-primary hover:text-accent-text transition-colors line-clamp-2"
      >
        {source.title}
      </a>

      {/* Top answer snippet */}
      {source.content && (
        <p className="text-xs text-text-secondary line-clamp-4 leading-relaxed">{source.content}</p>
      )}

      {/* Answer count */}
      {source.engagement.comments != null && source.engagement.comments > 0 && (
        <span className="text-[11px] text-text-muted">{source.engagement.comments} answers</span>
      )}

      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[11px] text-accent-text hover:underline"
      >
        Read on Quora <ArrowUpRight size={10} />
      </a>
    </div>
  );
}

// ── Web card ────────────────────────────────────────────────────────────────

function WebCard({ source }: { source: PlatformSource }) {
  const domain = extractDomain(source.url);

  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-4 space-y-2">
      {/* Domain badge */}
      <span className="text-[11px] text-text-muted">{domain}</span>

      {/* Title */}
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-sm font-medium text-text-primary hover:text-accent-text transition-colors line-clamp-2"
      >
        {stripHtml(source.title)}
      </a>

      {/* Snippet */}
      {source.content && (
        <p className="text-xs text-text-secondary line-clamp-3 leading-relaxed">{stripHtml(source.content)}</p>
      )}

      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[11px] text-accent-text hover:underline"
      >
        Visit page <ArrowUpRight size={10} />
      </a>
    </div>
  );
}

// ── Source card router ──────────────────────────────────────────────────────

function SourceCard({ source }: { source: PlatformSource }) {
  switch (source.platform) {
    case 'reddit':
      return <RedditCard source={source} />;
    case 'youtube':
      return <YouTubeCard source={source} />;
    case 'tiktok':
      return <TikTokCard source={source} />;
    case 'quora':
      return <QuoraCard source={source} />;
    case 'web':
      return <WebCard source={source} />;
    default:
      return <WebCard source={source} />;
  }
}

// ── Main component ──────────────────────────────────────────────────────────

type PlatformTab = 'all' | SearchPlatform;

interface SourceBrowserProps {
  sources: PlatformSource[];
}

export function SourceBrowser({ sources }: SourceBrowserProps) {
  const [activeTab, setActiveTab] = useState<PlatformTab>('all');
  const [showAll, setShowAll] = useState(false);

  if (!sources || sources.length === 0) return null;

  // Unique platforms with data
  const platforms = Array.from(new Set(sources.map((s) => s.platform)));
  const platformCounts = platforms.reduce<Record<string, number>>((acc, p) => {
    acc[p] = sources.filter((s) => s.platform === p).length;
    return acc;
  }, {});

  // Filter and sort by engagement
  const filtered = activeTab === 'all' ? sources : sources.filter((s) => s.platform === activeTab);
  const sorted = [...filtered].sort((a, b) => engagementScore(b) - engagementScore(a));
  const displayed = showAll ? sorted : sorted.slice(0, 12);

  return (
    <Card>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-text-primary">Source browser</h3>
        <span className="text-xs text-text-muted">{sources.length} sources</span>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-5 bg-white/[0.04] rounded-lg p-0.5 w-fit overflow-x-auto">
        <button
          type="button"
          onClick={() => { setActiveTab('all'); setShowAll(false); }}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'all' ? 'bg-white/[0.08] text-text-primary' : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          All
        </button>
        {platforms.map((p) => {
          const config = PLATFORM_CONFIG[p];
          const Icon = config.icon;
          return (
            <button
              key={p}
              type="button"
              onClick={() => { setActiveTab(p); setShowAll(false); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === p ? 'bg-white/[0.08] text-text-primary' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              <Icon size={12} className={config.color} />
              <span>{config.label}</span>
              <span className="text-text-muted">({platformCounts[p] ?? 0})</span>
            </button>
          );
        })}
      </div>

      {/* Grid of cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {displayed.map((source) => (
          <SourceCard key={`${source.platform}-${source.id}`} source={source} />
        ))}
      </div>

      {/* Show more */}
      {!showAll && sorted.length > 12 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-4 w-full text-center text-xs text-accent-text hover:underline cursor-pointer py-2"
        >
          Show all {sorted.length} sources
        </button>
      )}
    </Card>
  );
}
