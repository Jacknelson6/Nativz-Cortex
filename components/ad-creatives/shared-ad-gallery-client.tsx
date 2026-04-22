'use client';

import { useCallback, useMemo, useState } from 'react';
import Image from 'next/image';
import { MessageSquare, ThumbsUp, ThumbsDown, Send, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SharedComment {
  id: string;
  concept_id: string;
  author_name: string;
  body: string;
  kind: 'comment' | 'approval' | 'rejection';
  created_at: string;
}

export interface SharedConcept {
  id: string;
  slug: string;
  template_name: string;
  headline: string;
  body_copy: string | null;
  visual_description: string | null;
  source_grounding: string;
  image_storage_path: string | null;
  status: 'pending' | 'approved' | 'rejected';
  position: number;
  created_at: string;
  comments: SharedComment[];
}

interface Props {
  token: string;
  clientName: string;
  label: string | null;
  supabaseOrigin: string;
  initialConcepts: SharedConcept[];
}

const AUTHOR_STORAGE_KEY = 'cortex:shared-ad-gallery:author';

/**
 * Client-facing gallery rendered at /shared/ad-creatives/[token]. Anyone
 * with the link can browse the batch and leave per-concept comments
 * (typed reply + thumbs-up / thumbs-down quick actions). The admin
 * sweeps comments back in via the admin gallery or chat commands.
 *
 * No auth — the page already validated the token server-side. The
 * author_name is persisted in localStorage after the first comment so
 * repeat commenters don't re-enter it.
 */
export function SharedAdGalleryClient({
  token,
  clientName,
  label,
  supabaseOrigin,
  initialConcepts,
}: Props) {
  const [concepts, setConcepts] = useState<SharedConcept[]>(initialConcepts);
  const [openId, setOpenId] = useState<string | null>(null);
  const [savedAuthor, setSavedAuthor] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(AUTHOR_STORAGE_KEY) ?? '';
  });

  const openConcept = useMemo(
    () => concepts.find((c) => c.id === openId) ?? null,
    [concepts, openId],
  );

  const handleComment = useCallback(
    async (
      conceptId: string,
      body: string,
      kind: SharedComment['kind'],
      authorName: string,
    ) => {
      const trimmedAuthor = authorName.trim();
      const trimmedBody = body.trim();
      if (!trimmedAuthor) {
        toast.error('Add your name first');
        return false;
      }
      if (!trimmedBody) {
        toast.error('Write something before sending');
        return false;
      }

      try {
        const res = await fetch(`/api/shared/ad-creatives/${token}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conceptId,
            authorName: trimmedAuthor,
            body: trimmedBody,
            kind,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          toast.error(err?.error ?? 'Could not send — try again');
          return false;
        }
        const { comment } = (await res.json()) as { comment: SharedComment };
        setConcepts((prev) =>
          prev.map((c) =>
            c.id === conceptId ? { ...c, comments: [...c.comments, comment] } : c,
          ),
        );
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(AUTHOR_STORAGE_KEY, trimmedAuthor);
          setSavedAuthor(trimmedAuthor);
        }
        return true;
      } catch {
        toast.error('Could not send — check your connection and retry');
        return false;
      }
    },
    [token],
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-nativz-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-text-muted">
              Ad concept review
            </p>
            <h1 className="mt-0.5 text-xl font-semibold text-text-primary">
              {clientName}
            </h1>
            {label && <p className="mt-0.5 text-sm text-text-muted">{label}</p>}
          </div>
          <div className="text-right text-[11px] text-text-muted">
            <p>{concepts.length} concepts</p>
            <p className="mt-0.5">
              Leave a comment on any card — the team sees them in real time.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-6">
        {concepts.length === 0 ? (
          <div className="rounded-xl border border-nativz-border bg-surface p-10 text-center">
            <p className="text-sm text-text-muted">
              No concepts have been shared yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {concepts.map((concept) => (
              <SharedCard
                key={concept.id}
                concept={concept}
                supabaseOrigin={supabaseOrigin}
                savedAuthor={savedAuthor}
                onOpen={() => setOpenId(concept.id)}
                onQuickReact={async (kind) => {
                  const author = savedAuthor.trim() || 'Reviewer';
                  const body = kind === 'approval' ? '👍 approved' : '👎 rejected';
                  await handleComment(concept.id, body, kind, author);
                }}
              />
            ))}
          </div>
        )}
      </main>

      {openConcept && (
        <SharedDetailDialog
          concept={openConcept}
          supabaseOrigin={supabaseOrigin}
          savedAuthor={savedAuthor}
          onClose={() => setOpenId(null)}
          onComment={(body, authorName) =>
            handleComment(openConcept.id, body, 'comment', authorName)
          }
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function SharedCard({
  concept,
  supabaseOrigin,
  savedAuthor,
  onOpen,
  onQuickReact,
}: {
  concept: SharedConcept;
  supabaseOrigin: string;
  savedAuthor: string;
  onOpen: () => void;
  onQuickReact: (kind: 'approval' | 'rejection') => Promise<void>;
}) {
  const [reacting, setReacting] = useState<'approval' | 'rejection' | null>(null);
  const imageUrl = concept.image_storage_path
    ? buildImageUrl(supabaseOrigin, concept.image_storage_path)
    : null;
  const approvalCount = concept.comments.filter((c) => c.kind === 'approval').length;
  const rejectionCount = concept.comments.filter((c) => c.kind === 'rejection').length;
  const commentCount = concept.comments.filter((c) => c.kind === 'comment').length;

  const handleQuick = async (kind: 'approval' | 'rejection') => {
    setReacting(kind);
    try {
      await onQuickReact(kind);
    } finally {
      setReacting(null);
    }
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-nativz-border bg-surface">
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
          <div className="flex h-full w-full items-center justify-center px-4 text-center text-xs text-text-muted">
            Image not yet rendered.
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-accent/80 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
          {concept.slug}
        </span>
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
        {concept.body_copy && (
          <p className="line-clamp-2 text-[12px] text-text-secondary">
            {concept.body_copy}
          </p>
        )}

        <div className="mt-auto flex items-center gap-1 pt-2 text-[11px] text-text-muted">
          <button
            type="button"
            onClick={() => void handleQuick('approval')}
            disabled={reacting !== null}
            title="Like — tells the team this one works"
            className="flex items-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-emerald-500/10 hover:text-emerald-300 disabled:opacity-50"
          >
            {reacting === 'approval' ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <ThumbsUp size={12} />
            )}
            {approvalCount > 0 && <span>{approvalCount}</span>}
          </button>
          <button
            type="button"
            onClick={() => void handleQuick('rejection')}
            disabled={reacting !== null}
            title="Not quite — tells the team to revise or skip"
            className="flex items-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
          >
            {reacting === 'rejection' ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <ThumbsDown size={12} />
            )}
            {rejectionCount > 0 && <span>{rejectionCount}</span>}
          </button>
          <button
            type="button"
            onClick={onOpen}
            className="flex items-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            <MessageSquare size={12} />
            {commentCount > 0 ? <span>{commentCount}</span> : <span>Comment</span>}
          </button>
          {savedAuthor && (
            <span className="ml-auto truncate text-[10px] text-text-muted/60">
              as {savedAuthor}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail dialog
// ---------------------------------------------------------------------------

function SharedDetailDialog({
  concept,
  supabaseOrigin,
  savedAuthor,
  onClose,
  onComment,
}: {
  concept: SharedConcept;
  supabaseOrigin: string;
  savedAuthor: string;
  onClose: () => void;
  onComment: (body: string, authorName: string) => Promise<boolean>;
}) {
  const [authorName, setAuthorName] = useState(savedAuthor);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const imageUrl = concept.image_storage_path
    ? buildImageUrl(supabaseOrigin, concept.image_storage_path)
    : null;

  const handleSend = async () => {
    setSubmitting(true);
    try {
      const ok = await onComment(body, authorName);
      if (ok) setBody('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-nativz-border bg-surface shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-nativz-border/50 px-5 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text-primary">
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
            <X size={16} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[1fr,340px]">
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
              <div className="px-6 text-center text-sm text-text-muted">
                Image not yet rendered.
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-col overflow-hidden">
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {concept.body_copy && (
                <Section label="Body copy">
                  <p className="whitespace-pre-wrap text-[13px] text-text-secondary">
                    {concept.body_copy}
                  </p>
                </Section>
              )}
              {concept.visual_description && (
                <Section label="Visual description">
                  <p className="whitespace-pre-wrap text-[13px] text-text-secondary">
                    {concept.visual_description}
                  </p>
                </Section>
              )}
              <Section label={`Comments · ${concept.comments.length}`}>
                {concept.comments.length === 0 ? (
                  <p className="text-[12px] text-text-muted">
                    No comments yet. Leave a thought for the team.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {concept.comments.map((c) => (
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

            <div className="shrink-0 space-y-2 border-t border-nativz-border/50 bg-surface/60 px-4 py-3">
              <input
                type="text"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-md border border-nativz-border bg-background px-2.5 py-1.5 text-[12px] text-text-primary placeholder:text-text-muted focus:border-accent/40 focus:outline-none"
              />
              <div className="flex items-end gap-2">
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  rows={2}
                  placeholder="Leave a comment…"
                  className="min-h-[44px] flex-1 resize-y rounded-md border border-nativz-border bg-background px-2.5 py-1.5 text-[12px] text-text-primary placeholder:text-text-muted focus:border-accent/40 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={submitting || !body.trim() || !authorName.trim()}
                  className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
                  aria-label="Send comment"
                >
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </div>
            </div>
          </div>
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

function buildImageUrl(supabaseOrigin: string, storagePath: string): string {
  if (!supabaseOrigin) return '';
  return `${supabaseOrigin}/storage/v1/object/public/ad-creatives/${storagePath}`;
}
