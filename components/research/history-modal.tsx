'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
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

        <div className="flex-1 overflow-y-auto p-5">
          <HistoryFeed items={initialItems} clients={clients} />
        </div>
      </div>
    </div>
  );
}
