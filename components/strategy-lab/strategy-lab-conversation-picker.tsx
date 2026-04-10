'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { History, Check, Loader2, Trash2, Clock, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';
import { formatRelativeTime } from '@/lib/utils/format';

interface NerdConversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  client_id: string | null;
}

interface StrategyLabConversationPickerProps {
  clientId: string;
  activeConversationId: string | null;
  /** Called when the user picks a conversation from the list. Parent is
   *  responsible for hydrating messages + updating the localStorage pointer. */
  onSelect: (conversationId: string) => void;
  /**
   * Bumped by the parent every time a new message is sent or a new
   * conversation is created — forces a refetch so the header dropdown
   * stays in sync with the actual thread list without requiring a page
   * reload.
   */
  refreshToken: number;
  disabled?: boolean;
}

/**
 * Header dropdown that lists this client's Nerd conversations. Fetches
 * /api/nerd/conversations?clientId=<id>. Active conversation gets a
 * checkmark; hover exposes a delete button. Click-outside / Escape closes.
 * Matches the look of the Research chip bar picker so both header
 * popovers feel consistent.
 */
export function StrategyLabConversationPicker({
  clientId,
  activeConversationId,
  onSelect,
  refreshToken,
  disabled,
}: StrategyLabConversationPickerProps) {
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<NerdConversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
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

  // Load when the dropdown opens.
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // Refresh when the parent signals a change (new message, new conversation).
  useEffect(() => {
    if (open) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

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

  const count = conversations.length;

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50',
          open
            ? 'border-accent/40 bg-accent-surface/30 text-accent-text'
            : 'border-nativz-border text-text-muted hover:border-accent/20 hover:text-text-primary',
        )}
        aria-label="Conversation history"
        title="Conversation history"
      >
        <History size={12} />
        History
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-[340px] overflow-hidden rounded-xl border border-nativz-border bg-surface shadow-elevated">
          <div className="flex items-center justify-between border-b border-nativz-border/60 px-3 py-2">
            <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
              Conversations for this client
            </span>
            <span className="text-[10px] text-text-muted/70">{count} total</span>
          </div>
          <div className="max-h-[360px] overflow-y-auto p-1.5">
            {loading ? (
              <div className="space-y-1.5 p-1.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-hover" />
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-center">
                <MessageSquare size={16} className="text-text-muted/40" />
                <p className="text-xs text-text-muted">No conversations yet</p>
                <p className="text-[10px] text-text-muted/60">
                  Start chatting — your threads for this client will show up here.
                </p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {conversations.map((c) => {
                  const isActive = c.id === activeConversationId;
                  const displayTitle =
                    c.title && c.title !== 'New conversation' ? c.title : 'Untitled thread';
                  return (
                    <div
                      key={c.id}
                      className={cn(
                        'group relative rounded-lg border transition-colors',
                        isActive
                          ? 'border-accent/25 bg-accent-surface/15'
                          : 'border-transparent hover:bg-surface-hover',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (!isActive) onSelect(c.id);
                          setOpen(false);
                        }}
                        className="flex w-full cursor-pointer items-start gap-2 px-2 py-2 pr-8 text-left"
                      >
                        <div className="mt-0.5 shrink-0">
                          {isActive ? (
                            <Check size={12} className="text-accent-text" />
                          ) : (
                            <MessageSquare size={12} className="text-text-muted/50" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              'truncate text-xs leading-snug',
                              isActive
                                ? 'font-medium text-text-primary'
                                : 'text-text-secondary group-hover:text-text-primary',
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
            )}
          </div>
        </div>
      )}
    </div>
  );
}
