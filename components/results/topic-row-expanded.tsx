'use client';

import { useState } from 'react';
import {
  MessageSquare,
  FileText,
  Globe,
  MessageCircle,
  Video,
  ExternalLink,
  Copy,
  Check,
  Download,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { hasSources } from '@/lib/types/search';
import type { TrendingTopic, LegacyTrendingTopic, TopicSource, VideoIdea, SearchPlatform } from '@/lib/types/search';
import { displayIdeaFormat, displayIdeaVirality, effectiveVirality } from '@/lib/search/video-idea-display';
import { PLATFORM_CONFIG } from '@/components/search/platform-icon';
import { formatTopicReach, RESONANCE_LABEL } from '@/lib/search/topic-metrics';
import { getResearchAlignmentHint } from '@/lib/search/topic-research-alignment';
import { getSentimentLabel } from '@/lib/utils/sentiment';
import { SentimentSplitBar } from '@/components/results/sentiment-split-bar';

interface TopicRowExpandedProps {
  topic: TrendingTopic | LegacyTrendingTopic;
  clientId?: string | null;
  searchId?: string;
}

// Source type icons — muted by default since the source URL text is the
// actual signal. The prior rainbow (blue/emerald/purple) was decorative
// drift; it made every source list look like a toy.
const SOURCE_TYPE_ICON: Record<string, React.ReactNode> = {
  web: <Globe size={12} className="text-text-muted shrink-0" />,
  discussion: <MessageCircle size={12} className="text-text-muted shrink-0" />,
  video: <Video size={12} className="text-accent-text shrink-0" />,
};

function getPlatformBadge(platform: string): { label: string; className: string } | null {
  const cfg = PLATFORM_CONFIG[platform as SearchPlatform];
  if (!cfg) return null;
  return { label: cfg.label, className: `${cfg.bg} ${cfg.color} border border-current/20` };
}

function formatIdeaAsText(
  idea: VideoIdea,
  index: number,
  topic?: TrendingTopic | LegacyTrendingTopic,
): string {
  const lines: string[] = [];
  lines.push(`${index}. ${idea.title}`);
  lines.push(`   Hook: "${idea.hook}"`);
  lines.push(`   Format: ${displayIdeaFormat(idea.format)}`);
  lines.push(`   Virality: ${displayIdeaVirality(idea.virality)}`);
  if (topic) {
    lines.push(
      `   Grounded in topic data: reach ${formatTopicReach(topic)} · resonance ${RESONANCE_LABEL[topic.resonance] ?? topic.resonance} · ${getSentimentLabel(topic.sentiment)}`,
    );
  }
  if (idea.script_outline?.length) {
    lines.push('   Script outline:');
    idea.script_outline.forEach((point) => {
      lines.push(`     - ${point}`);
    });
  }
  if (idea.cta) {
    lines.push(`   CTA: ${idea.cta}`);
  }
  lines.push(`   Why it works: ${idea.why_it_works}`);
  return lines.join('\n');
}

function formatAllIdeasAsText(
  topicName: string,
  ideas: VideoIdea[],
  topic?: TrendingTopic | LegacyTrendingTopic,
): string {
  const lines = [
    `SHORT-FORM VIDEO IDEAS`,
    `Topic: ${topicName}`,
    `Generated: ${new Date().toLocaleDateString()}`,
    '',
    '─'.repeat(50),
    '',
  ];
  if (topic) {
    lines.push(
      `Topic metrics: reach ${formatTopicReach(topic)} · resonance ${RESONANCE_LABEL[topic.resonance] ?? topic.resonance} · ${getSentimentLabel(topic.sentiment)}`,
    );
    lines.push(`Research note: ${getResearchAlignmentHint(topic)}`);
    lines.push('');
  }
  ideas.forEach((idea, i) => {
    lines.push(formatIdeaAsText(idea, i + 1, topic));
    lines.push('');
  });
  return lines.join('\n');
}

function downloadAsTextFile(
  topicName: string,
  ideas: VideoIdea[],
  topic?: TrendingTopic | LegacyTrendingTopic,
) {
  const text = formatAllIdeasAsText(topicName, ideas, topic);
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `video-ideas-${topicName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
        <div className="flex items-center gap-1.5">
          <p className="font-medium text-text-secondary truncate group-hover:text-accent-text transition-colors text-xs">
            {source.title}
          </p>
          {source.platform && source.platform !== 'web' && (() => {
            const badge = getPlatformBadge(source.platform);
            return badge ? (
              <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-medium ${badge.className}`}>
                {badge.label}
              </span>
            ) : null;
          })()}
        </div>
        {source.relevance && (
          <p className="text-xs text-text-muted mt-0.5 line-clamp-1">{source.relevance}</p>
        )}
      </div>
      <ExternalLink size={10} className="shrink-0 mt-0.5 text-text-muted group-hover:text-accent-text transition-colors" />
    </a>
  );
}

