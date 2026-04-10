'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { BotMessageSquare, Plus, Loader2 } from 'lucide-react';
import { Conversation } from '@/components/ai/conversation';
import { AssistantMessage, UserMessage, type ChatMessage } from '@/components/ai/message';
import { PromptInput } from '@/components/ai/prompt-input';
import { SlashCommandMenu, filterSlashCommands } from '@/components/nerd/slash-command-menu';
import { TopicSearchContextRail } from '@/components/nerd/topic-search-context-rail';
import { StrategyLabConversationExportButton } from './strategy-lab-conversation-export-button';
import { StrategyLabConversationPicker } from './strategy-lab-conversation-picker';
import { StrategyLabClientPickerPill } from './strategy-lab-client-picker-pill';
import { toast } from 'sonner';
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
  const [conversationTitle, setConversationTitle] = useState<string | null>(null);
  const [conversationMessageCount, setConversationMessageCount] = useState<number>(0);
  const [loadingConversation, setLoadingConversation] = useState(false);
  // Bumped whenever we create a new conversation or send a new user message
  // so the history dropdown refetches when the user pops it open next.
  const [conversationsRefreshToken, setConversationsRefreshToken] = useState(0);

  // Topic search attachment — initial set from pinned, mutable from the
  // TopicSearchContextRail on the left side of the chat.
  const [attachedSearchIds, setAttachedSearchIds] = useState<string[]>(pinnedTopicSearchIds);
  const [clientSearches, setClientSearches] = useState<TopicSearchItem[]>([]);
  const [searchesLoading, setSearchesLoading] = useState(false);

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
          title: string | null;
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
        setConversationTitle(data.title?.trim() ? data.title : null);
        setConversationMessageCount(loaded.length);
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

  const toggleAttach = useCallback((searchId: string) => {
    setAttachedSearchIds((prev) =>
      prev.includes(searchId) ? prev.filter((id) => id !== searchId) : [...prev, searchId],
    );
  }, []);

  // Used by the PDF export button to look up attached search titles.
  const attachedSearches = useMemo(() => {
    return attachedSearchIds
      .map((id) => clientSearches.find((s) => s.id === id))
      .filter((s): s is TopicSearchItem => !!s);
  }, [attachedSearchIds, clientSearches]);

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
                // Nudge the history dropdown to refetch so the new thread
                // appears next time the user pops it open.
                setConversationsRefreshToken((t) => t + 1);
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
    setConversationTitle(null);
    setConversationMessageCount(0);
    clearStrategyLabNerdConversationId(clientId);
    sessionHintRef.current =
      'User is in Strategy Lab with this client pinned. Primary job: create strategy, generate video ideas, script them, and produce shareable outputs. Prefer topic search, pillar, knowledge, and content tools. Be concise and actionable.';
    // Ask the picker to refetch the list — the current thread may no longer
    // be the latest, and a brand-new one is about to start.
    setConversationsRefreshToken((t) => t + 1);
  }

  /**
   * Switch to an existing conversation from the History dropdown. Aborts any
   * in-flight stream, fetches the thread's messages, updates the localStorage
   * pointer so subsequent mounts resume the correct thread, and clears the
   * first-turn session hint so we don't re-send it.
   */
  const handleSelectConversation = useCallback(
    async (selectedId: string) => {
      if (selectedId === conversationId) return;
      if (streaming) abortRef.current?.abort();
      setStreaming(false);
      setLoadingConversation(true);
      setMessages([]);
      try {
        const res = await fetch(`/api/nerd/conversations/${selectedId}`);
        if (!res.ok) {
          toast.error('Could not load that conversation');
          return;
        }
        const data = (await res.json()) as {
          id: string;
          title: string | null;
          messages: Array<{ id: string; role: string; content: string; tool_results: unknown }>;
        };
        const loaded: ChatMessage[] = (data.messages ?? []).map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          toolResults: (m.tool_results as ChatMessage['toolResults']) ?? undefined,
        }));
        setMessages(loaded);
        setConversationId(data.id);
        setConversationTitle(data.title?.trim() ? data.title : null);
        setConversationMessageCount(loaded.length);
        writeStrategyLabNerdConversationId(clientId, data.id);
        sessionHintRef.current = null;
      } catch {
        toast.error('Could not load that conversation');
      } finally {
        setLoadingConversation(false);
      }
    },
    [conversationId, streaming, clientId],
  );

  const inputArea = (
    <div className="shrink-0 border-t border-nativz-border/50 bg-surface/60 px-4 py-4 backdrop-blur-sm md:px-6">
      <div className="mx-auto max-w-3xl">
        <PromptInput
          variant="research"
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
    <div className="flex h-full min-h-[520px] flex-1 overflow-hidden rounded-xl border border-nativz-border/60 bg-background/40">
      {/* Left rail: topic searches the user can attach as chat context. Same
          component the admin Nerd uses so the two surfaces feel identical. */}
      <TopicSearchContextRail
        clientId={clientId}
        clientName={clientName}
        attachedSearchIds={attachedSearchIds}
        onToggleSearch={toggleAttach}
      />

      {/* Main chat column */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-nativz-border/50 px-4 py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <StrategyLabClientPickerPill
              clientId={clientId}
              clientName={clientName}
              clientSlug={clientSlug}
            />
            <span className="rounded-full bg-accent/[0.12] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-text/90">
              Strategy lab
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <StrategyLabConversationPicker
              clientId={clientId}
              activeConversationId={conversationId}
              onSelect={(id) => void handleSelectConversation(id)}
              refreshToken={conversationsRefreshToken}
              disabled={streaming}
            />
            {messages.length > 0 && (
              <>
                <StrategyLabConversationExportButton
                  clientId={clientId}
                  clientName={clientName}
                  conversationTitle={conversationTitle}
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
              </>
            )}
          </div>
        </header>

      {loadingConversation && messages.length === 0 ? (
        <>
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
            <Loader2 size={24} className="animate-spin text-accent-text" />
            <p className="mt-3 text-sm font-medium text-text-primary">
              {conversationTitle && conversationTitle !== 'New conversation'
                ? `Resuming: ${conversationTitle}`
                : 'Resuming your strategy chat'}
            </p>
            {conversationMessageCount > 0 && (
              <p className="mt-1 text-[11px] text-text-muted">
                Loading {conversationMessageCount} message
                {conversationMessageCount === 1 ? '' : 's'}…
              </p>
            )}
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
                  // Inline "export this reply" button — only renders when the
                  // assistant message has finished streaming (non-empty
                  // content, not currently the streaming target). Uses the
                  // same export pipeline as the header button but in compact
                  // icon mode, and ships only this one message to the PDF.
                  const hasContent = msg.content.trim().length > 0;
                  const isStreamingTarget = isLast && streaming;
                  return (
                    <div key={msg.id}>
                      <AssistantMessage
                        message={msg}
                        isLast={isLast}
                        onRetry={() => handleSend('Continue')}
                      />
                      {hasContent && !isStreamingTarget && (
                        <div className="flex justify-end pt-1 pb-2 pr-2">
                          <StrategyLabConversationExportButton
                            clientId={clientId}
                            clientName={clientName}
                            conversationTitle={`${clientName} — strategy note`}
                            messages={[msg]}
                            attachedSearches={attachedSearches.map((s) => ({
                              query: s.query,
                              created_at: s.created_at,
                            }))}
                            compact
                            ariaLabel="Export this reply as PDF"
                          />
                        </div>
                      )}
                    </div>
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
    </div>
  );
}
