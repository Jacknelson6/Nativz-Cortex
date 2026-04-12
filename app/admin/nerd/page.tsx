'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Building2, User, Plus, History, Settings, BotMessageSquare } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Conversation } from '@/components/ai/conversation';
import { AssistantMessage, UserMessage, type ChatMessage } from '@/components/ai/message';
import { ChatComposer, type ChatAttachment } from '@/components/ai/chat-composer';
import { processAttachments } from '@/lib/chat/process-attachments';
import { MentionAutocomplete, type MentionOption } from '@/components/ai/mention-autocomplete';
import { ConversationSidebar } from '@/components/nerd/conversation-sidebar';
import { TopicSearchContextRail } from '@/components/nerd/topic-search-context-rail';
import { SlashCommandMenu, filterSlashCommands } from '@/components/nerd/slash-command-menu';
import { getAllCommands, getCommand, type SlashCommand } from '@/lib/nerd/slash-commands';
import { toast } from 'sonner';
import { detectArtifactType, extractArtifactTitle } from '@/lib/artifacts/types';
import { ConversationShareButton } from '@/components/ai/conversation-share-button';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NerdPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversationIdParam = searchParams.get('c');
  const strategyClientId = searchParams.get('strategyClient');
  const strategyBoardId = searchParams.get('strategyBoardId');
  const strategyBoardName = searchParams.get('strategyBoardName');
  const strategySource = searchParams.get('strategySource');

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(conversationIdParam);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loadingConvo, setLoadingConvo] = useState(false);
  const [attachedSearchIds, setAttachedSearchIds] = useState<string[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // @mention state
  const [mentionOptions, setMentionOptions] = useState<MentionOption[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [activeMentions, setActiveMentions] = useState<Array<{ type: 'client' | 'team_member'; id: string; name: string; slug?: string }>>([]);

  // Slash command state
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const slashCommands = useMemo(() => getAllCommands(), []);
  const filteredSlashCommands = useMemo(
    () => filterSlashCommands(slashQuery, slashCommands),
    [slashQuery, slashCommands],
  );

  const abortRef = useRef<AbortController | null>(null);
  const pendingAttachmentsRef = useRef<ChatAttachment[]>([]);
  const strategyClientPrefilledRef = useRef(false);
  const strategySessionHintRef = useRef<string | null>(
    strategySource === 'strategy-lab'
      ? 'User opened this conversation from Strategy Lab. Prefer strategy, analytics, affiliate, and analysis-board tools where relevant.'
      : null,
  );

  const mentionsVisible = showMentions && mentionOptions.some((o) =>
    o.name.toLowerCase().includes(mentionQuery.toLowerCase()),
  );

  // Check super_admin status
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('users').select('is_super_admin').eq('id', user.id).single();
      setIsSuperAdmin(data?.is_super_admin === true);
    })();
  }, []);

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

  // Strategy Lab deep link: /admin/nerd?strategyClient=<uuid> — prefill input and client mention
  useEffect(() => {
    if (strategyClientPrefilledRef.current) return;
    if (!strategyClientId || mentionOptions.length === 0) return;
    const client = mentionOptions.find((o) => o.type === 'client' && o.id === strategyClientId);
    if (!client) return;
    strategyClientPrefilledRef.current = true;
    const boardPrompt =
      strategyBoardId && strategyBoardName
        ? `Review analysis board "${strategyBoardName}" (board_id: ${strategyBoardId}) for @${client.name}. Use get_analysis_board_summary first, then recommend what to keep, cut, or turn into shoots. `
        : `Review our content strategy, pillars, and recent performance for @${client.name}. `;
    setInput(boardPrompt);
    setActiveMentions((prev) => {
      if (prev.some((m) => m.id === client.id && m.type === 'client')) return prev;
      return [...prev, { type: 'client' as const, id: client.id, name: client.name, slug: client.slug }];
    });
    const params = new URLSearchParams(searchParams.toString());
    params.delete('strategyClient');
    params.delete('strategyBoardId');
    params.delete('strategyBoardName');
    params.delete('strategySource');
    const qs = params.toString();
    router.replace(qs ? `/admin/nerd?${qs}` : '/admin/nerd', { scroll: false });
  }, [strategyClientId, strategyBoardId, strategyBoardName, mentionOptions, searchParams, router]);

  const loadConversation = useCallback(async (id: string) => {
    setLoadingConvo(true);
    try {
      const res = await fetch(`/api/nerd/conversations/${id}`);
      if (!res.ok) {
        router.replace('/admin/nerd');
        return;
      }
      const data = await res.json();
      const loadedMessages: ChatMessage[] = (data.messages ?? []).map((m: { id: string; role: string; content: string; tool_results: unknown }) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        toolResults: m.tool_results ?? undefined,
      }));
      setMessages(loadedMessages);
      setConversationId(id);
    } catch {
      router.replace('/admin/nerd');
    } finally {
      setLoadingConvo(false);
    }
  }, [router]);

  // Load conversation from URL param
  useEffect(() => {
    if (conversationIdParam) {
      loadConversation(conversationIdParam);
    }
  }, [conversationIdParam, loadConversation]);

  // Detect /slash command trigger
  useEffect(() => {
    if (input.startsWith('/') && !input.includes(' ')) {
      setSlashQuery(input.slice(1));
      setShowSlashMenu(true);
      setSlashActiveIndex(0);
    } else {
      setShowSlashMenu(false);
    }
  }, [input]);

  // Keep active index in range as the filter shrinks.
  useEffect(() => {
    if (slashActiveIndex >= filteredSlashCommands.length) {
      setSlashActiveIndex(Math.max(0, filteredSlashCommands.length - 1));
    }
  }, [filteredSlashCommands.length, slashActiveIndex]);

  // Detect @mention trigger
  useEffect(() => {
    const cursorPos = input.length;
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

  function handleSlashSelect(cmd: { name: string; type: string }) {
    const command = getCommand(cmd.name);
    if (!command) return;

    if (command.type === 'ai' && command.expandPrompt) {
      // Replace input with the expanded prompt
      setInput(command.expandPrompt(''));
      setShowSlashMenu(false);
    } else if (command.type === 'direct') {
      // Execute directly
      setInput('');
      setShowSlashMenu(false);
      executeDirectCommand(command);
    }
  }

  // Keyboard nav for the slash menu — Arrow keys move selection, Enter picks,
  // Escape closes. Runs BEFORE PromptInput's own Enter handling.
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
    // handleSlashSelect is a plain function closed over component state —
    // depending on it would cause endless re-renders; safe to omit since
    // React still sees the latest function via closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showSlashMenu, filteredSlashCommands, slashActiveIndex],
  );

  async function executeDirectCommand(cmd: SlashCommand) {
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: `/${cmd.name}` };
    const assistantMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: '', toolResults: [] };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    try {
      const res = await fetch('/api/nerd/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd.name }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Command failed' }));
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: `Error: ${err.error}` } : m)),
        );
        return;
      }

      const result = await res.json();
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: result.content, toolResults: result.toolResults } : m)),
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: 'Command failed. Try again.' } : m)),
      );
    }
  }

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

    // Intercept slash commands
    if (content.startsWith('/')) {
      const spaceIdx = content.indexOf(' ');
      const cmdName = spaceIdx > 0 ? content.slice(1, spaceIdx) : content.slice(1);
      const cmdArgs = spaceIdx > 0 ? content.slice(spaceIdx + 1).trim() : '';
      const cmd = getCommand(cmdName);

      if (cmd) {
        setInput('');
        setShowSlashMenu(false);

        if (cmd.type === 'direct') {
          executeDirectCommand(cmd);
          return;
        }
        if (cmd.type === 'ai' && cmd.expandPrompt) {
          // Expand and send as AI message
          const expanded = cmd.expandPrompt(cmdArgs);
          handleSend(expanded);
          return;
        }
      }
    }

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

      // Process any pending file attachments (PDF text extraction, image encoding)
      const rawAtts = pendingAttachmentsRef.current;
      pendingAttachmentsRef.current = [];
      const processed = rawAtts.length > 0 ? await processAttachments(rawAtts) : undefined;

      const res = await fetch('/api/nerd/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: chatHistory,
          mentions: messageMentions.length > 0 ? messageMentions : undefined,
          conversationId: conversationId ?? undefined,
          sessionHint: strategySessionHintRef.current ?? undefined,
          searchContext: attachedSearchIds.length > 0 ? attachedSearchIds : undefined,
          attachments: processed && processed.length > 0 ? processed : undefined,
        }),
        signal: controller.signal,
      });
      strategySessionHintRef.current = null;

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
            } else if (chunk.type === 'conversation') {
              // Set the conversation ID from the server
              const newConvoId = chunk.conversationId;
              setConversationId(newConvoId);
              // Update URL without full navigation
              window.history.replaceState(null, '', `/admin/nerd?c=${newConvoId}`);
            }
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
  }, [input, streaming, messages, activeMentions, conversationId]);

  const handleSaveArtifact = useCallback(async (content: string) => {
    const clientMention = activeMentions.find((m) => m.type === 'client');
    try {
      const res = await fetch('/api/nerd/artifacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientMention?.id ?? null,
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
  }, [activeMentions, conversationId]);

  function handleReset() {
    if (streaming) abortRef.current?.abort();
    setMessages([]);
    setActiveMentions([]);
    setAttachedSearchIds([]);
    setConversationId(null);
    router.replace('/admin/nerd');
  }

  function handleSelectConversation(id: string) {
    if (streaming) abortRef.current?.abort();
    setStreaming(false);
    setActiveMentions([]);
    router.replace(`/admin/nerd?c=${id}`);
  }

  // Active client mentions for the badge + rail
  const activeClientMentions = activeMentions.filter((m) => m.type === 'client');
  const railClientId = activeClientMentions[0]?.id ?? null;
  const railClientName = activeClientMentions[0]?.name ?? null;

  function handleToggleSearch(searchId: string) {
    setAttachedSearchIds((prev) =>
      prev.includes(searchId) ? prev.filter((id) => id !== searchId) : [...prev, searchId],
    );
  }

  /**
   * Chat input footer — styled to match the Strategy Lab version: wider
   * rounded input with the "research" pill variant, larger mention chips,
   * and the max-w-3xl column so the composer sits centred under the
   * conversation instead of crammed against the edges.
   */
  const inputArea = (
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
          placeholder="Ask Cortex anything… (try /ideas, /script, or @client)"
          blockEnterSubmit={mentionsVisible || showSlashMenu}
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
          {showMentions && mentionOptions.length > 0 && (
            <MentionAutocomplete query={mentionQuery} options={mentionOptions} onSelect={handleMentionSelect} />
          )}
        </ChatComposer>
        {/* Active mention chips — larger text and softer surface to match the
            Strategy Lab chip bar styling. */}
        {activeMentions.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 px-1">
            {activeMentions.map((m) => (
              <span
                key={`${m.type}-${m.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-nativz-border/60 bg-surface/60 px-2.5 py-1 text-xs text-text-secondary"
              >
                {m.type === 'client' ? <Building2 size={12} /> : <User size={12} />}
                {m.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Conversation history sidebar — hidden by default, toggled via button */}
      <ConversationSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpen={() => setSidebarOpen(true)}
        activeId={conversationId}
        onSelect={handleSelectConversation}
        onNewChat={handleReset}
      />

      {/* Topic search context rail */}
      <TopicSearchContextRail
        clientId={railClientId}
        clientName={railClientName}
        attachedSearchIds={attachedSearchIds}
        onToggleSearch={handleToggleSearch}
      />

      {/* Main chat card — matches the Strategy Lab Nerd shell: neutral header
          with minimal controls, welcoming empty state with big copy, max-w-3xl
          message column. */}
      <div className="flex min-w-0 flex-1 flex-col p-3 md:p-4">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-nativz-border/60 bg-background/40">
          {/* Header: chat history toggle · new chat · active client badge · settings */}
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-nativz-border/40 px-4 py-3 md:px-6">
            <div className="flex items-center gap-1.5">
              {!sidebarOpen && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-text-muted/60 transition-colors hover:bg-surface-hover hover:text-text-secondary"
                  title="Chat history"
                >
                  <History size={16} />
                </button>
              )}
              {messages.length > 0 && (
                <button
                  onClick={handleReset}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-text-muted/60 transition-colors hover:bg-surface-hover hover:text-text-secondary"
                  title="New chat"
                >
                  <Plus size={16} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {activeClientMentions.map((m) => (
                <span
                  key={m.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-nativz-border/60 bg-surface/60 px-3 py-1 text-xs font-medium text-text-secondary"
                >
                  <Building2 size={12} className="text-text-muted" />
                  {m.name}
                </span>
              ))}
              {messages.length > 0 && conversationId && (
                <ConversationShareButton
                  conversationId={conversationId}
                  disabled={streaming}
                />
              )}
              {isSuperAdmin && (
                <Link
                  href="/admin/nerd/settings"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted/60 transition-colors hover:bg-surface-hover hover:text-text-secondary"
                  title="Nerd settings"
                >
                  <Settings size={16} />
                </Link>
              )}
            </div>
          </header>

          {/* Chat content — three states: loading, empty (welcome), messages */}
          {loadingConvo && messages.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="animate-pulse text-sm text-text-muted">Loading conversation…</div>
            </div>
          ) : messages.length === 0 ? (
            <>
              <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-nativz-border/60 bg-surface/40">
                  <BotMessageSquare size={28} className="text-text-muted" />
                </div>
                <h2 className="mb-2 text-2xl font-semibold tracking-tight text-text-primary">
                  Ask Cortex anything
                </h2>
                <p className="mb-8 max-w-md text-center text-base leading-relaxed text-text-muted">
                  Full client context, knowledge vault access, research history, and analytics.
                  Use <span className="font-mono text-text-secondary">@</span> to mention a client or team member, or <span className="font-mono text-text-secondary">/</span> for a command.
                </p>
              </div>
              {inputArea}
            </>
          ) : (
            <>
              <Conversation className="min-h-0 flex-1 overflow-y-auto px-4 md:px-8">
                <div className="mx-auto max-w-3xl divide-y divide-nativz-border/30 py-6">
                  {messages.map((msg, index) => {
                    const isLast = index === messages.length - 1;
                    if (msg.role === 'assistant') {
                      return (
                        <AssistantMessage
                          key={msg.id}
                          message={msg}
                          isLast={isLast}
                          onRetry={() => handleSend('Continue')}
                          onSaveArtifact={handleSaveArtifact}
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
      </div>
    </div>
  );
}
