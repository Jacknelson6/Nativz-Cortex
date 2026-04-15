'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles, Building2 } from 'lucide-react';
import { Conversation } from '@/components/ai/conversation';
import { AssistantMessage, UserMessage, type ChatMessage } from '@/components/ai/message';
import { ChatComposer, type ChatAttachment } from '@/components/ai/chat-composer';
import { processAttachments } from '@/lib/chat/process-attachments';
import { ClientPickerModal, type ClientOption } from '@/components/ui/client-picker';

interface RoutableClient extends ClientOption {
  slug: string;
}
import { useAgencyBrand } from '@/lib/agency/use-agency-brand';
import { useRouter } from 'next/navigation';
import {
  readGeneralStrategyLabConversationId,
  writeGeneralStrategyLabConversationId,
  clearGeneralStrategyLabConversationId,
} from '@/lib/strategy-lab/nerd-conversation-storage';

interface StrategyLabGeneralChatProps {
  /** Full client roster used for the picker. Routing happens client-side. */
  clients: RoutableClient[];
}

const SUGGESTIONS = [
  'Help me think through a positioning angle for a new prospect',
  'What\'s our agency point of view on short-form hooks right now?',
  'Brainstorm a content pillar framework for a real estate brand we don\'t work with yet',
  'Walk me through the strongest hook patterns we\'ve seen across clients',
];

/**
 * General Strategy Lab chat — no client scope. Used at /admin/strategy-lab
 * when the admin wants to ideate freely, work on a prospect that isn't
 * onboarded, or get the Nerd's take across the whole portfolio. Picking a
 * client routes into the per-client workspace at /admin/strategy-lab/[slug]
 * which spins up an isolated thread.
 */
export function StrategyLabGeneralChat({ clients }: StrategyLabGeneralChatProps) {
  const router = useRouter();
  const { config: agencyConfig, brandName: agencyName } = useAgencyBrand();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const pendingAttachmentsRef = useRef<ChatAttachment[]>([]);

  const sessionHintRef = useRef<string | null>(
    'User is in the general Strategy Lab — no client is scoped. Reason across the whole agency portfolio. Reach for cross-client patterns, brand voice frameworks, and high-level positioning. Reference specific clients only when the user asks. Keep replies concise and tactical.',
  );

  // Resume the persisted general conversation on mount.
  useEffect(() => {
    const stored = readGeneralStrategyLabConversationId();
    if (!stored) return;
    let cancelled = false;
    setLoadingConversation(true);
    fetch(`/api/nerd/conversations/${stored}`)
      .then(async (res) => {
        if (!res.ok) {
          clearGeneralStrategyLabConversationId();
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
                writeGeneralStrategyLabConversationId(chunk.conversationId);
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
    clearGeneralStrategyLabConversationId();
    sessionHintRef.current =
      'User is in the general Strategy Lab — no client is scoped. Reason across the whole agency portfolio.';
  }

  function handlePickClient(id: string) {
    setPickerOpen(false);
    // The Strategy Lab dynamic route loads by client UUID (param name is
    // `clientId` and the page filters `clients.id`). Routing with the
    // slug 404s.
    if (id) router.push(`/admin/strategy-lab/${id}`);
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-nativz-border/60 bg-background/40">
      {/* Header — title pill + Pick a client */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-nativz-border/40 px-4 py-3 md:px-6">
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Sparkles size={14} className="text-accent-text" aria-hidden />
          <span>Content Lab — general</span>
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
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-accent/90 cursor-pointer"
          >
            <Building2 size={13} />
            Pick a client
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
              src={agencyName.toLowerCase().includes('anderson') ? '/anderson-logo-dark.svg' : '/nativz-logo.svg'}
              alt={agencyName}
              className="h-10 w-auto max-w-[260px] object-contain"
            />
            <span className="text-2xl font-light text-text-muted/60" aria-hidden>×</span>
            <span className="text-2xl font-semibold text-text-primary">Content Lab</span>
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
        <div className="mx-auto flex max-w-3xl flex-col">
          <ChatComposer
            variant="research"
            value={input}
            onChange={setInput}
            onSubmit={(atts: ChatAttachment[]) => {
              pendingAttachmentsRef.current = atts;
              handleSend();
            }}
            disabled={streaming}
            placeholder="Ask the Nerd anything — agency-wide…"
          />
        </div>
      </div>

      {pickerOpen && (
        <ClientPickerModal
          clients={clients}
          value={null}
          onSelect={handlePickClient}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
