'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { X, Loader2 } from 'lucide-react';
import { lockScroll, unlockScroll } from '@/lib/utils/scroll-lock';
import { HistoryFeed } from './history-feed';
import type { HistoryItem } from '@/lib/research/history';

interface ClientOption {
  id: string;
  name: string;
}

interface HistoryModalProps {
  open: boolean;
  onClose: () => void;
  initialItems: HistoryItem[];
  clients: ClientOption[];
}

export function HistoryModal({ open, onClose, initialItems, clients }: HistoryModalProps) {
  const [items, setItems] = useState<HistoryItem[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset when modal opens with fresh data
  useEffect(() => {
    if (open) {
      setItems(initialItems);
      setHasMore(true);
    }
  }, [open, initialItems]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    lockScroll();
    return () => unlockScroll();
  }, [open]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore || items.length === 0) return;
    setLoading(true);

    const cursor = items[items.length - 1]?.createdAt;
    try {
      const res = await fetch(`/api/research/history?limit=20&cursor=${encodeURIComponent(cursor)}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const newItems: HistoryItem[] = data.items ?? [];

      if (newItems.length === 0) {
        setHasMore(false);
      } else {
        setItems((prev) => [...prev, ...newItems]);
        if (newItems.length < 20) setHasMore(false);
      }
    } catch {
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, items]);

  // Infinite scroll detection
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !open) return;

    function handleScroll() {
      if (!el) return;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
      if (nearBottom) loadMore();
    }

    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, [open, loadMore]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-[80vh] rounded-xl border border-white/[0.06] bg-surface shadow-2xl animate-modal-pop-in flex flex-col">
        <div className="flex items-center justify-between p-5 pb-0">
          <h2 className="text-lg font-semibold text-text-primary">All history</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/40 hover:bg-white/[0.06] hover:text-white/60 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5">
          <HistoryFeed items={items} clients={clients} />
          {loading && (
            <div className="flex justify-center py-4">
              <Loader2 size={20} className="animate-spin text-text-muted" />
            </div>
          )}
          {!hasMore && items.length > 0 && (
            <p className="text-center text-xs text-text-muted py-4">No more results</p>
          )}
        </div>
      </div>
    </div>
  );
}
