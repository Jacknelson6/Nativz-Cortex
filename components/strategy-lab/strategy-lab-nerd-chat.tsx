'use client';

import { useState, useCallback, useRef, useEffect, useMemo, type ComponentType } from 'react';
import { BotMessageSquare, Loader2 } from 'lucide-react';
import { Conversation } from '@/components/ai/conversation';
import { AssistantMessage, UserMessage, type ChatMessage } from '@/components/ai/message';
import { ChatComposer, type ChatAttachment } from '@/components/ai/chat-composer';
import { processAttachments } from '@/lib/chat/process-attachments';
import { SlashCommandMenu, filterSlashCommands } from '@/components/nerd/slash-command-menu';
import { toast } from 'sonner';
import { detectArtifactType, extractArtifactTitle } from '@/lib/artifacts/types';
import { StrategyLabConversationExportButton } from './strategy-lab-conversation-export-button';
import { StrategyLabClientPickerPill } from './strategy-lab-client-picker-pill';
import { StrategyLabConversationHistoryRail } from './strategy-lab-conversation-history-rail';
import { StrategyLabTopicSearchChipBar } from './strategy-lab-topic-search-chip-bar';
import { cn } from '@/lib/utils/cn';
import { getAllCommands, getCommand } from '@/lib/nerd/slash-commands';
import {
  readStrategyLabNerdConversationId,
  writeStrategyLabNerdConversationId,
  clearStrategyLabNerdConversationId,
} from '@/lib/strategy-lab/nerd-conversation-storage';

// Quick-start prompts are tuned to push the Nerd toward artifact-style
// outputs (mermaid flows, structured scripts, effort/impact quadrants)
// that render as live visuals in the chat and export cleanly as PDFs.
const SUGGESTIONS = [
  {
    label: 'Full starter pack',
    prompt:
      'Produce a complete starter pack, all grounded in the attached research: (1) a mermaid flowchart content strategy map (pillars → topic clusters → first 3 video ideas each), (2) three fully written scripts with hook, beats, pattern interrupt, and CTA, (3) a mermaid quadrantChart ranking 10 video ideas on effort vs impact, and (4) a markdown table with a 2-week posting cadence for ',
  },
  {
    label: 'Content strategy map',
    prompt:
      'Build a content strategy map as a mermaid flowchart (pillars → topic clusters → first 3 video ideas each) grounded in the attached research for ',
  },
  {
    label: '3 full scripts',
    prompt:
      'Write three full scripts (hook, beats, pattern interrupt, CTA) from the highest-signal topics in the attached research for ',
  },
  {
    label: 'Effort vs impact',
    prompt:
      'Give me 12 video ideas ranked as a mermaid quadrantChart on effort vs impact, grounded in the attached research for ',
  },
  {
    label: 'Performance diagnosis',
    prompt:
      'Diagnose current social performance and produce a mermaid flowchart of symptom → cause → fix, with a 2-week action plan for ',
  },
];

// The tab nav shape the workspace passes down. We render it as a floating
// pill inside the chat container instead of above it, per the UI refactor.
interface MainTabSpec<Id extends string = string> {
  id: Id;
  label: string;
  icon: ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>;
}

