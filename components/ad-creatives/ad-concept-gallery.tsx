'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import {
  Check,
  X as XIcon,
  Trash2,
  Wand2,
  Loader2,
  Eye,
  Share2,
  MessageSquare,
  Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import { getSupabaseUrl } from '@/lib/supabase/public-env';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface AdConcept {
  id: string;
  slug: string;
  template_name: string;
  template_id: string | null;
  headline: string;
  body_copy: string | null;
  visual_description: string | null;
  source_grounding: string;
  image_prompt: string;
  image_storage_path: string | null;
  status: 'pending' | 'approved' | 'rejected';
  position: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

interface ConceptComment {
  id: string;
  concept_id: string;
  author_name: string;
  body: string;
  kind: 'comment' | 'approval' | 'rejection';
  share_token_id: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

interface Props {
  clientId: string;
  concepts: AdConcept[];
  onUpdate: (concept: AdConcept) => void;
  onDelete: (id: string) => void;
}

const DISPLAY_FONT = 'var(--font-nz-display), system-ui, sans-serif';

/**
 * Concept gallery. Renders every row in the current batch set as a
 * contact-sheet card (image + caption + action row) plus a detail dialog
 * for full copy inspection. Optimistic updates flow through parent
 * callbacks so the gallery stays in lockstep with the workspace state.
 */
export function AdConceptGallery({ clientId, concepts, onUpdate, onDelete }: Props) {
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [renderingIds, setRenderingIds] = useState<Set<string>>(new Set());
  const [shareOpen, setShareOpen] = useState(false);
  const [commentsByConcept, setCommentsByConcept] = useState<Record<string, ConceptComment[]>>({});

  // Prefetch comment counts in a single batched call when the gallery
  // mounts or the concept list grows. Keeps card badges accurate without
  // N round-trips. Only fetches when there's something to show.
  useEffect(() => {
    if (concepts.length === 0) return;
    let cancelled = false;
    (async () => {
      const conceptIds = concepts.map((c) => c.id).join(',');
      if (!conceptIds) return;
      try {
        const res = await fetch(
          `/api/ad-creatives/concept-comments?conceptIds=${encodeURIComponent(conceptIds)}`,
          { cache: 'no-store' },
        );
        if (!res.ok || cancelled) return;
        const { commentsByConcept: map } = (await res.json()) as {
          commentsByConcept: Record<string, ConceptComment[]>;
        };
        if (!cancelled) setCommentsByConcept(map ?? {});
      } catch {
        // Network blip — badges stay at 0, no toast (quietly degraded).
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [concepts]);

  const counts = useMemo(() => {
    const map: Record<StatusFilter, number> = {
      all: concepts.length,
      pending: 0,
      approved: 0,
      rejected: 0,
    };
    for (const c of concepts) map[c.status] += 1;
    return map;
  }, [concepts]);

  const filtered = useMemo(() => {
    if (filter === 'all') return concepts;
    return concepts.filter((c) => c.status === filter);
  }, [concepts, filter]);

  const openConcept = useMemo(
    () => concepts.find((c) => c.id === openId) ?? null,
    [concepts, openId],
  );

  const patchStatus = useCallback(
    async (id: string, status: AdConcept['status']) => {
      try {
        const res = await fetch(`/api/ad-creatives/concepts/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        if (!res.ok) throw new Error('patch failed');
        const { concept } = (await res.json()) as { concept: AdConcept };
        onUpdate(concept);
      } catch {
        toast.error('Could not update concept');
      }
    },
    [onUpdate],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/ad-creatives/concepts/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('delete failed');
        onDelete(id);
        if (openId === id) setOpenId(null);
      } catch {
        toast.error('Could not delete concept');
      }
    },
    [onDelete, openId],
  );

  const handleRender = useCallback(
    async (id: string) => {
      setRenderingIds((prev) => new Set(prev).add(id));
      try {
        const res = await fetch(`/api/ad-creatives/concepts/${id}/render`, { method: 'POST' });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          toast.error(body?.error ?? `Render failed (${res.status})`);
          return;
        }
        const { concept } = (await res.json()) as { concept: AdConcept };
        onUpdate(concept);
        toast.success(`Rendered ${concept.slug}`);
      } finally {
        setRenderingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [onUpdate],
  );

  if (concepts.length === 0) {
    return <EmptyGallery />;
  }

  return (
    <div className="space-y-6">
      {/* Filter strip — editorial labels with dot separators, share CTA on the right */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-nativz-border/60 pb-4">
        <FilterRow filter={filter} counts={counts} onChange={setFilter} />
        <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
          <Share2 size={13} />
          Share with client
        </Button>
      </div>

      {/* Masonry — CSS columns let varying-aspect cards pack like a moodboard.
          `break-inside-avoid` keeps each card together; `mb-4` provides the
          vertical rhythm between them since column-gap doesn't apply downward. */}
      <div className="columns-2 gap-4 md:columns-3 lg:columns-4">
        {filtered.map((concept) => (
          <ConceptCard
            key={concept.id}
            concept={concept}
            commentCount={(commentsByConcept[concept.id] ?? []).length}
            isRendering={renderingIds.has(concept.id)}
            onOpen={() => setOpenId(concept.id)}
            onApprove={() => void patchStatus(concept.id, 'approved')}
            onReject={() => void patchStatus(concept.id, 'rejected')}
            onDelete={() => void handleDelete(concept.id)}
            onRender={() => void handleRender(concept.id)}
          />
        ))}
      </div>

      {openConcept && (
        <ConceptDetailDialog
          concept={openConcept}
          comments={commentsByConcept[openConcept.id] ?? []}
          isRendering={renderingIds.has(openConcept.id)}
          onClose={() => setOpenId(null)}
          onApprove={() => void patchStatus(openConcept.id, 'approved')}
          onReject={() => void patchStatus(openConcept.id, 'rejected')}
          onDelete={() => void handleDelete(openConcept.id)}
          onRender={() => void handleRender(openConcept.id)}
        />
      )}

      {shareOpen && (
        <ShareDialog clientId={clientId} onClose={() => setShareOpen(false)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function EmptyGallery() {
  return (
    <div className="mx-auto max-w-md space-y-3 py-20 text-center">
      <p className="nz-eyebrow">No concepts yet</p>
      <p className="text-[13px] leading-relaxed text-text-muted">
        Describe the drop in the composer below. Cortex matches the brand to
        proven reference ads, writes the copy, and renders each concept right
        here.
      </p>
    </div>
  );
}

function FilterRow({
  filter,
  counts,
  onChange,
}: {
  filter: StatusFilter;
  counts: Record<StatusFilter, number>;
  onChange: (id: StatusFilter) => void;
}) {
  const items: { id: StatusFilter; label: string; count: number }[] = [
    { id: 'all',      label: 'All',      count: counts.all },
    { id: 'pending',  label: 'Pending',  count: counts.pending },
    { id: 'approved', label: 'Approved', count: counts.approved },
    { id: 'rejected', label: 'Rejected', count: counts.rejected },
  ];
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
      {items.map((item, i) => {
        const active = filter === item.id;
        const dim = !active && item.count === 0;
        return (
          <span key={item.id} className="inline-flex items-baseline gap-3">
            {i > 0 && (
              <span aria-hidden className="text-text-muted/30">
                ·
              </span>
            )}
            <button
              type="button"
              onClick={() => onChange(item.id)}
              aria-pressed={active}
              className="group inline-flex cursor-pointer items-baseline gap-1.5 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/60"
            >
              <span
                className={`text-[13px] transition-colors ${
                  active
                    ? 'font-medium text-text-primary underline decoration-accent decoration-2 underline-offset-[5px]'
                    : dim
                      ? 'text-text-muted/50 group-hover:text-text-muted'
                      : 'text-text-muted group-hover:text-text-primary'
                }`}
                style={{ fontFamily: DISPLAY_FONT }}
              >
                {item.label}
              </span>
              <span
                className={`font-mono text-[10px] tabular-nums ${
                  active ? 'text-accent-text' : 'text-text-muted/70'
                }`}
              >
                {String(item.count).padStart(2, '0')}
              </span>
            </button>
          </span>
        );
      })}
    </div>
  );
}

const STATUS_CONFIG: Record<
  AdConcept['status'],
  { dot: string; text: string; label: string }
> = {
  approved: { dot: 'bg-accent',         text: 'text-accent-text', label: 'Approved' },
  rejected: { dot: 'bg-nz-coral',       text: 'text-nz-coral',    label: 'Rejected' },
  pending:  { dot: 'bg-text-muted/50',  text: 'text-text-muted',  label: 'Pending'  },
};

function StatusDot({ status }: { status: AdConcept['status'] }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      <span className={`text-[10px] font-medium ${cfg.text}`}>{cfg.label}</span>
    </span>
  );
}

interface CardProps {
  concept: AdConcept;
  commentCount: number;
  isRendering: boolean;
  onOpen: () => void;
  onApprove: () => void;
  onReject: () => void;
  onDelete: () => void;
  onRender: () => void;
}

function ConceptCard({
  concept,
  commentCount,
  isRendering,
  onOpen,
  onApprove,
  onReject,
  onDelete,
  onRender,
}: CardProps) {
  const imageUrl = concept.image_storage_path ? publicImageUrl(concept.image_storage_path) : null;

  return (
    <article className="group relative mb-4 break-inside-avoid">
      {/* Image — primary surface; clicking opens detail. Border + radius match
          the rest of the workspace; hover lifts the ring + scales subtly. */}
      <button
        type="button"
        onClick={onOpen}
        className="relative block w-full cursor-pointer overflow-hidden rounded-xl bg-surface-hover/60 text-left ring-1 ring-nativz-border/60 transition-all duration-300 hover:ring-accent/50"
        aria-label={`Open ${concept.headline}`}
      >
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={concept.headline}
            width={400}
            height={500}
            className="h-auto w-full object-cover transition-transform duration-500 group-hover:scale-[1.015]"
          />
        ) : (
          <div className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 px-4 text-center text-xs text-text-muted">
            <Wand2 size={20} />
            <span>No image yet</span>
          </div>
        )}

        {isRendering && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm">
            <span
              className="inline-flex items-center gap-2 text-white/95"
              style={{ fontFamily: DISPLAY_FONT, fontStyle: 'italic' }}
            >
              <Loader2 size={14} className="animate-spin" />
              <span className="text-[11px]">Rendering</span>
            </span>
          </div>
        )}

        {/* Top-left status pill — only visible when not pending, since pending
            is the implicit default and a dot adds visual noise on every card. */}
        {concept.status !== 'pending' && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${STATUS_CONFIG[concept.status].dot}`} />
            {STATUS_CONFIG[concept.status].label}
          </span>
        )}

        {/* Top-right comment count — also hidden when zero */}
        {commentCount > 0 && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[10px] tabular-nums text-white backdrop-blur-sm">
            <MessageSquare size={10} />
            {String(commentCount).padStart(2, '0')}
          </span>
        )}

        {/* Hover overlay — gradient strip across the bottom carrying slug +
            headline + actions. Stays out of the way until pointer hover so the
            grid reads as a contact sheet, not an admin table. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-3 pb-3 pt-8 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span className="font-mono text-[10px] uppercase tracking-wider text-white/60">
            {concept.slug}
          </span>
          <h3 className="line-clamp-2 text-[12px] font-medium leading-snug text-white">
            {concept.headline}
          </h3>
        </div>
      </button>

      {/* Hover action rail — anchored to bottom-right of the card so it
          floats above the gradient. Pointer-events scoped here so the rest of
          the gradient stays click-through to the open trigger. */}
      <div className="absolute bottom-2 right-2 flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <FloatingAction
          label="Approve"
          onClick={onApprove}
          active={concept.status === 'approved'}
          tone="accent"
        >
          <Check size={13} />
        </FloatingAction>
        <FloatingAction
          label="Reject"
          onClick={onReject}
          active={concept.status === 'rejected'}
          tone="coral"
        >
          <XIcon size={13} />
        </FloatingAction>
        <FloatingAction
          label={imageUrl ? 'Re-render image' : 'Render image'}
          onClick={onRender}
          disabled={isRendering}
        >
          <Wand2 size={13} />
        </FloatingAction>
        <FloatingAction label="View detail" onClick={onOpen}>
          <Eye size={13} />
        </FloatingAction>
        <FloatingAction label="Delete" onClick={onDelete} tone="coral-ghost">
          <Trash2 size={13} />
        </FloatingAction>
      </div>
    </article>
  );
}

function FloatingAction({
  label,
  onClick,
  children,
  active,
  disabled,
  tone,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  tone?: 'accent' | 'coral' | 'coral-ghost';
}) {
  const classes = active
    ? tone === 'coral'
      ? 'bg-nz-coral text-white'
      : 'bg-accent text-white'
    : tone === 'coral-ghost'
      ? 'bg-black/70 text-white/80 hover:bg-nz-coral hover:text-white'
      : 'bg-black/70 text-white/85 hover:bg-white hover:text-black';
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`pointer-events-auto flex h-7 w-7 cursor-pointer items-center justify-center rounded-full backdrop-blur-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${classes}`}
    >
      {children}
    </button>
  );
}

function ConceptDetailDialog({
  concept,
  comments,
  isRendering,
  onClose,
  onApprove,
  onReject,
  onDelete,
  onRender,
}: {
  concept: AdConcept;
  comments: ConceptComment[];
  isRendering: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onDelete: () => void;
  onRender: () => void;
}) {
  const imageUrl = concept.image_storage_path ? publicImageUrl(concept.image_storage_path) : null;

  return (
    <Dialog
      open
      onClose={onClose}
      title=""
      maxWidth="2xl"
      className="!max-w-4xl"
      bodyClassName="p-0 flex flex-col max-h-[calc(100vh-4rem)] overflow-hidden"
    >
      {/* Header — eyebrow with slug + template, headline as Jost display */}
      <div className="flex shrink-0 items-start gap-3 border-b border-nativz-border/50 px-6 py-5 pr-14">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
              {concept.slug}
            </span>
            <span aria-hidden className="text-text-muted/30">·</span>
            <span className="text-[11px] text-text-muted">
              {concept.template_name}
            </span>
            <span aria-hidden className="text-text-muted/30">·</span>
            <StatusDot status={concept.status} />
          </div>
          <h2
            className="text-[20px] font-semibold leading-tight text-text-primary"
            style={{ fontFamily: DISPLAY_FONT }}
            title={concept.headline}
          >
            {concept.headline}
          </h2>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
        {/* Image pane */}
        <div className="flex min-h-0 items-center justify-center bg-background p-5 md:border-r md:border-nativz-border/50">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={concept.headline}
              width={600}
              height={750}
              className="max-h-[520px] w-auto object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-text-muted">
              <Wand2 size={28} />
              <p className="text-sm">No image rendered yet.</p>
              <Button size="sm" onClick={onRender} disabled={isRendering}>
                {isRendering ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Wand2 size={13} />
                )}
                {isRendering ? 'Rendering…' : 'Render with Gemini'}
              </Button>
            </div>
          )}
        </div>

        {/* Detail pane */}
        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-6 py-5">
          {concept.body_copy && (
            <Section label="Body copy">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
                {concept.body_copy}
              </p>
            </Section>
          )}
          {concept.visual_description && (
            <Section label="Visual description">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
                {concept.visual_description}
              </p>
            </Section>
          )}
          <Section label="Source grounding">
            <p className="text-sm italic leading-relaxed text-text-secondary">
              {concept.source_grounding}
            </p>
          </Section>
          <Section label="Image prompt">
            <pre className="whitespace-pre-wrap break-words rounded-md border border-nativz-border/60 bg-background/80 px-3 py-2 font-mono text-[11px] leading-snug text-text-secondary">
              {concept.image_prompt}
            </pre>
          </Section>
          <Section label={`Client comments · ${String(comments.length).padStart(2, '0')}`}>
            {comments.length === 0 ? (
              <p className="text-[12px] text-text-muted">
                No feedback yet. Share the gallery with the client and their
                replies land here.
              </p>
            ) : (
              <ul className="space-y-3">
                {comments.map((c) => (
                  <li key={c.id} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <CommentDot kind={c.kind} />
                        <span className="text-[12px] font-medium text-text-primary">
                          {c.author_name}
                        </span>
                      </span>
                      <span className="font-mono text-[10px] tabular-nums text-text-muted">
                        {new Date(c.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-text-secondary">
                      {c.body}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      {/* Footer — Delete on the far left, Reject + Approve on the right */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-nativz-border/50 bg-surface/60 px-6 py-4">
        <Button variant="ghost" size="sm" onClick={onDelete}>
          <Trash2 size={13} />
          Delete concept
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant={concept.status === 'rejected' ? 'danger' : 'outline'}
            size="sm"
            onClick={onReject}
          >
            <XIcon size={13} />
            Reject
          </Button>
          <Button
            variant={concept.status === 'approved' ? 'primary' : 'outline'}
            size="sm"
            onClick={onApprove}
          >
            <Check size={13} />
            Approve
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function CommentDot({ kind }: { kind: ConceptComment['kind'] }) {
  const cls =
    kind === 'approval'
      ? 'bg-accent'
      : kind === 'rejection'
        ? 'bg-nz-coral'
        : 'bg-text-muted/40';
  return <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${cls}`} />;
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p
        className="text-[11px] italic tracking-wide text-text-muted"
        style={{ fontFamily: DISPLAY_FONT }}
      >
        {label}
      </p>
      {children}
    </div>
  );
}

function publicImageUrl(storagePath: string): string {
  try {
    const origin = new URL(getSupabaseUrl()).origin;
    return `${origin}/storage/v1/object/public/ad-creatives/${storagePath}`;
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Share dialog — create + revoke share links for the current client
// ---------------------------------------------------------------------------

interface ShareTokenRow {
  id: string;
  token: string;
  batch_id: string | null;
  label: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

function ShareDialog({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const [tokens, setTokens] = useState<ShareTokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState('');
  const [expiresInDays, setExpiresInDays] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/ad-creatives/share-links?clientId=${clientId}`, {
          cache: 'no-store',
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { shareTokens: ShareTokenRow[] };
        if (!cancelled) setTokens(data.shareTokens ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    try {
      const payload: Record<string, unknown> = { clientId };
      if (label.trim()) payload.label = label.trim();
      const days = Number.parseInt(expiresInDays, 10);
      if (Number.isFinite(days) && days > 0) payload.expiresInDays = days;

      const res = await fetch('/api/ad-creatives/share-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? 'Could not create share link');
        return;
      }
      const { shareToken } = (await res.json()) as { shareToken: ShareTokenRow };
      setTokens((prev) => [shareToken, ...prev]);
      setLabel('');
      setExpiresInDays('');
      toast.success('Share link ready — click Copy');
    } finally {
      setCreating(false);
    }
  }, [clientId, label, expiresInDays]);

  const handleRevoke = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/ad-creatives/share-links/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('revoke failed');
      setTokens((prev) =>
        prev.map((t) => (t.id === id ? { ...t, revoked_at: new Date().toISOString() } : t)),
      );
      toast.success('Share link revoked');
    } catch {
      toast.error('Could not revoke');
    }
  }, []);

  return (
    <Dialog
      open
      onClose={onClose}
      title=""
      maxWidth="2xl"
      bodyClassName="p-0 flex flex-col max-h-[calc(100vh-4rem)] overflow-hidden"
    >
      <div className="flex shrink-0 items-start gap-3 border-b border-nativz-border/50 px-6 py-5 pr-14">
        <div className="space-y-1">
          <p className="nz-eyebrow">Share with client</p>
          <h2
            className="text-[18px] font-semibold leading-tight text-text-primary"
            style={{ fontFamily: DISPLAY_FONT }}
          >
            Public review links
          </h2>
        </div>
      </div>

      <div className="shrink-0 space-y-3 border-b border-nativz-border/50 bg-surface/60 px-6 py-5">
        <p className="text-[12px] leading-relaxed text-text-muted">
          Creates a public URL for the whole concept gallery (pending +
          approved only — rejected stays internal). Anyone with the link can
          leave comments; they come back on each card.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional — e.g. Q2 testimonial drop)"
            className="min-w-0 flex-1 rounded-md border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20"
          />
          <input
            type="number"
            min={1}
            max={365}
            value={expiresInDays}
            onChange={(e) => setExpiresInDays(e.target.value)}
            placeholder="Expires in days"
            className="w-44 rounded-md border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20"
          />
          <Button onClick={() => void handleCreate()} disabled={creating}>
            {creating ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Share2 size={14} />
            )}
            Create link
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-text-muted">
            <Loader2 size={14} className="animate-spin" />
            <span style={{ fontFamily: DISPLAY_FONT, fontStyle: 'italic' }}>
              Loading share links…
            </span>
          </div>
        ) : tokens.length === 0 ? (
          <p className="py-12 text-center text-sm text-text-muted">
            No share links yet. Create one above.
          </p>
        ) : (
          <ul className="space-y-3">
            {tokens.map((t) => (
              <ShareTokenRowCard key={t.id} token={t} onRevoke={() => void handleRevoke(t.id)} />
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

function ShareTokenRowCard({
  token,
  onRevoke,
}: {
  token: ShareTokenRow;
  onRevoke: () => void;
}) {
  const url =
    typeof window !== 'undefined'
      ? `${window.location.origin}/shared/ad-creatives/${token.token}`
      : `/shared/ad-creatives/${token.token}`;
  const isDead =
    !!token.revoked_at || (!!token.expires_at && new Date(token.expires_at) < new Date());
  const status = token.revoked_at
    ? 'Revoked'
    : token.expires_at && new Date(token.expires_at) < new Date()
      ? 'Expired'
      : token.expires_at
        ? `Expires ${new Date(token.expires_at).toLocaleDateString()}`
        : 'No expiry';

  return (
    <li
      className={`rounded-lg border px-4 py-3 transition-colors ${
        isDead
          ? 'border-nativz-border/40 bg-surface/40 opacity-60'
          : 'border-nativz-border bg-background hover:border-accent/30'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-sm font-medium text-text-primary">
            {token.label ?? 'Shared gallery'}
          </p>
          <p className="truncate font-mono text-[11px] text-text-muted" title={url}>
            {url}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(url);
              toast.success('Copied');
            }}
            disabled={isDead}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            title="Copy URL"
          >
            <Copy size={12} />
          </button>
          {!isDead && (
            <button
              type="button"
              onClick={onRevoke}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-text-muted transition-colors hover:bg-nz-coral/10 hover:text-nz-coral"
              title="Revoke link"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 font-mono text-[10px] tabular-nums text-text-muted/80">
        {status} · Created {new Date(token.created_at).toLocaleString()}
      </p>
    </li>
  );
}
