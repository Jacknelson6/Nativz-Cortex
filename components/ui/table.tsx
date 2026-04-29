'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Table primitive set — modeled after shadcn's table, with a `variant`
 * prop on `Table` that flips between two presentations:
 *
 *   - `default`: bare-bones, lives inside whatever surface the caller
 *      already owns. Comfortable rhythm for dense admin tables.
 *   - `card`: rows render as **individual rounded cards** stacked with
 *      a small vertical gap, header sits on the page background. Click
 *      target is the whole row; selected rows get an accent ring.
 *      Mirrors the "Card-variant table" reference in the design kit.
 *
 * The `variant` flows through context so children pick up the right
 * spacing without each call-site repeating it.
 */

type TableVariant = 'default' | 'card';

const TableVariantContext = React.createContext<TableVariant>('default');

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  variant?: TableVariant;
  /** Optional className applied to the outer wrapper. */
  containerClassName?: string;
}

function Table({
  variant = 'default',
  className,
  containerClassName,
  ...props
}: TableProps) {
  if (variant === 'card') {
    return (
      <TableVariantContext.Provider value={variant}>
        <div data-slot="table-container" className={cn('w-full', containerClassName)}>
          <div className="overflow-x-auto">
            {/* `border-separate` + spacing gives the gap between row-cards.
             *  Each <td> in the body paints the bg + border so rows look
             *  like discrete cards without needing a div wrapper. */}
            <table
              data-slot="table"
              data-variant="card"
              className={cn(
                'w-full caption-bottom text-sm',
                'border-separate border-spacing-x-0 border-spacing-y-1.5',
                className,
              )}
              {...props}
            />
          </div>
        </div>
      </TableVariantContext.Provider>
    );
  }

  return (
    <TableVariantContext.Provider value={variant}>
      <div
        data-slot="table-container"
        className={cn('relative w-full overflow-x-auto', containerClassName)}
      >
        <table
          data-slot="table"
          data-variant="default"
          className={cn('w-full caption-bottom text-sm', className)}
          {...props}
        />
      </div>
    </TableVariantContext.Provider>
  );
}

function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead data-slot="table-header" className={cn(className)} {...props} />;
}

function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody data-slot="table-body" className={cn(className)} {...props} />;
}

function TableFooter({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn('font-medium', className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  const variant = React.useContext(TableVariantContext);
  // The `group/row` lets cells in card variant pick up hover / selected
  // paint with `group-data-[state=selected]/row:` and `group-hover/row:`.
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'group/row',
        variant === 'card'
          ? 'transition-colors'
          : 'border-b border-nativz-border/60 transition-colors hover:bg-surface-hover/60 data-[state=selected]:bg-surface-hover',
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  const variant = React.useContext(TableVariantContext);
  // Card variant: header cells sit on page background, no border / bg.
  // Default variant: standard underlined header row.
  const variantClass =
    variant === 'card'
      ? 'px-4 py-2 first:pl-5 last:pr-5'
      : 'px-3 py-2.5 border-b border-nativz-border';
  return (
    <th
      data-slot="table-head"
      className={cn(
        'text-left align-middle text-xs font-medium uppercase tracking-wide text-text-muted',
        '[&:has([role=checkbox])]:w-px [&:has([role=checkbox])]:pr-0',
        variantClass,
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  const variant = React.useContext(TableVariantContext);
  if (variant === 'card') {
    return (
      <td
        data-slot="table-cell"
        className={cn(
          'align-middle text-sm text-text-secondary',
          // Each cell paints the row-card surface + horizontal borders.
          // First / last cells round their outer edges and add the side
          // borders, so the row reads as one rounded card.
          'bg-surface border-y border-nativz-border',
          'first:border-l first:rounded-l-xl first:pl-5',
          'last:border-r last:rounded-r-xl last:pr-5',
          'px-4 py-3.5',
          // Hover / selected painting via the row's group token.
          'group-hover/row:bg-surface-hover',
          'group-data-[state=selected]/row:bg-surface-hover',
          'group-data-[state=selected]/row:border-accent-text/40',
          // Checkbox cell narrower.
          '[&:has([role=checkbox])]:w-px [&:has([role=checkbox])]:pr-0',
          className,
        )}
        {...props}
      />
    );
  }
  return (
    <td
      data-slot="table-cell"
      className={cn(
        'align-middle text-sm text-text-secondary px-3 py-3',
        '[&:has([role=checkbox])]:w-px [&:has([role=checkbox])]:pr-0',
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.HTMLAttributes<HTMLTableCaptionElement>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('mt-4 text-sm text-text-muted', className)}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
