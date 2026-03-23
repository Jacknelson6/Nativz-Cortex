'use client';

import { useState } from 'react';
import { ExternalLink, Eye, Heart, MessageCircle, Share2, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PLATFORM_CONFIG } from '@/components/search/platform-icon';
import type { SearchPlatform, PlatformComment } from '@/lib/types/search';

interface StoredSource {
  platform: SearchPlatform;
  id: string;
  url: string;
  title: string;
  content: string;
  author: string;
  subreddit?: string;
  engagement: {
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    score?: number;
  };
  createdAt: string;
  comments: PlatformComment[];
  transcript?: string | null;
}

interface PlatformSourcesProps {
  sources: StoredSource[];
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function TikTokEmbed({ source }: { source: StoredSource }) {
  const [showComments, setShowComments] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      {/* TikTok embed iframe */}
      <div className="relative w-full" style={{ paddingBottom: '177%', maxHeight: 500 }}>
        <iframe
          src={`https://www.tiktok.com/embed/v2/${source.id}`}
          className="absolute inset-0 w-full h-full"
          style={{ maxHeight: 500 }}
          allowFullScreen
          allow="encrypted-media"
          loading="lazy"
        />
      </div>

      {/* Stats bar */}
      <div className="px-3 py-2 flex items-center gap-4 text-[11px] text-text-muted border-t border-white/[0.06]">
        {source.engagement.views != null && (
          <span className="flex items-center gap-1"><Eye size={10} /> {formatNumber(source.engagement.views)}</span>
        )}
        {source.engagement.likes != null && (
          <span className="flex items-center gap-1"><Heart size={10} /> {formatNumber(source.engagement.likes)}</span>
        )}
        {source.engagement.comments != null && (
          <span className="flex items-center gap-1"><MessageCircle size={10} /> {formatNumber(source.engagement.comments)}</span>
        )}
        {source.engagement.shares != null && (
          <span className="flex items-center gap-1"><Share2 size={10} /> {formatNumber(source.engagement.shares)}</span>
        )}
        <a href={source.url} target="_blank" rel="noopener noreferrer" className="ml-auto text-accent-text hover:underline flex items-center gap-1">
          Open <ExternalLink size={9} />
        </a>
      </div>

      {/* Expandable sections */}
      <div className="border-t border-white/[0.06]">
        {source.comments.length > 0 && (
          <button
            type="button"
            onClick={() => setShowComments(!showComments)}
            className="w-full flex items-center justify-between px-3 py-2 text-[11px] text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
          >
            <span>{source.comments.length} comments</span>
            {showComments ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
        {showComments && (
          <div className="px-3 pb-2 space-y-1.5 max-h-40 overflow-y-auto">
            {source.comments.map((c) => (
              <div key={c.id} className="text-[11px]">
                <span className="text-text-muted font-medium">@{c.author}</span>
                <span className="text-text-secondary ml-1.5">{c.text}</span>
                {c.likes > 0 && <span className="text-text-muted/50 ml-1.5">({c.likes} likes)</span>}
              </div>
            ))}
          </div>
        )}

        {source.transcript && (
          <>
            <button
              type="button"
              onClick={() => setShowTranscript(!showTranscript)}
              className="w-full flex items-center justify-between px-3 py-2 text-[11px] text-text-muted hover:text-text-secondary transition-colors cursor-pointer border-t border-white/[0.04]"
            >
              <span className="flex items-center gap-1"><FileText size={10} /> Transcript</span>
              {showTranscript ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {showTranscript && (
              <div className="px-3 pb-2 text-[11px] text-text-secondary leading-relaxed max-h-32 overflow-y-auto">
                {source.transcript}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function VideoSourceCard({ source }: { source: StoredSource }) {
  const [showComments, setShowComments] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const config = PLATFORM_CONFIG[source.platform];
  const Icon = config.icon;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
      <div className="flex items-start gap-2">
        <Icon size={14} className={config.color + ' shrink-0 mt-0.5'} />
        <div className="min-w-0 flex-1">
          <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-text-primary hover:text-accent-text line-clamp-2">
            {source.title}
          </a>
          <p className="text-[10px] text-text-muted mt-0.5">@{source.author}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 text-[10px] text-text-muted">
        {source.engagement.views != null && <span className="flex items-center gap-1"><Eye size={9} /> {formatNumber(source.engagement.views)}</span>}
        {source.engagement.likes != null && <span className="flex items-center gap-1"><Heart size={9} /> {formatNumber(source.engagement.likes)}</span>}
        {source.engagement.comments != null && <span className="flex items-center gap-1"><MessageCircle size={9} /> {formatNumber(source.engagement.comments)}</span>}
      </div>

      {source.comments.length > 0 && (
        <button type="button" onClick={() => setShowComments(!showComments)} className="text-[10px] text-accent-text hover:underline cursor-pointer">
          {showComments ? 'Hide' : 'Show'} {source.comments.length} comments
        </button>
      )}
      {showComments && (
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {source.comments.map(c => (
            <p key={c.id} className="text-[10px] text-text-secondary"><span className="text-text-muted">@{c.author}:</span> {c.text}</p>
          ))}
        </div>
      )}

      {source.transcript && (
        <button type="button" onClick={() => setShowTranscript(!showTranscript)} className="text-[10px] text-accent-text hover:underline cursor-pointer flex items-center gap-1">
          <FileText size={9} /> {showTranscript ? 'Hide' : 'Show'} transcript
        </button>
      )}
      {showTranscript && source.transcript && (
        <p className="text-[10px] text-text-secondary leading-relaxed max-h-24 overflow-y-auto">{source.transcript}</p>
      )}
    </div>
  );
}

function RedditSourceCard({ source }: { source: StoredSource }) {
  const [showComments, setShowComments] = useState(false);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
      <div className="flex items-start gap-2">
        {(() => { const I = PLATFORM_CONFIG.reddit.icon; return <I size={14} className="text-orange-400 shrink-0 mt-0.5" />; })()}
        <div className="min-w-0 flex-1">
          <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-text-primary hover:text-accent-text line-clamp-2">
            {source.title}
          </a>
          <p className="text-[10px] text-text-muted mt-0.5">r/{source.subreddit} · {source.engagement.score ?? 0} pts · {source.engagement.comments ?? 0} comments</p>
        </div>
      </div>
      {source.content && <p className="text-[10px] text-text-secondary line-clamp-3">{source.content}</p>}

      {source.comments.length > 0 && (
        <button type="button" onClick={() => setShowComments(!showComments)} className="text-[10px] text-accent-text hover:underline cursor-pointer">
          {showComments ? 'Hide' : 'Show'} {source.comments.length} comments
        </button>
      )}
      {showComments && (
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {source.comments.map(c => (
            <p key={c.id} className="text-[10px] text-text-secondary"><span className="text-text-muted">u/{c.author}:</span> {c.text}</p>
          ))}
        </div>
      )}
    </div>
  );
}

type PlatformTab = 'all' | SearchPlatform;

export function PlatformSources({ sources }: PlatformSourcesProps) {
  const [activeTab, setActiveTab] = useState<PlatformTab>('all');
  const [showAll, setShowAll] = useState(false);

  if (!sources || sources.length === 0) return null;

  // Sort by views/engagement descending
  const sorted = [...sources].sort((a, b) => {
    const aEng = (a.engagement.views ?? 0) + (a.engagement.likes ?? 0) * 10;
    const bEng = (b.engagement.views ?? 0) + (b.engagement.likes ?? 0) * 10;
    return bEng - aEng;
  });

  const platforms = Array.from(new Set(sources.map(s => s.platform)));
  const filtered = activeTab === 'all' ? sorted : sorted.filter(s => s.platform === activeTab);
  const displayed = showAll ? filtered : filtered.slice(0, 12);

  // Separate TikTok embeds from other sources
  const tiktokSources = displayed.filter(s => s.platform === 'tiktok');
  const otherSources = displayed.filter(s => s.platform !== 'tiktok');

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-text-primary">Sources ({sources.length})</h3>
      </div>

      {/* Platform tabs */}
      <div className="flex gap-1 mb-4 bg-white/[0.04] rounded-lg p-0.5 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            activeTab === 'all' ? 'bg-white/[0.08] text-text-primary' : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          All
        </button>
        {platforms.map(p => {
          const config = PLATFORM_CONFIG[p];
          const Icon = config.icon;
          const count = sources.filter(s => s.platform === p).length;
          return (
            <button
              key={p}
              type="button"
              onClick={() => setActiveTab(p)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === p ? 'bg-white/[0.08] text-text-primary' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              <Icon size={12} className={config.color} />
              {count}
            </button>
          );
        })}
      </div>

      {/* TikTok embeds grid */}
      {(activeTab === 'all' || activeTab === 'tiktok') && tiktokSources.length > 0 && (
        <div className="mb-4">
          {activeTab === 'all' && (
            <div className="flex items-center gap-2 mb-3">
              {(() => {
                const I = PLATFORM_CONFIG.tiktok.icon;
                return <I size={14} />;
              })()}
              <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">TikTok ({tiktokSources.length})</h4>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {tiktokSources.map(s => <TikTokEmbed key={s.id} source={s} />)}
          </div>
        </div>
      )}

      {/* Other sources */}
      {otherSources.length > 0 && (
        <div className="space-y-2">
          {otherSources.map(s => {
            if (s.platform === 'reddit') return <RedditSourceCard key={s.id} source={s} />;
            if (s.platform === 'youtube') return <VideoSourceCard key={s.id} source={s} />;
            return <VideoSourceCard key={s.id} source={s} />;
          })}
        </div>
      )}

      {/* Show more */}
      {!showAll && filtered.length > 12 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-4 w-full text-center text-xs text-accent-text hover:underline cursor-pointer py-2"
        >
          Show all {filtered.length} sources
        </button>
      )}
    </Card>
  );
}
