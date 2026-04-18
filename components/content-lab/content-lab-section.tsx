'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils/cn';

type ContentLabSectionProps = {
  icon: LucideIcon;
  title: ReactNode;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

/**
 * Shared shell for Strategy Lab cards — consistent border, surface, padding, and header rhythm.
 */
export function ContentLabSection({
  icon: Icon,
  title,
  description,
  actions,
  className,
  children,
}: ContentLabSectionProps) {
  return (
    <Card className={cn('border-nativz-border/60 bg-surface p-5', className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-2">
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-accent-text" aria-hidden />
            <div className="min-w-0">
              <div className="text-lg font-semibold leading-snug text-foreground">{title}</div>
              {description ? (
                <p className="mt-1 text-sm leading-relaxed text-text-muted">{description}</p>
              ) : null}
            </div>
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </Card>
  );
}
