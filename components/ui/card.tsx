import { forwardRef, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * Composable surface (shadcn / [shadcn studio card](https://shadcnstudio.com/docs/components/card) pattern).
 *
 * **Legacy (default):** `<Card>` applies padding; put any content inside.
 * **Composed:** `<Card padding="none">` then `CardHeader` / `CardTitle` / `CardDescription` / `CardAction` / `CardContent` / `CardFooter` with their own spacing (matches shadcn structure).
 */
interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg';
  interactive?: boolean;
  elevated?: boolean;
}

const paddingStyles = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
} as const;

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      padding = 'md',
      interactive = false,
      elevated = false,
      className,
      children,
      ...props
    },
    ref,
  ) => (
    <div
      ref={ref}
      className={cn(
        'rounded-xl border border-nativz-border bg-surface text-text-primary',
        elevated ? 'shadow-[var(--shadow-elevated)]' : 'shadow-[var(--shadow-card)]',
        paddingStyles[padding],
        interactive &&
          'cursor-pointer transition-all duration-200 hover:border-accent/40 hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.995]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  ),
);
Card.displayName = 'Card';

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        '@container/card-header mb-4 flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
      {...props}
    />
  ),
);
CardHeader.displayName = 'CardHeader';

/** Optional header actions (menus, buttons) — pair with CardHeader. */
export const CardAction = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex shrink-0 items-center gap-2 self-start sm:ml-auto', className)} {...props} />
  ),
);
CardAction.displayName = 'CardAction';

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('text-lg font-semibold leading-none tracking-tight text-text-primary', className)}
      {...props}
    />
  ),
);
CardTitle.displayName = 'CardTitle';

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm text-text-muted', className)} {...props} />
  ),
);
CardDescription.displayName = 'CardDescription';

/** Use with `Card padding="none"` — default `p-6 pt-0` matches shadcn (below a header). */
export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

/** Use with `Card padding="none"` — default `flex flex-wrap gap-2 border-t border-nativz-border/80 p-6`. */
export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex flex-wrap items-center gap-2 border-t border-nativz-border/80 p-6', className)}
      {...props}
    />
  ),
);
CardFooter.displayName = 'CardFooter';
