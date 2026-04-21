'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Clock,
  Trash2,
  MessageSquare,
  Check,
  FileText,
  Workflow,
  Lightbulb,
  Sparkles,
  BookOpen,
  X,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';
import { formatRelativeTime } from '@/lib/utils/format';
import { Markdown } from '@/components/ai/markdown';
import type { ArtifactType, NerdArtifact } from '@/lib/artifacts/types';

const STORAGE_KEY = 'cortex:content-lab-history-rail-open';

interface NerdConversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  client_id: string | null;
}

interface ContentLabConversationHistoryRailProps {
  clientId: string;
  activeConversationId: string | null;
  /** Called when the user picks a conversation from the list. Parent hydrates
   *  messages and updates the localStorage pointer. */
  onSelect: (conversationId: string) => void;
  /** Called when the user clicks "+ New chat" at the top of the rail. */
  onNewChat: () => void;
  /** Bump to force a refetch after send / new conversation / delete. */
  refreshToken: number;
}

const ARTIFACT_ICON: Record<ArtifactType, React.ReactNode> = {
  script: <FileText size={11} className="text-blue-400/80" />,
  plan: <Workflow size={11} className="text-purple-400/80" />,
  diagram: <Workflow size={11} className="text-teal-400/80" />,
  ideas: <Lightbulb size={11} className="text-yellow-400/80" />,
  hook: <Sparkles size={11} className="text-orange-400/80" />,
  strategy: <BookOpen size={11} className="text-green-400/80" />,
  general: <FileText size={11} className="text-zinc-400/80" />,
};

/**
 * Strategy Lab left rail — unified conversation history + artifacts list for
 * the active client. Mirrors the Topic Search history rail styling so the two
 * feel like sister surfaces. Artifacts moved in here from the old top-nav tab.
 */
