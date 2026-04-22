'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { AgencyClientAvatar } from './agency-client-avatar';
import { Conversation } from '@/components/ai/conversation';
import { AssistantMessage, UserMessage, type ChatMessage } from '@/components/ai/message';
import { ChatComposer, type ChatAttachment } from '@/components/ai/chat-composer';
import { processAttachments } from '@/lib/chat/process-attachments';
import { SlashCommandMenu, filterSlashCommands } from '@/components/nerd/slash-command-menu';
import { useSlashCommands, expandSkillCommand } from '@/lib/nerd/use-slash-commands';
import { toast } from 'sonner';
import { ContentLabConversationExportButton } from './content-lab-conversation-export-button';
import { ConversationShareButton } from '@/components/ai/conversation-share-button';
import { ContentLabConversationHistoryRail } from './content-lab-conversation-history-rail';
import { ContentLabTopicSearchChipBar } from './content-lab-topic-search-chip-bar';
import { ContentLabAttachResearchDialog } from './content-lab-attach-research-dialog';
import { getCommand } from '@/lib/nerd/slash-commands';
import {
  readContentLabNerdConversationId,
  writeContentLabNerdConversationId,
  clearContentLabNerdConversationId,
} from '@/lib/content-lab/nerd-conversation-storage';
import { contentLabTopicSearchStorageKey } from '@/lib/content-lab/topic-search-selection-storage';

// Quick-start prompts are tuned to push the Nerd toward artifact-style
// outputs (mermaid flows, structured scripts, effort/impact quadrants)
// that render as live visuals in the chat and export cleanly as PDFs.
// Prompts stand alone — the Nerd already has the active client pinned via
// clientId on the chat request, so we don't need to parrot the brand name
// back at the user in the composer.
const SUGGESTIONS = [
  {
    label: 'Generate video ideas',
    prompt:
      'Generate a topic plan of video ideas, grounded in the attached research and the client knowledge vault.',
  },
  {
    label: 'Generate scripts',
    prompt:
      'Write three full scripts (hook, beats, pattern interrupt, CTA) from the highest-signal topics in the attached research.',
  },
  {
    label: 'Explain this topic search',
    prompt:
      "Summarize the attached topic search — what's resonating, the strongest themes, the audience sentiment, and what it means.",
  },
  {
    label: 'What does this mean?',
    prompt: 'What does this mean in the context of the attached research?',
  },
];

type ContentLabNerdChatProps = {
  clientId: string;
  clientName: string;
  clientSlug: string;
  /** Topic search IDs the user pinned in Strategy Lab — the initial attached set for the chat context. */
  pinnedTopicSearchIds?: string[];
  /**
   * Portal mode: scoped to one org-bound client, no multi-client switcher,
   * no export/share/commands header buttons, portal-flavored session hint,
   * and `portalMode: true` on the chat request so the route picks the portal
   * addendum and enforces PORTAL_ALLOWED_TOOLS.
   */
  portalMode?: boolean;
};

const ADMIN_SESSION_HINT =
  'User is in Strategy Lab with this client pinned. Primary job: create strategy, generate video ideas, script them, and produce shareable outputs. Prefer topic search, pillar, knowledge, and content tools. Be concise and actionable.';
