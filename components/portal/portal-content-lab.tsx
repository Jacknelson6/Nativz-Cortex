'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { AgencyClientAvatar } from '@/components/strategy-lab/agency-client-avatar';
import { useAgencyBrand } from '@/lib/agency/use-agency-brand';
import { Conversation } from '@/components/ai/conversation';
import { AssistantMessage, UserMessage, type ChatMessage } from '@/components/ai/message';
import { ChatComposer, type ChatAttachment } from '@/components/ai/chat-composer';
import { processAttachments } from '@/lib/chat/process-attachments';
import { SlashCommandMenu, filterSlashCommands } from '@/components/nerd/slash-command-menu';
import { StrategyLabConversationHistoryRail } from '@/components/strategy-lab/strategy-lab-conversation-history-rail';
import { StrategyLabTopicSearchChipBar } from '@/components/strategy-lab/strategy-lab-topic-search-chip-bar';
import { StrategyLabAttachResearchDialog } from '@/components/strategy-lab/strategy-lab-attach-research-dialog';
import { getAllCommands, getCommand } from '@/lib/nerd/slash-commands';
import {
  readStrategyLabNerdConversationId,
  writeStrategyLabNerdConversationId,
  clearStrategyLabNerdConversationId,
} from '@/lib/strategy-lab/nerd-conversation-storage';

/**
 * Portal Content Lab — the client-facing variant of StrategyLabNerdChat.
 *
 * Differences from the admin surface:
 * - No client picker (viewer is locked to their org-bound client)
 * - No cross-client history — the history rail is scoped to this client,
 *   same as admin, but there's no way to switch to another
 * - No header tabs (analytics / knowledge base views don't exist here)
 * - No export / share buttons in the header (v1 — revisit if asked)
 * - Sends `portalMode: true` alongside `mode: 'strategy-lab'` so the
 *   chat route picks the portal-flavored addendum and enforces the
 *   PORTAL_ALLOWED_TOOLS allowlist
 *
 * The topic plan PDF download path uses the existing
 * `/api/topic-plans/[id]/pdf` route, which already RLS-checks the
 * caller's `organization_id` — no portal-specific wiring needed.
 */

const SUGGESTIONS = [
  {
    label: 'Generate video ideas',
    prompt:
      'Generate a topic plan of video ideas, grounded in the attached research and our knowledge vault, for ',
  },
  {
    label: 'Generate scripts',
    prompt:
      'Write three full scripts (hook, beats, pattern interrupt, CTA) from the highest-signal topics in the attached research for ',
  },
  {
    label: 'Explain this topic search',
    prompt:
      'Summarize the attached topic search — what\'s resonating, the strongest themes, the audience sentiment, and what it means for ',
  },
  {
    label: 'What does this mean?',
    prompt: 'What does this mean in the context of ',
  },
];

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

interface PortalContentLabProps {
  clientId: string;
  clientName: string;
  clientSlug: string;
}

