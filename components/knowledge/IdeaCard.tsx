'use client';

import { useState } from 'react';
import { Save, Check, Video, Film, Instagram, BookOpen } from 'lucide-react';
import type { GeneratedIdea } from '@/lib/knowledge/idea-generator';

const FORMAT_STYLES: Record<
  GeneratedIdea['format'],
  { bg: string; text: string; label: string; icon: React.ElementType }
> = {
  short_form: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Short form', icon: Video },
  long_form: { bg: 'bg-purple-500/10', text: 'text-purple-400', label: 'Long form', icon: Film },
  reel: { bg: 'bg-pink-500/10', text: 'text-pink-400', label: 'Reel', icon: Instagram },
  story: { bg: 'bg-green-500/10', text: 'text-green-400', label: 'Story', icon: BookOpen },
};

interface IdeaCardProps {
  idea: GeneratedIdea;
  clientId: string;
}

export function IdeaCard({ idea, clientId }: IdeaCardProps) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const format = FORMAT_STYLES[idea.format] ?? FORMAT_STYLES.short_form;
  const FormatIcon = format.icon;

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
            format: idea.format,
            content_pillar: idea.content_pillar,
            concept_input: '',
          },
          source: 'generated',
        }),
      });
      if (res.ok) {
        setSaved(true);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-surface rounded-xl border border-nativz-border p-4 flex flex-col gap-2">
      <h3 className="font-semibold text-text-primary">{idea.title}</h3>

      <p className="text-sm text-text-secondary italic">
        &ldquo;{idea.hook}&rdquo;
      </p>

      <p className="text-sm text-text-secondary mt-2">{idea.description}</p>

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <span
          className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${format.bg} ${format.text}`}
        >
          <FormatIcon size={12} />
          {format.label}
        </span>

        <span className="inline-flex text-xs px-2 py-0.5 rounded-full bg-surface-hover text-text-secondary">
          {idea.content_pillar}
        </span>

        <button
          onClick={handleSave}
          disabled={saved || saving}
          className="ml-auto p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-50"
          title={saved ? 'Saved' : 'Save idea'}
        >
          {saved ? <Check size={16} className="text-green-400" /> : <Save size={16} />}
        </button>
      </div>
    </div>
  );
}
