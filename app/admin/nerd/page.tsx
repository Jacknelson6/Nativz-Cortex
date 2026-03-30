'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BotMessageSquare, Plus, Building2, User, Sparkles, X, Command, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Conversation } from '@/components/ai/conversation';
import { AssistantMessage, UserMessage, type ChatMessage } from '@/components/ai/message';
import { PromptInput } from '@/components/ai/prompt-input';
import { MentionAutocomplete, type MentionOption } from '@/components/ai/mention-autocomplete';
import { ConversationSidebar } from '@/components/nerd/conversation-sidebar';
import { SlashCommandMenu } from '@/components/nerd/slash-command-menu';
import { getAllCommands, getCommand, type SlashCommand } from '@/lib/nerd/slash-commands';

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

const SUGGESTIONS = [
  { label: 'Content strategy', prompt: 'Build a full content strategy for @' },
  { label: 'Analyze video', prompt: 'Analyze the top performing videos for @' },
  { label: 'Affiliate performance', prompt: 'Review affiliate performance for @' },
  { label: 'View tasks', prompt: '/tasks' },
  { label: 'Hook ideas', prompt: 'Give me 10 scroll-stopping hooks for @' },
];

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
  const [showCapabilities, setShowCapabilities] = useState(false);

  // @mention state
  const [mentionOptions, setMentionOptions] = useState<MentionOption[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [activeMentions, setActiveMentions] = useState<Array<{ type: 'client' | 'team_member'; id: string; name: string; slug?: string }>>([]);

  // Slash command state
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const slashCommands = getAllCommands();

  const abortRef = useRef<AbortController | null>(null);
  const strategyClientPrefilledRef = useRef(false);
  const strategySessionHintRef = useRef<string | null>(
    strategySource === 'strategy-lab'
      ? 'User opened this conversation from Strategy Lab. Prefer strategy, analytics, affiliate, and analysis-board tools where relevant.'
      : null,
  );

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
    } else {
      setShowSlashMenu(false);
    }
  }, [input]);

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

      const res = await fetch('/api/nerd/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: chatHistory,
          mentions: messageMentions.length > 0 ? messageMentions : undefined,
          conversationId: conversationId ?? undefined,
          sessionHint: strategySessionHintRef.current ?? undefined,
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

  function handleReset() {
    if (streaming) abortRef.current?.abort();
    setMessages([]);
    setActiveMentions([]);
    setConversationId(null);
    router.replace('/admin/nerd');
  }

  function handleSelectConversation(id: string) {
    if (streaming) abortRef.current?.abort();
    setStreaming(false);
    setActiveMentions([]);
    router.replace(`/admin/nerd?c=${id}`);
  }

  const clientCount = mentionOptions.filter((o) => o.type === 'client').length;

  const inputArea = (
    <div className="shrink-0 px-4 pb-4 md:px-6 md:pb-6">
      <div className="mx-auto max-w-3xl">
        <PromptInput
          value={input}
          onChange={setInput}
          onSubmit={() => handleSend()}
          disabled={streaming}
          placeholder="Ask anything... use / for commands, @ to mention"
          blockEnterSubmit={mentionsVisible || showSlashMenu}
        >
          {showSlashMenu && (
            <SlashCommandMenu query={slashQuery} commands={slashCommands} onSelect={handleSlashSelect} />
          )}
          {showMentions && mentionOptions.length > 0 && (
            <MentionAutocomplete query={mentionQuery} options={mentionOptions} onSelect={handleMentionSelect} />
          )}
        </PromptInput>
        <MentionBadges mentions={activeMentions} />
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Inline sidebar */}
      <ConversationSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpen={() => setSidebarOpen(true)}
        activeId={conversationId}
        onSelect={handleSelectConversation}
        onNewChat={handleReset}
      />

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          clientCount={clientCount}
          onReset={handleReset}
          showReset={messages.length > 0}
        />

        {loadingConvo && messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-pulse text-text-muted text-sm">Loading conversation...</div>
          </div>
        ) : messages.length === 0 ? (
          <>
            <div className="flex flex-1 flex-col items-center justify-center px-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-nativz-border bg-gradient-to-b from-surface to-background shadow-[0_0_24px_rgba(4,107,210,0.1)] mb-5">
                <BotMessageSquare size={24} className="text-accent-text" />
              </div>

              <h2 className="text-xl font-semibold text-text-primary mb-1 tracking-tight">Hey, I&apos;m The Nerd</h2>
              <p className="text-sm text-text-muted text-center max-w-md mb-8 leading-relaxed">
                Your social media strategy expert. Use <span className="text-accent-text font-medium">@mentions</span> to reference clients and team members.
              </p>

              <div className="flex flex-wrap justify-center gap-2 max-w-lg mb-10">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => s.prompt.startsWith('/') ? handleSend(s.prompt) : setInput(s.prompt)}
                    className="rounded-xl border border-nativz-border px-4 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:border-accent/20 hover:bg-accent/[0.04] transition-all duration-200 cursor-pointer"
                  >
                    {s.label}
                  </button>
                ))}
                <button
                  onClick={() => setShowCapabilities(true)}
                  className="rounded-xl border border-accent2/20 bg-accent2/[0.04] px-4 py-2.5 text-sm text-accent2-text hover:text-accent2-text hover:border-accent2/30 hover:bg-accent2/[0.08] transition-all duration-200 cursor-pointer flex items-center gap-1.5"
                >
                  <Sparkles size={14} />
                  What can I do?
                </button>
              </div>

              {/* Capabilities modal */}
              <CapabilitiesModal open={showCapabilities} onClose={() => setShowCapabilities(false)} commands={slashCommands} />
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
        {clientCount > 0 && (
          <span className="text-[10px] text-text-muted bg-accent/[0.08] px-1.5 py-0.5 rounded-full">
            {clientCount} clients
          </span>
        )}
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

