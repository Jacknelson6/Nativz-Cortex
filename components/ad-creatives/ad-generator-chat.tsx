'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Loader2, Terminal, User as UserIcon, Bot } from 'lucide-react';
import { toast } from 'sonner';
import type { AdConcept } from './ad-concept-gallery';
import { CHAT_COMMAND_HELP } from '@/lib/ad-creatives/chat-commands';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  command: string | null;
  metadata: Record<string, unknown>;
  batch_id: string | null;
  created_at: string;
}

interface Props {
  clientId: string;
  onBatchComplete: (concepts: AdConcept[]) => void;
  onConceptsChanged: (updatedConcepts: AdConcept[], deletedIds: string[]) => void;
  onSwitchToGallery: () => void;
}

const COUNT_PRESETS = [5, 10, 20, 30];
const DEFAULT_COUNT = 20;

const EXAMPLE_PROMPTS: string[] = [
  'Generate ads that emphasize testimonials and social proof. Cycle through review cards, testimonial stacks, and problem/solution framings.',
  'Focus on the current offer — build urgency without being salesy. Mix stat callouts with comparison framings.',
  'Lead with customer pain points pulled from the reviews in the asset library. Each concept should quote a reviewer directly where possible.',
];

/**
 * Multi-turn chat intake. Hydrates persisted messages on mount, renders
 * them as a scrollable transcript, and routes input to one of two
 * backends depending on content:
 *
 *   - `/`-prefixed input → /api/ad-creatives/command (slash commands)
 *   - Anything else      → /api/ad-creatives/generate (concept batch)
 *
 * Both endpoints write their own user/assistant pair to
 * ad_generator_messages, so the history stays truthful even on refresh.
 */