type StrategyLabNerdChatProps = {
  clientId: string;
  clientName: string;
  clientSlug: string;
  /** Topic search IDs the user pinned in Strategy Lab — the initial attached set for the chat context. */
  pinnedTopicSearchIds: string[];
  /** Floating tab nav passed down from the workspace. Rendered inside the
   *  chat container's header so it visually belongs to the chat UI. */
  mainTabs: MainTabSpec[];
  activeMainTab: string;
  onMainTabChange: (next: string) => void;
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
  mainTabs,
  activeMainTab,
  onMainTabChange,
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

  // Topic search attachment — initial set comes from pinned + auto-attach
  // latest, both handled inside StrategyLabTopicSearchChipBar now. The
  // chip bar notifies us whenever the client's search list loads so we can
  // look up attached-search metadata for the PDF export.
  const [attachedSearchIds, setAttachedSearchIds] = useState<string[]>([]);
  const [clientSearches, setClientSearches] = useState<TopicSearchItem[]>([]);

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
  const pendingAttachmentsRef = useRef<ChatAttachment[]>([]);


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

        // Process any pending file attachments (PDF text extraction, image encoding)
        const rawAtts = pendingAttachmentsRef.current;
        pendingAttachmentsRef.current = [];
        const processed = rawAtts.length > 0 ? await processAttachments(rawAtts) : undefined;

        const res = await fetch('/api/nerd/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: chatHistory,
            mentions,
            sessionHint: hint ?? undefined,
            searchContext: attachedSearchIds.length > 0 ? attachedSearchIds : undefined,
            conversationId: conversationId ?? undefined,
            mode: 'strategy-lab' as const,
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

  const handleSaveArtifact = useCallback(async (content: string) => {
    try {
      const res = await fetch('/api/nerd/artifacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          conversation_id: conversationId ?? null,
          title: extractArtifactTitle(content),
          content,
          artifact_type: detectArtifactType(content),
        }),
      });
      if (res.ok) {
        toast.success('Artifact saved');
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        toast.error(err.error ?? 'Failed to save artifact');
      }
    } catch {
      toast.error('Failed to save artifact');
    }
  }, [clientId, conversationId]);

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

  const chatFooter = (
    <div className="shrink-0 px-4 pb-5 pt-3 md:px-8 md:pb-6">
      <div className="mx-auto flex max-w-3xl flex-col">
        <StrategyLabTopicSearchChipBar
          clientId={clientId}
          clientName={clientName}
          attachedSearchIds={attachedSearchIds}
          onToggle={toggleAttach}
          pinnedTopicSearchIds={pinnedTopicSearchIds}
          onSearchesLoaded={setClientSearches}
        />
        <ChatComposer
          variant="research"
          value={input}
          onChange={setInput}
          onSubmit={(atts: ChatAttachment[]) => {
            pendingAttachmentsRef.current = atts;
            handleSend();
          }}
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
        </ChatComposer>
      </div>
    </div>
  );

  const suggestions = SUGGESTIONS.map((s) => ({
    ...s,
    prompt: `${s.prompt}@${clientName.trim() || 'this client'}.`,
  }));

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden rounded-2xl border border-nativz-border/60 bg-background/40">
      {/* Left rail: strategy session history — every prior Nerd conversation
          for this client, grouped by recency. Replaces the old topic-search
          rail; research attachment moved to a compact chip bar above the
          chat input. */}
      <StrategyLabConversationHistoryRail
        clientId={clientId}
        clientName={clientName}
        activeConversationId={conversationId}
        onSelect={(id) => void handleSelectConversation(id)}
        onNewChat={handleReset}
        refreshToken={conversationsRefreshToken}
      />

      {/* Main chat column */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header: client picker · floating tab nav · export PDF */}
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-nativz-border/40 px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <StrategyLabClientPickerPill
              clientId={clientId}
              clientName={clientName}
              clientSlug={clientSlug}
            />
          </div>

          {/* Floating tab pill — inside the chat container per the UI
              refactor. Neutral styling so the chat input is the only
              colored element on the page. */}
          <div className="inline-flex shrink-0 gap-1 rounded-full border border-nativz-border/60 bg-surface/60 p-1 shadow-sm">
            {mainTabs.map((tab) => {
              const active = activeMainTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onMainTabChange(tab.id)}
                  className={cn(
                    'flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-surface-hover text-text-primary'
                      : 'text-text-muted hover:bg-surface-hover/60 hover:text-text-secondary',
                  )}
                >
                  <Icon size={14} aria-hidden />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5">
            {messages.length > 0 && (
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
            )}
          </div>
        </header>

      {loadingConversation && messages.length === 0 ? (
        <>
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
            <Loader2 size={26} className="animate-spin text-text-muted" />
            <p className="mt-3 text-base font-medium text-text-primary">
              {conversationTitle && conversationTitle !== 'New conversation'
                ? `Resuming: ${conversationTitle}`
                : 'Resuming your strategy chat'}
            </p>
            {conversationMessageCount > 0 && (
              <p className="mt-1 text-sm text-text-muted">
                Loading {conversationMessageCount} message
                {conversationMessageCount === 1 ? '' : 's'}…
              </p>
            )}
          </div>
          {chatFooter}
        </>
      ) : messages.length === 0 ? (
        <>
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-nativz-border/60 bg-surface/40">
              <BotMessageSquare size={28} className="text-text-muted" />
            </div>
            <h2 className="mb-2 text-2xl font-semibold tracking-tight text-text-primary">
              Strategy chat for {clientName.trim() || 'this client'}
            </h2>
            <p className="mb-8 max-w-md text-center text-base leading-relaxed text-text-muted">
              Cortex has full client context, knowledge vault access, and any topic searches you attach below.
              Ask about research, pillars, ideas, or performance.
            </p>
            <div className="flex max-w-xl flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setInput(s.prompt)}
                  className="cursor-pointer rounded-xl border border-nativz-border/60 bg-surface/40 px-4 py-2.5 text-sm text-text-secondary transition-colors hover:border-nativz-border hover:bg-surface-hover hover:text-text-primary"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          {chatFooter}
        </>
      ) : (
        <>
          <Conversation className="min-h-0 flex-1 overflow-y-auto px-4 md:px-8">
            <div className="mx-auto max-w-3xl divide-y divide-nativz-border/30 py-6">
              {messages.map((msg, index) => {
                const isLast = index === messages.length - 1;
                if (msg.role === 'assistant') {
                  // Inline "export this reply" button — only renders when the
                  // assistant message has finished streaming. Uses the same
                  // export pipeline as the header button but in compact icon
                  // mode, shipping only this one message to the PDF.
                  const hasContent = msg.content.trim().length > 0;
                  const isStreamingTarget = isLast && streaming;
                  return (
                    <div key={msg.id} className="py-2">
                      <AssistantMessage
                        message={msg}
                        isLast={isLast}
                        onRetry={() => handleSend('Continue')}
                        onSaveArtifact={handleSaveArtifact}
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
          {chatFooter}
        </>
      )}
      </div>
    </div>
  );
}
