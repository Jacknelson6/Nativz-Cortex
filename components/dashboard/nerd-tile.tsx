'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BotMessageSquare, ArrowUpRight } from 'lucide-react';

interface NerdStats {
  total: number;
  lastActive: string | null;
}

// Compact relative time: "3m" / "17h" / "2d" — fits a single instrument line.
function compactAgo(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diffMs = Math.max(0, Date.now() - then);
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

// Bento tile for the Nerd — replaces the old animated-ping + gradient-orb glow
// with a terminal-prompt instrument. Per .impeccable.md principle 3:
// "Nerdy details earn their place. Instrument, don't decorate."
//
// Layout: 140px tile. Top row = icon + arrow. Bottom = title + single
// terminal caption ("> 16 convos · 17h ago"). Graceful fallback to "ready"
// when the fetch errors so the tile still feels alive on first paint.
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

  const countPart = errored
    ? 'ready'
    : stats
      ? `${stats.total} ${stats.total === 1 ? 'convo' : 'convos'}`
      : '—';
  const agoPart = !errored ? compactAgo(stats?.lastActive ?? null) : null;
  const caption = agoPart ? `${countPart} · ${agoPart}` : countPart;

  return (
    <Link href="/admin/nerd" className={`group block ${className}`}>
      <div className="relative h-full overflow-hidden rounded-2xl border border-accent/30 bg-surface transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/55 hover:shadow-[var(--shadow-card-hover)]">
        <div className="relative flex h-full flex-col justify-between p-5">
          {/* Top row — icon + navigate arrow */}
          <div className="flex items-start justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent/12 ring-1 ring-accent/20">
              <BotMessageSquare size={20} className="text-accent-text" />
            </div>
            <ArrowUpRight
              size={16}
              className="text-text-muted/0 transition-all duration-300 group-hover:text-text-muted group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
          </div>

          {/* Title + terminal caption — fits in one block, no overflow */}
          <div className="mt-auto">
            <h3 className="text-sm font-semibold text-text-primary">Talk to the Nerd</h3>
            <div
              aria-live="polite"
              className="mt-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-accent-text/85 tabular-nums"
            >
              <span className="nerd-prompt-cursor" aria-hidden>
                &gt;
              </span>
              <span className="truncate">{caption}</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
