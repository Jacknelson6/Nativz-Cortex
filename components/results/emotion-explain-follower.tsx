'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type FollowState =
  | { kind: 'loading'; emotion: string }
  | { kind: 'done'; emotion: string; text: string }
  | { kind: 'error'; message: string };

interface EmotionExplainFollowerProps {
  open: boolean;
  cursor: { x: number; y: number };
  state: FollowState | null;
  onClose: () => void;
}

const PANEL_W = 320;
const GAP = 14;

function clampPosition(x: number, y: number): { left: number; top: number } {
  if (typeof window === 'undefined') return { left: x + GAP, top: y + GAP };
  const maxLeft = Math.max(GAP, window.innerWidth - PANEL_W - GAP);
  const left = Math.min(Math.max(GAP, x + GAP), maxLeft);
  const top = Math.min(Math.max(GAP, y + GAP), window.innerHeight - GAP - 120);
  return { left, top };
}

export function EmotionExplainFollower({ open, cursor, state, onClose }: EmotionExplainFollowerProps) {
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState(() => clampPosition(cursor.x, cursor.y));

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setPos(clampPosition(cursor.x, cursor.y));
  }, [cursor.x, cursor.y]);

  useEffect(() => {
    if (!open) return;
    const onMove = (e: MouseEvent) => {
      setPos(clampPosition(e.clientX, e.clientY));
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted || !open || !state) return null;

  const title =
    state.kind === 'loading'
      ? state.emotion
      : state.kind === 'done'
        ? state.emotion
        : 'Could not load explanation';

  const node = (
    <div
      className="pointer-events-none fixed z-[200] w-[min(320px,calc(100vw-24px))]"
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="pointer-events-auto rounded-xl border border-nativz-border bg-surface shadow-elevated">
        <div className="flex items-start justify-between gap-2 border-b border-nativz-border/80 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Why this emotion</p>
            <p className="truncate text-sm font-semibold text-text-primary">{title}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 shrink-0 p-0 text-text-muted hover:text-text-primary"
            onClick={onClose}
            aria-label="Close explanation"
          >
            <X size={16} />
          </Button>
        </div>
        <div className="max-h-[min(70vh,420px)] overflow-y-auto px-3 py-3">
          {state.kind === 'loading' ? (
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Loader2 size={16} className="animate-spin shrink-0" />
              Generating explanation…
            </div>
          ) : null}
          {state.kind === 'error' ? (
            <p className="text-sm text-red-400">{state.message}</p>
          ) : null}
          {state.kind === 'done' ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">{state.text}</p>
          ) : null}
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