export function ContentLabConversationHistoryRail({
  clientId,
  activeConversationId,
  onSelect,
  onNewChat,
  refreshToken,
}: ContentLabConversationHistoryRailProps) {
  const [open, setOpen] = useRailOpen();
  const [conversations, setConversations] = useState<NerdConversation[]>([]);
  const [loading, setLoading] = useState(false);
  const firstLoadRef = useRef(true);

  const [artifacts, setArtifacts] = useState<NerdArtifact[]>([]);
  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [openArtifactId, setOpenArtifactId] = useState<string | null>(null);
  const [openArtifact, setOpenArtifact] = useState<NerdArtifact | null>(null);
  const [openArtifactLoading, setOpenArtifactLoading] = useState(false);

  const load = useCallback(async () => {
    if (!clientId) return;
    if (firstLoadRef.current) setLoading(true);
    firstLoadRef.current = false;
    try {
      const res = await fetch(`/api/nerd/conversations?clientId=${clientId}`);
      if (!res.ok) {
        setConversations([]);
        return;
      }
      const data = (await res.json()) as { conversations?: NerdConversation[] };
      setConversations(data.conversations ?? []);
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  const loadArtifacts = useCallback(async () => {
    if (!clientId) return;
    setArtifactsLoading(true);
    try {
      const res = await fetch(`/api/nerd/artifacts?client_id=${clientId}&limit=50`);
      if (!res.ok) {
        setArtifacts([]);
        return;
      }
      const data = (await res.json()) as NerdArtifact[];
      setArtifacts(Array.isArray(data) ? data : []);
    } catch {
      setArtifacts([]);
    } finally {
      setArtifactsLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
    void loadArtifacts();
  }, [load, loadArtifacts, refreshToken]);

  const handleDelete = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      let removed: typeof conversations[number] | undefined;
      setConversations((prev) => {
        removed = prev.find((c) => c.id === id);
        return prev.filter((c) => c.id !== id);
      });
      try {
        const res = await fetch(`/api/nerd/conversations/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed');
        toast.success('Conversation deleted');
      } catch {
        if (removed) {
          setConversations((prev) => {
            const next = [...prev, removed!];
            next.sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
            return next;
          });
        }
        toast.error('Could not delete conversation');
      }
    },
    [],
  );

  const handleDeleteArtifact = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      let removed: NerdArtifact | undefined;
      setArtifacts((prev) => {
        removed = prev.find((a) => a.id === id);
        return prev.filter((a) => a.id !== id);
      });
      try {
        const res = await fetch(`/api/nerd/artifacts/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed');
        toast.success('Artifact deleted');
        if (openArtifactId === id) {
          setOpenArtifactId(null);
          setOpenArtifact(null);
        }
      } catch {
        if (removed) {
          setArtifacts((prev) => {
            const next = [...prev, removed!];
            next.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
            return next;
          });
        }
        toast.error('Could not delete artifact');
      }
    },
    [openArtifactId],
  );

  const handleOpenArtifact = useCallback(async (id: string) => {
    setOpenArtifactId(id);
    setOpenArtifact(null);
    setOpenArtifactLoading(true);
    try {
      const res = await fetch(`/api/nerd/artifacts/${id}`);
      if (res.ok) {
        const data = (await res.json()) as NerdArtifact;
        setOpenArtifact(data);
      } else {
        toast.error('Failed to load artifact');
        setOpenArtifactId(null);
      }
    } catch {
      toast.error('Failed to load artifact');
      setOpenArtifactId(null);
    } finally {
      setOpenArtifactLoading(false);
    }
  }, []);

  const handleCloseArtifact = useCallback(() => {
    setOpenArtifactId(null);
    setOpenArtifact(null);
  }, []);

  const groups = groupByDate(conversations);

  return (
    <>
      <div
        className={cn(
          'hidden min-h-0 shrink-0 flex-col overflow-hidden border-nativz-border lg:flex lg:h-full',
          open
            ? 'w-[280px] border-r bg-surface/50'
            : 'w-11 border-r border-nativz-border/50 bg-surface/30',
        )}
      >
        {!open ? (
          <div className="flex h-full min-h-0 flex-col items-center gap-3 py-3">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
              title="Open history"
            >
              <PanelLeftOpen size={15} />
            </button>
            <div className="min-h-0 flex-1" />
            <span className="select-none text-[10px] text-text-muted/30 [writing-mode:vertical-lr] rotate-180">
              History
            </span>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* Header — mirrors Topic Search rail exactly */}
            <div className="flex shrink-0 items-center justify-between border-b border-nativz-border/50 px-3 py-3">
              <span className="text-sm font-semibold text-text-primary">History</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="cursor-pointer text-text-muted transition-colors hover:text-text-secondary"
                title="Close sidebar"
              >
                <PanelLeftClose size={15} />
              </button>
            </div>

            {/* New chat button */}
            <div className="shrink-0 px-3 py-2">
              <button
                type="button"
                onClick={onNewChat}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-nativz-border/60 bg-surface-hover/30 px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-nativz-border hover:bg-surface-hover hover:text-text-primary"
              >
                <Plus size={14} aria-hidden />
                New chat
              </button>
            </div>

            {/* Scrolling body — conversations then artifacts */}
            <div className="flex-1 overflow-y-auto px-2 pb-3">
              {loading && conversations.length === 0 ? (
                <div className="space-y-1.5 px-2 py-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-hover/50" />
                  ))}
                </div>
              ) : conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                  <MessageSquare size={20} className="text-text-muted/30" />
                  <p className="text-sm text-text-muted">No chats yet</p>
                  <p className="text-[11px] text-text-muted">
                    Start chatting to create your first one.
                  </p>
                </div>
              ) : (
                groups.map((group) => (
                  <div key={group.label} className="mt-3 first:mt-1">
                    <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                      {group.label}
                    </p>
                    <div className="space-y-0.5">
                      {group.items.map((c) => {
                        const isActive = c.id === activeConversationId;
                        const displayTitle =
                          c.title && c.title !== 'New conversation' ? c.title : 'Untitled thread';
                        return (
                          <div
                            key={c.id}
                            className={cn(
                              'group relative rounded-lg transition-colors',
                              isActive ? 'bg-surface-hover' : 'hover:bg-surface-hover/60',
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (!isActive) onSelect(c.id);
                              }}
                              className="flex w-full cursor-pointer items-start gap-2 px-2.5 py-2 pr-8 text-left"
                            >
                              <div className="mt-0.5 shrink-0">
                                {isActive ? (
                                  <Check size={12} className="text-text-primary" />
                                ) : (
                                  <MessageSquare size={12} className="text-text-muted/40" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p
                                  className={cn(
                                    'truncate text-[13px] leading-snug',
                                    isActive
                                      ? 'font-medium text-text-primary'
                                      : 'text-text-secondary',
                                  )}
                                >
                                  {displayTitle}
                                </p>
                                <div className="mt-0.5 flex items-center gap-0.5 text-[10px] text-text-muted/50">
                                  <Clock size={8} />
                                  {formatRelativeTime(c.updated_at)}
                                </div>
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDelete(c.id, e)}
                              aria-label={`Delete ${displayTitle}`}
                              title={`Delete ${displayTitle}`}
                              className="absolute right-1.5 top-1.5 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-text-muted/50 opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}

              {/* Artifacts section — compact list under the conversations */}
              <div className="mt-5 border-t border-nativz-border/40 pt-3">
                <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                  Artifacts
                </p>
                {artifactsLoading && artifacts.length === 0 ? (
                  <div className="space-y-1.5 px-2 py-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-hover/40" />
                    ))}
                  </div>
                ) : artifacts.length === 0 ? (
                  <p className="px-2 py-3 text-[11px] text-text-muted">
                    No saved artifacts yet. Save assistant replies to keep them here.
                  </p>
                ) : (
                  <div className="space-y-0.5">
                    {artifacts.map((a) => {
                      const isActive = a.id === openArtifactId;
                      return (
                        <div
                          key={a.id}
                          className={cn(
                            'group relative rounded-lg transition-colors',
                            isActive ? 'bg-surface-hover' : 'hover:bg-surface-hover/60',
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => void handleOpenArtifact(a.id)}
                            className="flex w-full cursor-pointer items-start gap-2 px-2.5 py-2 pr-8 text-left"
                          >
                            <div className="mt-0.5 shrink-0">
                              {ARTIFACT_ICON[a.artifact_type] ?? ARTIFACT_ICON.general}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p
                                className={cn(
                                  'truncate text-[13px] leading-snug',
                                  isActive
                                    ? 'font-medium text-text-primary'
                                    : 'text-text-secondary',
                                )}
                              >
                                {a.title || 'Untitled artifact'}
                              </p>
                              <div className="mt-0.5 flex items-center gap-0.5 text-[10px] text-text-muted/50">
                                <Clock size={8} />
                                {formatRelativeTime(a.created_at)}
                              </div>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteArtifact(a.id, e)}
                            aria-label={`Delete ${a.title || 'artifact'}`}
                            title={`Delete ${a.title || 'artifact'}`}
                            className="absolute right-1.5 top-1.5 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-text-muted/50 opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Artifact detail modal — opens when an artifact row is clicked */}
      {openArtifactId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8"
          onClick={handleCloseArtifact}
        >
          <div
            className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-nativz-border bg-surface shadow-elevated"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-nativz-border/50 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text-primary">
                  {openArtifact?.title || 'Artifact'}
                </p>
                {openArtifact && (
                  <p className="truncate text-[11px] text-text-muted">
                    {openArtifact.artifact_type} · {formatRelativeTime(openArtifact.created_at)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleCloseArtifact}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
                aria-label="Close artifact"
              >
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {openArtifactLoading || !openArtifact ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={20} className="animate-spin text-text-muted" />
                </div>
              ) : (
                <Markdown content={openArtifact.content ?? ''} />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

function useRailOpen(): [boolean, (v: boolean) => void] {
  const [open, setOpenState] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === 'false') setOpenState(false);
    } catch {
      /* ignore */
    }
  }, []);

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      /* ignore quota */
    }
  }, []);

  return [open, setOpen];
}

interface ConversationGroup {
  label: string;
  items: NerdConversation[];
}

function groupByDate(conversations: NerdConversation[]): ConversationGroup[] {
  const now = new Date();
  const today = dateKey(now);
  const yesterday = dateKey(new Date(now.getTime() - 86_400_000));
  const weekAgo = dateKey(new Date(now.getTime() - 7 * 86_400_000));

  const groups: ConversationGroup[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 days', items: [] },
    { label: 'Older', items: [] },
  ];

  for (const c of conversations) {
    const date = c.updated_at.slice(0, 10);
    if (date === today) groups[0].items.push(c);
    else if (date === yesterday) groups[1].items.push(c);
    else if (date >= weekAgo) groups[2].items.push(c);
    else groups[3].items.push(c);
  }

  return groups.filter((g) => g.items.length > 0);
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
