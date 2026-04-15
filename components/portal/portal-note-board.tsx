'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Link2,
  Loader2,
  Plus,
  StickyNote,
  Trash2,
  Type,
  Sparkles,
  ExternalLink,
  Copy,
  Pencil,
} from 'lucide-react';
import { toast } from 'sonner';

interface ItemRow {
  id: string;
  board_id: string;
  type: 'video' | 'image' | 'website' | 'text';
  url: string | null;
  title: string | null;
  text_content: string | null;
  thumbnail_url: string | null;
  platform: string | null;
  author_name: string | null;
  author_handle: string | null;
  transcript: string | null;
  /** One-sentence "why the hook works" summary from /analyze. */
  hook_analysis: string | null;
  hook_type: string | null;
  hook_score: number | null;
  status: string | null;
  created_at: string;
}

interface PortalNoteBoardProps {
  boardId: string;
  /** Used for the back link and the board rename API. Title may update
   *  locally without re-hitting the server. */
  initialBoardName: string;
}

const POLL_INTERVAL_MS = 4_000;
const POLL_TIMEOUT_MS = 180_000; // give up after 3 minutes per item

function detectType(input: string): 'video' | 'website' | 'text' {
  const trimmed = input.trim();
  if (!/^https?:\/\//i.test(trimmed)) return 'text';
  try {
    const u = new URL(trimmed);
    const host = u.hostname.toLowerCase();
    const videoHosts = [
      'tiktok.com', 'www.tiktok.com', 'vm.tiktok.com',
      'instagram.com', 'www.instagram.com',
      'youtube.com', 'www.youtube.com', 'youtu.be',
      'facebook.com', 'www.facebook.com', 'fb.watch',
    ];
    return videoHosts.some((h) => host === h || host.endsWith(`.${h}`)) ? 'video' : 'website';
  } catch {
    return 'text';
  }
}

export function PortalNoteBoard({ boardId, initialBoardName }: PortalNoteBoardProps) {
  const [boardName, setBoardName] = useState(initialBoardName);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(initialBoardName);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const pollersRef = useRef<Map<string, number>>(new Map());

  const loadItems = useCallback(async () => {
    const res = await fetch(`/api/analysis/boards/${boardId}`);
    if (!res.ok) {
      toast.error('Could not load this note');
      return;
    }
    const data = await res.json();
    const rows = (data.items ?? []) as ItemRow[];
    rows.sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
    setItems(rows);
    setLoading(false);
  }, [boardId]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  // Per-item polling: any item missing transcript or hook analysis gets a
  // periodic GET until it arrives or we time out. Matches how the admin
  // canvas waits for the analysis pipeline to catch up.
  useEffect(() => {
    const activePollers = pollersRef.current;
    for (const item of items) {
      if (item.type !== 'video') continue;
      const fullyProcessed = Boolean(item.transcript && item.hook_analysis);
      if (fullyProcessed || activePollers.has(item.id)) continue;

      const startedAt = Date.now();
      const handle = window.setInterval(async () => {
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          window.clearInterval(activePollers.get(item.id));
          activePollers.delete(item.id);
          return;
        }
        try {
          const res = await fetch(`/api/analysis/items/${item.id}`);
          if (!res.ok) return;
          const fresh = (await res.json()) as ItemRow;
          if (fresh.transcript && fresh.hook_analysis) {
            window.clearInterval(activePollers.get(item.id));
            activePollers.delete(item.id);
            setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, ...fresh } : it)));
          } else {
            setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, ...fresh } : it)));
          }
        } catch {
          /* transient — next tick will retry */
        }
      }, POLL_INTERVAL_MS);

      activePollers.set(item.id, handle);
    }

    return () => {
      // Poll handles keep running across renders until the item resolves or
      // the component unmounts. Only clear on unmount.
    };
  }, [items]);

  useEffect(() => {
    const pollers = pollersRef.current;
    return () => {
      for (const id of pollers.keys()) {
        window.clearInterval(pollers.get(id));
      }
      pollers.clear();
    };
  }, []);

  async function submit(typeHint?: 'text' | 'video' | 'website') {
    const trimmed = input.trim();
    if (!trimmed || submitting) return;
    const type = typeHint ?? detectType(trimmed);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { board_id: boardId, type };
      if (type === 'text') body.text_content = trimmed;
      else body.url = trimmed;

      const res = await fetch('/api/analysis/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error ?? 'Could not add that to your note');
        return;
      }
      setInput('');
      await loadItems();
      if (type === 'video') {
        toast.success('Pulling transcript + hook analysis…');
      }
    } catch {
      toast.error('Could not add that to your note');
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteItem(id: string) {
    const prev = items;
    setItems((s) => s.filter((it) => it.id !== id));
    const res = await fetch(`/api/analysis/items/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setItems(prev);
      toast.error('Delete failed');
    }
  }

  async function saveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === boardName) {
      setEditingName(false);
      setNameDraft(boardName);
      return;
    }
    const res = await fetch(`/api/analysis/boards/${boardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    });
    if (res.ok) {
      setBoardName(trimmed);
      setEditingName(false);
    } else {
      toast.error('Rename failed');
    }
  }

  const detectedType = useMemo(() => detectType(input), [input]);

  return (
    <div className="cortex-page-gutter max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/portal/notes"
          className="text-text-muted hover:text-text-secondary transition-colors"
          aria-label="Back to notes"
        >
          <ArrowLeft size={18} />
        </Link>
        {editingName ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => void saveName()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveName();
              if (e.key === 'Escape') {
                setEditingName(false);
                setNameDraft(boardName);
              }
            }}
            className="flex-1 rounded-md bg-transparent border-b border-nativz-border px-1 py-0.5 text-xl font-semibold text-text-primary focus:outline-none focus:border-accent/40"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setNameDraft(boardName);
              setEditingName(true);
            }}
            className="flex items-center gap-2 min-w-0 flex-1 text-left group"
          >
            <StickyNote size={18} className="text-accent-text shrink-0" />
            <span className="truncate text-xl font-semibold text-text-primary">{boardName}</span>
            <Pencil size={12} className="shrink-0 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        )}
      </div>

      {/* Composer */}
      <div className="rounded-xl border border-nativz-border bg-surface p-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !submitting) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={2}
          placeholder="Paste a TikTok, Instagram, YouTube, or Facebook URL — or type a note"
          className="w-full resize-none rounded-md bg-transparent px-2 py-1.5 text-sm text-text-primary placeholder:text-text-muted/60 focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-text-muted">
            {detectedType === 'text' && input.trim() ? (
              <>
                <Type size={12} /> Text note
              </>
            ) : detectedType === 'video' ? (
              <>
                <Link2 size={12} /> Video — we&apos;ll pull transcript + hook analysis
              </>
            ) : detectedType === 'website' && input.trim() ? (
              <>
                <Link2 size={12} /> Link
              </>
            ) : (
              <span className="opacity-70">⌘+Enter to add</span>
            )}
          </span>
          <button
            type="button"
            disabled={submitting || !input.trim()}
            onClick={() => void submit()}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {submitting ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            Add
          </button>
        </div>
      </div>

      {/* Feed */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-surface-elevated animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-nativz-border bg-surface/40 px-6 py-12 text-center">
          <p className="text-sm text-text-muted">
            Paste a TikTok or Instagram URL above to pull the transcript and hook breakdown. Plain text notes work too.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) =>
            item.type === 'text' ? (
              <TextItemCard key={item.id} item={item} onDelete={() => void deleteItem(item.id)} />
            ) : (
              <VideoItemCard key={item.id} item={item} onDelete={() => void deleteItem(item.id)} />
            ),
          )}
        </div>
      )}

    </div>
  );
}

