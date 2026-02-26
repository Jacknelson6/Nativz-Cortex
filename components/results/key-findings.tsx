'use client';

import { Lightbulb } from 'lucide-react';

interface KeyFindingsProps {
  summary: string;
  topics: { name: string; resonance: string; sentiment: number }[];
}

export function KeyFindings({ summary }: KeyFindingsProps) {
  // Extract key sentences from summary
  const sentences = summary
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20)
    .slice(0, 4);

  if (sentences.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {sentences.map((sentence, i) => (
        <div
          key={i}
          className="animate-stagger-in relative overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm p-4"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-purple-500/5 pointer-events-none" />
          <div className="relative flex items-start gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/10">
              <Lightbulb size={14} className="text-accent-text" />
            </div>
            <p className="text-sm leading-relaxed text-text-secondary">{sentence}.</p>
          </div>
        </div>
      ))}
    </div>
  );
}