export function PortalContentLab({ clientId, clientName, clientSlug }: PortalContentLabProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState<string | null>(null);
  const [conversationMessageCount, setConversationMessageCount] = useState<number>(0);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [conversationsRefreshToken, setConversationsRefreshToken] = useState(0);

  const [attachedSearchIds, setAttachedSearchIds] = useState<string[]>([]);
  const [, setClientSearches] = useState<TopicSearchItem[]>([]);
  const [attachResearchOpen, setAttachResearchOpen] = useState(false);

  const [clientLogoUrl, setClientLogoUrl] = useState<string | null>(null);
  const { brandName: agencyName, brand: agencyBrand } = useAgencyBrand();
  const wideAgencyLogoPath =
    agencyBrand === 'anderson' ? '/anderson-logo-dark.svg' : '/nativz-logo.svg';

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      try {
        const mentionsRes = await fetch('/api/nerd/mentions');
        if (mentionsRes.ok) {
          const data = (await mentionsRes.json()) as {
            clients?: Array<{ id: string; avatarUrl?: string | null }>;
          };
          const match = (data.clients ?? []).find((c) => c.id === clientId);
          if (match?.avatarUrl) {
            if (!cancelled) setClientLogoUrl(match.avatarUrl);
            return;
          }
        }
        const clientRes = await fetch(`/api/clients/${clientId}`);
        if (clientRes.ok) {
          const client = (await clientRes.json()) as { logo_url?: string | null };
          if (!cancelled) setClientLogoUrl(client.logo_url ?? null);
        }
      } catch {
        if (!cancelled) setClientLogoUrl(null);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

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
    'User is in the portal Content Lab. You are scoped to this one client only. Primary job: create strategy, generate video ideas, script them, and produce shareable outputs. Be concise and actionable.',
  );
  const abortRef = useRef<AbortController | null>(null);
  const pendingAttachmentsRef = useRef<ChatAttachment[]>([]);

  useEffect(() => {
    if (!clientId) return;
    const storedId = readStrategyLabNerdConversationId(clientId);
    if (!storedId) return;

    let cancelled = false;
    setLoadingConversation(true);
    fetch(`/api/nerd/conversations/${storedId}`)
      .then(async (res) => {
        if (!res.ok) {
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
        sessionHintRef.current = null;
      })
      .catch(() => { /* stale pointer */ })
      .finally(() => {
        if (!cancelled) setLoadingConversation(false);
      });

    return () => { cancelled = true; };
  }, [clientId]);

  useEffect(() => {
    if (input.startsWith('/') && !input.includes(' ')) {
      setSlashQuery(input.slice(1));
      setShowSlashMenu(true);
      setSlashActiveIndex(0);
    } else {
      setShowSlashMenu(false);
    }
  }, [input]);

  useEffect(() => {
    if (slashActiveIndex >= filteredSlashCommands.length) {
      setSlashActiveIndex(Math.max(0, filteredSlashCommands.length - 1));
    }
  }, [filteredSlashCommands.length, slashActiveIndex]);

  const handleSlashSelect = useCallback((cmd: { name: string; type: string }) => {
    const command = getCommand(cmd.name);
    if (!command) return;
    if (command.type === 'ai' && command.expandPrompt) {
      setInput(command.expandPrompt(''));
      setShowSlashMenu(false);
    } else if (command.type === 'direct') {
      setShowSlashMenu(false);
    }
  }, []);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!showSlashMenu || filteredSlashCommands.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashActiveIndex((i) => (i + 1) % filteredSlashCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashActiveIndex(
          (i) => (i - 1 + filteredSlashCommands.length) % filteredSlashCommands.length,
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

  const handleSend = useCallback(
    async (text?: string) => {
      const content = (text ?? input).trim();
      if (!content || streaming) return;

      setInput('');

      // Auto-inject this portal's client as the only mention — the chat
      // route uses this to resolve `portalClientName` for the addendum
      // intro and to gate portal-scoped tools.
      const mentions = [
        { type: 'client' as const, id: clientId, name: clientName, slug: clientSlug },
      ];

      const hint = sessionHintRef.current;
      sessionHintRef.current = null;

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(), role: 'user', content, createdAt: Date.now(),
      };
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(), role: 'assistant', content: '', toolResults: [], createdAt: Date.now(),
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
            mentions,
            sessionHint: hint ?? undefined,
            searchContext: attachedSearchIds.length > 0 ? attachedSearchIds : undefined,
            conversationId: conversationId ?? undefined,
            mode: 'strategy-lab' as const,
            portalMode: true,
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
                writeStrategyLabNerdConversationId(clientId, chunk.conversationId);
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

  const handleReset = useCallback(() => {
    if (streaming) abortRef.current?.abort();
    setMessages([]);
    setConversationId(null);
    setConversationTitle(null);
    setConversationMessageCount(0);
    clearStrategyLabNerdConversationId(clientId);
    sessionHintRef.current =
      'User is in the portal Content Lab. You are scoped to this one client only. Primary job: create strategy, generate video ideas, script them, and produce shareable outputs. Be concise and actionable.';
    setConversationsRefreshToken((t) => t + 1);
  }, [streaming, clientId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        handleReset();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleReset]);

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
          pinnedTopicSearchIds={[]}
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
          onAttachResearch={() => setAttachResearchOpen(true)}
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

      <StrategyLabAttachResearchDialog
        open={attachResearchOpen}
        onClose={() => setAttachResearchOpen(false)}
        clientId={clientId}
        clientName={clientName}
        clientSlug={clientSlug}
        attachedSearchIds={attachedSearchIds}
        onToggle={toggleAttach}
      />
    </div>
  );

  const suggestions = SUGGESTIONS.map((s) => ({
    ...s,
    prompt: `${s.prompt}${clientName.trim() || 'this client'}.`,
  }));

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden rounded-2xl border border-nativz-border/60 bg-background/40">
      <StrategyLabConversationHistoryRail
        clientId={clientId}
        clientName={clientName}
        activeConversationId={conversationId}
        onSelect={(id) => void handleSelectConversation(id)}
        onNewChat={handleReset}
        refreshToken={conversationsRefreshToken}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="relative flex shrink-0 items-center justify-between gap-3 border-b border-nativz-border/40 px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <AgencyClientAvatar
              clientName={clientName}
              clientLogoUrl={clientLogoUrl}
              size="sm"
            />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold text-text-primary">{clientName}</span>
              <span className="text-xs text-text-muted">Content Lab</span>
            </div>
          </div>
        </header>

        {loadingConversation && messages.length === 0 ? (
          <>
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
              <Loader2 size={26} className="animate-spin text-text-muted" />
              <p className="mt-3 text-base font-medium text-text-primary">
                {conversationTitle && conversationTitle !== 'New conversation'
                  ? `Resuming: ${conversationTitle}`
                  : 'Resuming your Content Lab chat'}
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
              <div className="mb-6 flex items-center gap-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={wideAgencyLogoPath}
                  alt={agencyName}
                  className="h-10 w-auto max-w-[260px] object-contain"
                />
                <span className="text-2xl font-light text-text-muted/60" aria-hidden>×</span>
                <span className="text-2xl font-semibold text-text-primary">
                  {clientName.trim() || 'Client'}
                </span>
              </div>
              <h2 className="mb-8 text-2xl font-semibold tracking-tight text-text-primary">
                What are we building today?
              </h2>
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
                    return (
                      <div key={msg.id} className="py-2">
                        <AssistantMessage
                          message={msg}
                          isLast={isLast}
                          onRetry={() => handleSend('Continue')}
                          avatarOverride={
                            <AgencyClientAvatar
                              clientName={clientName}
                              clientLogoUrl={clientLogoUrl}
                              size="sm"
                            />
                          }
                        />
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
