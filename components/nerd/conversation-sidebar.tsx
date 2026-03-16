'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Pencil, Trash2, Check, MessageSquare, Clock, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { toast } from 'sonner';
import { formatRelativeTime } from '@/lib/utils/format';

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ConversationSidebarProps {
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
}

function groupByDate(conversations: Conversation[]): { label: string; items: Conversation[] }[] {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const yesterday = new Date(now.getTime() - 86400000);
  const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const weekAgoStr = `${weekAgo.getFullYear()}-${String(weekAgo.getMonth() + 1).padStart(2, '0')}-${String(weekAgo.getDate()).padStart(2, '0')}`;

  const groups: { label: string; items: Conversation[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 days', items: [] },
    { label: 'Older', items: [] },
  ];

  for (const c of conversations) {
    const date = c.updated_at.slice(0, 10);
    if (date === today) groups[0].items.push(c);
    else if (date === yesterdayStr) groups[1].items.push(c);
    else if (date >= weekAgoStr) groups[2].items.push(c);
    else groups[3].items.push(c);
  }

  return groups.filter((g) => g.items.length > 0);
}

export function ConversationSidebar({ open, onClose, onOpen, activeId, onSelect, onNewChat }: ConversationSidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) fetchConversations();
  }, [open]);

  useEffect(() => {
    if (editingId) editRef.current?.focus();
  }, [editingId]);

  async function fetchConversations() {
    try {
      const res = await fetch('/api/nerd/conversations');
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations ?? []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  async function handleRename(id: string) {
    if (!editTitle.trim()) { setEditingId(null); return; }
    try {
      const res = await fetch(`/api/nerd/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle.trim() }),
      });
      if (res.ok) {
        setConversations((prev) => prev.map((c) => c.id === id ? { ...c, title: editTitle.trim() } : c));
      }
    } catch { toast.error('Failed to rename'); }
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) onNewChat();
    try {
      await fetch(`/api/nerd/conversations/${id}`, { method: 'DELETE' });
    } catch { toast.error('Failed to delete'); }
  }

  const groups = groupByDate(conversations);

  if (!open) {
    return (
      <div className="w-10 shrink-0 border-r border-nativz-border/50 bg-surface/30 flex flex-col items-center py-3 gap-3 h-full">
        <button
          onClick={onOpen}
          className="flex items-center justify-center h-7 w-7 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
          title="Open chat history"
        >
          <PanelLeftOpen size={15} />
        </button>
        <button
          onClick={onNewChat}
          className="flex items-center justify-center h-7 w-7 rounded-md text-text-muted hover:text-accent-text hover:bg-accent-surface/20 transition-colors cursor-pointer"
          title="New chat"
        >
          <Plus size={15} />
        </button>
        <div className="flex-1" />
        <span className="text-[9px] text-text-muted/30 [writing-mode:vertical-lr] rotate-180 select-none">
          History
        </span>
      </div>
    );
  }

  return (
    <div className="w-[260px] shrink-0 border-r border-nativz-border bg-surface/50 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-nativz-border/50">
        <span className="text-xs font-semibold text-text-primary">History</span>
        <button onClick={onClose} className="text-text-muted hover:text-text-secondary transition-colors cursor-pointer" title="Close sidebar">
          <PanelLeftClose size={15} />
        </button>
      </div>

      {/* New chat button */}
      <div className="px-2 py-2">
        <button
          onClick={() => { onNewChat(); }}
          className="flex items-center gap-2 w-full rounded-lg border border-nativz-border/60 px-2.5 py-1.5 text-xs text-text-secondary hover:bg-surface-hover transition-colors cursor-pointer"
        >
          <Plus size={13} />
          New chat
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-1.5 pb-3">
        {loading ? (
          <div className="space-y-1.5 p-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 rounded-lg bg-surface-elevated animate-pulse" />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare size={18} className="mx-auto mb-2 text-text-muted/30" />
            <p className="text-xs text-text-muted">No conversations yet</p>
            <p className="text-[10px] text-text-muted/50 mt-0.5">Start chatting to see history here</p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="mt-2.5 first:mt-0">
              <p className="text-[10px] font-medium text-text-muted/60 uppercase tracking-wide px-1.5 mb-0.5">
                {group.label}
              </p>
              {group.items.map((convo) => (
                <div
                  key={convo.id}
                  className={`group flex items-center gap-1 rounded-lg px-1.5 py-1.5 transition-colors cursor-pointer ${
                    activeId === convo.id
                      ? 'bg-accent-surface/20 border border-accent/10'
                      : 'hover:bg-surface-hover border border-transparent'
                  }`}
                >
                  {editingId === convo.id ? (
                    <form
                      className="flex-1 flex items-center gap-1"
                      onSubmit={(e) => { e.preventDefault(); handleRename(convo.id); }}
                    >
                      <input
                        ref={editRef}
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={() => handleRename(convo.id)}
                        onKeyDown={(e) => { if (e.key === 'Escape') setEditingId(null); }}
                        className="flex-1 bg-transparent text-[11px] text-text-primary outline-none border-b border-accent"
                      />
                      <button type="submit" className="text-accent-text cursor-pointer">
                        <Check size={11} />
                      </button>
                    </form>
                  ) : (
                    <>
                      <button
                        onClick={() => onSelect(convo.id)}
                        className="flex-1 min-w-0 text-left cursor-pointer"
                      >
                        <p className={`text-[11px] truncate leading-snug ${
                          activeId === convo.id ? 'text-text-primary font-medium' : 'text-text-secondary'
                        }`}>
                          {convo.title}
                        </p>
                        <p className="text-[9px] text-text-muted/40 flex items-center gap-0.5 mt-0.5">
                          <Clock size={7} />
                          {formatRelativeTime(convo.updated_at)}
                        </p>
                      </button>
                      <div className="flex items-center gap-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingId(convo.id); setEditTitle(convo.title); }}
                          className="h-5 w-5 flex items-center justify-center rounded text-text-muted/60 hover:text-text-secondary transition-colors cursor-pointer"
                          title="Rename"
                        >
                          <Pencil size={10} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(convo.id); }}
                          className="h-5 w-5 flex items-center justify-center rounded text-text-muted/60 hover:text-red-400 transition-colors cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
