'use client';

import { useEffect, useState, useTransition } from 'react';
import { Plus, Trash2, Globe, ExternalLink, Instagram, Facebook, Youtube, Sparkles, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

// NAT-57 follow-up (polish pass 3): radical simplification per Jack.
//
// What changed:
//   - Subtext dropped from the card header (section title speaks for
//     itself now that the surface is minimal).
//   - Inline "Add competitor" form (brand name, website, 4 handles,
//     notes) → gone. Replaced with a single "Add competitor" button
//     at the BOTTOM of the list, which opens a polished modal that
//     just asks for a URL. The backend scrapes the rest.
//   - Per-competitor edit/add-handle state is still available through
//     PATCH on client_competitors (admins can edit existing competitors
//     by clicking a row), but the default flow is URL paste + scrape.
//
// Net: adding a competitor is one URL paste instead of 8+ fields.

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
  const [modalOpen, setModalOpen] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => { void fetchCompetitors(); }, [clientId]);

  async function fetchCompetitors() {
    try {
      const res = await fetch(`/api/clients/${clientId}/competitors`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      // Defensive default — a response without a `competitors` key (or a
      // failed fetch below) used to leave state on `null`, which renders
      // as "Loading…" forever. Always settle to an array so the UI can
      // show the empty state + Add button immediately.
      setCompetitors(Array.isArray(data.competitors) ? data.competitors : []);
      setUngroupedCount(data.ungrouped_count ?? 0);
    } catch (err) {
      console.error('CompetitorsSection: fetch failed', err);
      toast.error('Failed to load competitors');
      setCompetitors([]);
    }
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
    <>
      <section className="rounded-xl border border-nativz-border bg-surface p-5 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Competitors</h3>
        </div>

        {ungroupedCount > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
            {ungroupedCount} legacy competitor handle{ungroupedCount === 1 ? '' : 's'} not yet
            grouped under a brand. They&apos;ll surface in competitor-spying tools but
            aren&apos;t editable here until grouped.
          </div>
        )}

        {competitors && competitors.length > 0 ? (
          <div className="space-y-2">
            {competitors.map((c) => (
              <CompetitorRow
                key={c.id}
                competitor={c}
                onDelete={() => void remove(c.id, c.brand_name)}
              />
            ))}
          </div>
        ) : competitors ? (
          <p className="text-xs text-text-muted italic">
            No competitors yet. Add one to pre-load competitor-spying tools.
          </p>
        ) : (
          <p className="text-xs text-text-muted">Loading…</p>
        )}

        {/* Bottom CTA — the primary flow for adding competitors now. */}
        <div className="pt-2">
          <button
            onClick={() => setModalOpen(true)}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-nativz-border bg-background/30 hover:bg-background/60 hover:border-accent-text/40 px-3 py-2.5 text-sm text-text-secondary hover:text-accent-text transition"
          >
            <Plus size={14} /> Add competitor
          </button>
        </div>
      </section>

      {modalOpen && (
        <AddCompetitorModal
          clientId={clientId}
          onClose={() => setModalOpen(false)}
          onAdded={() => {
            setModalOpen(false);
            void fetchCompetitors();
          }}
        />
      )}
    </>
  );
}

function CompetitorRow({
  competitor,
  onDelete,
}: {
  competitor: Competitor;
  onDelete: () => void;
}) {
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
          <p className="text-xs text-text-muted italic">No handles found on their website</p>
        )}
        {competitor.notes && (
          <p className="text-xs text-text-muted mt-1 line-clamp-2">{competitor.notes}</p>
        )}
      </div>
      <button
        onClick={onDelete}
        className="shrink-0 text-xs text-red-400 hover:text-red-300 p-1.5 rounded hover:bg-red-500/10"
        aria-label="Remove"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

// ─── Add Competitor Modal ─────────────────────────────────────────────

function AddCompetitorModal({
  clientId, onClose, onAdded,
}: {
  clientId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [scrapeSummary, setScrapeSummary] = useState<{
    brand_name: string;
    handle_count: number;
  } | null>(null);

  // ESC closes. Click-outside closes too (on the backdrop).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  async function submit() {
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error('Paste a URL to scrape.');
      return;
    }
    // Add protocol if missing — the backend validates with z.string().url()
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/competitors/scrape`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: normalized }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'Scrape failed');
        setSubmitting(false);
        return;
      }
      // Brief success confirmation before closing so the admin sees
      // what we extracted.
      setScrapeSummary({
        brand_name: data.scraped?.brand_name ?? data.competitor?.brand_name ?? 'competitor',
        handle_count: data.scraped?.handle_count ?? 0,
      });
      toast.success('Added competitor');
      setTimeout(() => onAdded(), 800);
    } catch {
      toast.error('Scrape failed — network error');
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        // Click outside the dialog closes.
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-nativz-border bg-surface shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-nativz-border">
          <div className="flex items-start gap-3">
            <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-text/10 text-accent-text">
              <Plus size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text-primary">Add competitor</h2>
              <p className="text-xs text-text-muted mt-0.5">
                Paste their URL and we&apos;ll scrape the brand details + social handles.
              </p>
            </div>
          </div>
          <button
            onClick={() => { if (!submitting) onClose(); }}
            disabled={submitting}
            className="shrink-0 text-text-muted hover:text-text-primary p-1 rounded disabled:opacity-40"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {scrapeSummary ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm text-emerald-300">
                <Sparkles size={14} />
                <span className="font-medium">{scrapeSummary.brand_name}</span>
                <span className="text-emerald-400/70">saved</span>
              </div>
              <p className="text-xs text-emerald-300/80">
                {scrapeSummary.handle_count > 0
                  ? `Found ${scrapeSummary.handle_count} social ${scrapeSummary.handle_count === 1 ? 'handle' : 'handles'} from their site.`
                  : 'No social handles detected on their site — you can add them manually later.'}
              </p>
            </div>
          ) : (
            <>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-text-muted font-semibold flex items-center gap-1 mb-2">
                  <Globe size={11} /> Competitor URL
                </label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !submitting) void submit();
                  }}
                  placeholder="https://liquiddeath.com"
                  autoFocus
                  disabled={submitting}
                  className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent-text/50 focus:outline-none focus:ring-1 focus:ring-accent-text/20 disabled:opacity-50"
                />
              </div>

              <ul className="text-[11px] text-text-muted space-y-1 leading-relaxed">
                <li className="flex items-start gap-2">
                  <span className="text-accent-text shrink-0 mt-0.5">•</span>
                  We&apos;ll pull the brand name, description, and their
                  Instagram, TikTok, Facebook, and YouTube handles.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent-text shrink-0 mt-0.5">•</span>
                  Any handles we can&apos;t find are left blank — you can
                  add them manually afterward.
                </li>
              </ul>
            </>
          )}
        </div>

        {/* Footer */}
        {!scrapeSummary && (
          <div className="flex items-center justify-end gap-2 p-4 border-t border-nativz-border bg-background/30">
            <button
              onClick={() => { if (!submitting) onClose(); }}
              disabled={submitting}
              className="rounded-lg px-3 py-1.5 text-xs text-text-muted hover:text-text-primary disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={() => void submit()}
              disabled={submitting || !url.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-text text-background px-4 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-40"
            >
              {submitting ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              {submitting ? 'Scraping…' : 'Add competitor'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
