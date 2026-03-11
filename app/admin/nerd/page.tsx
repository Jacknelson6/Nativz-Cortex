'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { BotMessageSquare, Plus, Building2, User } from 'lucide-react';
import { Conversation } from '@/components/ai/conversation';
import { AssistantMessage, UserMessage, type ChatMessage } from '@/components/ai/message';
import { PromptInput } from '@/components/ai/prompt-input';
import { MentionAutocomplete, type MentionOption } from '@/components/ai/mention-autocomplete';

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

const SUGGESTIONS = [
  { label: 'Content pillars', prompt: 'Build a content pillar framework for @' },
  { label: 'Posting strategy', prompt: 'What should the ideal posting schedule be for @' },
  { label: 'Hook ideas', prompt: 'Give me 10 scroll-stopping hooks for @' },
  { label: 'Analytics review', prompt: 'Review the analytics and performance for @' },
  { label: 'Create a task', prompt: 'Create a task to ' },
  { label: 'Team workload', prompt: 'Show me the current workload for @' },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NerdPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);

  // @mention state
  const [mentionOptions, setMentionOptions] = useState<MentionOption[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [activeMentions, setActiveMentions] = useState<Array<{ type: 'client' | 'team_member'; id: string; name: string; slug?: string }>>([]);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // True when the mention dropdown is actually visible with results
  const mentionsVisible = showMentions && mentionOptions.some((o) =>
    o.name.toLowerCase().includes(mentionQuery.toLowerCase()),
  );

  // Load mention options
  useEffect(() => {
    fetch('/api/nerd/mentions')
      .then((r) => r.json())
      .then((data) => {
        const opts: MentionOption[] = [
          ...(data.clients ?? []).map((c: MentionOption & { agency?: string }) => ({
            type: 'client' as const, id: c.id, name: c.name, slug: c.slug, agency: c.agency, avatarUrl: c.avatarUrl,
          })),
          ...(data.team ?? []).map((t: MentionOption & { role?: string }) => ({
            type: 'team_member' as const, id: t.id, name: t.name, role: t.role, avatarUrl: t.avatarUrl,
          })),
        ];
        setMentionOptions(opts);
      })
      .catch(() => {});
  }, []);

  // Detect @mention trigger
  useEffect(() => {
    const cursorPos = input.length; // simplified — works for end-of-input typing
    const textBeforeCursor = input.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex >= 0) {
      const charBefore = atIndex > 0 ? textBeforeCursor[atIndex - 1] : ' ';
      if (charBefore === ' ' || charBefore === '\n' || atIndex === 0) {
        const query = textBeforeCursor.slice(atIndex + 1);
        if (!query.includes(' ') || query.length < 20) {
          setMentionQuery(query);
          setShowMentions(true);
          return;
        }
      }
    }
    setShowMentions(false);
  }, [input]);

  function handleMentionSelect(option: MentionOption) {
    const atIndex = input.lastIndexOf('@');
    if (atIndex >= 0) {
      const before = input.slice(0, atIndex);
      const newInput = `${before}@${option.name} `;
      setInput(newInput);
      setActiveMentions((prev) => {
        if (prev.find((m) => m.id === option.id && m.type === option.type)) return prev;
        return [...prev, { type: option.type, id: option.id, name: option.name, slug: option.slug }];
      });
    }
    setShowMentions(false);
  }

  // Send message
  const handleSend = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || streaming) return;

    setInput('');
    setShowMentions(false);

    const messageMentions = activeMentions.filter((m) => content.includes(`@${m.name}`));

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content };
    const assistantMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: '', toolResults: [] };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setStreaming(true);
    setActiveMentions([]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const chatHistory = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch('/api/nerd/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: chatHistory,
          mentions: messageMentions.length > 0 ? messageMentions : undefined,
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
          } catch {
            // Non-JSON fallback
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
  }, [input, streaming, messages, activeMentions]);

  function handleReset() {
    if (streaming) abortRef.current?.abort();
    setMessages([]);
    setActiveMentions([]);
  }

  // Empty state
  if (messages.length === 0) {
    return (
      <div className="flex h-[calc(100vh-4rem)] flex-col">
        {/* Header */}
        <Header clientCount={mentionOptions.filter((o) => o.type === 'client').length} onReset={handleReset} showReset={false} />

        {/* Empty state */}
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-gradient-to-b from-surface to-[#0d0d14] shadow-[0_0_24px_rgba(4,107,210,0.1)] mb-5">
            <BotMessageSquare size={24} className="text-accent-text" />
          </div>

          <h2 className="text-xl font-semibold text-text-primary mb-1 tracking-tight">Hey, I&apos;m The Nerd</h2>
          <p className="text-sm text-text-muted text-center max-w-md mb-8 leading-relaxed">
            Your social media strategy expert. Use <span className="text-accent-text font-medium">@mentions</span> to reference clients and team members.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-lg mb-10">
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

        {/* Input */}
        <div className="shrink-0 px-4 pb-4 md:px-6 md:pb-6">
          <div className="mx-auto max-w-3xl">
            <PromptInput
              value={input}
              onChange={setInput}
              onSubmit={() => handleSend()}
              disabled={streaming}
              placeholder="Ask anything... use @ to mention clients or team members"
              blockEnterSubmit={mentionsVisible}
            >
              {showMentions && mentionOptions.length > 0 && (
                <MentionAutocomplete query={mentionQuery} options={mentionOptions} onSelect={handleMentionSelect} />
              )}
            </PromptInput>
            <MentionBadges mentions={activeMentions} />
          </div>
        </div>
      </div>
    );
  }

  // Chat state
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <Header
        clientCount={mentionOptions.filter((o) => o.type === 'client').length}
        onReset={handleReset}
        showReset={messages.length > 0}
      />

      <Conversation className="px-4 md:px-6">
        <div className="mx-auto max-w-3xl divide-y divide-white/[0.04]">
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

      {/* Input */}
      <div className="shrink-0 px-4 pb-4 md:px-6 md:pb-6">
        <div className="mx-auto max-w-3xl">
          <PromptInput
            value={input}
            onChange={setInput}
            onSubmit={() => handleSend()}
            disabled={streaming}
            placeholder="Ask anything... use @ to mention clients or team members"
            blockEnterSubmit={mentionsVisible}
          >
            {showMentions && mentionOptions.length > 0 && (
              <MentionAutocomplete query={mentionQuery} options={mentionOptions} onSelect={handleMentionSelect} />
            )}
          </PromptInput>
          <MentionBadges mentions={activeMentions} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Header({
  clientCount,
  onReset,
  showReset,
}: {
  clientCount: number;
  onReset: () => void;
  showReset: boolean;
}) {
  return (
    <header className="z-10 flex h-12 w-full shrink-0 items-center justify-between gap-2 border-b border-nativz-border px-4 md:px-6">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-text-primary">The Nerd</span>
        <span className="text-[10px] text-text-muted bg-accent/[0.08] px-1.5 py-0.5 rounded-full">
          {clientCount} clients
        </span>
      </div>
      {showReset && (
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 rounded-lg border border-nativz-border px-2.5 py-1 text-xs text-text-muted hover:text-text-primary hover:border-accent/20 transition-colors cursor-pointer"
        >
          <Plus size={12} />
          New
        </button>
      )}
    </header>
  );
}

function MentionBadges({
  mentions,
}: {
  mentions: Array<{ type: 'client' | 'team_member'; id: string; name: string }>;
}) {
  if (mentions.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 mt-2 px-1">
      {mentions.map((m) => (
        <span
          key={`${m.type}-${m.id}`}
          className="inline-flex items-center gap-1 rounded-full bg-accent/[0.08] px-2 py-0.5 text-[10px] text-accent-text"
        >
          {m.type === 'client' ? <Building2 size={10} /> : <User size={10} />}
          {m.name}
        </span>
      ))}
    </div>
  );
}
