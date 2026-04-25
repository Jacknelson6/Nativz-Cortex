'use client';

import { useCallback, useRef, useState } from 'react';
import { ImagePlus, Loader2, Send, Wrench, AlertCircle, FileText } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Inline chat for /admin/proposals/builder. Single-turn (non-streaming)
 * — the admin types, we POST to /api/admin/proposals/builder/chat,
 * the LLM loops tool calls server-side until it returns plain text,
 * we render the assistant message + a "what changed" tool log under it.
 *
 * Drop zone for images / .md files goes through the existing draft
 * upload-image / blocks endpoints (NOT through chat) — the chat agent
 * doesn't need to see the file bytes; it just gets a "user dropped
 * <name>" system note next turn.
 *
 * onDraftMutated() bumps the parent's preview-iframe key so the right
 * pane re-renders after every assistant turn that ran a tool.
 */

type Msg =
  | { role: 'user'; content: string; id: string }
  | { role: 'assistant'; content: string; id: string; tool_events?: ToolEvent[] }
  | { role: 'system_note'; content: string; id: string };

type ToolEvent = { tool: string; success: boolean; error?: string };

// History entries we send back to the API. Matches the server schema.
type HistoryEntry =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string };

export function ProposalBuilderChat({
  draftId,
  agencyName,
  onDraftMutated,
  initialPrompt,
}: {
  draftId: string;
  agencyName: string;
  onDraftMutated: () => void;
  initialPrompt?: string;
}) {
  const [messages, setMessages] = useState<Msg[]>(() =>
    initialPrompt
      ? [
          {
            role: 'system_note',
            id: 'sys-init',
            content: initialPrompt,
          },
        ]
      : [],
  );
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth' }));
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setDraft('');
      const userMsg: Msg = { role: 'user', id: `u-${Date.now()}`, content: trimmed };
      setMessages((m) => [...m, userMsg]);
      const nextHistory: HistoryEntry[] = [...history, { role: 'user', content: trimmed }];
      setBusy(true);
      scrollToEnd();
      try {
        const res = await fetch('/api/admin/proposals/builder/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ draft_id: draftId, message: trimmed, history }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(json.error || `failed (${res.status})`);
        }
        const assistant = String(json.assistant ?? '');
        const tool_events = (json.tool_events ?? []) as ToolEvent[];
        setMessages((m) => [
          ...m,
          { role: 'assistant', id: `a-${Date.now()}`, content: assistant, tool_events },
        ]);
        setHistory([...nextHistory, { role: 'assistant', content: assistant }]);
        if (tool_events.some((t) => t.success)) onDraftMutated();
      } catch (err) {
        toast.error('Chat failed', { description: err instanceof Error ? err.message : undefined });
      } finally {
        setBusy(false);
        scrollToEnd();
      }
    },
    [busy, draftId, history, onDraftMutated, scrollToEnd],
  );

  // Drop / browse: image → upload to /upload-image then /blocks.
  // .md → /blocks directly. The chat agent doesn't see the bytes; we
  // append a system_note so the conversation log makes sense.
  const handleFile = useCallback(
    async (f: File) => {
      setBusy(true);
      try {
        if (f.type.startsWith('image/')) {
          const form = new FormData();
          form.append('file', f);
          const upRes = await fetch(`/api/admin/proposals/drafts/${draftId}/upload-image`, {
            method: 'POST',
            body: form,
          });
          if (!upRes.ok) throw new Error((await upRes.json().catch(() => ({}))).error || 'upload failed');
          const { url } = (await upRes.json()) as { url: string };
          await fetch(`/api/admin/proposals/drafts/${draftId}/blocks`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ kind: 'image', content: url }),
          });
          setMessages((m) => [
            ...m,
            { role: 'system_note', id: `sn-${Date.now()}`, content: `📎 Image inserted: ${f.name}` },
          ]);
          onDraftMutated();
          toast.success(`${f.name} added to the proposal`);
        } else if (f.type === 'text/markdown' || f.name.endsWith('.md')) {
          const text = await f.text();
          const r = await fetch(`/api/admin/proposals/drafts/${draftId}/blocks`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ kind: 'markdown', content: text }),
          });
          if (!r.ok) throw new Error('markdown insert failed');
          setMessages((m) => [
            ...m,
            { role: 'system_note', id: `sn-${Date.now()}`, content: `📝 Markdown inserted: ${f.name}` },
          ]);
          onDraftMutated();
          toast.success(`${f.name} added`);
        } else {
          toast.error('Drop an image or .md file');
        }
      } catch (err) {
        toast.error('Insert failed', { description: err instanceof Error ? err.message : undefined });
      } finally {
        setBusy(false);
        scrollToEnd();
      }
    },
    [draftId, onDraftMutated, scrollToEnd],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files?.[0];
      if (f) void handleFile(f);
    },
    [handleFile],
  );

  return (
    <div
      className="flex h-full flex-col"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 ? (
          <EmptyState agencyName={agencyName} onPick={send} busy={busy} />
        ) : (
          messages.map((m) => <Message key={m.id} msg={m} />)
        )}
        {busy && (
          <div className="flex items-center gap-2 text-[12px] text-text-muted">
            <Loader2 size={12} className="animate-spin" />
            Working…
          </div>
        )}
        <div ref={scrollAnchorRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-nativz-border bg-surface/60 p-3">
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="shrink-0 rounded-lg border border-nativz-border bg-background hover:bg-surface-hover p-2 text-text-muted"
            title="Drop or click to attach an image / .md"
          >
            <ImagePlus size={14} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,text/markdown,.md"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = '';
            }}
          />
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
            placeholder="Describe what to add or change…"
            rows={2}
            disabled={busy}
            className="flex-1 resize-none rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void send(draft)}
            disabled={busy || !draft.trim()}
            className="shrink-0 rounded-lg bg-accent-surface text-accent-text px-3 py-2 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-text-muted/70">
          Drop images or .md files anywhere in this pane to inline them in the proposal. Shift+Enter for newline.
        </p>
      </div>
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────

