'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Clock,
  Loader2,
  Trash2,
  MessageSquare,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';
import { formatRelativeTime } from '@/lib/utils/format';

const STORAGE_KEY = 'cortex:strategy-lab-history-rail-open';

interface NerdConversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  client_id: string | null;
}

interface StrategyLabConversationHistoryRailProps {
  clientId: string;
  clientName: string;
  activeConversationId: string | null;
  /** Called when the user picks a conversation from the list. Parent hydrates
   *  messages and updates the localStorage pointer. */
  onSelect: (conversationId: string) => void;
  /** Called when the user clicks "+ New chat" at the top of the rail. */
  onNewChat: () => void;
  /** Bump to force a refetch after send / new conversation / delete. */
  refreshToken: number;
}

/**
 * Strategy Lab left rail — shows every Nerd conversation this user has for
 * this client, grouped by recency. Replaces the old TopicSearchContextRail
 * because the user wanted the left side to be strategy session history,
 * not the research picker.
 *
 * Reuses the /api/nerd/conversations?clientId= endpoint and the same
 * localStorage open/closed persistence the research rail uses, so the two
 * rails feel consistent across the app.
 */
export function StrategyLabConversationHistoryRail({
  clientId,
  clientName,
  activeConversationId,
  onSelect,
  onNewChat,
  refreshToken,
}: StrategyLabConversationHistoryRailProps) {
  const [open, setOpen] = useRailOpen();
  const [conversations, setConversations] = useState<NerdConversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const firstLoadRef = useRef(true);

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

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const handleDelete = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (deletingId) return;
      setDeletingId(id);
      try {
        const res = await fetch(`/api/nerd/conversations/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          toast.error('Could not delete conversation');
          return;
        }
        setConversations((prev) => prev.filter((c) => c.id !== id));
        toast.success('Conversation deleted');
      } catch {
        toast.error('Could not delete conversation');
      } finally {
        setDeletingId(null);
      }
    },
    [deletingId],
  );

  // Group conversations by date bucket — same shape as the admin Nerd sidebar.
  const groups = groupByDate(conversations);

  return (
    <div
      className={cn(
        'hidden min-h-0 shrink-0 flex-col overflow-hidden border-nativz-border/60 lg:flex lg:h-full',
        open ? 'w-[280px] border-r bg-background/20' : 'w-11 border-r border-nativz-border/40 bg-background/10',
      )}
    >
      {!open ? (
        <div className="flex h-full min-h-0 flex-col items-center gap-3 py-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
            title="Open conversation history"
          >
            <PanelLeftOpen size={16} />
          </button>
          <div className="min-h-0 flex-1" />
          <span className="select-none text-[11px] text-text-muted/40 [writing-mode:vertical-lr] rotate-180">
            History
          </span>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-nativz-border/50 px-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text-primary">Strategy sessions</p>
              <p className="truncate text-[11px] text-text-muted">{clientName}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="cursor-pointer text-text-muted transition-colors hover:text-text-secondary"
              title="Collapse"
            >
              <PanelLeftClose size={16} />
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

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-2 pb-3">
            {loading && conversations.length === 0 ? (
              <div className="space-y-1.5 px-2 py-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-hover/50" />
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <MessageSquare size={20} className="text-text-muted/30" />
                <p className="text-sm text-text-muted">No strategy sessions yet</p>
                <p className="text-[11px] text-text-muted/60">
                  Start chatting to create your first one.
                </p>
              </div>
            ) : (
              groups.map((group) => (
                <div key={group.label} className="mt-3 first:mt-1">
                  <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted/60">
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
                            isActive
                              ? 'bg-surface-hover'
                              : 'hover:bg-surface-hover/60',
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
                                  isActive ? 'font-medium text-text-primary' : 'text-text-secondary',
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
                            disabled={deletingId === c.id}
                            aria-label={`Delete ${displayTitle}`}
                            title={`Delete ${displayTitle}`}
                            className="absolute right-1.5 top-1.5 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-text-muted/50 opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {deletingId === c.id ? (
                              <Loader2 size={10} className="animate-spin" />
                            ) : (
                              <Trash2 size={10} />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
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
