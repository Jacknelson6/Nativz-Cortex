'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  StickyNote, Plus, MoreHorizontal, Clock, Trash2, Archive, ArchiveRestore,
  Copy, Pencil, FileText, ListOrdered, BarChart3, BarChart2, ChevronRight, Search, Instagram,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { CONTENT_PRODUCTION_SOP_SEED_TAG } from '@/lib/presentations/ensure-content-production-sop';

interface PresentationItem {
  id: string;
  title: string;
  description: string | null;
  type: 'slides' | 'tier_list' | 'social_audit' | 'benchmarks' | 'prospect_audit' | 'social_results';
  client_id: string | null;
  client_name: string | null;
  slides: { title: string; body: string; image_url?: string | null }[];
  tiers: { id: string; name: string; color: string }[];
  tier_items: { id: string; title: string; thumbnail_url?: string | null; tier_id?: string | null }[];
  status: 'draft' | 'ready' | 'archived';
  tags: string[];
  created_at: string;
  updated_at: string;
}

const DEFAULT_TIERS = [
  { id: 's', name: 'S', color: '#ff7f7f' },
  { id: 'a', name: 'A', color: '#ffbf7f' },
  { id: 'b', name: 'B', color: '#ffdf7f' },
  { id: 'c', name: 'C', color: '#ffff7f' },
  { id: 'd', name: 'D', color: '#bfff7f' },
  { id: 'e', name: 'E', color: '#7fbfff' },
  { id: 'f', name: 'F', color: '#7f7fff' },
];