function Message({ msg }: { msg: Msg }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-accent-surface text-text-primary px-3.5 py-2 text-sm whitespace-pre-wrap">
          {msg.content}
        </div>
      </div>
    );
  }
  if (msg.role === 'system_note') {
    return (
      <div className="text-[11px] text-text-muted italic flex items-center gap-1.5">
        <FileText size={11} />
        {msg.content}
      </div>
    );
  }
  // assistant
  return (
    <div className="space-y-1.5">
      {msg.tool_events && msg.tool_events.length > 0 && (
        <ul className="space-y-0.5">
          {msg.tool_events.map((t, i) => (
            <li
              key={i}
              className={`flex items-center gap-1.5 text-[11px] ${
                t.success ? 'text-emerald-300' : 'text-red-400'
              }`}
            >
              {t.success ? <Wrench size={10} /> : <AlertCircle size={10} />}
              <span className="font-mono">{t.tool}</span>
              {!t.success && t.error && <span className="text-text-muted">— {t.error}</span>}
            </li>
          ))}
        </ul>
      )}
      <div className="max-w-[88%] rounded-2xl rounded-bl-sm bg-surface text-text-primary px-3.5 py-2 text-sm whitespace-pre-wrap">
        {msg.content || <span className="italic text-text-muted">…</span>}
      </div>
    </div>
  );
}

function EmptyState({
  agencyName,
  onPick,
  busy,
}: {
  agencyName: string;
  onPick: (text: string) => void;
  busy: boolean;
}) {
  const suggestions = [
    'List the social services in the catalog so I can pick.',
    'Add 12 short-form videos and the TikTok organic retainer.',
    'Switch to a one-off project, $5,000 deposit.',
    'Show me the proposal preview.',
  ];
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">
        Hey — chatting on a {agencyName} draft. Tell me what to add, change, or send. The right pane updates live.
      </p>
      <div className="space-y-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => onPick(s)}
            className="block w-full text-left rounded-lg border border-nativz-border bg-background hover:bg-surface-hover px-3 py-2 text-sm text-text-primary disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
