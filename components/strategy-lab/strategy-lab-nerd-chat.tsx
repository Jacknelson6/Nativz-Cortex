'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { BotMessageSquare, Plus, X, Check, Search as SearchIcon, FileText, Clock, Loader2 } from 'lucide-react';
import { Conversation } from '@/components/ai/conversation';
import { AssistantMessage, UserMessage, type ChatMessage } from '@/components/ai/message';
import { PromptInput } from '@/components/ai/prompt-input';
import { SlashCommandMenu, filterSlashCommands } from '@/components/nerd/slash-command-menu';
import { StrategyLabConversationExportButton } from './strategy-lab-conversation-export-button';
import { cn } from '@/lib/utils/cn';
import { formatRelativeTime } from '@/lib/utils/format';
import { getAllCommands, getCommand } from '@/lib/nerd/slash-commands';
import {
  readStrategyLabNerdConversationId,
  writeStrategyLabNerdConversationId,
  clearStrategyLabNerdConversationId,
} from '@/lib/strategy-lab/nerd-conversation-storage';

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
  /** Topic search IDs the user pinned in Strategy Lab — the initial attached set for the chat context. */
  pinnedTopicSearchIds: string[];
};

interface TopicSearchItem {
  id: string;
  query: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  search_mode: string | null;
  platforms: string[] | null;
  volume: string | null;
  metrics: { trending_topics_count?: number; topic_score?: number } | null;
}

