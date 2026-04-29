'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Table primitive set — modeled after shadcn's table, with a `variant`
 * prop on `Table` that flips between two presentations:
 *
 *   - `default`: bare-bones, lives inside whatever surface the caller
 *      already owns. Comfortable rhythm for dense admin tables.
 *   - `card`: the table _is_ the card. Wraps in a rounded border on
 *      `bg-surface`, gives header + cells extra padding, and lets row
 *      hover/selection states paint the full row.
 *
 * The `variant` flows through context so children pick up the right
 * spacing without each call-site repeating it. Keep both variants when
 * editing — multiple call-sites already depend on the default variant.
 */

type TableVariant = 'default' | 'card';

const TableVariantContext = React.createContext<TableVariant>('default');

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  variant?: TableVariant;
  /** Optional className applied to the outer wrapper (the card surface
   *  in `card` variant, or the scroll container in `default`). The
   *  `className` prop on `<Table>` itself targets the `<table>`. */
  containerClassName?: string;
}

function Table({
  variant = 'default',
  className,
  containerClassName,
  ...props
}: TableProps) {
  const wrapperClass =
    variant === 'card'
      ? 'overflow-hidden rounded-xl border border-nativz-border bg-surface'
      : 'relative w-full overflow-x-auto';

  return (
    <TableVariantContext.Provider value={variant}>
      <div data-slot="table-container" className={cn(wrapperClass, containerClassName)}>
        <div className={variant === 'card' ? 'overflow-x-auto' : undefined}>
          <table
            data-slot="table"
            data-variant={variant}
            className={cn('w-full caption-bottom text-sm', className)}
            {...props}
          />
        </div>
      </div>
    </TableVariantContext.Provider>
  );
}

function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      data-slot="table-header"
      className={cn('[&_tr]:border-b [&_tr]:border-nativz-border', className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        'border-t border-nativz-border bg-surface-hover/50 font-medium [&>tr]:last:border-b-0',
        className,
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'border-b border-nativz-border/60 transition-colors',
        'hover:bg-surface-hover/60',
        'data-[state=selected]:bg-surface-hover',
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  const variant = React.useContext(TableVariantContext);
  const padding = variant === 'card' ? 'px-5 py-3 first:pl-5 last:pr-5' : 'px-3 py-2.5';
  return (
    <th
      data-slot="table-head"
      className={cn(
        'text-left align-middle text-xs font-medium uppercase tracking-wide text-text-muted',
        '[&:has([role=checkbox])]:w-px [&:has([role=checkbox])]:pr-0',
        padding,
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  const variant = React.useContext(TableVariantContext);
  const padding = variant === 'card' ? 'px-5 py-4 first:pl-5 last:pr-5' : 'px-3 py-3';
  return (
    <td
      data-slot="table-cell"
      className={cn(
        'align-middle text-sm text-text-secondary',
        '[&:has([role=checkbox])]:w-px [&:has([role=checkbox])]:pr-0',
        padding,
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
