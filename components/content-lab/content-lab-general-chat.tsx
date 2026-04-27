'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles, Paperclip, X } from 'lucide-react';
import { Conversation } from '@/components/ai/conversation';
import { AssistantMessage, UserMessage, type ChatMessage } from '@/components/ai/message';
import { ChatComposer, type ChatAttachment } from '@/components/ai/chat-composer';
import { processAttachments } from '@/lib/chat/process-attachments';
import type { ClientOption } from '@/components/ui/client-picker';

interface RoutableClient extends ClientOption {
  slug: string;
}
import { useAgencyBrand } from '@/lib/agency/use-agency-brand';

type AttachedScopeType = 'audit' | 'topic_search';

interface AttachedScope {
  type: AttachedScopeType;
  id: string;
  label: string;
}

const SCOPE_TYPE_LABEL: Record<AttachedScopeType, string> = {
  audit: 'Audit',
  topic_search: 'Topic',
};
import {
  readGeneralContentLabConversationId,
  writeGeneralContentLabConversationId,
  clearGeneralContentLabConversationId,
} from '@/lib/content-lab/nerd-conversation-storage';

interface ContentLabGeneralChatProps {
  /** Full client roster used for the picker. Routing happens client-side. */
  clients: RoutableClient[];
  /**
   * Pre-pinned analysis from a drawer handoff (e.g. user clicked
   * "Continue in Strategy Lab" on a topic search results page). The
   * parent page resolves the label server-side from `?attach=` so the
   * chip can render without a roundtrip.
   */
  initialScope?: AttachedScope | null;
}

const SUGGESTIONS = [
  'Help me think through a positioning angle for a new prospect',
  'What\'s our agency point of view on short-form hooks right now?',
  'Brainstorm a content pillar framework for a real estate brand we don\'t work with yet',
  'Walk me through the strongest hook patterns we\'ve seen across clients',
];

/**
 * General Strategy Lab chat — no client scope. Used at /lab
 * when the admin wants to ideate freely, work on a prospect that isn't
 * onboarded, or get the Nerd's take across the whole portfolio. Picking a
 * client routes into the per-client workspace at /lab/[slug]
 * which spins up an isolated thread.
 */
