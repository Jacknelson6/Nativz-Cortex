'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Table primitive set — modeled after shadcn's table, with a `variant`
 * prop on `Table` that flips between two presentations:
 *
 *   - `default`: bare-bones, lives inside whatever surface the caller
 *      already owns. Comfortable rhythm for dense admin tables.
 *   - `card`: the **whole table** sits inside a single rounded card on
 *      the page background — header row tinted, body rows separated
 *      by hairline dividers, the last row rounds to match the card.
 *      Think of the "All Reports" reference: one outer surface, every
 *      row is a stripe inside it. Use this for hero tables that are
 *      the page's main content.
 *
 * The variant flows through context so children pick up the right
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
        <div
          data-slot="table-container"
          className={cn(
            'w-full overflow-hidden rounded-xl border border-nativz-border bg-surface',
            containerClassName,
          )}
        >
          <div className="overflow-x-auto">
            <table
              data-slot="table"
              data-variant="card"
              className={cn('w-full caption-bottom text-sm', className)}
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
  const variant = React.useContext(TableVariantContext);
  return (
    <thead
      data-slot="table-header"
      className={cn(
        variant === 'card' && 'bg-background/40 border-b border-nativz-border',
        className,
      )}
      {...props}
    />
  );
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
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'group/row transition-colors',
        variant === 'card'
          ? 'border-b border-nativz-border/60 last:border-b-0 hover:bg-surface-hover/60 data-[state=selected]:bg-surface-hover'
          : 'border-b border-nativz-border/60 hover:bg-surface-hover/60 data-[state=selected]:bg-surface-hover',
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  const variant = React.useContext(TableVariantContext);
  const variantClass =
    variant === 'card' ? 'px-4 py-3 first:pl-5 last:pr-5' : 'px-3 py-2.5 border-b border-nativz-border';
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
  const variantClass =
    variant === 'card' ? 'px-4 py-4 first:pl-5 last:pr-5' : 'px-3 py-3';
  return (
    <td
      data-slot="table-cell"
      className={cn(
        'align-middle text-sm text-text-secondary',
        variantClass,
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