function TopicMetricsSnapshot({ topic }: { topic: TrendingTopic | LegacyTrendingTopic }) {
  const reach = formatTopicReach(topic);
  const resonance = RESONANCE_LABEL[topic.resonance] ?? topic.resonance;
  const hint = getResearchAlignmentHint(topic);

  return (
    <div className="mb-5 rounded-xl border border-accent/15 bg-accent/[0.06] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">Topic metrics (same as row above)</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Blended reach</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-text-primary">{reach}</p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Resonance</p>
          <p className="mt-0.5 text-lg font-medium text-text-primary">{resonance}</p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Sentiment split</p>
          <div className="mt-1">
            <SentimentSplitBar sentiment={topic.sentiment} />
          </div>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-text-secondary">{hint}</p>
    </div>
  );
}

function IdeaValidationChips({ topic }: { topic: TrendingTopic | LegacyTrendingTopic }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2 border-t border-nativz-border/60 pt-3">
      <span className="inline-flex items-center rounded-lg border border-nativz-border/80 bg-background/80 px-2.5 py-1 text-xs text-text-secondary">
        <span className="font-medium text-text-muted">Reach</span>
        <span className="ml-1.5 tabular-nums text-text-primary">{formatTopicReach(topic)}</span>
      </span>
      <span className="inline-flex items-center rounded-lg border border-nativz-border/80 bg-background/80 px-2.5 py-1 text-xs text-text-secondary">
        <span className="font-medium text-text-muted">Resonance</span>
        <span className="ml-1.5 text-text-primary">{RESONANCE_LABEL[topic.resonance] ?? topic.resonance}</span>
      </span>
      <span
        className="inline-flex items-center rounded-lg border border-nativz-border/80 bg-background/80 px-2.5 py-1 text-xs text-text-secondary"
        title={getSentimentLabel(topic.sentiment)}
      >
        <span className="font-medium text-text-muted">Audience mood</span>
        <span className="ml-1.5 text-text-primary">{getSentimentLabel(topic.sentiment)}</span>
      </span>
    </div>
  );
}

