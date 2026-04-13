'use client';

import Link from 'next/link';
import { Brain, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';

interface IdeationPipelinePanelProps {
  searchId: string;
  clientId: string | null;
}

export function IdeationPipelinePanel({
  searchId,
  clientId,
}: IdeationPipelinePanelProps) {
  const labHref = clientId
    ? `/admin/strategy-lab/${clientId}?searchId=${searchId}`
    : `/admin/strategy-lab?searchId=${searchId}`;

  return (
    <Card className="overflow-hidden border-accent/20 bg-gradient-to-br from-accent/5 via-transparent to-accent2/5 p-0">
      <div className="flex items-center justify-between gap-4 px-5 py-5 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-surface">
            <Brain size={20} className="text-accent-text" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold">Content Lab</CardTitle>
            <p className="mt-0.5 text-sm text-text-muted">
              Use this research in the Content Lab to generate video ideas and content strategy.
            </p>
          </div>
        </div>
        <Link href={labHref}>
          <Button type="button" variant="primary" size="sm" className="gap-1.5 whitespace-nowrap">
            Open in Content Lab
            <ChevronRight size={14} />
          </Button>
        </Link>
      </div>
    </Card>
  );
}