function CapabilitiesModal({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: Array<{ name: string; description: string; type: string; example?: string }>;
}) {
  const directCmds = commands.filter((c) => c.type === 'direct');
  const aiCmds = commands.filter((c) => c.type === 'ai');

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={onClose}
          >
            <div
              className="w-full max-w-lg bg-surface border border-nativz-border rounded-2xl shadow-elevated overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-nativz-border">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-accent2-text" />
                  <h2 className="text-sm font-semibold text-text-primary">What The Nerd can do</h2>
                </div>
                <button onClick={onClose} className="text-text-muted hover:text-text-secondary transition-colors cursor-pointer">
                  <X size={16} />
                </button>
              </div>

              <div className="px-5 py-4 max-h-[60vh] overflow-y-auto space-y-5">
                {/* Natural language */}
                <div>
                  <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-2">Ask anything</p>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    The Nerd knows all your clients, their strategies, analytics, and content history.
                    Just ask in natural language — use <span className="text-accent-text">@mentions</span> to reference specific clients or team members.
                  </p>
                </div>

                {/* Instant commands */}
                {directCmds.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Command size={11} className="text-accent-text" />
                      <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide">Instant commands</p>
                    </div>
                    <div className="space-y-1">
                      {directCmds.map((cmd) => (
                        <div key={cmd.name} className="flex items-center gap-3 rounded-lg px-2.5 py-2 bg-surface-hover/50">
                          <code className="text-xs text-accent-text font-mono">/{cmd.name}</code>
                          <span className="text-xs text-text-muted">{cmd.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI-powered commands */}
                {aiCmds.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Zap size={11} className="text-accent2-text" />
                      <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide">AI-powered commands</p>
                    </div>
                    <div className="space-y-1">
                      {aiCmds.map((cmd) => (
                        <div key={cmd.name} className="flex items-center gap-3 rounded-lg px-2.5 py-2 bg-surface-hover/50">
                          <code className="text-xs text-accent2-text font-mono">/{cmd.name}</code>
                          <span className="text-xs text-text-muted flex-1">{cmd.description}</span>
                          {cmd.example && (
                            <span className="text-[10px] text-text-muted/40 font-mono hidden sm:block">{cmd.example}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tools */}
                <div>
                  <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-2">Built-in tools</p>
                  <div className="grid grid-cols-2 gap-1">
                    {[
                      'Manage tasks',
                      'View analytics',
                      'Schedule shoots',
                      'Search knowledge base',
                      'Create notifications',
                      'Manage clients',
                      'Import meeting notes',
                      'Video analysis boards',
                    ].map((tool) => (
                      <div key={tool} className="text-xs text-text-muted/70 px-2 py-1">
                        • {tool}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="px-5 py-3 border-t border-nativz-border/50">
                <p className="text-[10px] text-text-muted/40 text-center">
                  Type <code className="text-text-muted/60">/</code> in the chat to see all commands
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
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
