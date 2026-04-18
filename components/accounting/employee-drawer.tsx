'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { centsToDollars } from '@/lib/accounting/periods';

type EntryType = 'editing' | 'smm' | 'affiliate' | 'blogging';

interface Entry {
  id: string;
  entry_type: EntryType | 'override' | 'misc';
  team_member_id: string | null;
  payee_label: string | null;
  client_id: string | null;
  video_count: number;
  rate_cents: number;
  amount_cents: number;
  margin_cents: number;
  description: string | null;
  created_at: string;
}

interface EmployeeDrawerProps {
  open: boolean;
  onClose: () => void;
  payeeLabel: string;
  serviceLabel: string;
  periodLabel: string;
  entries: Entry[];
  clientNameById: Map<string, string>;
  readonly: boolean;
  onDelete: (id: string) => void;
  onAdd: () => void;
}

/**
 * Right-side drawer that shows every payroll entry for one payee inside
 * one service, for the active period. Designed to replace the
 * collapse-in-place card — gives the reviewer a focused canvas with a
 * real TOTAL footer and room to read descriptions + client names without
 * squishing the service tab.
 */
export function EmployeeDrawer({
  open,
  onClose,
  payeeLabel,
  serviceLabel,
  periodLabel,
  entries,
  clientNameById,
  readonly,
  onDelete,
  onAdd,
}: EmployeeDrawerProps) {
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    // Prevent body scroll while drawer is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const total = entries.reduce((s, e) => s + (e.amount_cents ?? 0), 0);
  const totalMargin = entries.reduce((s, e) => s + (e.margin_cents ?? 0), 0);
  const totalVideos = entries.reduce((s, e) => s + (e.video_count ?? 0), 0);

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex justify-end bg-black/60"
      onClick={onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-2xl bg-surface border-l border-nativz-border shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-nativz-border">
          <div>
            <p className="text-xs uppercase tracking-wide text-text-secondary font-medium">
              {serviceLabel} · {periodLabel}
            </p>
            <h2 className="text-2xl font-bold text-text-primary mt-1">{payeeLabel}</h2>
            <p className="text-sm text-text-secondary mt-1">
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
              {totalVideos > 0 && ` · ${totalVideos} videos`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary cursor-pointer"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Entries */}
        <div className="flex-1 overflow-y-auto">
          {entries.length === 0 ? (
            <div className="px-6 py-12 text-center text-base text-text-secondary">
              No entries yet for this payee.
            </div>
          ) : (
            <table className="w-full text-base">
              <thead className="bg-background/50 text-text-secondary sticky top-0">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Client</th>
                  <th className="text-right font-semibold px-4 py-3">Videos</th>
                  <th className="text-right font-semibold px-4 py-3">Rate</th>
                  <th className="text-right font-semibold px-4 py-3">Amount</th>
                  <th className="text-right font-semibold px-4 py-3">Margin</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-t border-nativz-border align-top">
                    <td className="px-4 py-3">
                      <p className="text-text-primary">
                        {e.client_id ? clientNameById.get(e.client_id) ?? '—' : '—'}
                      </p>
                      {e.description && (
                        <p className="text-sm text-text-secondary mt-1 whitespace-pre-wrap">
                          {e.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-primary">
                      {e.video_count || '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-primary">
                      {e.rate_cents ? centsToDollars(e.rate_cents) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-text-primary">
                      {centsToDollars(e.amount_cents)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                      {e.margin_cents ? centsToDollars(e.margin_cents) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {!readonly && (
                        <button
                          onClick={() => onDelete(e.id)}
                          className="text-text-secondary hover:text-red-400 cursor-pointer"
                          title="Delete entry"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer — totals + actions */}
        <div className="border-t border-nativz-border px-6 py-4 space-y-3 bg-background/30">
          <div className="flex items-center justify-between">
            <p className="text-base text-text-secondary">
              {totalVideos > 0 && <span>{totalVideos} videos · </span>}
              <span className="text-text-primary">{entries.length} entries</span>
              {totalMargin > 0 && (
                <>
                  <span> · </span>
                  <span className="text-text-secondary">margin {centsToDollars(totalMargin)}</span>
                </>
              )}
            </p>
            <p className="text-2xl font-bold text-text-primary tabular-nums">
              {centsToDollars(total)}
            </p>
          </div>
          {!readonly && (
            <Button variant="outline" onClick={onAdd} className="w-full">
              <Plus size={14} /> Add entry for {payeeLabel}
            </Button>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
