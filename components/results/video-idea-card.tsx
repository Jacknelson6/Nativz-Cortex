'use client';

import { useState } from 'react';
import { Lightbulb, Zap, Copy, Check, ThumbsUp, Star, MessageSquareWarning } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import type { VideoIdea } from '@/lib/types/search';

type Reaction = 'approved' | 'starred' | 'revision_requested' | null;

interface VideoIdeaCardProps {
  idea: VideoIdea;
  topicName?: string;
  clientId?: string | null;
  searchId?: string;
  initialReaction?: Reaction;
}

const VIRALITY_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple'> = {
  low: 'default',
  medium: 'info',
  high: 'success',
  viral_potential: 'purple',
};

const VIRALITY_BORDER: Record<string, string> = {
  viral_potential: 'border-l-purple-500',
  high: 'border-l-blue-500',
};

function formatIdeaForClipboard(idea: VideoIdea): string {
  return [
    idea.title,
    '',
    `Hook: ${idea.hook}`,
    `Format: ${idea.format.replace(/_/g, ' ')}`,
    `Virality: ${idea.virality.replace('_', ' ')}`,
    '',
    `Why it works: ${idea.why_it_works}`,
  ].join('\n');
}

const REACTION_CONFIG = {
  approved: {
    icon: ThumbsUp,
    label: 'Approve',
    activeClass: 'text-emerald-400 bg-emerald-400/10',
  },
  starred: {
    icon: Star,
    label: 'Star',
    activeClass: 'text-amber-400 bg-amber-400/10',
  },
  revision_requested: {
    icon: MessageSquareWarning,
    label: 'Revision',
    activeClass: 'text-orange-400 bg-orange-400/10',
  },
} as const;

export function VideoIdeaCard({ idea, topicName, clientId, searchId, initialReaction }: VideoIdeaCardProps) {
  const [copied, setCopied] = useState(false);
  const [reaction, setReaction] = useState<Reaction>(initialReaction ?? null);
  const [saving, setSaving] = useState(false);
  const borderClass = VIRALITY_BORDER[idea.virality] || 'border-l-transparent';

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(formatIdeaForClipboard(idea));
      setCopied(true);
      toast.success('Idea copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  }

  async function handleReaction(newReaction: Reaction) {
    if (saving) return;
    // Toggle off if already selected
    const target = reaction === newReaction ? null : newReaction;
    setSaving(true);
    const prev = reaction;
    setReaction(target);

    try {
      const res = await fetch('/api/concepts/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: idea.title,
          hook: idea.hook,
          format: idea.format,
          virality: idea.virality,
          why_it_works: idea.why_it_works,
          topic_name: topicName,
          client_id: clientId || null,
          search_id: searchId,
          reaction: target,
        }),
      });

      if (!res.ok) {
        setReaction(prev);
        toast.error('Failed to save reaction');
      }
    } catch {
      setReaction(prev);
      toast.error('Failed to save reaction');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`group rounded-lg border border-nativz-border border-l-[3px] ${borderClass} bg-surface p-4 transition-all duration-200 hover:shadow-card-hover hover:border-accent/40`}>
      {/* Title row with virality badge and copy button */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-start gap-2 min-w-0">
          <Lightbulb size={14} className="mt-0.5 text-amber-400 shrink-0" />
          <h5 className="text-sm font-medium text-text-primary leading-snug">{idea.title}</h5>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleCopy}
            className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted opacity-0 transition-all hover:bg-surface-hover hover:text-text-primary group-hover:opacity-100"
            title="Copy idea"
          >
            {copied ? <Check size={12} className="text-accent" /> : <Copy size={12} />}
          </button>
          <Badge variant={VIRALITY_VARIANT[idea.virality] || 'default'}>
            {idea.virality.replace('_', ' ')}
          </Badge>
        </div>
      </div>

      {/* Hook — the most actionable piece */}
      <div className="ml-6">
        <div className="flex items-start gap-1.5 mb-2">
          <Zap size={11} className="mt-0.5 text-accent-text shrink-0" />
          <p className="text-xs text-accent-text font-medium">&ldquo;{idea.hook}&rdquo;</p>
        </div>

        {/* Why it works */}
        <p className="text-xs text-text-secondary leading-relaxed mb-3">{idea.why_it_works}</p>

        {/* Format tag + reaction buttons */}
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center rounded-md bg-surface-hover px-2 py-0.5 text-xs text-text-muted">
            {idea.format.replace(/_/g, ' ')}
          </span>

          <div className="flex items-center gap-1">
            {(Object.keys(REACTION_CONFIG) as Array<keyof typeof REACTION_CONFIG>).map((key) => {
              const config = REACTION_CONFIG[key];
              const Icon = config.icon;
              const isActive = reaction === key;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReaction(key);
                  }}
                  disabled={saving}
                  title={config.label}
                  className={`flex h-7 w-7 items-center justify-center rounded-md transition-all ${
                    isActive
                      ? config.activeClass
                      : 'text-text-muted/50 hover:text-text-secondary hover:bg-surface-hover opacity-0 group-hover:opacity-100'
                  } ${isActive ? 'opacity-100' : ''} disabled:pointer-events-none`}
                >
                  <Icon size={14} fill={isActive ? 'currentColor' : 'none'} />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
