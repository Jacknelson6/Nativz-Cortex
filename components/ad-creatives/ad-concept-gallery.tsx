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

/**
 * Concept gallery. Renders every row in the current batch set as a card
 * with quick actions (approve / reject / regenerate image / delete) plus
 * a detail dialog for full copy inspection.
 *
 * Phase 2a uses optimistic updates for status changes and deletes — the
 * parent workspace holds the concept list and mutates it in response to
 * child callbacks.
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
    return (
      <div className="rounded-xl border border-dashed border-nativz-border bg-surface/40 p-10 text-center">
        <p className="text-sm text-text-muted">
          No concepts yet. Head to the Chat tab and describe the batch you want.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <FilterChip
            label={`All · ${counts.all}`}
            active={filter === 'all'}
            onClick={() => setFilter('all')}
          />
          <FilterChip
            label={`Pending · ${counts.pending}`}
            active={filter === 'pending'}
            onClick={() => setFilter('pending')}
            dim={counts.pending === 0}
          />
          <FilterChip
            label={`Approved · ${counts.approved}`}
            active={filter === 'approved'}
            onClick={() => setFilter('approved')}
            dim={counts.approved === 0}
          />
          <FilterChip
            label={`Rejected · ${counts.rejected}`}
            active={filter === 'rejected'}
            onClick={() => setFilter('rejected')}
            dim={counts.rejected === 0}
          />
        </div>
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover"
        >
          <Share2 size={14} />
          Share with client
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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

function FilterChip({
  label,
  active,
  onClick,
  dim,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  dim?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
        active
          ? 'bg-accent-surface text-accent-text'
          : dim
            ? 'text-text-muted/50 hover:bg-surface-hover hover:text-text-muted'
            : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
      }`}
    >
      {label}
    </button>
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
  const statusColor =
    concept.status === 'approved'
      ? 'text-emerald-400 border-emerald-400/30 bg-emerald-500/10'
      : concept.status === 'rejected'
        ? 'text-red-400 border-red-400/30 bg-red-500/10'
        : 'text-text-muted border-nativz-border bg-surface-hover/60';

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-nativz-border bg-surface">
      <button
        type="button"
        onClick={onOpen}
        className="relative block aspect-[4/5] w-full cursor-pointer overflow-hidden bg-surface-hover text-left"
      >
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={concept.headline}
            width={400}
            height={500}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center text-xs text-text-muted">
            <Wand2 size={22} />
            <span>No image yet — click Render to fire Gemini.</span>
          </div>
        )}
        {isRendering && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-1.5 text-white/90">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-[11px] font-medium">Rendering…</span>
            </div>
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-accent/80 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
          {concept.slug}
        </span>
        <span
          className={`absolute right-2 top-2 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusColor}`}
        >
          {concept.status}
        </span>
        {commentCount > 0 && (
          <span
            className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-accent-surface/90 px-2 py-0.5 text-[10px] font-semibold text-accent-text shadow-sm"
            title={`${commentCount} comment${commentCount === 1 ? '' : 's'}`}
          >
            <MessageSquare size={10} />
            {commentCount}
          </span>
        )}
      </button>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-text-muted/70">
            {concept.template_name}
          </p>
          <p className="mt-0.5 line-clamp-2 text-sm font-semibold text-text-primary">
            {concept.headline}
          </p>
        </div>
        {concept.source_grounding && (
          <p className="line-clamp-2 text-[11px] italic text-text-muted">
            {concept.source_grounding}
          </p>
        )}
        <div className="mt-auto flex items-center gap-1 pt-2">
          <IconButton
            label="Approve"
            onClick={onApprove}
            active={concept.status === 'approved'}
            tone="emerald"
          >
            <Check size={14} />
          </IconButton>
          <IconButton
            label="Reject"
            onClick={onReject}
            active={concept.status === 'rejected'}
            tone="red"
          >
            <XIcon size={14} />
          </IconButton>
          <IconButton
            label={imageUrl ? 'Re-render image' : 'Render image'}
            onClick={onRender}
            disabled={isRendering}
          >
            <Wand2 size={14} />
          </IconButton>
          <IconButton label="View detail" onClick={onOpen}>
            <Eye size={14} />
          </IconButton>
          <div className="flex-1" />
          <IconButton label="Delete" onClick={onDelete} tone="red">
            <Trash2 size={14} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

function IconButton({
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
  tone?: 'emerald' | 'red';
}) {
  const toneClasses = active
    ? tone === 'emerald'
      ? 'bg-emerald-500/20 text-emerald-300'
      : tone === 'red'
        ? 'bg-red-500/20 text-red-300'
        : 'bg-accent-surface text-accent-text'
    : 'text-text-muted hover:bg-surface-hover hover:text-text-primary';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-md transition-colors disabled:opacity-50 ${toneClasses}`}
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-nativz-border bg-surface shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-nativz-border/50 px-5 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text-primary" title={concept.headline}>
              {concept.slug} · {concept.headline}
            </p>
            <p className="truncate text-[11px] text-text-muted">
              {concept.template_name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
            aria-label="Close"
          >
            <XIcon size={16} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
          <div className="flex min-h-0 items-center justify-center bg-background p-4 md:border-r md:border-nativz-border/50">
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
                <Wand2 size={32} />
                <p className="text-sm">No image rendered yet.</p>
                <button
                  type="button"
                  onClick={onRender}
                  disabled={isRendering}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
                >
                  {isRendering ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                  {isRendering ? 'Rendering…' : 'Render with Gemini'}
                </button>
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-5 py-4">
            {concept.body_copy && (
              <Section label="Body copy">
                <p className="whitespace-pre-wrap text-sm text-text-secondary">
                  {concept.body_copy}
                </p>
              </Section>
            )}
            {concept.visual_description && (
              <Section label="Visual description">
                <p className="whitespace-pre-wrap text-sm text-text-secondary">
                  {concept.visual_description}
                </p>
              </Section>
            )}
            <Section label="Source grounding">
              <p className="text-sm italic text-text-secondary">{concept.source_grounding}</p>
            </Section>
            <Section label="Image prompt">
              <pre className="whitespace-pre-wrap break-words rounded-md bg-background/80 p-2 font-mono text-[11px] leading-snug text-text-secondary">
                {concept.image_prompt}
              </pre>
            </Section>
            <Section label={`Client comments · ${comments.length}`}>
              {comments.length === 0 ? (
                <p className="text-[12px] text-text-muted">
                  No feedback yet. Share the gallery with the client and their replies land here.
                </p>
              ) : (
                <div className="space-y-2">
                  {comments.map((c) => (
                    <div
                      key={c.id}
                      className={`rounded-md border px-2.5 py-2 text-[12px] ${
                        c.kind === 'approval'
                          ? 'border-emerald-500/30 bg-emerald-500/5'
                          : c.kind === 'rejection'
                            ? 'border-red-500/30 bg-red-500/5'
                            : 'border-nativz-border bg-background'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[10px] text-text-muted">
                        <span className="font-semibold text-text-primary">
                          {c.author_name}
                        </span>
                        <span>{new Date(c.created_at).toLocaleString()}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-text-secondary">
                        {c.body}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-nativz-border/50 bg-surface/60 px-5 py-3">
          <button
            type="button"
            onClick={onReject}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              concept.status === 'rejected'
                ? 'bg-red-500/20 text-red-300'
                : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <XIcon size={14} /> Reject
          </button>
          <button
            type="button"
            onClick={onApprove}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              concept.status === 'approved'
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <Check size={14} /> Approve
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-text-muted transition-colors hover:bg-red-500/10 hover:text-red-400"
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-nativz-border bg-surface shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-nativz-border/50 px-5 py-3">
          <p className="text-sm font-semibold text-text-primary">Share with client</p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
            aria-label="Close"
          >
            <XIcon size={16} />
          </button>
        </div>

        <div className="shrink-0 space-y-2 border-b border-nativz-border/50 bg-surface/60 px-5 py-4">
          <p className="text-xs text-text-muted">
            Creates a public URL for the whole concept gallery (pending +
            approved only — rejected stays internal). Anyone with the link
            can leave comments; they come back on each card.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (optional — e.g. 'Q2 testimonial drop')"
              className="flex-1 rounded-md border border-nativz-border bg-background px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/40 focus:outline-none"
            />
            <input
              type="number"
              min={1}
              max={365}
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
              placeholder="Expires in days"
              className="w-40 rounded-md border border-nativz-border bg-background px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/40 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
              Create link
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-text-muted">
              <Loader2 size={14} className="animate-spin" />
              Loading share links…
            </div>
          ) : tokens.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-muted">
              No share links yet. Create one above.
            </p>
          ) : (
            <div className="space-y-2">
              {tokens.map((t) => (
                <ShareTokenRowCard key={t.id} token={t} onRevoke={() => void handleRevoke(t.id)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
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
  const isDead = !!token.revoked_at || (!!token.expires_at && new Date(token.expires_at) < new Date());
  const status = token.revoked_at
    ? 'Revoked'
    : token.expires_at && new Date(token.expires_at) < new Date()
      ? 'Expired'
      : token.expires_at
        ? `Expires ${new Date(token.expires_at).toLocaleDateString()}`
        : 'No expiry';

  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        isDead ? 'border-nativz-border/40 bg-surface/40 opacity-60' : 'border-nativz-border bg-background'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">
            {token.label ?? 'Shared gallery'}
          </p>
          <p className="mt-0.5 truncate font-mono text-[11px] text-text-muted" title={url}>
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
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
            title="Copy URL"
          >
            <Copy size={12} />
          </button>
          {!isDead && (
            <button
              type="button"
              onClick={onRevoke}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors hover:bg-red-500/10 hover:text-red-400"
              title="Revoke link"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
      <p className="mt-1 text-[10px] text-text-muted">
        {status} · Created {new Date(token.created_at).toLocaleString()}
      </p>
    </div>
  );
}