export default function PresentationsPage() {
  const router = useRouter();
  const [presentations, setPresentations] = useState<PresentationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { confirm: confirmDelete, dialog: confirmDeleteDialog } = useConfirm({
    title: 'Delete note',
    description: 'This will permanently delete this note. This action cannot be undone.',
    confirmLabel: 'Delete',
    variant: 'danger',
  });

  const fetchPresentations = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/presentations');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPresentations(data);
    } catch {
      toast.error('Failed to load notes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPresentations();
  }, [fetchPresentations]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!menuOpenId) return;
    function handleClick() { setMenuOpenId(null); }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [menuOpenId]);

  async function handleCreate(type: 'slides' | 'tier_list' | 'social_audit' | 'benchmarks' | 'prospect_audit' | 'social_results') {
    try {
      const titles: Record<string, string> = {
        slides: 'Untitled note',
        tier_list: 'Untitled tier list',
        social_audit: 'Social audit',
        benchmarks: 'Creative benchmarks 2026',
        prospect_audit: 'Prospect audit',
        social_results: 'Instagram social results',
      };
      const body: Record<string, unknown> = {
        title: titles[type],
        type,
      };
      if (type === 'slides') {
        body.slides = [{ title: '', body: '' }];
      } else if (type === 'tier_list') {
        body.tiers = DEFAULT_TIERS;
        body.tier_items = [];
      } else if (type === 'social_audit') {
        body.audit_data = { profiles: [], competitors: [], projections: {}, step: 'wizard' };
      } else if (type === 'benchmarks') {
        body.audit_data = {
          visible_sections: ['CH-003', 'CH-005', 'CH-006', 'CH-007', 'CH-008', 'CH-009', 'CH-010', 'CH-011', 'CH-012'],
          section_order: ['CH-003', 'CH-005', 'CH-006', 'CH-007', 'CH-008', 'CH-009', 'CH-010', 'CH-011', 'CH-012'],
          active_vertical_filter: null,
        };
      } else if (type === 'prospect_audit') {
        body.audit_data = {
          url: '',
          status: 'idle',
          profile: null,
          content_pillars: [],
          visual_styles: [],
          posting_cadence: null,
          hook_strategies: [],
          recommendations: [],
          scraped_content: [],
          analyzed_at: null,
        };
      } else if (type === 'social_results') {
        body.audit_data = {
          instagram_handle: '',
          status: 'idle',
          before: null,
          after: null,
          timeline_months: 3,
          generated_at: null,
        };
      }

      const res = await fetch('/api/presentations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      router.push(`/admin/presentations/${data.id}`);
    } catch {
      toast.error('Failed to create note');
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirmDelete();
    if (!ok) return;
    try {
      const res = await fetch(`/api/presentations/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        let message = 'Failed to delete presentation';
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          /* ignore */
        }
        throw new Error(message);
      }
      toast.success('Note deleted');
      setPresentations((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete note');
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
          type: p.type,
          client_id: p.client_id,
          slides: p.slides,
          tiers: p.tiers,
          tier_items: p.tier_items,
          tags: (p.tags ?? []).filter((t) => t !== CONTENT_PRODUCTION_SOP_SEED_TAG),
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

  const typeConfig = {
    slides: { icon: FileText, label: 'Slides', accentClass: 'bg-accent-surface', iconColor: 'text-accent-text' },
    tier_list: { icon: ListOrdered, label: 'Tier list', accentClass: 'bg-accent2-surface', iconColor: 'text-accent2-text' },
    social_audit: { icon: BarChart3, label: 'Social audit', accentClass: 'bg-emerald-500/15', iconColor: 'text-emerald-400' },
    benchmarks: { icon: BarChart2, label: 'Benchmarks', accentClass: 'bg-orange-500/15', iconColor: 'text-orange-400' },
    prospect_audit: { icon: Search, label: 'Prospect audit', accentClass: 'bg-cyan-500/15', iconColor: 'text-cyan-400' },
    social_results: { icon: Instagram, label: 'Social results', accentClass: 'bg-pink-500/15', iconColor: 'text-pink-400' },
  };

  const active = presentations.filter((p) => p.status !== 'archived');
  const archived = presentations.filter((p) => p.status === 'archived');

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notes</h1>
          <p className="text-sm text-text-muted mt-1">
            Sales tools, tier lists, and client notes — includes a ready-made video content production SOP deck
          </p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)}>
          <Plus size={14} />
          New
        </Button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowCreate(false)} />
          <div className="relative w-full max-w-xl rounded-2xl border border-nativz-border bg-surface shadow-2xl animate-modal-pop-in p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">Create new note</h2>
              <button onClick={() => setShowCreate(false)} className="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-sm text-text-muted -mt-2">Choose a note type to get started</p>
            <div className="grid grid-cols-1 gap-2">
              {[
                { type: 'slides' as const, label: 'Slide deck', desc: 'Create a note with slides, images, and speaker notes', icon: FileText, color: 'rgba(4, 107, 210, 0.15)', iconColor: 'text-accent-text', bgColor: 'bg-accent-surface' },
                { type: 'tier_list' as const, label: 'Tier list', desc: 'Rank content with drag-and-drop tiers for visual demos on calls', icon: ListOrdered, color: 'rgba(168, 85, 247, 0.15)', iconColor: 'text-accent2-text', bgColor: 'bg-accent2-surface' },
                { type: 'social_audit' as const, label: 'Social audit', desc: 'Before & after analysis with real social data and growth projections', icon: BarChart3, color: 'rgba(16, 185, 129, 0.15)', iconColor: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
                { type: 'benchmarks' as const, label: 'Creative benchmarks', desc: 'Interactive charts and tables from $1.3B in ad spend data', icon: BarChart2, color: 'rgba(249, 115, 22, 0.15)', iconColor: 'text-orange-400', bgColor: 'bg-orange-500/15' },
                // Prospect audit and Social results visualizer moved to Strategy Lab
              ].map(({ type, label, desc, icon: Icon, iconColor, bgColor }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => { setShowCreate(false); handleCreate(type); }}
                  className="cursor-pointer flex items-center gap-4 rounded-xl border border-nativz-border bg-surface px-4 py-4 text-left hover:bg-surface-hover hover:border-nativz-border/80 transition-all hover:scale-[1.01] active:scale-[0.99]"
                >
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${bgColor} shrink-0`}>
                    <Icon size={20} className={iconColor} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-text-primary">{label}</h3>
                    <p className="text-xs text-text-muted mt-0.5">{desc}</p>
                  </div>
                  <ChevronRight size={16} className="text-text-muted shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
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

      {/* Active presentations */}
      {!loading && active.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {active.map((p, i) => {
            const tc = typeConfig[p.type] ?? typeConfig.slides;
            const TypeIcon = tc.icon;
            const itemCount = p.type === 'tier_list'
              ? (p.tier_items ?? []).length
              : (p.slides ?? []).length;
            const itemLabel = p.type === 'tier_list' ? 'items' : 'slides';

            return (
              <div
                key={p.id}
                className="animate-stagger-in min-w-0"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="relative group rounded-xl border border-nativz-border bg-surface shadow-card hover:shadow-elevated transition-all duration-300 hover:border-transparent hover:ring-1 hover:ring-accent/40">
                  {/* Tier list color bar */}
                  {p.type === 'tier_list' && (p.tiers ?? []).length > 0 && (
                    <div className="h-1.5 flex overflow-hidden rounded-t-xl">
                      {(p.tiers ?? []).map((tier: { id: string; color: string }) => (
                        <div key={tier.id} className="flex-1" style={{ backgroundColor: tier.color + '80' }} />
                      ))}
                    </div>
                  )}

                  {/* Top row: icon + badges + ellipsis (always visible) */}
                  <div className="flex items-center gap-2 px-4 pt-4 pb-1">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${tc.accentClass}`}>
                      <TypeIcon size={16} className={tc.iconColor} />
                    </div>
                    <div className="flex items-center gap-1.5 flex-1 min-w-0 flex-wrap">
                      <span className="rounded-full bg-surface-hover border border-nativz-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-text-muted whitespace-nowrap">
                        {tc.label}
                      </span>
                      {p.tags?.includes(CONTENT_PRODUCTION_SOP_SEED_TAG) ? (
                        <span className="rounded-full bg-accent/15 border border-accent/35 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-text whitespace-nowrap">
                          Included
                        </span>
                      ) : null}
                    </div>
                    <div className="relative shrink-0">
                      <button
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
                            onClick={(e) => { e.stopPropagation(); router.push(`/admin/presentations/${p.id}`); }}
                            className="cursor-pointer flex items-center gap-2 w-full px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover transition-colors"
                          >
                            <Pencil size={12} /> Edit
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDuplicate(p); }}
                            className="cursor-pointer flex items-center gap-2 w-full px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover transition-colors"
                          >
                            <Copy size={12} /> Duplicate
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleArchive(p); }}
                            className="cursor-pointer flex items-center gap-2 w-full px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover transition-colors"
                          >
                            {p.status === 'archived' ? <ArchiveRestore size={12} /> : <Archive size={12} />}
                            {p.status === 'archived' ? 'Unarchive' : 'Archive'}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                            className="cursor-pointer flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-400 hover:bg-surface-hover transition-colors"
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Clickable content area */}
                  <button
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
                        <StickyNote size={10} />
                        {itemCount} {itemLabel}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        {formatDate(p.updated_at)}
                      </span>
                    </div>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Archived */}
      {!loading && archived.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide">Archived</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {archived.map((p) => (
              <div key={p.id} className="relative group rounded-xl border border-nativz-border/50 bg-surface/50 overflow-hidden">
                <button
                  onClick={() => router.push(`/admin/presentations/${p.id}`)}
                  className="cursor-pointer w-full text-left p-4 space-y-2 opacity-60 hover:opacity-80 transition-opacity"
                >
                  <h3 className="text-sm font-semibold text-text-primary truncate">{p.title}</h3>
                  <div className="flex items-center gap-2 text-[11px] text-text-muted">
                    <span className="uppercase font-bold">{typeConfig[p.type]?.label ?? 'Slides'}</span>
                    <span>{formatDate(p.updated_at)}</span>
                  </div>
                </button>
                <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleArchive(p);
                    }}
                    className="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-surface-hover transition-colors"
                    title="Unarchive"
                  >
                    <ArchiveRestore size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleDelete(p.id);
                    }}
                    className="cursor-pointer rounded-lg p-1.5 text-red-400/90 hover:bg-surface-hover hover:text-red-400 transition-colors"
                    title="Delete permanently"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty */}
      {!loading && presentations.length === 0 && (
        <EmptyState
          icon={<StickyNote size={32} />}
          title="No notes yet"
          description="Create slide decks, tier lists, and other visual tools to close more sales."
          action={
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={14} />
              Create your first note
            </Button>
          }
        />
      )}

      {confirmDeleteDialog}
    </div>
  );
}
