'use client';

import { Columns3 } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import type { ContentPillar } from '@/lib/types/search';

interface ContentPillarsProps {
  pillars: ContentPillar[];
}

export function ContentPillars({ pillars }: ContentPillarsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2">
            <Columns3 size={18} className="text-accent" />
            Content pillars
          </span>
        </CardTitle>
      </CardHeader>
      <div className="space-y-4">
        {pillars.map((pillar, i) => (
          <div
            key={i}
            className="rounded-lg border border-nativz-border-light p-4 space-y-2"
          >
            <p className="text-sm font-medium text-text-primary">{pillar.pillar}</p>
            <p className="text-sm text-text-muted">{pillar.description}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
