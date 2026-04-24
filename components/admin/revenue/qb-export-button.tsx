'use client';

import { useState } from 'react';
import { FileDown } from 'lucide-react';

export function QuickBooksExportButton() {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<'mtd' | 'ytd' | 'last30' | 'last90' | 'all' | 'custom'>(
    'ytd',
  );
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  function buildHref(): string {
    const qs = new URLSearchParams();
    if (range === 'custom') {
      if (start) qs.set('start', start);
      if (end) qs.set('end', end);
    } else {
      qs.set('range', range);
    }
    return `/api/revenue/export/quickbooks?${qs.toString()}`;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-surface px-3 py-1 text-xs text-text-primary hover:bg-white/5"
      >
        <FileDown size={12} /> QuickBooks CSV
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-nativz-border bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-text-primary">Export paid invoices (CSV)</h3>
            <p className="mt-1 text-[11px] text-text-muted">
              Columns: Date, Invoice Number, Customer, Memo, Amount, Currency, Status, Stripe Invoice ID.
              Paste into QuickBooks&rsquo; CSV importer.
            </p>
            <label className="mt-4 block">
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Range</span>
              <select
                value={range}
                onChange={(e) => setRange(e.target.value as typeof range)}
                className="w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
              >
                <option value="mtd">Month to date</option>
                <option value="ytd">Year to date</option>
                <option value="last30">Last 30 days</option>
                <option value="last90">Last 90 days</option>
                <option value="all">All time</option>
                <option value="custom">Custom range</option>
              </select>
            </label>
            {range === 'custom' ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label>
                  <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Start</span>
                  <input
                    type="date"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    className="w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
                  />
                </label>
                <label>
                  <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">End</span>
                  <input
                    type="date"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    className="w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
                  />
                </label>
              </div>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-nativz-border bg-surface px-3 py-1 text-xs text-text-primary hover:bg-white/5"
              >
                Cancel
              </button>
              <a
                href={buildHref()}
                onClick={() => setOpen(false)}
                className="rounded-full bg-nz-cyan px-3 py-1 text-xs font-medium text-background hover:bg-nz-cyan/90"
              >
                Download CSV
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
