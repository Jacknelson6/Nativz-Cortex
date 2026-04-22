'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BotMessageSquare, ArrowUpRight } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils/format';

interface NerdStats {
  total: number;
  lastActive: string | null;
}

// Bento tile for the Nerd — replaces the old animated-ping + gradient-orb glow
// with a terminal-prompt instrument. Per .impeccable.md principle 3:
// "Nerdy details earn their place. Instrument, don't decorate."
//
// Shows real data (conversation count + last-active timestamp) so the tile
// means something. If the fetch fails, gracefully degrades to a static
// "ready ." line — no silent failure, the cursor still blinks.
export function NerdTile({ className = '' }: { className?: string }) {
  const [stats, setStats] = useState<NerdStats | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/nerd/conversations');
        if (!res.ok) throw new Error(`nerd stats ${res.status}`);
        const data = await res.json();
        const conversations: Array<{ updated_at: string }> = Array.isArray(data)
          ? data
          : data.conversations ?? [];
        if (cancelled) return;
        setStats({
          total: conversations.length,
          lastActive: conversations[0]?.updated_at ?? null,
        });
      } catch {
        if (!cancelled) setErrored(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const countLine = errored
    ? 'ready'
    : stats
      ? `${stats.total} ${stats.total === 1 ? 'conversation' : 'conversations'}`
      : '—';
  const lastLine =
    !errored && stats?.lastActive
      ? `last · ${formatRelativeTime(stats.lastActive)}`
      : null;

  return (
    <Link href="/admin/nerd" className={`group block ${className}`}>
      <div className="relative h-full overflow-hidden rounded-2xl border border-accent/30 bg-surface transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/55 hover:shadow-[var(--shadow-card-hover)]">
        <div className="relative flex h-full flex-col justify-between p-5">
          <div className="flex items-start justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent/12 ring-1 ring-accent/20">
              <BotMessageSquare size={20} className="text-accent-text" />
            </div>
            <ArrowUpRight
              size={16}
              className="text-text-muted/0 transition-all duration-300 group-hover:text-text-muted group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
          </div>
          {/* Instrument — terminal prompt with live conversation count */}
          <div
            aria-live="polite"
            className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-accent-text/85 flex items-center gap-1.5"
          >
            <span className="nerd-prompt-cursor" aria-hidden>
              &gt;
            </span>
            <span>{countLine}</span>
          </div>
          {lastLine ? (
            <p className="mt-0.5 font-mono text-[10px] text-text-muted/85 tabular-nums pl-3">
              {lastLine}
            </p>
          ) : null}
          <div className="mt-auto pt-4">
            <h3 className="text-sm font-semibold text-text-primary">Talk to the Nerd</h3>
            <p className="text-xs text-text-muted mt-0.5">
              Your AI agent with full Cortex access
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}
