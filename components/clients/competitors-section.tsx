'use client';

import { useEffect, useState, useTransition } from 'react';
import { Plus, Trash2, Globe, ExternalLink, Instagram, Facebook, Youtube, Sparkles, Pencil, X, Check } from 'lucide-react';
import { toast } from 'sonner';

// NAT-57 follow-up: admin UI for the per-client competitor list. Manual
// entry only — no AI discovery. The saved list becomes the default
// suggestion source for every competitor-spying tool.

type Platform = 'instagram' | 'tiktok' | 'facebook' | 'youtube';

const PLATFORM_ICON: Record<Platform, React.ElementType> = {
  instagram: Instagram,
  tiktok: Sparkles,
  facebook: Facebook,
  youtube: Youtube,
};

interface CompetitorHandle {
  handle: string;
  profile_url: string | null;
}

interface Competitor {
  id: string;
  brand_name: string;
  website_url: string | null;
  notes: string | null;
  website_scraped: boolean;
  handles: Record<Platform, CompetitorHandle | null>;
  created_at: string;
  updated_at: string;
}

export function CompetitorsSection({ clientId }: { clientId: string }) {
  const [competitors, setCompetitors] = useState<Competitor[] | null>(null);
  const [ungroupedCount, setUngroupedCount] = useState(0);
  const [showAddForm, setShowAddForm] = useState(false);
  const [draft, setDraft] = useState<DraftState>(emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => { void fetchCompetitors(); }, [clientId]);

  async function fetchCompetitors() {
    try {
      const res = await fetch(`/api/clients/${clientId}/competitors`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setCompetitors(data.competitors);
      setUngroupedCount(data.ungrouped_count ?? 0);
    } catch (err) {
      console.error('CompetitorsSection: fetch failed', err);
      toast.error('Failed to load competitors');
    }
  }

  function cancelEdit() {
    setShowAddForm(false);
    setEditingId(null);
    setDraft(emptyDraft());
  }

  function beginEdit(c: Competitor) {
    setEditingId(c.id);
    setShowAddForm(false);
    setDraft({
      brand_name: c.brand_name,
      website_url: c.website_url ?? '',
      notes: c.notes ?? '',
      handles: {
        instagram: c.handles.instagram?.handle ?? '',
        tiktok: c.handles.tiktok?.handle ?? '',
        facebook: c.handles.facebook?.handle ?? '',
        youtube: c.handles.youtube?.handle ?? '',
      },
    });
  }

  async function save() {
    if (!draft.brand_name.trim()) {
      toast.error('Brand name is required');
      return;
    }
    startTransition(async () => {
      const payload = {
        brand_name: draft.brand_name.trim(),
        website_url: draft.website_url.trim() || null,
        notes: draft.notes.trim() || null,
        handles: {
          instagram: draft.handles.instagram.trim() || null,
          tiktok: draft.handles.tiktok.trim() || null,
          facebook: draft.handles.facebook.trim() || null,
          youtube: draft.handles.youtube.trim() || null,
        },
      };
      const url = editingId
        ? `/api/clients/${clientId}/competitors/${editingId}`
        : `/api/clients/${clientId}/competitors`;
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(typeof data.error === 'string' ? data.error : 'Failed to save');
        return;
      }
      toast.success(editingId ? 'Competitor updated' : 'Competitor added');
      cancelEdit();
      void fetchCompetitors();
    });
  }

  async function remove(competitorId: string, brandName: string) {
    if (!confirm(`Remove ${brandName}? This cannot be undone.`)) return;
    startTransition(async () => {
      const res = await fetch(`/api/clients/${clientId}/competitors/${competitorId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        toast.error('Failed to remove');
        return;
      }
      toast.success('Removed');
      void fetchCompetitors();
    });
  }

  return (
    <section className="rounded-xl border border-nativz-border bg-surface p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Competitors</h3>
          <p className="text-xs text-text-muted mt-1 leading-relaxed">
            Brands we compare this client against. Competitor-spying tools
            auto-suggest from this list, so a well-maintained roster saves
            a lot of URL pasting.
          </p>
        </div>
        {!showAddForm && !editingId && (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1 text-xs text-accent-text hover:underline px-2 py-1"
          >
            <Plus size={14} /> Add competitor
          </button>
        )}
      </div>

      {ungroupedCount > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
          {ungroupedCount} legacy competitor handle{ungroupedCount === 1 ? '' : 's'} not yet
          grouped under a brand. They&apos;ll surface in competitor-spying tools but
          aren&apos;t editable here until grouped.
        </div>
      )}

      {(showAddForm || editingId) && (
        <CompetitorForm
          draft={draft}
          setDraft={setDraft}
          onCancel={cancelEdit}
          onSave={save}
          editing={!!editingId}
        />
      )}

      {competitors && competitors.length > 0 ? (
        <div className="space-y-2">
          {competitors.map((c) => (
            <CompetitorRow
              key={c.id}
              competitor={c}
              onEdit={() => beginEdit(c)}
              onDelete={() => void remove(c.id, c.brand_name)}
              editingThis={editingId === c.id}
            />
          ))}
        </div>
      ) : !showAddForm && !editingId ? (
        <p className="text-xs text-text-muted italic">
          No competitors saved yet. Add one to pre-load competitor-spying tools.
        </p>
      ) : null}
    </section>
  );
}

function CompetitorRow({
  competitor,
  onEdit,
  onDelete,
  editingThis,
}: {
  competitor: Competitor;
  onEdit: () => void;
  onDelete: () => void;
  editingThis: boolean;
}) {
  if (editingThis) return null; // editing state rendered by form above
  const linkedPlatforms = (['instagram', 'tiktok', 'facebook', 'youtube'] as Platform[]).filter(
    (p) => competitor.handles[p] !== null,
  );
  return (
    <div className="flex items-start gap-3 rounded-lg border border-nativz-border bg-background/30 p-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-text-primary truncate">{competitor.brand_name}</span>
          {competitor.website_url && (
            <a
              href={competitor.website_url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs text-accent-text hover:underline flex items-center gap-0.5"
            >
              <Globe size={10} /> Site <ExternalLink size={10} />
            </a>
          )}
        </div>
        {linkedPlatforms.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {linkedPlatforms.map((p) => {
              const Icon = PLATFORM_ICON[p];
              const h = competitor.handles[p];
              if (!h) return null;
              return (
                <a
                  key={p}
                  href={h.profile_url ?? '#'}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
                >
                  <Icon size={10} /> @{h.handle}
                </a>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-text-muted italic">No platform handles yet</p>
        )}
        {competitor.notes && (
          <p className="text-xs text-text-muted mt-1 line-clamp-2">{competitor.notes}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onEdit}
          className="text-xs text-text-muted hover:text-text-primary p-1.5 rounded hover:bg-nativz-border/30"
          aria-label="Edit"
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={onDelete}
          className="text-xs text-red-400 hover:text-red-300 p-1.5 rounded hover:bg-red-500/10"
          aria-label="Remove"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

interface DraftState {
  brand_name: string;
  website_url: string;
  notes: string;
  handles: Record<Platform, string>;
}

function emptyDraft(): DraftState {
  return {
    brand_name: '',
    website_url: '',
    notes: '',
    handles: { instagram: '', tiktok: '', facebook: '', youtube: '' },
  };
}

function CompetitorForm({
  draft,
  setDraft,
  onCancel,
  onSave,
  editing,
}: {
  draft: DraftState;
  setDraft: (d: DraftState) => void;
  onCancel: () => void;
  onSave: () => void;
  editing: boolean;
}) {
  const setField = <K extends keyof Omit<DraftState, 'handles'>>(
    k: K,
    v: DraftState[K],
  ) => setDraft({ ...draft, [k]: v });

  const setHandle = (p: Platform, v: string) =>
    setDraft({ ...draft, handles: { ...draft.handles, [p]: v } });

  return (
    <div className="rounded-lg border border-accent-text/30 bg-accent-text/[0.03] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-text-primary">
          {editing ? 'Edit competitor' : 'Add competitor'}
        </h4>
        <button onClick={onCancel} className="text-text-muted hover:text-text-primary p-1" aria-label="Cancel">
          <X size={14} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
            Brand name *
          </label>
          <input
            type="text"
            value={draft.brand_name}
            onChange={(e) => setField('brand_name', e.target.value)}
            placeholder="Liquid Death"
            className="mt-1 w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            autoFocus
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
            Website
          </label>
          <input
            type="text"
            value={draft.website_url}
            onChange={(e) => setField('website_url', e.target.value)}
            placeholder="https://liquiddeath.com"
            className="mt-1 w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {(['instagram', 'tiktok', 'facebook', 'youtube'] as Platform[]).map((p) => {
          const Icon = PLATFORM_ICON[p];
          return (
            <div key={p}>
              <label className="text-[10px] uppercase tracking-wider text-text-muted font-semibold flex items-center gap-1">
                <Icon size={10} /> {p.charAt(0).toUpperCase() + p.slice(1)}
              </label>
              <div className="mt-1 flex items-center gap-1">
                <span className="text-xs text-text-muted">@</span>
                <input
                  type="text"
                  value={draft.handles[p]}
                  onChange={(e) => setHandle(p, e.target.value.replace(/^@+/, ''))}
                  placeholder="handle"
                  className="flex-1 rounded border border-nativz-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
          Notes (optional)
        </label>
        <textarea
          value={draft.notes}
          onChange={(e) => setField('notes', e.target.value)}
          rows={2}
          placeholder="Why they're a competitor, positioning differences, etc."
          className="mt-1 w-full rounded border border-nativz-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent resize-none"
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary rounded"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          className="px-3 py-1.5 text-xs bg-foreground text-background rounded hover:opacity-90 flex items-center gap-1"
        >
          <Check size={12} /> {editing ? 'Save changes' : 'Add competitor'}
        </button>
      </div>
    </div>
  );
}