function VideoIdeaListItem({
  idea,
  index,
  topic,
}: {
  idea: VideoIdea;
  index: number;
  topicName: string;
  topic: TrendingTopic | LegacyTrendingTopic;
  clientId?: string | null;
  searchId?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const virality = effectiveVirality(idea.virality);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(formatIdeaAsText(idea, index, topic));
      setCopied(true);
      toast.success('Idea copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  }

  return (
    <div className="group border-b border-nativz-border/50 last:border-b-0 py-4 first:pt-0">
      {/* Main row: number + title + badges + actions */}
      <div className="flex items-start gap-3">
        <span className="mt-0.5 w-6 shrink-0 text-right font-mono text-sm text-text-muted">{index}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h5 className="text-base font-semibold leading-snug text-text-primary">{idea.title}</h5>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={handleCopy}
                className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted opacity-0 transition-all hover:bg-surface-hover hover:text-text-primary group-hover:opacity-100"
                title="Copy idea"
              >
                {copied ? <Check size={12} className="text-accent" /> : <Copy size={12} />}
              </button>
            </div>
          </div>

          {/* Hook */}
          <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">&ldquo;{idea.hook}&rdquo;</p>

          {/* Why it works */}
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">{idea.why_it_works}</p>

          {/* Inline meta: format + virality (hide "low") */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-white/[0.04] px-2 py-0.5 text-xs font-medium text-text-muted">
              {displayIdeaFormat(idea.format)}
            </span>
            {virality !== 'low' && (
              // No coral per Jack's 2026-04-22 feedback. viral_potential now
              // reads as bright cyan-200 (lighter, more attention-getting),
              // high stays semantic emerald (success = "good signal"),
              // medium uses brand cyan. The text label itself carries the
              // signal — colors are reinforcement.
              <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                virality === 'viral_potential' ? 'text-cyan-200' :
                virality === 'high' ? 'text-emerald-400' :
                virality === 'medium' ? 'text-accent-text' :
                'text-text-muted'
              }`}>
                <span className={`inline-block h-1 w-1 rounded-full ${
                  virality === 'viral_potential' ? 'bg-cyan-200' :
                  virality === 'high' ? 'bg-emerald-400' :
                  virality === 'medium' ? 'bg-accent' :
                  'bg-text-muted'
                }`} />
                {displayIdeaVirality(idea.virality)}
              </span>
            )}
          </div>

          {/* Script outline (expandable) */}
          {idea.script_outline && idea.script_outline.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-sm text-text-muted transition-colors hover:text-text-secondary"
              >
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                Script outline ({idea.script_outline.length} points)
              </button>
              {expanded && (
                <ol className="ml-4 mt-2 space-y-1.5">
                  {idea.script_outline.map((point, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm text-text-secondary">
                      <span className="text-text-muted font-mono shrink-0">{j + 1}.</span>
                      {point}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {/* CTA */}
          {idea.cta && (
            <p className="mt-2 text-sm text-text-muted">
              <span className="font-medium text-text-secondary">CTA:</span> {idea.cta}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function TopicRowExpanded({ topic, clientId, searchId }: TopicRowExpandedProps) {
  const [copiedAll, setCopiedAll] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [extraIdeas, setExtraIdeas] = useState<VideoIdea[]>([]);
  const topicHasSources = hasSources(topic);
  const baseIdeas = topic.video_ideas ?? [];
  const ideas = [...baseIdeas, ...extraIdeas];

  async function handleCopyAll() {
    try {
      await navigator.clipboard.writeText(formatAllIdeasAsText(topic.name, ideas, topic));
      setCopiedAll(true);
      toast.success('All ideas copied to clipboard');
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  }

  function handleDownload() {
    downloadAsTextFile(topic.name, ideas, topic);
    toast.success('Downloaded as text file');
  }

  async function handleGenerateMore() {
    if (generating || !searchId) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/search/${searchId}/generate-ideas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic_name: topic.name,
          existing_ideas: ideas.map((i) => i.title),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || 'Failed to generate');
      }

      const data = await res.json();
      const newIdeas = (data.ideas ?? []) as VideoIdea[];

      if (newIdeas.length > 0) {
        setExtraIdeas((prev) => [...prev, ...newIdeas]);
        toast.success(`${newIdeas.length} new ideas generated`);
      } else {
        toast.error('No new ideas returned');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate ideas');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="animate-expand-in border-b border-nativz-border bg-background px-6 py-5">
      {/* Overview cards */}
      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-nativz-border bg-surface p-4">
          <div className="mb-2 flex items-center gap-2">
            <FileText size={15} className="text-accent-text" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-text-primary">Posts overview</h4>
          </div>
          <p className="text-sm leading-relaxed text-text-secondary">{topic.posts_overview}</p>
        </div>

        <div className="rounded-lg border border-nativz-border bg-surface p-4">
          <div className="mb-2 flex items-center gap-2">
            <MessageSquare size={15} className="text-emerald-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-text-primary">Comments overview</h4>
          </div>
          <p className="text-sm leading-relaxed text-text-secondary">{topic.comments_overview}</p>
        </div>
      </div>

      {/* Source links (new shape only) */}
      {topicHasSources && topic.sources.length > 0 && (
        <div className="mb-5">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Sources ({topic.sources.length})
          </h4>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {topic.sources.map((source, i) => (
              <SourceLink key={i} source={source} />
            ))}
          </div>
        </div>
      )}

      {/* Video ideas — list format */}
      {ideas.length > 0 && (
        <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-text-primary">
              Video ideas ({ideas.length})
            </h4>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={handleGenerateMore}
                disabled={generating || !searchId}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary disabled:pointer-events-none disabled:opacity-50"
              >
                <RefreshCw size={12} className={generating ? 'animate-spin' : ''} />
                {generating ? 'Generating...' : 'Generate more'}
              </button>
              <button
                onClick={handleCopyAll}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
              >
                {copiedAll ? (
                  <>
                    <Check size={12} className="text-accent" />
                    <span className="text-accent">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy size={12} />
                    Copy all
                  </>
                )}
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
              >
                <Download size={12} />
                Download
              </button>
            </div>
          </div>

          {/* Numbered list */}
          <div className="rounded-xl border border-nativz-border bg-surface px-4 py-2 sm:px-5">
            {ideas.map((idea, i) => (
              <VideoIdeaListItem
                key={i}
                idea={idea}
                index={i + 1}
                topicName={topic.name}
                topic={topic}
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