function TextItemCard({ item, onDelete }: { item: ItemRow; onDelete: () => void }) {
  return (
    <div className="group rounded-xl border border-nativz-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-primary">
          {item.text_content ?? ''}
        </p>
        <button
          type="button"
          onClick={onDelete}
          className="shrink-0 rounded p-1 text-text-muted hover:bg-surface-hover hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Delete note"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

function VideoItemCard({ item, onDelete }: { item: ItemRow; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const hookScore = item.hook_score ?? null;
  const transcriptReady = Boolean(item.transcript);
  const hookReady = Boolean(item.hook_analysis) || Boolean(item.hook_type);

  return (
    <div className="group rounded-xl border border-nativz-border bg-surface overflow-hidden">
      <div className="flex gap-3 p-3">
        {item.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbnail_url}
            alt=""
            className="h-28 w-20 shrink-0 rounded-md object-cover bg-surface-elevated"
          />
        ) : (
          <div className="h-28 w-20 shrink-0 rounded-md bg-surface-elevated" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-text-primary line-clamp-2">
              {item.title ?? 'Untitled video'}
            </p>
            <button
              type="button"
              onClick={onDelete}
              className="shrink-0 rounded p-1 text-text-muted hover:bg-surface-hover hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Delete video"
            >
              <Trash2 size={13} />
            </button>
          </div>
          <p className="mt-0.5 text-xs text-text-muted truncate">
            {item.platform ?? 'video'}
            {item.author_handle ? ` · @${item.author_handle}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-text-muted">
            {item.url ? (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-text-secondary transition-colors"
              >
                <ExternalLink size={11} />
                Open
              </a>
            ) : null}
            {hookScore != null ? (
              <span className="inline-flex items-center gap-1 text-accent-text">
                <Sparkles size={11} />
                Hook score {hookScore}/10
              </span>
            ) : null}
            {!transcriptReady || !hookReady ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 size={11} className="animate-spin" />
                {transcriptReady ? 'Analyzing hook…' : 'Transcribing…'}
              </span>
            ) : null}
          </div>
          {transcriptReady ? (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="mt-2 text-xs font-medium text-accent-text hover:underline"
            >
              {open ? 'Hide breakdown' : 'Show transcript + hook'}
            </button>
          ) : null}
        </div>
      </div>

      {open && transcriptReady ? (
        <div className="border-t border-nativz-border/40 bg-background/40 px-3 py-3 space-y-3">
          {hookReady ? (
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">
                Hook analysis
              </h4>
              <dl className="text-xs text-text-secondary space-y-1">
                {item.hook_type ? (
                  <div>
                    <dt className="inline text-text-muted">Type: </dt>
                    <dd className="inline">{item.hook_type}</dd>
                  </div>
                ) : null}
                {item.hook_score != null ? (
                  <div>
                    <dt className="inline text-text-muted">Score: </dt>
                    <dd className="inline">{item.hook_score}/10</dd>
                  </div>
                ) : null}
                {item.hook_analysis ? (
                  <div>
                    <dt className="inline text-text-muted">Why it works: </dt>
                    <dd className="inline">{item.hook_analysis}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}
          <section>
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Transcript
              </h4>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(item.transcript ?? '');
                  toast.success('Transcript copied');
                }}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-text-muted hover:bg-surface-hover hover:text-text-secondary"
              >
                <Copy size={11} />
                Copy
              </button>
            </div>
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-text-secondary">
              {item.transcript}
            </p>
          </section>
        </div>
      ) : null}
    </div>
  );
}
