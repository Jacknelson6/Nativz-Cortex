'use client';

import { Card } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';

interface ExecutiveSummaryProps {
  summary: string;
}

export function ExecutiveSummary({ summary }: ExecutiveSummaryProps) {
  if (!summary) return null;

  return (
    <Card elevated className="relative overflow-hidden border-accent/30 bg-gradient-to-br from-accent/10 via-surface to-purple-500/5">
      {/* Decorative accent bar */}
      <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-accent to-purple-500" />

      <div className="pl-4">
        <div className="mb-3 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-surface">
            <Sparkles size={16} className="text-accent-text" />
          </div>
          <h3 className="text-base font-semibold text-text-primary">
            Executive summary
          </h3>
        </div>

        <p className="text-sm leading-relaxed text-text-secondary">{summary}</p>
      </div>
    </Card>
  );
}
