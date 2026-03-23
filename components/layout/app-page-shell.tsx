import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

const stackClass = {
  tight: 'space-y-4',
  default: 'space-y-6',
  relaxed: 'space-y-8',
} as const;

/**
 * Default page wrapper for admin/portal screens: shared padding + vertical rhythm.
 */
export function AppPageShell({
  children,
  className,
  stack = 'default',
}: {
  children: ReactNode;
  className?: string;
  stack?: keyof typeof stackClass;
}) {
  return <div className={cn('cortex-page-gutter', stackClass[stack], className)}>{children}</div>;
}