export function ContentLabGeneralChat({ clients: _clients, initialScope = null }: ContentLabGeneralChatProps) {
  const { config: agencyConfig, brandName: agencyName } = useAgencyBrand();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loadingConversation, setLoadingConversation] = useState(false);
  // Attached analyses (drawer handoff seed + future user-added attachments).
  // Sent to the Nerd as `scopeContext` — the compact-index variant where the
  // agent pulls detail on demand via tools, not a full-blob dump.
  const [attachedScope, setAttachedScope] = useState<AttachedScope[]>(
    initialScope ? [initialScope] : [],
  );
  const abortRef = useRef<AbortController | null>(null);
  const pendingAttachmentsRef = useRef<ChatAttachment[]>([]);

  const sessionHintRef = useRef<string | null>(
    'User is in the general Strategy Lab — no client is scoped. Reason across the whole agency portfolio. Reach for cross-client patterns, brand voice frameworks, and high-level positioning. Reference specific clients only when the user asks. Keep replies concise and tactical.',
  );

  // Resume the persisted general conversation on mount.
  useEffect(() => {
    const stored = readGeneralContentLabConversationId();
    if (!stored) return;
    let cancelled = false;
    setLoadingConversation(true);
    fetch(`/api/nerd/conversations/${stored}`)
      .then(async (res) => {
        if (!res.ok) {
          clearGeneralContentLabConversationId();
          return null;
        }
        return res.json() as Promise<{
          id: string;
          messages: Array<{ id: string; role: string; content: string; tool_results: unknown }>;
        }>;
      })
      .then((data) => {
        if (!data || cancelled) return;
        const loaded: ChatMessage[] = (data.messages ?? []).map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          toolResults: (m.tool_results as ChatMessage['toolResults']) ?? undefined,
        }));
        setMessages(loaded);
        setConversationId(data.id);
        sessionHintRef.current = null;
      })
      .catch(() => {/* stale pointer — start clean */})
      .finally(() => { if (!cancelled) setLoadingConversation(false); });
    return () => { cancelled = true; };
  }, []);

  const handleSend = useCallback(
    async (text?: string) => {
      const content = (text ?? input).trim();
      if (!content || streaming) return;

      setInput('');
      const hint = sessionHintRef.current;
      sessionHintRef.current = null;

      const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content, createdAt: Date.now() };
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        toolResults: [],
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const chatHistory = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
        const rawAtts = pendingAttachmentsRef.current;
        pendingAttachmentsRef.current = [];
        const processed = rawAtts.length > 0 ? await processAttachments(rawAtts) : undefined;

        const res = await fetch('/api/nerd/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: chatHistory,
            sessionHint: hint ?? undefined,
            conversationId: conversationId ?? undefined,
            attachments: processed && processed.length > 0 ? processed : undefined,
            // Progressive-context attachments from drawer handoffs or
            // future Strategy Lab attach actions. Paired with
            // mode='strategy-lab' so the Nerd gets the scripting addendum
            // + the compact attached-analyses index.
            mode: attachedScope.length > 0 ? 'strategy-lab' : undefined,
            scopeContext:
              attachedScope.length > 0
                ? attachedScope.map((s) => ({ type: s.type, id: s.id }))
                : undefined,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Failed to connect' }));
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: `Error: ${err.error}` } : m)),
          );
          return;
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let accText = '';
        const accToolResults: ChatMessage['toolResults'] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const chunk = JSON.parse(line);
              if (chunk.type === 'text') {
                accText += chunk.content;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: accText, toolResults: [...accToolResults] }
                      : m,
                  ),
                );
              } else if (chunk.type === 'tool_result') {
                accToolResults.push({
                  toolCallId: chunk.toolCallId,
                  toolName: chunk.toolName,
                  result: chunk.result,
                });
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: accText, toolResults: [...accToolResults] }
                      : m,
                  ),
                );
              } else if (chunk.type === 'conversation' && typeof chunk.conversationId === 'string') {
                setConversationId(chunk.conversationId);
                writeGeneralContentLabConversationId(chunk.conversationId);
              }
            } catch {
              accText += line;
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: accText } : m)),
              );
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: 'Connection lost. Try again.' } : m)),
          );
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [input, streaming, messages, conversationId],
  );

  function handleReset() {
    if (streaming) abortRef.current?.abort();
    setMessages([]);
    setConversationId(null);
    clearGeneralContentLabConversationId();
    sessionHintRef.current =
      'User is in the general Strategy Lab — no client is scoped. Reason across the whole agency portfolio.';
  }

  // Note: "Pick a client" button removed — the top-bar brand pill handles
  // session-level brand selection now. Picking a brand there auto-redirects
  // into /lab/[clientId] via the index route's cookie check.

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-nativz-border/60 bg-background/40">
      {/* Header — title pill + Pick a client */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-nativz-border/40 px-4 py-3 md:px-6">
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Sparkles size={14} className="text-accent-text" aria-hidden />
          <span>Strategy Lab — general</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={messages.length === 0 || streaming}
            className="rounded-full border border-nativz-border/60 px-3 py-1.5 text-xs text-text-muted transition hover:border-accent/30 hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            New chat
          </button>
        </div>
      </header>

      {loadingConversation && messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
          <Loader2 size={26} className="animate-spin text-text-muted" />
          <p className="mt-3 text-base font-medium text-text-primary">Resuming your strategy chat</p>
        </div>
      ) : messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
          <div className="mb-6 flex items-center gap-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={agencyName.toLowerCase().includes('anderson') ? '/anderson-logo-dark.svg' : '/nativz-logo.png'}
              alt={agencyName}
              className="h-10 w-auto max-w-[260px] object-contain"
            />
            <span className="text-2xl font-light text-text-muted/60" aria-hidden>×</span>
            <span className="text-2xl font-semibold text-text-primary">Strategy Lab</span>
          </div>
          <h2 className="mb-2 text-2xl font-semibold tracking-tight text-text-primary">
            What are we thinking about?
          </h2>
          <p className="mb-8 max-w-md text-center text-sm leading-relaxed text-text-muted">
            No client scoped — the Nerd has cross-portfolio knowledge. Pick a client up top to spin
            up an isolated chat focused on them.
          </p>
          <div className="flex max-w-2xl flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setInput(s)}
                className="cursor-pointer rounded-xl border border-nativz-border/60 bg-surface/40 px-4 py-2.5 text-sm text-text-secondary transition-colors hover:border-nativz-border hover:bg-surface-hover hover:text-text-primary"
              >
                {s}
              </button>
            ))}
          </div>
          {/* Hidden so we always render the composer below — no double layout */}
          <div className="hidden">{agencyConfig.name}</div>
        </div>
      ) : (
        <Conversation className="min-h-0 flex-1 overflow-y-auto px-4 md:px-8">
          <div className="mx-auto max-w-3xl divide-y divide-nativz-border/30 py-6">
            {messages.map((msg, index) => {
              const isLast = index === messages.length - 1;
              if (msg.role === 'assistant') {
                return (
                  <div key={msg.id} className="py-2">
                    <AssistantMessage
                      message={msg}
                      isLast={isLast}
                      onRetry={() => handleSend('Continue')}
                    />
                  </div>
                );
              }
              return <UserMessage key={msg.id} message={msg} />;
            })}
          </div>
        </Conversation>
      )}

      {/* Composer */}
      <div className="shrink-0 px-4 pb-5 pt-3 md:px-8 md:pb-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-2">
          {attachedScope.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
                <Paperclip size={11} aria-hidden />
                Attached
              </span>
              {attachedScope.map((s) => (
                <span
                  key={`${s.type}:${s.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent-text"
                >
                  <span className="opacity-70">{SCOPE_TYPE_LABEL[s.type]}</span>
                  <span className="truncate max-w-[18rem]">{s.label}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setAttachedScope((prev) => prev.filter((x) => !(x.type === s.type && x.id === s.id)))
                    }
                    className="rounded-full p-0.5 text-accent-text transition hover:bg-accent/15"
                    aria-label="Remove attachment"
                  >
                    <X size={11} aria-hidden />
                  </button>
                </span>
              ))}
            </div>
          )}
          <ChatComposer
            variant="research"
            value={input}
            onChange={setInput}
            onSubmit={(atts: ChatAttachment[]) => {
              pendingAttachmentsRef.current = atts;
              handleSend();
            }}
            disabled={streaming}
            placeholder={
              attachedScope.length > 0
                ? 'Ask about the attached analysis…'
                : 'Ask the Nerd anything — agency-wide…'
            }
          />
        </div>
      </div>

    </div>
  );
}
