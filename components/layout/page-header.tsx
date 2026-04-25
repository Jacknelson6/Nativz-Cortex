import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * Primary page title — title-only post 2026-04-25. Subtext was retired
 * across admin chrome so the H1 stands alone on every dashboard surface.
 * `description` prop kept for back-compat but rendered as nothing; drop
 * it from the call site whenever you touch the file.
 */
export function PageHeader({
  title,
  actions,
  className,
  titleClassName,
}: {
  title: ReactNode;
  /** @deprecated Subtext retired site-wide. Renders nothing. */
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** Override when the title needs extras (e.g. flex + icon) */
  titleClassName?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6',
        className,
      )}
    >
      <h1 className={cn('ui-page-title', titleClassName)}>{title}</h1>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
