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
  Bookmark,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { hasSources } from '@/lib/types/search';
import type { TrendingTopic, LegacyTrendingTopic, TopicSource, VideoIdea, SearchPlatform } from '@/lib/types/search';
import { displayIdeaFormat, displayIdeaVirality, effectiveVirality } from '@/lib/search/video-idea-display';
import { PLATFORM_CONFIG } from '@/components/search/platform-icon';

interface TopicRowExpandedProps {
  topic: TrendingTopic | LegacyTrendingTopic;
  clientId?: string | null;
  searchId?: string;
}

const SOURCE_TYPE_ICON: Record<string, React.ReactNode> = {
  web: <Globe size={12} className="text-blue-400 shrink-0" />,
  discussion: <MessageCircle size={12} className="text-emerald-400 shrink-0" />,
  video: <Video size={12} className="text-accent2-text shrink-0" />,
};

function getPlatformBadge(platform: string): { label: string; className: string } | null {
  const cfg = PLATFORM_CONFIG[platform as SearchPlatform];
  if (!cfg) return null;
  return { label: cfg.label, className: `${cfg.bg} ${cfg.color} border border-current/20` };
}

const VIRALITY_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple'> = {
  low: 'default',
  medium: 'info',
  high: 'success',
  viral_potential: 'purple',
};

function formatIdeaAsText(idea: VideoIdea, index: number): string {
  const lines: string[] = [];
  lines.push(`${index}. ${idea.title}`);
  lines.push(`   Hook: "${idea.hook}"`);
  lines.push(`   Format: ${displayIdeaFormat(idea.format)}`);
  lines.push(`   Virality: ${displayIdeaVirality(idea.virality)}`);
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

function formatAllIdeasAsText(topicName: string, ideas: VideoIdea[]): string {
  const lines = [
    `SHORT-FORM VIDEO IDEAS`,
    `Topic: ${topicName}`,
    `Generated: ${new Date().toLocaleDateString()}`,
    '',
    '─'.repeat(50),
    '',
  ];
  ideas.forEach((idea, i) => {
    lines.push(formatIdeaAsText(idea, i + 1));
    lines.push('');
  });
  return lines.join('\n');
}

function downloadAsTextFile(topicName: string, ideas: VideoIdea[]) {
  const text = formatAllIdeasAsText(topicName, ideas);
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
              <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-medium ${badge.className}`}>
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

function VideoIdeaListItem({
  idea,
  index,
  topicName,
  clientId,
  searchId,
}: {
  idea: VideoIdea;
  index: number;
  topicName: string;
  clientId?: string | null;
  searchId?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const virality = effectiveVirality(idea.virality);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(formatIdeaAsText(idea, index));
      setCopied(true);
      toast.success('Idea copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  }

  async function handleSave() {
    if (saved || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/concepts/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: idea.title,
          hook: idea.hook,
          format: idea.format ?? null,
          virality: idea.virality ?? null,
          why_it_works: idea.why_it_works,
          topic_name: topicName,
          client_id: clientId || null,
          search_id: searchId,
          reaction: 'starred',
        }),
      });
      if (res.ok) {
        setSaved(true);
        toast.success('Saved to ideas');
      } else {
        toast.error('Failed to save');
      }
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="group border-b border-nativz-border/50 last:border-b-0 py-3 first:pt-0">
      {/* Main row: number + title + badges + actions */}
      <div className="flex items-start gap-3">
        <span className="text-xs font-mono text-text-muted mt-0.5 w-5 shrink-0 text-right">
          {index}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h5 className="text-sm font-medium text-text-primary leading-snug">{idea.title}</h5>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={handleCopy}
                className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted opacity-0 transition-all hover:bg-surface-hover hover:text-text-primary group-hover:opacity-100"
                title="Copy idea"
              >
                {copied ? <Check size={12} className="text-accent" /> : <Copy size={12} />}
              </button>
              <button
                onClick={handleSave}
                disabled={saved || saving}
                className={`flex h-6 w-6 items-center justify-center rounded-md transition-all ${
                  saved
                    ? 'text-amber-400'
                    : 'text-text-muted opacity-0 hover:bg-surface-hover hover:text-text-primary group-hover:opacity-100'
                } disabled:pointer-events-none`}
                title={saved ? 'Saved' : 'Save idea'}
              >
                {saved ? <Check size={12} /> : <Bookmark size={12} className={saving ? 'animate-pulse' : ''} />}
              </button>
            </div>
          </div>

          {/* Hook */}
          <p className="text-xs text-text-secondary mt-1">
            &ldquo;{idea.hook}&rdquo;
          </p>

          {/* Why it works */}
          <p className="text-xs text-text-muted leading-relaxed mt-1.5">{idea.why_it_works}</p>

          {/* Inline meta: format + virality — tucked at bottom */}
          <div className="flex items-center gap-2 mt-2">
            <span className="inline-flex items-center rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-text-muted font-medium">
              {displayIdeaFormat(idea.format)}
            </span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${
              virality === 'viral_potential' ? 'text-accent2-text' :
              virality === 'high' ? 'text-emerald-400' :
              virality === 'medium' ? 'text-blue-400' :
              'text-text-muted'
            }`}>
              <span className={`inline-block h-1 w-1 rounded-full ${
                virality === 'viral_potential' ? 'bg-accent2' :
                virality === 'high' ? 'bg-emerald-400' :
                virality === 'medium' ? 'bg-blue-400' :
                'bg-text-muted'
              }`} />
              {displayIdeaVirality(idea.virality)}
            </span>
          </div>

          {/* Script outline (expandable) */}
          {idea.script_outline && idea.script_outline.length > 0 && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
              >
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                Script outline ({idea.script_outline.length} points)
              </button>
              {expanded && (
                <ol className="mt-1.5 ml-4 space-y-1">
                  {idea.script_outline.map((point, j) => (
                    <li key={j} className="text-xs text-text-secondary flex items-start gap-2">
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
            <p className="text-xs text-text-muted mt-1.5">
              <span className="text-text-secondary font-medium">CTA:</span> {idea.cta}
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
      await navigator.clipboard.writeText(formatAllIdeasAsText(topic.name, ideas));
      setCopiedAll(true);
      toast.success('All ideas copied to clipboard');
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  }

  function handleDownload() {
    downloadAsTextFile(topic.name, ideas);
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

      {/* Video ideas — list format */}
      {ideas.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide">
              Video ideas ({ideas.length})
            </h4>
            <div className="flex items-center gap-1">
              <button
                onClick={handleGenerateMore}
                disabled={generating || !searchId}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-50 disabled:pointer-events-none"
              >
                <RefreshCw size={12} className={generating ? 'animate-spin' : ''} />
                {generating ? 'Generating...' : 'Generate more'}
              </button>
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
                    Copy all
                  </>
                )}
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
              >
                <Download size={12} />
                Download
              </button>
            </div>
          </div>

          {/* Numbered list */}
          <div className="rounded-lg border border-nativz-border bg-surface px-4 py-3">
            {ideas.map((idea, i) => (
              <VideoIdeaListItem
                key={i}
                idea={idea}
                index={i + 1}
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
