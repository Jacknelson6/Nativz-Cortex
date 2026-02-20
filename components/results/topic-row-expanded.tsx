'use client';

import { useState } from 'react';
import { MessageSquare, FileText, Globe, MessageCircle, Video, ExternalLink, Copy, Check } from 'lucide-react';
import { VideoIdeaCard } from './video-idea-card';
import { hasSources } from '@/lib/types/search';
import type { TrendingTopic, LegacyTrendingTopic, TopicSource, VideoIdea } from '@/lib/types/search';

interface TopicRowExpandedProps {
  topic: TrendingTopic | LegacyTrendingTopic;
  clientId?: string | null;
  searchId?: string;
}

const SOURCE_TYPE_ICON: Record<string, React.ReactNode> = {
  web: <Globe size={12} className="text-blue-400 shrink-0" />,
  discussion: <MessageCircle size={12} className="text-emerald-400 shrink-0" />,
  video: <Video size={12} className="text-purple-400 shrink-0" />,
};

function formatAllIdeasForClipboard(topicName: string, ideas: VideoIdea[]): string {
  const lines = [`Video ideas for: ${topicName}`, ''];
  ideas.forEach((idea, i) => {
    lines.push(`${i + 1}. ${idea.title}`);
    lines.push(`   Hook: ${idea.hook}`);
    lines.push(`   Format: ${idea.format.replace(/_/g, ' ')}`);
    lines.push(`   Why it works: ${idea.why_it_works}`);
    lines.push('');
  });
  return lines.join('\n');
}

function SourceLink({ source }: { source: TopicSource }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-2 rounded-md border border-nativz-border bg-surface px-3 py-2 text-sm transition-colors hover:border-accent/40 hover:bg-accent-surface group"
    >
      {SOURCE_TYPE_ICON[source.type] || SOURCE_TYPE_ICON.web}
      <div className="min-w-0 flex-1">
        <p className="font-medium text-text-secondary truncate group-hover:text-accent-text transition-colors text-xs">
          {source.title}
        </p>
        {source.relevance && (
          <p className="text-xs text-text-muted mt-0.5 line-clamp-1">{source.relevance}</p>
        )}
      </div>
      <ExternalLink size={10} className="shrink-0 mt-0.5 text-text-muted group-hover:text-accent-text transition-colors" />
    </a>
  );
}

export function TopicRowExpanded({ topic, clientId, searchId }: TopicRowExpandedProps) {
  const [copiedAll, setCopiedAll] = useState(false);
  const topicHasSources = hasSources(topic);

  async function handleCopyAll() {
    try {
      await navigator.clipboard.writeText(
        formatAllIdeasForClipboard(topic.name, topic.video_ideas)
      );
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      // Clipboard API not available
    }
  }

  return (
    <div className="animate-expand-in border-b border-nativz-border bg-background px-6 py-5">
      {/* Overview cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 mb-5">
        <div className="rounded-lg border border-nativz-border bg-surface p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText size={14} className="text-accent-text" />
            <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wide">Posts overview</h4>
          </div>
          <p className="text-sm text-text-secondary leading-relaxed">{topic.posts_overview}</p>
        </div>

        <div className="rounded-lg border border-nativz-border bg-surface p-4">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare size={14} className="text-emerald-400" />
            <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wide">Comments overview</h4>
          </div>
          <p className="text-sm text-text-secondary leading-relaxed">{topic.comments_overview}</p>
        </div>
      </div>

      {/* Source links (new shape only) */}
      {topicHasSources && topic.sources.length > 0 && (
        <div className="mb-5">
          <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">
            Sources ({topic.sources.length})
          </h4>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {topic.sources.map((source, i) => (
              <SourceLink key={i} source={source} />
            ))}
          </div>
        </div>
      )}

      {/* Video ideas */}
      {(topic.video_ideas?.length ?? 0) > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide">
              Video ideas ({topic.video_ideas?.length ?? 0})
            </h4>
            <button
              onClick={handleCopyAll}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              {copiedAll ? (
                <>
                  <Check size={12} className="text-accent" />
                  <span className="text-accent">Copied</span>
                </>
              ) : (
                <>
                  <Copy size={12} />
                  Copy all ideas
                </>
              )}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {(topic.video_ideas ?? []).map((idea, i) => (
              <VideoIdeaCard
                key={i}
                idea={idea}
                topicName={topic.name}
                clientId={clientId}
                searchId={searchId}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
