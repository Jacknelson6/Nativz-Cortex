'use client';

import { useState } from 'react';
import { Bookmark, Check, Copy, Zap, Tag } from 'lucide-react';
import { toast } from 'sonner';
import type { GeneratedIdea } from '@/lib/knowledge/idea-generator';

interface IdeaCardProps {
  idea: GeneratedIdea;
  clientId: string;
}

function formatForClipboard(idea: GeneratedIdea): string {
  return [
    idea.title,
    '',
    `Hook: "${idea.hook}"`,
    '',
    idea.description,
    '',
    `Content pillar: ${idea.content_pillar}`,
  ].join('\n');
}

export function IdeaCard({ idea, clientId }: IdeaCardProps) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleSave() {
    if (saved || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'idea',
          title: idea.title,
          content: `${idea.hook}\n\n${idea.description}`,
          metadata: {
            content_pillar: idea.content_pillar,
            concept_input: '',
          },
          source: 'generated',
        }),
      });
      if (res.ok) {
        setSaved(true);
        toast.success('Saved to knowledge base');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(formatForClipboard(idea));
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  }

  return (
    <div className="group bg-surface rounded-xl border border-nativz-border p-4 flex flex-col gap-3 transition-all duration-200 hover:border-accent2/30 hover:shadow-card-hover">
      {/* Title + actions */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-primary leading-snug">{idea.title}</h3>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={handleCopy}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted opacity-0 group-hover:opacity-100 hover:text-text-primary hover:bg-surface-hover transition-all cursor-pointer"
            title="Copy idea"
          >
            {copied ? <Check size={13} className="text-accent2-text" /> : <Copy size={13} />}
          </button>
          <button
            onClick={handleSave}
            disabled={saved || saving}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all cursor-pointer ${
              saved
                ? 'text-emerald-400 bg-emerald-400/10'
                : 'text-text-muted opacity-0 group-hover:opacity-100 hover:text-text-primary hover:bg-surface-hover'
            } disabled:cursor-default`}
            title={saved ? 'Saved' : 'Save to knowledge base'}
          >
            {saved ? <Check size={13} /> : <Bookmark size={13} />}
          </button>
        </div>
      </div>

      {/* Hook */}
      <div className="flex items-start gap-1.5">
        <Zap size={12} className="mt-0.5 text-accent2-text shrink-0" />
        <p className="text-xs font-medium text-accent2-text leading-relaxed">&ldquo;{idea.hook}&rdquo;</p>
      </div>

      {/* Description */}
      <p className="text-xs text-text-secondary leading-relaxed">{idea.description}</p>

      {/* Content pillar */}
      <div className="flex items-center gap-1.5 mt-auto pt-1">
        <Tag size={10} className="text-text-muted" />
        <span className="text-[11px] text-text-muted">{idea.content_pillar}</span>
      </div>
    </div>
  );
}
