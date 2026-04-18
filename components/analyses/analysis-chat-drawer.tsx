'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Markdown } from '@/components/ai/markdown';
import { cn } from '@/lib/utils/cn';

export type AnalysisScopeType = 'audit' | 'tiktok_shop_search' | 'topic_search';

interface Props {
  scopeType: AnalysisScopeType;
  scopeId: string;
  /** Short label for the drawer header (e.g. "skincare serum" or the brand name). */
  scopeLabel: string;
  /** Optional href for "Continue in Strategy Lab" handoff. Hidden when not provided. */
  strategyLabHref?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Loose list of tools the assistant called this turn, for a small indicator chip. */
  toolsUsed?: string[];
  /** True while this assistant message is still streaming. */
  streaming?: boolean;
}

const SCOPE_LABEL: Record<AnalysisScopeType, string> = {
  audit: 'Audit',
  tiktok_shop_search: 'TikTok Shop',
  topic_search: 'Topic',
};

const SUGGESTED: Record<AnalysisScopeType, string[]> = {
  audit: [
    'Summarize this brand\'s biggest content gaps.',
    'What are the top 3 opportunities their competitors are missing?',
    'Draft 5 video ideas that would plug the biggest gap.',
  ],
  tiktok_shop_search: [
    'Which creators have the best conversion signal (high E-com, reasonable traffic)?',
    'What do the top 3 creators have in common?',
    'Draft an outreach plan for the top 5 creators.',
  ],
  topic_search: [
    'What are the hottest trending topics here?',
    'Which topic has the highest sentiment + resonance combo?',
    'Turn the top 3 topics into video hooks.',
  ],
};

export function AnalysisChatDrawer({
  scopeType,
  scopeId,
  scopeLabel,
  strategyLabHref,
}: Props) {
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Resolve (or create) the per-user × per-scope conversation the first
  // time the drawer opens. Cached after first open so re-toggling doesn't
  // re-hit the API.
  const resolveConversation = useCallback(async () => {
    if (conversationId || resolving) return;
    setResolving(true);
    try {
      const res = await fetch('/api/nerd/conversations/by-scope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scopeType, scopeId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to open chat');
        return;
      }
      setConversationId(data.conversationId as string);
    } catch {
      toast.error('Something went wrong');
    } finally {
      setResolving(false);
    }
  }, [conversationId, resolving, scopeType, scopeId]);

  useEffect(() => {
    if (open) void resolveConversation();
  }, [open, resolveConversation]);

  useEffect(() => {
    // Auto-scroll to bottom on new messages / streaming tokens.
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const suggestions = useMemo(() => SUGGESTED[scopeType], [scopeType]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;

      setInput('');
      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: trimmed,
      };
      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: '',
        streaming: true,
      };
      const history = [...messages, userMsg];
      setMessages([...history, assistantMsg]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch('/api/nerd/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: history.map((m) => ({ role: m.role, content: m.content })),
            mode: 'strategy-lab' as const,
            conversationId: conversationId ?? undefined,
            scopeContext: [{ type: scopeType, id: scopeId }],
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Failed to connect' }));
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, content: `Error: ${err.error}`, streaming: false }
                : m,
            ),
          );
          return;
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let accText = '';
        const toolsUsed: string[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const chunk = JSON.parse(line);
              if (chunk.type === 'text' && typeof chunk.content === 'string') {
                accText += chunk.content;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: accText, toolsUsed: [...toolsUsed], streaming: true }
                      : m,
                  ),
                );
              } else if (chunk.type === 'tool_result' && typeof chunk.toolName === 'string') {
                if (!toolsUsed.includes(chunk.toolName)) toolsUsed.push(chunk.toolName);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: accText, toolsUsed: [...toolsUsed], streaming: true }
                      : m,
                  ),
                );
              } else if (chunk.type === 'conversation' && typeof chunk.conversationId === 'string') {
                setConversationId(chunk.conversationId);
              }
            } catch {
              /* non-JSON line, ignore */
            }
          }
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: accText || '(no response)', toolsUsed, streaming: false }
              : m,
          ),
        );
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, content: 'Error: Something went wrong.', streaming: false }
                : m,
            ),
          );
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [conversationId, messages, scopeId, scopeType, streaming],
  );

  return (
    <>
      {/* Floating trigger button — bottom-right of the analysis page */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'fixed bottom-6 right-6 z-30 flex h-12 items-center gap-2 rounded-full border border-accent/40 bg-accent px-4 text-sm font-medium text-white shadow-[0_0_24px_-6px_rgba(91,163,230,0.55)] transition hover:brightness-110',
          open && 'hidden',
        )}
        aria-label="Open chat"
      >
        <MessageSquare size={16} aria-hidden />
        Ask the Nerd
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Drawer */}
      <aside
        aria-hidden={!open}
        className={cn(
          'fixed right-0 top-0 z-50 flex h-screen w-full max-w-md flex-col border-l border-nativz-border bg-surface shadow-[0_0_48px_-12px_rgba(0,0,0,0.5)] transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-nativz-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
              {SCOPE_LABEL[scopeType]} · Nerd chat
            </p>
            <h2 className="mt-0.5 truncate text-base font-semibold text-text-primary">
              {scopeLabel}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {strategyLabHref && (
              <Link
                href={strategyLabHref}
                title="Continue in Strategy Lab"
                className="rounded-md p-1.5 text-text-muted transition hover:bg-surface-hover hover:text-text-primary"
              >
                <ArrowUpRight size={16} aria-hidden />
              </Link>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1.5 text-text-muted transition hover:bg-surface-hover hover:text-text-primary"
              aria-label="Close"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
          {messages.length === 0 && (
            <div className="mt-6">
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <Sparkles size={14} className="text-accent-text" aria-hidden />
                Ask anything about this analysis. The Nerd pulls detail as needed.
              </div>
              <div className="mt-4 space-y-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={streaming || resolving}
                    onClick={() => void send(s)}
                    className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-left text-sm text-text-secondary transition hover:border-accent/40 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={cn('mb-4', m.role === 'user' ? 'text-right' : '')}>
              <div
                className={cn(
                  'inline-block max-w-[85%] rounded-xl px-3.5 py-2 text-sm',
                  m.role === 'user'
                    ? 'bg-accent text-white'
                    : 'border border-nativz-border bg-background text-text-primary',
                )}
              >
                {m.role === 'assistant' ? (
                  <Markdown content={m.content || (m.streaming ? '' : '(empty)')} />
                ) : (
                  m.content
                )}
                {m.role === 'assistant' && m.streaming && (
                  <Loader2 size={12} className="ml-1 inline animate-spin text-accent-text" aria-hidden />
                )}
              </div>
              {m.role === 'assistant' && m.toolsUsed && m.toolsUsed.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {m.toolsUsed.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-background px-2 py-0.5 text-[10px] font-medium text-text-muted"
                    >
                      <Wrench size={9} aria-hidden />
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <form
          className="border-t border-nativz-border px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              placeholder={resolving ? 'Opening chat…' : 'Ask about this analysis…'}
              disabled={resolving || streaming}
              rows={1}
              className="min-h-[40px] max-h-32 flex-1 resize-none rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-text-muted focus:border-accent focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!input.trim() || streaming || resolving}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Send"
            >
              {streaming ? (
                <Loader2 size={14} className="animate-spin" aria-hidden />
              ) : (
                <Send size={14} aria-hidden />
              )}
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}