export function AdGeneratorChat({
  clientId,
  onBatchComplete,
  onConceptsChanged,
  onSwitchToGallery,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [count, setCount] = useState<number>(DEFAULT_COUNT);
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isCommand = input.trim().startsWith('/');

  // Hydrate persisted history. The endpoint returns ASC-sorted messages
  // so we can render top-to-bottom without extra work.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/ad-creatives/messages?clientId=${clientId}`,
          { cache: 'no-store' },
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { messages: ChatMessage[] };
        if (!cancelled) setMessages(data.messages ?? []);
      } finally {
        if (!cancelled) setHistoryLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  // Scroll to bottom on new messages. The transcript is a bounded height
  // flex child; scrollTo on the inner container keeps the composer fixed.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const handleSubmit = useCallback(async () => {
    const trimmed = input.trim();
    if (trimmed.length < 1) return;

    // Optimistic user bubble — replaced by the server's canonical row
    // when the response lands.
    const optimisticUserId = `tmp-u-${Date.now()}`;
    const optimisticUser: ChatMessage = {
      id: optimisticUserId,
      role: 'user',
      content: trimmed,
      command: trimmed.startsWith('/') ? trimmed.split(/\s+/)[0]!.slice(1) : null,
      metadata: {},
      batch_id: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setInput('');
    setSubmitting(true);

    try {
      if (trimmed.startsWith('/')) {
        const res = await fetch('/api/ad-creatives/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, input: trimmed }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          const errorMsg = body?.error ?? `Command failed (${res.status})`;
          appendAssistant(setMessages, errorMsg, null);
          toast.error(errorMsg.slice(0, 120));
          return;
        }
        const data = (await res.json()) as {
          summary: string;
          affectedConcepts: AdConcept[];
          metadata: Record<string, unknown>;
          assistantMessageId: string | null;
        };
        appendAssistant(setMessages, data.summary, null, data.metadata);
        if (data.affectedConcepts.length > 0) {
          const deletedIds = data.affectedConcepts
            .filter((c) => (c as { status?: unknown }).status === 'deleted')
            .map((c) => (c as { id: string }).id);
          const updated = data.affectedConcepts.filter(
            (c) => (c as { status?: unknown }).status !== 'deleted',
          ) as AdConcept[];
          onConceptsChanged(updated, deletedIds);
          if (updated.length > 0 || deletedIds.length > 0) {
            toast.success(data.summary.slice(0, 120));
          }
        } else {
          toast.success(data.summary.slice(0, 120));
        }
      } else {
        const res = await fetch('/api/ad-creatives/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, prompt: trimmed, count }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          const errorMsg = body?.error ?? `Generation failed (${res.status})`;
          appendAssistant(setMessages, errorMsg, null);
          toast.error(errorMsg.slice(0, 120));
          return;
        }
        const data = (await res.json()) as {
          batchId: string;
          status: 'completed' | 'partial' | 'failed';
          concepts: AdConcept[];
        };
        const summary = `Generated ${data.concepts.length} concept${data.concepts.length === 1 ? '' : 's'}${data.status === 'partial' ? ' (partial)' : ''}.`;
        appendAssistant(setMessages, summary, data.batchId);
        onBatchComplete(data.concepts);
        toast.success(summary);
        onSwitchToGallery();
      }
    } finally {
      setSubmitting(false);
    }
  }, [input, clientId, count, onBatchComplete, onConceptsChanged, onSwitchToGallery]);

  const transcript = useMemo(() => {
    if (!historyLoaded) {
      return (
        <div className="flex items-center justify-center py-12 text-sm text-text-muted">
          <Loader2 size={14} className="mr-2 animate-spin" />
          Loading history…
        </div>
      );
    }
    if (messages.length === 0) {
      return (
        <div className="space-y-4 py-4">
          <EmptyStateHint />
        </div>
      );
    }
    return (
      <div className="space-y-4 py-2">
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </div>
    );
  }, [historyLoaded, messages]);

  return (
    <div className="flex h-[calc(100vh-260px)] min-h-[480px] flex-col gap-3 overflow-hidden">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-nativz-border bg-surface/60 px-4"
      >
        {transcript}
      </div>

      <div className="shrink-0 space-y-2 rounded-xl border border-nativz-border bg-surface p-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              void handleSubmit();
            }
          }}
          rows={3}
          disabled={submitting}
          placeholder="Describe the batch, or type /help for slash commands. ⌘↵ to submit."
          className="w-full resize-y rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm leading-relaxed text-text-primary placeholder:text-text-muted focus:border-accent/40 focus:outline-none"
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {isCommand ? (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-accent-surface/70 px-2.5 py-1 text-[11px] font-medium text-accent-text">
                <Terminal size={11} />
                Slash command
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">Count</span>
                <div className="inline-flex rounded-lg bg-surface-hover/60 p-0.5">
                  {COUNT_PRESETS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setCount(n)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                        count === n
                          ? 'bg-accent text-white shadow-sm'
                          : 'text-text-muted hover:text-text-secondary'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || input.trim().length < 1}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {submitting
              ? 'Working…'
              : isCommand
                ? 'Run command'
                : `Generate ${count} concepts`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function appendAssistant(
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  content: string,
  batchId: string | null,
  metadata: Record<string, unknown> = {},
) {
  setMessages((prev) => [
    ...prev,
    {
      id: `tmp-a-${Date.now()}`,
      role: 'assistant',
      content,
      command: null,
      metadata,
      batch_id: batchId,
      created_at: new Date().toISOString(),
    },
  ]);
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isUser ? 'bg-accent/20 text-accent-text' : 'bg-surface-hover text-text-secondary'
        }`}
      >
        {isUser ? <UserIcon size={14} /> : <Bot size={14} />}
      </div>
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-accent-surface text-text-primary'
            : 'border border-nativz-border bg-background text-text-secondary'
        }`}
      >
        {message.command && isUser && (
          <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            <Terminal size={10} />
            /{message.command}
          </div>
        )}
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}

function EmptyStateHint() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-dashed border-nativz-border bg-surface/40 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
          Try a direction
        </p>
        <div className="space-y-1.5">
          {EXAMPLE_PROMPTS.map((p) => (
            <p key={p} className="text-[13px] leading-relaxed text-text-secondary">
              {p}
            </p>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-dashed border-nativz-border bg-surface/40 p-4">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
          <Terminal size={11} />
          Or use a slash command
        </div>
        <pre className="whitespace-pre-wrap font-mono text-[11px] leading-snug text-text-secondary">
          {CHAT_COMMAND_HELP}
        </pre>
      </div>
    </div>
  );
}