const PORTAL_SESSION_HINT =
  'User is in the portal Strategy Lab. You are scoped to this one client only. Primary job: create strategy, generate video ideas, script them, and produce shareable outputs. Be concise and actionable.';

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
export function ContentLabNerdChat({
  clientId,
  clientName,
  clientSlug,
  pinnedTopicSearchIds: pinnedFromProps,
  portalMode = false,
}: ContentLabNerdChatProps) {
  // Portal entry points don't server-hydrate the pinned list, so fall back to
  // a localStorage read on mount. Admin always passes the prop (already
  // hydrated by the workspace wrapper) so this useEffect is a no-op there.
  const [pinnedTopicSearchIds, setPinnedTopicSearchIds] = useState<string[]>(
    pinnedFromProps ?? [],
  );
  useEffect(() => {
    if (pinnedFromProps && pinnedFromProps.length > 0) return;
    if (typeof window === 'undefined' || !clientId) return;
    try {
      const raw = window.localStorage.getItem(contentLabTopicSearchStorageKey(clientId));
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const ids = parsed.filter((x): x is string => typeof x === 'string');
        if (ids.length > 0) setPinnedTopicSearchIds(ids);
      }
    } catch {
      /* quota / JSON — ignore */
    }
  }, [clientId, pinnedFromProps]);
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
  // latest, both handled inside ContentLabTopicSearchChipBar now. The
  // chip bar notifies us whenever the client's search list loads so we can
  // look up attached-search metadata for the PDF export.
  const [attachedSearchIds, setAttachedSearchIds] = useState<string[]>([]);
  const [clientSearches, setClientSearches] = useState<TopicSearchItem[]>([]);
  const [attachResearchOpen, setAttachResearchOpen] = useState(false);

  // Client logo URL so the empty state and export header can render the real
  // brand mark instead of initials. Pulls from /api/nerd/mentions (same
  // source the client picker uses).
  const [clientLogoUrl, setClientLogoUrl] = useState<string | null>(null);

  // Topic plans are produced via the create_topic_plan tool call, which
  // renders an artifact download card in the chat (see topic-plan-
  // artifact-card.tsx). No prose auto-export anymore — that was a
  // duplicate code path that competed with the real artifact flow.

  // Interactive /idea flow: when the user submits a bare "/idea" with no
  // number, intercept before hitting the AI and ask them how many ideas
  // they want. Their next input (parsed as an integer) gets rewritten
  // to "/idea N" and flows through normal slash-command expansion.
  const [pendingIdeaCount, setPendingIdeaCount] = useState(false);
  const [pendingGenerateArgs, setPendingGenerateArgs] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    // Primary path: mentions endpoint exposes every active client's logo.
    // Fallback: hit /api/clients/[id] directly in case the client is inactive
    // or the mentions list omits logo_url for any reason.
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

  // Slash command menu — same /ideas, /script, /pillars, /hooks, /strategy etc.
  // commands the admin Nerd registers centrally.
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  // Unified command list = hardcoded builtins + user-installed skills (with
  // command_slug set). Fetched from /api/nerd/slash-commands so skill edits
  // in /admin/nerd/settings show up without a redeploy.
  const { commands: unifiedCommands } = useSlashCommands();
  const slashCommands = useMemo(
    () =>
      unifiedCommands.map((c) => ({
        name: c.name,
        description: c.description,
        type: c.type,
        example: c.example ?? undefined,
      })),
    [unifiedCommands],
  );
  const filteredSlashCommands = useMemo(
    () => filterSlashCommands(slashQuery, slashCommands),
    [slashQuery, slashCommands],
  );

  const sessionHintRef = useRef<string | null>(
    portalMode ? PORTAL_SESSION_HINT : ADMIN_SESSION_HINT,
  );
  const abortRef = useRef<AbortController | null>(null);
  const pendingAttachmentsRef = useRef<ChatAttachment[]>([]);


  // Resume the persisted conversation for this client. localStorage holds
  // one conversation-id-per-client; if it's set we hydrate prior messages
  // via the same endpoint /admin/nerd uses.
  useEffect(() => {
    if (!clientId) return;
    const storedId = readContentLabNerdConversationId(clientId);
    if (!storedId) return;

    let cancelled = false;
    setLoadingConversation(true);
    fetch(`/api/nerd/conversations/${storedId}`)
      .then(async (res) => {
        if (!res.ok) {
          // Conversation was deleted or doesn't belong to this user — drop the stale pointer.
          clearContentLabNerdConversationId(clientId);
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
      // /generate defers expansion — fill "/generate " and let the user
      // type args (video ideas, scripts, topics, a count). The expansion
      // happens at send time via the interactive flow in handleSend.
      if (cmd.name === 'generate') {
        setInput('/generate ');
        setShowSlashMenu(false);
        return;
      }
      // Other built-ins: expand immediately so the user can see the full
      // prompt before hitting Enter. Skill-sourced: just put "/slug " in
      // the input — handleSend expands the template client-side on submit.
      const builtin = getCommand(cmd.name);
      if (builtin) {
        if (builtin.type === 'ai' && builtin.expandPrompt) {
          setInput(builtin.expandPrompt(''));
        }
        setShowSlashMenu(false);
        return;
      }
      const skillCmd = unifiedCommands.find(
        (c) => c.source === 'skill' && c.name === cmd.name,
      );
      if (skillCmd) {
        setInput(`/${skillCmd.name} `);
        setShowSlashMenu(false);
      }
    },
    [unifiedCommands],
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
      } else if (e.key === 'Tab') {
        // Tab-complete: fill "/commandname " without expanding — let the
        // user type args after. Works like Claude Code's skill tab-complete.
        const cmd = filteredSlashCommands[slashActiveIndex] ?? filteredSlashCommands[0];
        if (cmd) {
          e.preventDefault();
          setInput(`/${cmd.name} `);
          setShowSlashMenu(false);
        }
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
      const originalContent = (text ?? input).trim();
      if (!originalContent || streaming) return;
      // displayContent = what the user's chat bubble shows (their own input).
      // content = what actually gets sent to the AI (may be template-expanded).
      let displayContent = originalContent;
      let content = originalContent;

      // ── User-installed skill commands (/<slug>) ──────────────────────
      // If the message starts with a slash matching a skill-sourced
      // command, expand it locally using the skill's content + template
      // before sending to the AI. The bubble keeps the original "/cold-email
      // John at Acme" so the user doesn't see a wall of expanded template.
      const skillMatch = originalContent.match(/^\/([a-z][a-z0-9-]{1,39})\b\s*(.*)$/i);
      if (skillMatch) {
        const [, slug, skillArgs] = skillMatch;
        const skillCmd = unifiedCommands.find(
          (c) => c.source === 'skill' && c.name.toLowerCase() === slug.toLowerCase(),
        );
        if (skillCmd) {
          content = expandSkillCommand(skillCmd, skillArgs ?? '');
        }
      }

      // ── Interactive /generate flow ────────────────────────────────────
      // Bare "/generate" → ask what type + how many. "/generate video ideas"
      // or "/generate 20 scripts" → expand immediately. Like /idea but broader.
      const generateMatch = content.match(/^\/generate\s*(.*)$/i);
      if (generateMatch && !pendingGenerateArgs) {
        const args = generateMatch[1].trim();
        if (!args) {
          // No args — ask the user what they want
          setInput('');
          setPendingGenerateArgs(true);
          const userMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: displayContent,
            createdAt: Date.now(),
          };
          const promptMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: attachedSearchIds.length > 0
              ? 'What would you like me to generate? Type something like `20 video ideas`, `10 scripts`, or `15 topics`.'
              : 'What would you like me to generate? You can also attach a topic search first for research-grounded results.\n\nTry: `20 video ideas`, `10 scripts`, or `15 topics`.',
            createdAt: Date.now(),
          };
          setMessages((prev) => [...prev, userMsg, promptMsg]);
          return;
        }
        // Args present — expand via the built-in /generate command
        const builtin = getCommand('generate');
        if (builtin?.expandPrompt) {
          content = builtin.expandPrompt(args);
        }
      }
      // Step 2 — pendingGenerateArgs was set, user replied with type + count
      if (pendingGenerateArgs) {
        setPendingGenerateArgs(false);
        const builtin = getCommand('generate');
        if (builtin?.expandPrompt) {
          content = builtin.expandPrompt(content);
        }
      }

      // ── Interactive /idea follow-up (legacy alias) ─────────────────────
      // Step 1 — user sent bare "/idea" (or "/idea " with no number).
      // Don't call the AI: display a prompt message asking how many ideas
      // they want, flip pendingIdeaCount, and wait for their next input.
      if (!pendingIdeaCount && /^\/idea\s*$/i.test(content)) {
        setInput('');
        setPendingIdeaCount(true);
        const userMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content: displayContent,
          createdAt: Date.now(),
        };
        const promptMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'How many ideas do you want? Reply with a number (3–50).',
          createdAt: Date.now(),
        };
        setMessages((prev) => [...prev, userMsg, promptMsg]);
        return;
      }
      // Step 2 — pendingIdeaCount was set, treat this input as the count.
      if (pendingIdeaCount) {
        const match = content.match(/\d{1,3}/);
        if (!match) {
          const userMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: displayContent,
            createdAt: Date.now(),
          };
          const retryMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: "I didn't catch a number there. Reply with just a digit like `12` — or type `/idea 12` next time to skip this step.",
            createdAt: Date.now(),
          };
          setMessages((prev) => [...prev, userMsg, retryMsg]);
          setInput('');
          return;
        }
        setPendingIdeaCount(false);
        // Rewrite the input so slash-command expansion downstream handles
        // clamping + the full prompt consistently with a direct `/idea 20`.
        // Display stays as "20" (or whatever the user typed) so their bubble
        // reads naturally as an answer to the prior question.
        content = `/idea ${match[0]}`;
      }
      // ──────────────────────────────────────────────────────────────────

      setInput('');

      const mentions = [
        { type: 'client' as const, id: clientId, name: clientName, slug: clientSlug },
      ];

      const hint = sessionHintRef.current;
      sessionHintRef.current = null;

      const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: displayContent, createdAt: Date.now() };
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
        // For skill commands, the bubble shows the original "/slug args"
        // text but the AI needs the expanded template. Rewrite the last
        // message in chatHistory if displayContent and content differ.
        const chatHistory = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
        if (content !== displayContent && chatHistory.length > 0) {
          chatHistory[chatHistory.length - 1] = { role: 'user', content };
        }

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
            portalMode: portalMode ? true : undefined,
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
                writeContentLabNerdConversationId(clientId, chunk.conversationId);
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
    [input, streaming, messages, clientId, clientName, clientSlug, attachedSearchIds, conversationId, pendingIdeaCount, unifiedCommands],
  );

  function handleReset() {
    if (streaming) abortRef.current?.abort();
    setMessages([]);
    setConversationId(null);
    setConversationTitle(null);
    setConversationMessageCount(0);
    clearContentLabNerdConversationId(clientId);
    sessionHintRef.current = portalMode ? PORTAL_SESSION_HINT : ADMIN_SESSION_HINT;
    // Ask the picker to refetch the list — the current thread may no longer
    // be the latest, and a brand-new one is about to start.
    setConversationsRefreshToken((t) => t + 1);
  }

  // Cmd+K / Ctrl+K → new chat
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        handleReset();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
        writeContentLabNerdConversationId(clientId, data.id);
        sessionHintRef.current = null;
      } catch {
        toast.error('Could not load that conversation');
      } finally {
        setLoadingConversation(false);
      }
    },
    [conversationId, streaming, clientId],
  );

  // Composer is rendered in two places: centered above the hero on the empty
  // state (Topic Search style), and pinned at the bottom while streaming.
  // Extracted so the layout switch doesn't duplicate attach/slash wiring.
  const composer = (
    <div className="flex flex-col">
      <ContentLabTopicSearchChipBar
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
        placeholder="Ask Cortex anything… (try /ideas or /script)"
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
  );

  const chatFooter = (
    <div className="shrink-0 px-4 pb-5 pt-3 md:px-8 md:pb-6">
      <div className="mx-auto flex max-w-3xl flex-col">{composer}</div>
      <ContentLabAttachResearchDialog
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

  const suggestions = SUGGESTIONS;

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-background">
      {/* Left rail: conversation history + saved artifacts for this client.
          Sits flush against the primary app sidebar now — the old rounded
          card container was removed so the chat spans the viewport. */}
      <ContentLabConversationHistoryRail
        clientId={clientId}
        activeConversationId={conversationId}
        onSelect={(id) => void handleSelectConversation(id)}
        onNewChat={handleReset}
        refreshToken={conversationsRefreshToken}
      />

      {/* Main chat column */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header: client picker (admin only) · export buttons on right. The
            Chat/Knowledge Base/Artifacts/Analytics tab row was removed; all
            four surfaces now live under the chat (artifacts in the rail,
            everything else automatically reachable from the sidebar). */}
        <header className="relative flex shrink-0 items-center justify-end gap-3 border-b border-nativz-border/40 px-4 py-3 md:px-6">
          {!portalMode && messages.length > 0 && (
            <div className="flex items-center gap-1.5">
              <ConversationShareButton
                conversationId={conversationId}
                disabled={streaming}
              />
              <ContentLabConversationExportButton
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
            </div>
          )}
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
        // Pre-chat state — hero + centered composer, matching Topic Search.
        // Composer drops to the bottom as soon as the first message arrives.
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 md:px-8">
          <div className="flex w-full max-w-3xl flex-col items-center">
            <h2 className="mb-8 text-2xl font-semibold tracking-tight text-text-primary">
              What are we building today?
            </h2>
            <div className="mb-6 flex max-w-xl flex-wrap justify-center gap-2">
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
            <div className="w-full">{composer}</div>
          </div>
          <ContentLabAttachResearchDialog
            open={attachResearchOpen}
            onClose={() => setAttachResearchOpen(false)}
            clientId={clientId}
            clientName={clientName}
            clientSlug={clientSlug}
            attachedSearchIds={attachedSearchIds}
            onToggle={toggleAttach}
          />
        </div>
      ) : (
        <>
          <Conversation className="min-h-0 flex-1 overflow-y-auto px-4 md:px-8">
            <div className="mx-auto max-w-3xl divide-y divide-nativz-border/30 py-6">
              {messages.map((msg, index) => {
                const isLast = index === messages.length - 1;
                if (msg.role === 'assistant') {
                  // Per-message export lives inside MessageActions now so it
                  // sits flush with Copy / Retry on the left rather than
                  // floating off to the right as an extra control.
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
