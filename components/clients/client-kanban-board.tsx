'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { ClientLogo } from '@/components/clients/client-logo';

/**
 * Client pipeline Kanban — drag a client between agency columns to
 * reassign their `agency` field. Replaces the search grid on
 * /admin/clients so the roster reads as a pipeline instead of a flat
 * list.
 *
 * Columns:
 *   - Unassigned  → agency is null / empty
 *   - Nativz
 *   - Anderson Collaborative
 *   - Internal
 *
 * (Onboarding is coming in a follow-up once we wire auto-move from
 * tracker completion → agency column.)
 */

interface KanbanClient {
  dbId: string;
  name: string;
  slug: string;
  industry: string;
  services: string[];
  agency: string | null;
  isActive: boolean;
  logoUrl: string | null;
  healthScore: string | null;
}

interface ColumnDef {
  id: string;
  label: string;
  /** The exact `agency` value written to the DB when a card drops here. */
  agencyValue: string | null;
  /** Tailwind colour tokens for the header dot + count. */
  dot: string;
  text: string;
}

const COLUMNS: ColumnDef[] = [
  { id: 'unassigned', label: 'Unassigned',             agencyValue: null,                      dot: 'bg-slate-500',   text: 'text-slate-300' },
  { id: 'nativz',     label: 'Nativz',                 agencyValue: 'Nativz',                  dot: 'bg-accent',       text: 'text-accent-text' },
  { id: 'ac',         label: 'Anderson Collaborative', agencyValue: 'Anderson Collaborative',  dot: 'bg-teal-400',     text: 'text-teal-300' },
  { id: 'internal',   label: 'Internal',               agencyValue: 'Internal',                dot: 'bg-purple-500',   text: 'text-purple-300' },
];

/** Decide which column a client lives in based on its agency value. */
function columnForClient(agency: string | null): ColumnDef {
  if (!agency) return COLUMNS[0];
  const a = agency.trim().toLowerCase();
  if (a.includes('nativz')) return COLUMNS[1];
  if (a.includes('anderson') || a === 'ac') return COLUMNS[2];
  if (a === 'internal') return COLUMNS[3];
  return COLUMNS[0];
}

interface ClientKanbanBoardProps {
  clients: KanbanClient[];
}

export function ClientKanbanBoard({ clients: initialClients }: ClientKanbanBoardProps) {
  const [clients, setClients] = useState(initialClients);
  const [query, setQuery] = useState('');
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return clients;
    const q = query.trim().toLowerCase();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.industry.toLowerCase().includes(q) ||
        (c.agency?.toLowerCase() ?? '').includes(q) ||
        c.services.some((s) => s.toLowerCase().includes(q)),
    );
  }, [clients, query]);

  function handleDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    setDraggingId(id);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDragOverCol(null);
  }

  function handleDragOver(e: React.DragEvent, colId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCol !== colId) setDragOverCol(colId);
  }

  function handleDragLeave(e: React.DragEvent, colId: string) {
    if (dragOverCol === colId && !e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverCol(null);
    }
  }

  async function handleDrop(e: React.DragEvent, col: ColumnDef) {
    e.preventDefault();
    setDragOverCol(null);
    setDraggingId(null);

    const id = e.dataTransfer.getData('text/plain');
    const client = clients.find((c) => c.dbId === id);
    if (!client) return;

    const current = columnForClient(client.agency);
    if (current.id === col.id) return; // no-op drop

    // Optimistic update — flip the card immediately.
    const prevAgency = client.agency;
    setClients((cs) => cs.map((c) => (c.dbId === id ? { ...c, agency: col.agencyValue } : c)));

    try {
      const res = await fetch(`/api/clients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agency: col.agencyValue }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      toast.success(`${client.name} → ${col.label}`);
    } catch (err) {
      // Revert on failure.
      setClients((cs) => cs.map((c) => (c.dbId === id ? { ...c, agency: prevAgency } : c)));
      toast.error(`Move failed: ${(err as Error).message}`);
    }
  }

  return (
    <div className="space-y-4">
      {/* Search + hint */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name, industry, agency…"
            className="w-full rounded-lg border border-nativz-border bg-transparent pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        </div>
        <p className="hidden text-xs text-text-muted sm:block">
          Drag a card between columns to reassign. Changes save immediately.
        </p>
      </div>

      {/* Board */}
      <div className="flex gap-4 overflow-x-auto pb-2">
        {COLUMNS.map((col) => {
          const colClients = filtered.filter((c) => columnForClient(c.agency).id === col.id);
          const total = clients.filter((c) => columnForClient(c.agency).id === col.id).length;
          const isDropTarget = dragOverCol === col.id;

          return (
            <div
              key={col.id}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={(e) => handleDragLeave(e, col.id)}
              onDrop={(e) => handleDrop(e, col)}
              className={`w-[280px] shrink-0 rounded-xl border bg-background/40 transition-colors ${
                isDropTarget
                  ? 'border-accent/50 bg-accent/5'
                  : 'border-nativz-border'
              }`}
            >
              {/* Column header */}
              <div className="flex items-center gap-2 border-b border-nativz-border/60 px-3 py-2.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${col.dot}`} aria-hidden />
                <span className={`text-xs font-semibold uppercase tracking-wide ${col.text}`}>
                  {col.label}
                </span>
                <span className="ml-auto text-[10px] tabular-nums text-text-muted">
                  {query.trim() ? `${colClients.length} / ${total}` : total}
                </span>
              </div>

              {/* Cards */}
              <ul className="space-y-2 p-2 min-h-[120px]">
                {colClients.map((c) => (
                  <li key={c.dbId}>
                    <Card
                      client={c}
                      dragging={draggingId === c.dbId}
                      onDragStart={(e) => handleDragStart(e, c.dbId)}
                      onDragEnd={handleDragEnd}
                    />
                  </li>
                ))}
                {colClients.length === 0 ? (
                  <li className="rounded-lg border border-dashed border-nativz-border/50 px-3 py-6 text-center text-xs text-text-muted">
                    {query.trim() ? 'No matches' : 'Drop a client here'}
                  </li>
                ) : null}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface CardProps {
  client: KanbanClient;
  dragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

function Card({ client: c, dragging, onDragStart, onDragEnd }: CardProps) {
  return (
    <Link
      href={`/admin/clients/${c.slug}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group block cursor-grab rounded-lg border bg-surface p-3 transition-all active:cursor-grabbing ${
        dragging
          ? 'border-accent/60 opacity-60 shadow-lg'
          : 'border-nativz-border hover:border-accent/35 hover:shadow-[var(--shadow-card-hover)]'
      }`}
    >
      <div className="flex items-start gap-3">
        <ClientLogo name={c.name} src={c.logoUrl} size="sm" className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text-primary group-hover:text-accent-text">
            {c.name}
          </p>
          {c.industry ? (
            <p className="mt-0.5 truncate text-xs text-text-muted">{c.industry}</p>
          ) : null}
          {c.services.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {c.services.slice(0, 3).map((s) => (
                <span
                  key={s}
                  className="inline-flex rounded-full bg-surface-hover/60 px-2 py-0.5 text-[10px] text-text-secondary"
                >
                  {s}
                </span>
              ))}
              {c.services.length > 3 ? (
                <span className="text-[10px] text-text-muted">+{c.services.length - 3}</span>
              ) : null}
            </div>
          ) : null}
        </div>
        {!c.isActive ? (
          <span
            className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-300"
            title="Inactive"
          >
            off
          </span>
        ) : null}
      </div>
    </Link>
  );
}
