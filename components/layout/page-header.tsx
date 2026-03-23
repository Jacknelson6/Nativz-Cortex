import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * Primary page title + optional description. Use on dashboard-style pages for consistent type scale.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
  titleClassName,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** Override when the title needs extras (e.g. flex + icon) */
  titleClassName?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6',
        className,
      )}
    >
      <header className="min-w-0 space-y-0.5">
        <h1 className={cn('ui-page-title', titleClassName)}>{title}</h1>
        {description != null && description !== false ? (
          <div className="ui-muted [&_p]:mt-0">{description}</div>
        ) : null}
      </header>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
