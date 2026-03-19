'use client';

import { useState, useCallback, useRef } from 'react';
import { BotMessageSquare, Plus } from 'lucide-react';
import { Conversation } from '@/components/ai/conversation';
import { AssistantMessage, UserMessage, type ChatMessage } from '@/components/ai/message';
import { PromptInput } from '@/components/ai/prompt-input';

// ---------------------------------------------------------------------------
// Suggestions (portal-specific, no @mentions needed since context is auto-injected)
// ---------------------------------------------------------------------------

const SUGGESTIONS = [
  { label: 'Content strategy', prompt: 'What should our content strategy focus on right now?' },
  { label: 'Video ideas', prompt: 'Give me 10 video ideas based on our brand' },
  { label: 'Hook ideas', prompt: 'Give me scroll-stopping hooks for our next videos' },
  { label: 'Brand voice', prompt: 'Summarize our brand voice and positioning' },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PortalNerdClientProps {
  clientId: string;
  clientName: string;
  clientSlug: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PortalNerdClient({ clientId, clientName, clientSlug }: PortalNerdClientProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  // Send message — auto-injects client context as a mention
  const handleSend = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || streaming) return;

    setInput('');

    // Always inject the client as a mention so the Nerd scopes to this client
    const portalMentions = [
      { type: 'client' as const, id: clientId, name: clientName, slug: clientSlug },
    ];

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content };
    const assistantMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: '', toolResults: [] };

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
          mentions: portalMentions,
          portalMode: true,
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
              const snapshot = accText;
              const toolSnapshot = [...accToolResults];
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: snapshot, toolResults: toolSnapshot } : m)),
              );
            } else if (chunk.type === 'tool_result') {
              accToolResults.push({
                toolCallId: chunk.toolCallId,
                toolName: chunk.toolName,
                result: chunk.result,
              });
              const toolSnapshot = [...accToolResults];
              const textSnapshot = accText;
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: textSnapshot, toolResults: toolSnapshot } : m)),
              );
            }
            // Portal doesn't track conversation IDs (no sidebar history)
          } catch {
            accText += line;
            const snapshot = accText;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: snapshot } : m)),
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
  }, [input, streaming, messages, clientId, clientName, clientSlug]);

  function handleReset() {
    if (streaming) abortRef.current?.abort();
    setMessages([]);
  }

  const inputArea = (
    <div className="shrink-0 px-4 pb-4 md:px-6 md:pb-6">
      <div className="mx-auto max-w-3xl">
        <PromptInput
          value={input}
          onChange={setInput}
          onSubmit={() => handleSend()}
          disabled={streaming}
          placeholder="Ask anything about your brand, content, or strategy..."
        />
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <header className="z-10 flex h-12 w-full shrink-0 items-center justify-between gap-2 border-b border-nativz-border px-4 md:px-6">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary">The Nerd</span>
          <span className="text-[10px] text-text-muted bg-accent/[0.08] px-1.5 py-0.5 rounded-full">
            {clientName}
          </span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 rounded-lg border border-nativz-border px-2.5 py-1 text-xs text-text-muted hover:text-text-primary hover:border-accent/20 transition-colors cursor-pointer"
          >
            <Plus size={12} />
            New
          </button>
        )}
      </header>

      {/* Chat area */}
      {messages.length === 0 ? (
        <>
          <div className="flex flex-1 flex-col items-center justify-center px-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-nativz-border bg-gradient-to-b from-surface to-background shadow-[0_0_24px_rgba(4,107,210,0.1)] mb-5">
              <BotMessageSquare size={24} className="text-accent-text" />
            </div>

            <h2 className="text-xl font-semibold text-text-primary mb-1 tracking-tight">Hey, I&apos;m The Nerd</h2>
            <p className="text-sm text-text-muted text-center max-w-md mb-8 leading-relaxed">
              Your social media strategy expert. Ask me anything about your brand, content ideas, or strategy.
            </p>

            <div className="flex flex-wrap justify-center gap-2 max-w-lg">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => setInput(s.prompt)}
                  className="rounded-xl border border-nativz-border px-4 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:border-accent/20 hover:bg-accent/[0.04] transition-all duration-200 cursor-pointer"
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
          <Conversation className="px-4 md:px-6">
            <div className="mx-auto max-w-3xl divide-y divide-nativz-border/50">
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
