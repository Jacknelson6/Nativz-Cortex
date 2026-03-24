'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Presentation, Plus, MoreHorizontal, Clock, Trash2, Archive, ArchiveRestore,
  Copy, Pencil, BarChart2,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { DEFAULT_SECTION_ORDER, DEFAULT_VISIBLE_SECTIONS } from '@/lib/benchmarks/sections';

interface PresentationItem {
  id: string;
  title: string;
  description: string | null;
  type: string;
  client_id: string | null;
  client_name: string | null;
  audit_data?: { visible_sections?: string[] } | null;
  status: 'draft' | 'ready' | 'archived';
  tags: string[];
  created_at: string;
  updated_at: string;
}

function visibleSectionCount(p: PresentationItem): number {
  const n = p.audit_data?.visible_sections?.length;
  return typeof n === 'number' && n > 0 ? n : DEFAULT_VISIBLE_SECTIONS.length;
}

export default function PresentationsPage() {
  const router = useRouter();
  const [presentations, setPresentations] = useState<PresentationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { confirm: confirmDelete, dialog: confirmDeleteDialog } = useConfirm({
    title: 'Delete presentation',
    description: 'This will permanently delete this presentation. This action cannot be undone.',
    confirmLabel: 'Delete',
    variant: 'danger',
  });

  const fetchPresentations = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/presentations');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPresentations(
        (data as PresentationItem[]).filter((p) => p.type === 'benchmarks')
      );
    } catch {
      toast.error('Failed to load presentations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPresentations();
  }, [fetchPresentations]);

  useEffect(() => {
    if (!menuOpenId) return;
    function handleClick() {
      setMenuOpenId(null);
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [menuOpenId]);

  async function handleCreate() {
    try {
      const res = await fetch('/api/presentations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Creative benchmarks 2026',
          type: 'benchmarks',
          audit_data: {
            visible_sections: [...DEFAULT_VISIBLE_SECTIONS],
            section_order: [...DEFAULT_SECTION_ORDER],
            active_vertical_filter: null,
          },
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      router.push(`/admin/presentations/${data.id}`);
    } catch {
      toast.error('Failed to create presentation');
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirmDelete();
    if (!ok) return;
    try {
      const res = await fetch(`/api/presentations/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Presentation deleted');
      setPresentations((prev) => prev.filter((p) => p.id !== id));
    } catch {
      toast.error('Failed to delete presentation');
    }
    setMenuOpenId(null);
  }

  async function handleDuplicate(p: PresentationItem) {
    try {
      const res = await fetch('/api/presentations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${p.title} (copy)`,
          description: p.description,
          type: 'benchmarks',
          client_id: p.client_id,
          audit_data: p.audit_data ?? {},
          tags: p.tags,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('Duplicated');
      fetchPresentations();
    } catch {
      toast.error('Failed to duplicate');
    }
    setMenuOpenId(null);
  }

  async function handleArchive(p: PresentationItem) {
    const newStatus = p.status === 'archived' ? 'draft' : 'archived';
    try {
      const res = await fetch(`/api/presentations/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      toast.success(newStatus === 'archived' ? 'Archived' : 'Unarchived');
      fetchPresentations();
    } catch {
      toast.error('Failed to update');
    }
    setMenuOpenId(null);
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  const active = presentations.filter((p) => p.status !== 'archived');
  const archived = presentations.filter((p) => p.status === 'archived');

  return (
    <div className="cortex-page-gutter space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="ui-page-title">Presentations</h1>
          <p className="text-sm text-text-muted mt-1">
            Creative benchmarks 2026 — interactive charts for live and client calls
          </p>
        </div>
        <Button
          onClick={() => {
            setShowCreate(true);
          }}
        >
          <Plus size={14} />
          New
        </Button>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setShowCreate(false)}
            aria-hidden
          />
          <div className="relative w-full max-w-md rounded-2xl border border-nativz-border bg-surface shadow-2xl animate-modal-pop-in p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">New deck</h2>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
              >
                <span className="sr-only">Close</span>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-text-muted">
              Opens the creative benchmarks editor with all sections; toggle visibility and reorder before Present.
            </p>
            <Button
              className="w-full"
              onClick={() => {
                setShowCreate(false);
                void handleCreate();
              }}
            >
              <BarChart2 size={14} />
              Create creative benchmarks deck
            </Button>
          </div>
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-40 animate-pulse">
              <div className="h-full flex flex-col justify-between p-4">
                <div className="space-y-2">
                  <div className="h-4 w-2/3 rounded bg-surface-hover" />
                  <div className="h-3 w-1/3 rounded bg-surface-hover" />
                </div>
                <div className="h-3 w-1/2 rounded bg-surface-hover" />
              </div>
            </Card>
          ))}
        </div>
      )}

      {!loading && active.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {active.map((p, i) => (
            <div
              key={p.id}
              className="animate-stagger-in min-w-0"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="relative group rounded-xl border border-nativz-border bg-surface shadow-card hover:shadow-elevated transition-all duration-300 hover:border-transparent hover:ring-1 hover:ring-accent/40">
                <div className="flex items-center gap-2 px-4 pt-4 pb-1">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0 bg-orange-500/15">
                    <BarChart2 size={16} className="text-orange-400" />
                  </div>
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className="rounded-full bg-surface-hover border border-nativz-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-text-muted whitespace-nowrap">
                      Benchmarks
                    </span>
                  </div>
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId(menuOpenId === p.id ? null : p.id);
                      }}
                      className="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
                    >
                      <MoreHorizontal size={16} />
                    </button>

                    {menuOpenId === p.id && (
                      <div className="absolute right-0 top-full z-20 mt-1 min-w-[140px] rounded-lg border border-nativz-border bg-surface py-1 shadow-dropdown animate-fade-in">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/admin/presentations/${p.id}`);
                          }}
                          className="cursor-pointer flex items-center gap-2 w-full px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover transition-colors"
                        >
                          <Pencil size={12} /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDuplicate(p);
                          }}
                          className="cursor-pointer flex items-center gap-2 w-full px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover transition-colors"
                        >
                          <Copy size={12} /> Duplicate
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleArchive(p);
                          }}
                          className="cursor-pointer flex items-center gap-2 w-full px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover transition-colors"
                        >
                          {p.status === 'archived' ? <ArchiveRestore size={12} /> : <Archive size={12} />}
                          {p.status === 'archived' ? 'Unarchive' : 'Archive'}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDelete(p.id);
                          }}
                          className="cursor-pointer flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-400 hover:bg-surface-hover transition-colors"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => router.push(`/admin/presentations/${p.id}`)}
                  className="cursor-pointer w-full text-left px-4 pb-4 pt-1 space-y-2"
                >
                  <h3 className="text-base font-semibold text-text-primary truncate group-hover:text-accent-text transition-colors">
                    {p.title}
                  </h3>
                  <div className="flex items-center gap-3 text-[11px] text-text-muted">
                    {p.client_name && (
                      <span className="rounded-full bg-accent2-surface px-2 py-0.5 text-accent2-text font-medium">
                        {p.client_name}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Presentation size={10} />
                      {visibleSectionCount(p)} sections
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {formatDate(p.updated_at)}
                    </span>
                  </div>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && archived.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide">Archived</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {archived.map((p) => (
              <div key={p.id} className="relative group rounded-xl border border-nativz-border/50 bg-surface/50 overflow-hidden">
                <button
                  type="button"
                  onClick={() => router.push(`/admin/presentations/${p.id}`)}
                  className="cursor-pointer w-full text-left p-4 space-y-2 opacity-60 hover:opacity-80 transition-opacity"
                >
                  <h3 className="text-sm font-semibold text-text-primary truncate">{p.title}</h3>
                  <div className="flex items-center gap-2 text-[11px] text-text-muted">
                    <span className="uppercase font-bold">Benchmarks</span>
                    <span>{formatDate(p.updated_at)}</span>
                  </div>
                </button>
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => void handleArchive(p)}
                    className="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-surface-hover transition-colors"
                    title="Unarchive"
                  >
                    <ArchiveRestore size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && presentations.length === 0 && (
        <EmptyState
          icon={<Presentation size={32} />}
          title="No benchmark decks yet"
          description="Create a creative benchmarks presentation for live walkthroughs and client calls."
          action={
            <Button
              onClick={() => {
                void handleCreate();
              }}
            >
              <Plus size={14} />
              Create benchmark deck
            </Button>
          }
        />
      )}

      {confirmDeleteDialog}
    </div>
  );
}
