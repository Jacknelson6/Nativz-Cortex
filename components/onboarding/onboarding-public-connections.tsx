'use client';

import { useMemo, useState } from 'react';
import { Check, ExternalLink, Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { detectPlatform, type PlatformSpec } from '@/lib/onboarding/platform-matcher';

type Item = {
  id: string;
  task: string;
  description: string | null;
  owner: 'agency' | 'client';
  status: 'pending' | 'done';
};

/**
 * Renders above the generic checklist. Detects which client-owned tasks map
 * to a known platform (TikTok, Instagram, etc) and promotes them to
 * branded connection cards with deep links + canonical instructions.
 *
 * Zero-config: the card shows up automatically when the admin's task text
 * mentions a supported platform. Done-state cards collapse into a compact
 * confirmation row so they don't dominate once completed.
 */
export function OnboardingPublicConnections({
  shareToken,
  items,
  onToggle,
}: {
  shareToken: string;
  items: Item[];
  onToggle: (itemId: string, done: boolean) => Promise<boolean>; // returns true on success
}) {
  // Find items that map to a platform AND are client-owned. Agency-owned
  // platform items stay invisible here — they're the agency's job.
  const cards = useMemo(() => {
    return items
      .filter((it) => it.owner === 'client')
      .map((it) => ({ item: it, platform: detectPlatform(it.task) }))
      .filter((c): c is { item: Item; platform: PlatformSpec } => c.platform !== null);
  }, [items]);

  if (cards.length === 0) return null;

  // Sort: pending first, then done. Keeps active work on top.
  const sorted = [...cards].sort((a, b) => {
    if (a.item.status === b.item.status) return 0;
    return a.item.status === 'done' ? 1 : -1;
  });

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[22px] font-semibold flex items-center gap-2">
          <Zap size={18} className="text-accent-text" />
          Connect your accounts
        </h2>
        <p className="text-[13px] text-text-muted">
          Grant access once and we handle the rest. Each card opens the right settings page.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sorted.map(({ item, platform }) => (
          <ConnectionCard
            key={item.id}
            item={item}
            platform={platform}
            shareToken={shareToken}
            onToggle={onToggle}
          />
        ))}
      </div>
    </section>
  );
}

function ConnectionCard({
  item,
  platform,
  shareToken: _shareToken,
  onToggle,
}: {
  item: Item;
  platform: PlatformSpec;
  shareToken: string;
  onToggle: (itemId: string, done: boolean) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const done = item.status === 'done';

  async function confirm() {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await onToggle(item.id, !done);
      if (!ok) return;
      if (!done) toast.success(`Thanks! ${platform.name} marked connected.`);
    } finally {
      setBusy(false);
    }
  }

  // Compact row when already done — doesn't hog attention.
  if (done) {
    return (
      <div className="rounded-[12px] border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-center gap-3">
        <div
          className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center bg-gradient-to-br ${platform.gradient} ring-2 ring-emerald-500/40`}
        >
          <Check size={16} className="text-white" strokeWidth={3} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-text-primary truncate">{platform.name}</p>
          <p className="text-[12px] text-emerald-400">Connected</p>
        </div>
        <button
          type="button"
          onClick={confirm}
          disabled={busy}
          className="text-[11px] text-text-muted hover:text-text-primary transition-colors disabled:opacity-60"
        >
          {busy ? <Loader2 size={11} className="inline animate-spin" /> : 'Undo'}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-[12px] border border-nativz-border bg-surface overflow-hidden flex flex-col">
      <div className={`relative px-4 py-4 bg-gradient-to-br ${platform.gradient}`}>
        <div className="absolute inset-0 bg-background/20" />
        <div className="relative flex items-center gap-3">
          <div className="h-10 w-10 shrink-0 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white">
            <Zap size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">
              Connect
            </p>
            <h3 className="text-[18px] font-semibold text-white truncate leading-tight">
              {platform.name}
            </h3>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 space-y-3 flex-1">
        <p className="text-[12px] text-text-muted leading-relaxed">{platform.why}</p>
        <ol className="space-y-1.5">
          {platform.steps.map((step, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px] text-text-primary">
              <span className="h-4 w-4 shrink-0 rounded-full bg-accent-surface text-accent-text text-[10px] font-bold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <span className="leading-snug">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="px-4 py-3 border-t border-nativz-border flex items-center gap-2 flex-wrap">
        <a
          href={platform.deepLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full bg-accent-text text-background px-3.5 py-1.5 text-[12px] font-semibold hover:brightness-110 transition"
        >
          Open {platform.name}
          <ExternalLink size={11} />
        </a>
        <button
          type="button"
          onClick={confirm}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full border border-nativz-border bg-surface-primary text-text-primary px-3.5 py-1.5 text-[12px] font-semibold hover:bg-surface-hover transition-colors disabled:opacity-60"
        >
          {busy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
          I&rsquo;ve granted access
        </button>
      </div>
    </div>
  );
}
