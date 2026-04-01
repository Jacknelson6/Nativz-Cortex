'use client';

import { useState, useCallback, useRef } from 'react';
import { BotMessageSquare, Plus } from 'lucide-react';
import { Conversation } from '@/components/ai/conversation';
import { AssistantMessage, UserMessage, type ChatMessage } from '@/components/ai/message';
import { PromptInput } from '@/components/ai/prompt-input';

const SUGGESTIONS = [
  { label: 'Summarize research', prompt: 'Summarize our topic search findings and what to do next for ' },
  { label: 'Content pillars', prompt: 'How should we translate our research into content pillars for ' },
  { label: 'Video ideas', prompt: 'Give me 10 video ideas grounded in our strategy for ' },
  { label: 'Performance', prompt: 'What should we prioritize on social for ' },
];

type StrategyLabNerdChatProps = {
  clientId: string;
  clientName: string;
  clientSlug: string;
  /** Topic search IDs the user pinned in Strategy Lab — sent as session context on the first message. */
  pinnedTopicSearchIds: string[];
};

/**
 * Admin Nerd chat embedded in Strategy Lab — full tool access, client scoped via @mention resolution.
 */
export function StrategyLabNerdChat({
  clientId,
  clientName,
  clientSlug,
  pinnedTopicSearchIds,
}: StrategyLabNerdChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const sessionHintRef = useRef<string | null>(
    'User is in Strategy Lab with this client pinned. Prefer strategy, topic search, pillar, analytics, and knowledge tools. Be concise and actionable.',
  );
  const abortRef = useRef<AbortController | null>(null);

  const handleSend = useCallback(
    async (text?: string) => {
      const content = (text ?? input).trim();
      if (!content || streaming) return;

      setInput('');

      const mentions = [
        { type: 'client' as const, id: clientId, name: clientName, slug: clientSlug },
      ];

      let hint = sessionHintRef.current;
      if (hint && pinnedTopicSearchIds.length > 0) {
        hint += ` Pinned topic search IDs: ${pinnedTopicSearchIds.join(', ')} — use topic / search tools to pull findings when relevant.`;
      }
      sessionHintRef.current = null;

      const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content };
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        toolResults: [],
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const chatHistory = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));

        const res = await fetch('/api/nerd/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: chatHistory,
            mentions,
            sessionHint: hint ?? undefined,
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
    [input, streaming, messages, clientId, clientName, clientSlug, pinnedTopicSearchIds],
  );

  function handleReset() {
    if (streaming) abortRef.current?.abort();
    setMessages([]);
    sessionHintRef.current =
      'User is in Strategy Lab with this client pinned. Prefer strategy, topic search, pillar, analytics, and knowledge tools. Be concise and actionable.';
  }

  const inputArea = (
    <div className="shrink-0 border-t border-nativz-border/50 bg-surface/80 px-4 py-4 backdrop-blur-sm">
      <div className="mx-auto max-w-3xl">
        <PromptInput
          value={input}
          onChange={setInput}
          onSubmit={() => handleSend()}
          disabled={streaming}
          placeholder={`Ask Cortex about ${clientName.trim() || 'this client'}…`}
        />
      </div>
    </div>
  );

  const suggestions = SUGGESTIONS.map((s) => ({
    ...s,
    prompt: `${s.prompt}@${clientName.trim() || 'this client'}.`,
  }));

  return (
    <div className="flex min-h-[520px] flex-col overflow-hidden rounded-xl border border-nativz-border/60 bg-background/40">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-nativz-border/50 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <BotMessageSquare className="h-4 w-4 shrink-0 text-accent-text" aria-hidden />
          <span className="text-sm font-semibold text-text-primary">Chat with the Nerd</span>
          <span className="rounded-full bg-accent/[0.12] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-text/90">
            Strategy lab
          </span>
        </div>
        {messages.length > 0 ? (
          <button
            type="button"
            onClick={handleReset}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-nativz-border px-2.5 py-1 text-xs text-text-muted transition-colors hover:border-accent/20 hover:text-text-primary"
          >
            <Plus size={12} aria-hidden />
            New chat
          </button>
        ) : null}
      </header>

      {messages.length === 0 ? (
        <>
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-nativz-border bg-gradient-to-b from-surface to-background shadow-[0_0_24px_rgba(4,107,210,0.1)]">
              <BotMessageSquare size={24} className="text-accent-text" />
            </div>
            <h2 className="mb-1 text-xl font-semibold tracking-tight text-text-primary">
              Strategy chat for {clientName.trim() || 'this client'}
            </h2>
            <p className="mb-8 max-w-md text-center text-sm leading-relaxed text-text-muted">
              Cortex has full client context, knowledge vault access, and your pinned topic searches. Ask about
              research, pillars, ideas, or performance.
            </p>
            <div className="flex max-w-lg flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setInput(s.prompt)}
                  className="cursor-pointer rounded-xl border border-nativz-border px-4 py-2.5 text-sm text-text-secondary transition-all duration-200 hover:border-accent/20 hover:bg-accent/[0.04] hover:text-text-primary"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          {inputArea}
        </>
      ) : (
        <>
          <Conversation className="min-h-0 flex-1 overflow-y-auto px-4 md:px-6">
            <div className="mx-auto max-w-3xl divide-y divide-nativz-border/50 py-4">
              {messages.map((msg, index) => {
                const isLast = index === messages.length - 1;
                if (msg.role === 'assistant') {
                  return (
                    <AssistantMessage
                      key={msg.id}
                      message={msg}
                      isLast={isLast}
                      onRetry={() => handleSend('Continue')}
                    />
                  );
                }
                return <UserMessage key={msg.id} message={msg} />;
              })}
            </div>
          </Conversation>
          {inputArea}
        </>
      )}
    </div>
  );
}