/**
 * Admin Nerd chat embedded in Strategy Lab — full tool access, client scoped via
 * @mention resolution, and topic-search attachment so Cortex can reason over the
 * actual research findings (not just IDs).
 *
 * Strategy Lab is the primary Nerd surface; the chat is where strategy, content
 * pillar, video idea, and scripting work lives. Attached topic searches flow into
 * the `searchContext` field on `/api/nerd/chat`, which injects the full topic
 * search content (summary, trending topics, metrics, video ideas, emotions) into
 * the system prompt — same path `/admin/nerd` already uses.
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

  // Persistent conversation: one "current" strategy chat per client. Loaded
  // from localStorage on mount, written back when the server assigns an ID
  // on the first streamed chunk.
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loadingConversation, setLoadingConversation] = useState(false);

  // Topic search attachment — initial set from pinned, mutable from the picker.
  const [attachedSearchIds, setAttachedSearchIds] = useState<string[]>(pinnedTopicSearchIds);
  const [clientSearches, setClientSearches] = useState<TopicSearchItem[]>([]);
  const [searchesLoading, setSearchesLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  // Slash command menu — same /ideas, /script, /pillars, /hooks, /strategy etc.
  // commands the admin Nerd registers centrally.
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const slashCommands = useMemo(
    () =>
      getAllCommands().map((c) => ({
        name: c.name,
        description: c.description,
        type: c.type,
        example: c.example,
      })),
    [],
  );
  const filteredSlashCommands = useMemo(
    () => filterSlashCommands(slashQuery, slashCommands),
    [slashQuery, slashCommands],
  );

  const sessionHintRef = useRef<string | null>(
    'User is in Strategy Lab with this client pinned. Primary job: create strategy, generate video ideas, script them, and produce shareable outputs. Prefer topic search, pillar, knowledge, and content tools. Be concise and actionable.',
  );
  const abortRef = useRef<AbortController | null>(null);

  // Load this client's topic searches so the picker + chip labels work.
  // Also auto-attach the most recent completed search on first load if nothing
  // was pinned from Strategy Lab — keeps the chat from cold-starting with no
  // research context when the user just opens the lab and types a question.
  useEffect(() => {
    if (!clientId) {
      setClientSearches([]);
      return;
    }
    let cancelled = false;
    setSearchesLoading(true);
    fetch(`/api/nerd/searches?clientId=${clientId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const fetched = (data.searches ?? []) as TopicSearchItem[];
        setClientSearches(fetched);
        // Auto-attach latest completed search, only if the user hasn't already
        // attached anything (nothing from pinned, nothing the picker has set).
        setAttachedSearchIds((prev) => {
          if (prev.length > 0) return prev;
          const latestCompleted = fetched.find((s) => s.status === 'completed');
          return latestCompleted ? [latestCompleted.id] : prev;
        });
      })
      .catch(() => {
        if (!cancelled) setClientSearches([]);
      })
      .finally(() => {
        if (!cancelled) setSearchesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  // Resume the persisted conversation for this client. localStorage holds
  // one conversation-id-per-client; if it's set we hydrate prior messages
  // via the same endpoint /admin/nerd uses.
  useEffect(() => {
    if (!clientId) return;
    const storedId = readStrategyLabNerdConversationId(clientId);
    if (!storedId) return;

    let cancelled = false;
    setLoadingConversation(true);
    fetch(`/api/nerd/conversations/${storedId}`)
      .then(async (res) => {
        if (!res.ok) {
          // Conversation was deleted or doesn't belong to this user — drop the stale pointer.
          clearStrategyLabNerdConversationId(clientId);
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
        // Resumed conversation — don't re-send the session hint on the first
        // new user turn, since the model already has the history.
        sessionHintRef.current = null;
      })
      .catch(() => {
        /* stale pointer — leave as-is, new chat starts clean */
      })
      .finally(() => {
        if (!cancelled) setLoadingConversation(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  // Detect / at the start of the input (and before any space) and open the
  // slash command menu. Matches the admin Nerd's detection logic.
  useEffect(() => {
    if (input.startsWith('/') && !input.includes(' ')) {
      setSlashQuery(input.slice(1));
      setShowSlashMenu(true);
      setSlashActiveIndex(0);
    } else {
      setShowSlashMenu(false);
    }
  }, [input]);

  // Keep the active index in range as the filter shrinks the list.
  useEffect(() => {
    if (slashActiveIndex >= filteredSlashCommands.length) {
      setSlashActiveIndex(Math.max(0, filteredSlashCommands.length - 1));
    }
  }, [filteredSlashCommands.length, slashActiveIndex]);

  const handleSlashSelect = useCallback(
    (cmd: { name: string; type: string }) => {
      const command = getCommand(cmd.name);
      if (!command) return;
      if (command.type === 'ai' && command.expandPrompt) {
        // Fill the input with the expanded prompt — user presses Enter to send.
        setInput(command.expandPrompt(''));
        setShowSlashMenu(false);
      } else if (command.type === 'direct') {
        // Direct commands are executed via /api/nerd/command on the admin
        // Nerd; Strategy Lab currently doesn't expose direct commands so
        // fall back to expandPrompt treatment if one ever lands here.
        setShowSlashMenu(false);
      }
    },
    [],
  );

  // Keyboard nav for the slash menu — Arrow keys move selection, Enter picks,
  // Escape closes. Runs BEFORE PromptInput's own Enter handling via the
  // onKeyDown prop so it can preventDefault to block submit.
  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!showSlashMenu || filteredSlashCommands.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashActiveIndex((i) => (i + 1) % filteredSlashCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashActiveIndex((i) =>
          (i - 1 + filteredSlashCommands.length) % filteredSlashCommands.length,
        );
      } else if (e.key === 'Enter' && !e.shiftKey) {
        const cmd = filteredSlashCommands[slashActiveIndex];
        if (cmd) {
          e.preventDefault();
          handleSlashSelect(cmd);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowSlashMenu(false);
      }
    },
    [showSlashMenu, filteredSlashCommands, slashActiveIndex, handleSlashSelect],
  );

  // Close the picker when the user clicks outside or presses Escape.
  useEffect(() => {
    if (!pickerOpen) return;
    function handleClick(e: MouseEvent) {
      if (!pickerRef.current) return;
      if (!pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPickerOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [pickerOpen]);

  const toggleAttach = useCallback((searchId: string) => {
    setAttachedSearchIds((prev) =>
      prev.includes(searchId) ? prev.filter((id) => id !== searchId) : [...prev, searchId],
    );
  }, []);

  const attachedSearches = useMemo(() => {
    // Preserve insertion order so the chip row matches the user's selection order.
    return attachedSearchIds
      .map((id) => clientSearches.find((s) => s.id === id))
      .filter((s): s is TopicSearchItem => !!s);
  }, [attachedSearchIds, clientSearches]);

  const completedSearches = useMemo(
    () => clientSearches.filter((s) => s.status === 'completed'),
    [clientSearches],
  );

  const handleSend = useCallback(
    async (text?: string) => {
      const content = (text ?? input).trim();
      if (!content || streaming) return;

      setInput('');

      const mentions = [
        { type: 'client' as const, id: clientId, name: clientName, slug: clientSlug },
      ];

      const hint = sessionHintRef.current;
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
            // Backend (/api/nerd/chat) pulls each ID's full topic_searches row —
            // query, summary, trending_topics, metrics, emotions, content_breakdown —
            // and injects the formatted content into the system prompt. Same path
            // the admin Nerd uses at /admin/nerd.
            searchContext: attachedSearchIds.length > 0 ? attachedSearchIds : undefined,
            conversationId: conversationId ?? undefined,
            // Tells /api/nerd/chat to append the Strategy Lab scripting
            // addendum + preloaded scripting skills to the system prompt.
            mode: 'strategy-lab' as const,
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
                // First chunk of a brand-new conversation — server assigned the id.
                // Persist it so we resume next time the lab reopens for this client.
                setConversationId(chunk.conversationId);
                writeStrategyLabNerdConversationId(clientId, chunk.conversationId);
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
    [input, streaming, messages, clientId, clientName, clientSlug, attachedSearchIds, conversationId],
  );

  function handleReset() {
    if (streaming) abortRef.current?.abort();
    setMessages([]);
    setConversationId(null);
    clearStrategyLabNerdConversationId(clientId);
    sessionHintRef.current =
      'User is in Strategy Lab with this client pinned. Primary job: create strategy, generate video ideas, script them, and produce shareable outputs. Prefer topic search, pillar, knowledge, and content tools. Be concise and actionable.';
  }

  const inputArea = (
    <div className="shrink-0 border-t border-nativz-border/50 bg-surface/80 px-4 py-4 backdrop-blur-sm">
      <div className="mx-auto max-w-3xl">
        <PromptInput
          value={input}
          onChange={setInput}
          onSubmit={() => handleSend()}
          disabled={streaming}
          placeholder={`Ask Cortex about ${clientName.trim() || 'this client'}… (try /ideas or /script)`}
          blockEnterSubmit={showSlashMenu}
          onKeyDown={handleInputKeyDown}
        >
          {showSlashMenu && (
            <SlashCommandMenu
              query={slashQuery}
              commands={slashCommands}
              onSelect={handleSlashSelect}
              activeIndex={slashActiveIndex}
            />
          )}
        </PromptInput>
      </div>
    </div>
  );

  const suggestions = SUGGESTIONS.map((s) => ({
    ...s,
    prompt: `${s.prompt}@${clientName.trim() || 'this client'}.`,
  }));

  return (
    <div className="flex h-full min-h-[520px] flex-1 flex-col overflow-hidden rounded-xl border border-nativz-border/60 bg-background/40">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-nativz-border/50 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <BotMessageSquare className="h-4 w-4 shrink-0 text-accent-text" aria-hidden />
          <span className="text-sm font-semibold text-text-primary">Chat with the Nerd</span>
          <span className="rounded-full bg-accent/[0.12] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-text/90">
            Strategy lab
          </span>
        </div>
        {messages.length > 0 ? (
          <div className="flex items-center gap-1.5">
            <StrategyLabConversationExportButton
              clientId={clientId}
              clientName={clientName}
              conversationTitle={null}
              messages={messages}
              attachedSearches={attachedSearches.map((s) => ({
                query: s.query,
                created_at: s.created_at,
              }))}
              disabled={streaming}
            />
            <button
              type="button"
              onClick={handleReset}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-nativz-border px-2.5 py-1 text-xs text-text-muted transition-colors hover:border-accent/20 hover:text-text-primary"
            >
              <Plus size={12} aria-hidden />
              New chat
            </button>
          </div>
        ) : null}
      </header>

      {/* Attached research bar — attached topic searches flow into /api/nerd/chat
          as searchContext and inject the full topic search content into the
          system prompt. */}
      <div className="relative flex shrink-0 items-center gap-2 border-b border-nativz-border/40 bg-background/20 px-4 py-2">
        <FileText size={12} className="shrink-0 text-text-muted" aria-hidden />
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-text-muted">
          Research
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {attachedSearches.length === 0 ? (
            <span className="text-[11px] text-text-muted/70">
              {searchesLoading && attachedSearchIds.length > 0
                ? 'Loading…'
                : 'No searches attached'}
            </span>
          ) : (
            attachedSearches.map((s) => (
              <span
                key={s.id}
                className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-accent/25 bg-accent-surface/20 pl-2 pr-1 py-0.5 text-[11px] text-accent-text"
              >
                <span className="truncate" title={s.query}>{s.query}</span>
                <button
                  type="button"
                  onClick={() => toggleAttach(s.id)}
                  className="cursor-pointer rounded-full p-0.5 text-accent-text/70 hover:bg-accent/20 hover:text-accent-text"
                  aria-label={`Remove ${s.query} from context`}
                >
                  <X size={10} />
                </button>
              </span>
            ))
          )}
        </div>
        <div ref={pickerRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className={cn(
              'inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1 text-[11px] transition-colors',
              pickerOpen
                ? 'border-accent/40 bg-accent-surface/30 text-accent-text'
                : 'border-nativz-border text-text-muted hover:border-accent/20 hover:text-text-primary',
            )}
          >
            <Plus size={11} />
            Add research
          </button>
          {pickerOpen && (
            <div className="absolute right-0 top-full z-30 mt-1 w-[320px] overflow-hidden rounded-xl border border-nativz-border bg-surface shadow-elevated">
              <div className="flex items-center justify-between border-b border-nativz-border/60 px-3 py-2">
                <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                  {clientName}
                </span>
                <span className="text-[10px] text-text-muted/70">
                  {attachedSearchIds.length} of {completedSearches.length} attached
                </span>
              </div>
              <div className="max-h-[320px] overflow-y-auto p-1.5">
                {searchesLoading ? (
                  <div className="space-y-1.5 p-1.5">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-11 animate-pulse rounded-lg bg-surface-hover" />
                    ))}
                  </div>
                ) : completedSearches.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-center">
                    <SearchIcon size={16} className="text-text-muted/40" />
                    <p className="text-xs text-text-muted">No completed searches yet</p>
                    <p className="text-[10px] text-text-muted/60">
                      Run a topic search for {clientName} to attach it here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {completedSearches.map((s) => {
                      const isAttached = attachedSearchIds.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => toggleAttach(s.id)}
                          className={cn(
                            'group flex w-full cursor-pointer items-start gap-2 rounded-lg border px-2 py-2 text-left transition-colors',
                            isAttached
                              ? 'border-accent/25 bg-accent-surface/15'
                              : 'border-transparent hover:bg-surface-hover',
                          )}
                        >
                          <div className="mt-0.5 shrink-0">
                            {isAttached ? (
                              <Check size={12} className="text-accent-text" />
                            ) : (
                              <div className="h-3 w-3 rounded-full border border-text-muted/30 group-hover:border-accent/50" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p
                              className={cn(
                                'truncate text-xs leading-snug',
                                isAttached ? 'font-medium text-text-primary' : 'text-text-secondary',
                              )}
                            >
                              {s.query}
                            </p>
                            <div className="mt-0.5 flex items-center gap-1.5">
                              <span className="flex items-center gap-0.5 text-[10px] text-text-muted/50">
                                <Clock size={8} />
                                {formatRelativeTime(s.created_at)}
                              </span>
                              {s.metrics?.topic_score != null && (
                                <span className="text-[10px] text-text-muted/50">
                                  Score {s.metrics.topic_score}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {loadingConversation && messages.length === 0 ? (
        <>
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
            <Loader2 size={24} className="animate-spin text-accent-text" />
            <p className="mt-3 text-xs text-text-muted">Resuming your strategy chat…</p>
          </div>
          {inputArea}
        </>
      ) : messages.length === 0 ? (
        <>
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-nativz-border bg-gradient-to-b from-surface to-background shadow-[0_0_24px_rgba(4,107,210,0.1)]">
              <BotMessageSquare size={24} className="text-accent-text" />
            </div>
            <h2 className="mb-1 text-xl font-semibold tracking-tight text-text-primary">
              Strategy chat for {clientName.trim() || 'this client'}
            </h2>
            <p className="mb-8 max-w-md text-center text-sm leading-relaxed text-text-muted">
              Cortex has full client context, knowledge vault access, and any topic searches you attach above.
              Ask about research, pillars, ideas, or performance.
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
