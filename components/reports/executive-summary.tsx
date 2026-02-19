'use client';

import { Card } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';

interface ExecutiveSummaryProps {
  summary: string;
}

export function ExecutiveSummary({ summary }: ExecutiveSummaryProps) {
  if (!summary) return null;

  return (
    <Card className="relative overflow-hidden border-indigo-100 bg-gradient-to-br from-indigo-50/60 via-white to-purple-50/40">
      {/* Decorative accent bar */}
      <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-indigo-500 to-purple-500" />

      <div className="pl-4">
        <div className="mb-3 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100">
            <Sparkles size={16} className="text-indigo-600" />
          </div>
          <h3 className="text-base font-semibold text-gray-900">
            Executive summary
          </h3>
        </div>

        <p className="text-sm leading-relaxed text-gray-700">{summary}</p>
      </div>
    </Card>
  );
}
