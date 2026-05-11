'use client';

// VFF-06 T09: One of the 4 columns on /admin/formats/taxonomy.
// Lists slugs for a single kind. Super-admin sees edit + archive icons.

import { useState } from 'react';
import type { TaxonomyRow, ViralFormatKind } from '@/lib/analytics/types';

type Props = {
  kind: ViralFormatKind;
  title: string;
  rows: TaxonomyRow[];
  canEdit: boolean;
  onEdit?: (row: TaxonomyRow) => void;
  onArchiveToggle?: (row: TaxonomyRow) => Promise<void>;
};

export function TaxonomyColumn({
  kind,
  title,
  rows,
  canEdit,
  onEdit,
  onArchiveToggle,
}: Props) {
  return (
    <section className="flex h-full flex-col rounded-xl border border-white/5 bg-surface">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <h3 className="text-sm font-medium text-white/90">{title}</h3>
        <span className="text-[11px] uppercase tracking-wider text-white/40">
          {rows.length}
        </span>
      </header>
      <ul className="flex-1 divide-y divide-white/5 overflow-y-auto">
        {rows.length === 0 ? (
          <li className="px-4 py-6 text-center text-xs text-white/40">
            No {kind} slugs yet
          </li>
        ) : (
          rows.map((row) => (
            <TaxonomyRowItem
              key={row.id}
              row={row}
              canEdit={canEdit}
              onEdit={onEdit}
              onArchiveToggle={onArchiveToggle}
            />
          ))
        )}
      </ul>
    </section>
  );
}

function TaxonomyRowItem({
  row,
  canEdit,
  onEdit,
  onArchiveToggle,
}: {
  row: TaxonomyRow;
  canEdit: boolean;
  onEdit?: (row: TaxonomyRow) => void;
  onArchiveToggle?: (row: TaxonomyRow) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const archived = row.archived_at !== null;

  const handleArchive = async () => {
    if (!onArchiveToggle || busy) return;
    setBusy(true);
    try {
      await onArchiveToggle(row);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`flex flex-col gap-1 px-4 py-3 ${archived ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm text-white/90">{row.display_name}</span>
            {row.is_seeded ? (
              <span className="rounded-sm bg-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white/60">
                seeded
              </span>
            ) : null}
          </div>
          <div className="truncate font-mono text-[11px] text-white/40">
            {row.slug}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[11px] text-white/50">{row.video_count}</span>
          {canEdit && onEdit ? (
            <button
              type="button"
              onClick={() => onEdit(row)}
              className="text-[11px] text-white/50 hover:text-accent"
              aria-label="Edit"
            >
              edit
            </button>
          ) : null}
          {canEdit && onArchiveToggle ? (
            <button
              type="button"
              onClick={handleArchive}
              disabled={busy}
              className="text-[11px] text-white/50 hover:text-accent disabled:opacity-40"
              aria-label={archived ? 'Restore' : 'Archive'}
            >
              {archived ? 'restore' : 'archive'}
            </button>
          ) : null}
        </div>
      </div>
      {row.aliases.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {row.aliases.map((a) => (
            <span
              key={a}
              className="rounded-sm bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/50"
            >
              {a}
            </span>
          ))}
        </div>
      ) : null}
      {row.description ? (
        <p className="line-clamp-2 text-[11px] text-white/50">{row.description}</p>
      ) : null}
    </li>
  );
}
