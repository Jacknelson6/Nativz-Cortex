'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

type PhaseStatus = 'not_started' | 'in_progress' | 'done';
type ItemOwner = 'agency' | 'client';
type ItemStatus = 'pending' | 'done';

type Tracker = {
  id: string;
  client_id: string;
  service: string;
  title: string | null;
  status: string;
  share_token: string;
  started_at: string | null;
  completed_at: string | null;
  clients: { name: string; slug: string; logo_url: string | null } | null;
};

type Phase = {
  id: string;
  name: string;
  description: string | null;
  what_we_need: string | null;
  status: PhaseStatus;
  sort_order: number;
  actions: { label: string; url: string; variant?: 'primary' | 'secondary' }[];
  progress_percent: number | null;
};

type Group = { id: string; name: string; sort_order: number };
type Item = {
  id: string;
  group_id: string;
  task: string;
  description: string | null;
  owner: ItemOwner;
  status: ItemStatus;
  sort_order: number;
};

const STATUS_STYLE: Record<PhaseStatus, {
  label: string;
  pill: string;
  node: string;
  stepBadge: string;
}> = {
  not_started: {
    label: 'Not started',
    pill: 'bg-surface-hover text-text-muted ring-1 ring-inset ring-nativz-border',
    node: 'bg-surface-hover text-text-muted border-nativz-border',
    stepBadge: 'bg-surface-hover text-text-muted',
  },
  in_progress: {
    label: 'In progress',
    pill: 'bg-accent-surface text-accent-text ring-1 ring-inset ring-accent/25',
    node: 'bg-accent-text text-background border-accent-text',
    stepBadge: 'bg-accent-surface text-accent-text',
  },
  done: {
    label: 'Done',
    pill: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-inset ring-emerald-500/25',
    node: 'bg-emerald-500 text-white border-emerald-500',
    stepBadge: 'bg-emerald-500/15 text-emerald-400',
  },
};

/**
 * Public client-facing onboarding view. Vertical timeline (alternating left/
 * right on md+, stacked on mobile) + a below-the-fold checklist. Client-owned
 * tasks are **tappable** — the client ticks them and the change round-trips
 * through /api/onboarding/public/item-toggle, guarded by the share token.
 *
 * Agency-owned tasks stay read-only here; the admin marks those done from the
 * editor. The UI makes the difference obvious (tap affordance on client tasks,
 * plain state dot on agency tasks).
 */
export function OnboardingPublicView({
  tracker,
  phases,
  groups,
  items: initialItems,
  agency = 'nativz',
}: {
  tracker: Tracker;
  phases: Phase[];
  groups: Group[];
  items: Item[];
  agency?: 'nativz' | 'anderson';
}) {
  const clientName = tracker.clients?.name ?? 'Client';
  const logoUrl = tracker.clients?.logo_url;
  const brandName = agency === 'anderson' ? 'Anderson Collaborative' : 'Nativz Cortex';

  // Items are local state so client-side toggles feel instant. Server is the
  // source of truth — we rollback on error and resync on mount.
  const [items, setItems] = useState<Item[]>(initialItems);
  useEffect(() => { setItems(initialItems); }, [initialItems]);

  const totalItems = items.length;
  const doneItems = items.filter((it) => it.status === 'done').length;
  const progressPct = totalItems === 0 ? 0 : Math.round((doneItems / totalItems) * 100);

  // Completion celebration — one-time, reset on fresh page load. Ticks when
  // the last item of the last-rendered checklist flips. Keeps state local so
  // it doesn't re-fire if the server reloads progress.
  const [celebrated, setCelebrated] = useState(false);
  useEffect(() => {
    if (progressPct === 100 && !celebrated && totalItems > 0) {
      setCelebrated(true);
      toast.success("You're all set. We've got it from here.");
    }
  }, [progressPct, celebrated, totalItems]);

  const clientOwnedTotal = useMemo(() => items.filter((it) => it.owner === 'client').length, [items]);
  const clientOwnedDone = useMemo(
    () => items.filter((it) => it.owner === 'client' && it.status === 'done').length,
    [items],
  );

  async function toggleItem(item: Item) {
    if (item.owner !== 'client') return; // UI should prevent, but be safe.
    const nextStatus: ItemStatus = item.status === 'done' ? 'pending' : 'done';
    // Optimistic flip.
    setItems((xs) => xs.map((it) => (it.id === item.id ? { ...it, status: nextStatus } : it)));
    try {
      const res = await fetch('/api/onboarding/public/item-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          share_token: tracker.share_token,
          item_id: item.id,
          done: nextStatus === 'done',
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error || 'Failed to save');
      }
    } catch (err) {
      // Rollback + gentle toast. Never a full-page error — keeps trust.
      setItems((xs) => xs.map((it) => (it.id === item.id ? { ...it, status: item.status } : it)));
      toast.error(err instanceof Error ? err.message : "Couldn't save that yet. Try again?");
    }
  }

  return (
    <div className="min-h-screen bg-background text-text-primary">
      {/* Top bar — neutral, not the admin chrome */}
      <header className="border-b border-nativz-border px-6 py-4 flex items-center gap-3">
        {logoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={logoUrl}
            alt={clientName}
            className="h-8 w-8 rounded-lg object-contain bg-white/5 p-1"
          />
        ) : (
          <div className="h-8 w-8 rounded-lg bg-accent-surface text-accent-text flex items-center justify-center font-bold text-xs">
            {clientName
              .split(/\s+/)
              .map((w) => w[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">{clientName}</p>
          <p className="text-[11px] text-text-muted uppercase tracking-[0.1em]">{tracker.service} onboarding</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 md:py-14 space-y-10">
        {/* Hero */}
        <section className="text-center space-y-3">
          <h1 className="text-[40px] md:text-[52px] font-semibold tracking-tight leading-[1.08]">
            {progressPct === 100
              ? "You're fully onboarded."
              : progressPct > 0
                ? 'Getting there.'
                : "Let's get you set up."}
          </h1>
          <p className="text-[16px] text-text-muted max-w-xl mx-auto leading-relaxed">
            {progressPct === 100
              ? `Everything's connected and approved. ${tracker.service} is live.`
              : `Here's where we are with your ${tracker.service.toLowerCase()} rollout. Tap items below when you finish them — we'll take it from there.`}
          </p>
          {totalItems > 0 && (
            <div className="max-w-md mx-auto pt-3">
              <div className="flex items-center justify-between text-[12px] mb-1.5">
                <span className="text-text-muted">Progress</span>
                <span className="text-text-secondary tabular-nums">
                  {doneItems} of {totalItems} · {progressPct}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-surface-hover overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ease-out ${
                    progressPct === 100 ? 'bg-emerald-500' : 'bg-accent-text'
                  }`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {clientOwnedTotal > 0 && progressPct < 100 && (
                <p className="text-[11px] text-text-muted mt-2">
                  {clientOwnedDone} of {clientOwnedTotal} things in your court are done.
                </p>
              )}
            </div>
          )}
        </section>

        {/* Timeline */}
        {phases.length > 0 && (
          <section className="relative py-4">
            <div
              aria-hidden
              className="absolute left-4 md:left-1/2 top-0 bottom-0 w-px bg-nativz-border md:-translate-x-px"
            />
            <ul className="space-y-12">
              {phases.map((p, i) => (
                <PhaseItem key={p.id} phase={p} index={i} />
              ))}
            </ul>
          </section>
        )}

        {/* Checklist */}
        {groups.length > 0 && (
          <section className="space-y-6">
            <div className="flex items-end justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-[22px] font-semibold">Checklist</h2>
                <p className="text-[13px] text-text-muted">
                  Tap your tasks when they're done. We'll handle the ones marked{' '}
                  <span className="text-text-secondary font-medium">Us</span>.
                </p>
              </div>
              {clientOwnedTotal > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-surface/60 text-accent-text text-[11px] font-semibold px-3 py-1 ring-1 ring-inset ring-accent/25">
                  <Sparkles size={11} />
                  You: {clientOwnedDone} / {clientOwnedTotal}
                </span>
              )}
            </div>
            {groups.map((g) => {
              const groupItems = items.filter((it) => it.group_id === g.id);
              const groupDone = groupItems.filter((it) => it.status === 'done').length;
              return (
                <div
                  key={g.id}
                  className="rounded-[10px] border border-nativz-border bg-surface overflow-hidden"
                >
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-nativz-border bg-surface-hover/30">
                    <h3 className="text-[14px] font-semibold">{g.name}</h3>
                    <span className="text-[11px] text-text-muted tabular-nums">
                      {groupDone} / {groupItems.length}
                    </span>
                  </div>
                  {groupItems.length === 0 ? (
                    <p className="px-4 py-6 text-center text-[13px] text-text-muted italic">
                      Nothing in this section yet.
                    </p>
                  ) : (
                    <ul className="divide-y divide-nativz-border">
                      {groupItems.map((it) => (
                        <ChecklistRow key={it.id} item={it} onToggle={toggleItem} />
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </section>
        )}

        <footer className="pt-6 text-center text-[11px] text-text-muted/70">
          Powered by {brandName}
        </footer>
      </main>
    </div>
  );
}

// ─── Checklist row ────────────────────────────────────────────────────────

function ChecklistRow({
  item,
  onToggle,
}: {
  item: Item;
  onToggle: (item: Item) => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const done = item.status === 'done';
  const interactive = item.owner === 'client';

  async function handleClick() {
    if (!interactive || busy) return;
    setBusy(true);
    try { await onToggle(item); } finally { setBusy(false); }
  }

  const wrapperCls = interactive
    ? 'group flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-hover/40 transition-colors'
    : 'flex items-center gap-3 px-4 py-3';

  return (
    <li
      className={wrapperCls}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (!interactive) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          void handleClick();
        }
      }}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive ? done : undefined}
    >
      <span
        className={`h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-all duration-150 ${
          done
            ? 'bg-emerald-500 border-emerald-500 scale-100'
            : interactive
              ? 'border-accent-border/60 group-hover:border-accent-text group-hover:scale-110'
              : 'border-nativz-border'
        }`}
      >
        {busy ? (
          <Loader2 size={11} className="animate-spin text-white" />
        ) : done ? (
          <Check size={12} className="text-white" strokeWidth={3} />
        ) : null}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`text-[14px] transition-colors ${
            done ? 'line-through text-text-muted' : 'text-text-primary'
          }`}
        >
          {item.task}
        </p>
        {item.description && (
          <p className="text-[12px] text-text-muted mt-0.5">{item.description}</p>
        )}
      </div>
      <span
        className={`text-[10px] font-semibold uppercase tracking-wider shrink-0 ${
          item.owner === 'client' ? 'text-accent-text' : 'text-text-muted'
        }`}
      >
        {item.owner === 'client' ? 'You' : 'Us'}
      </span>
    </li>
  );
}

// ─── Phase item (alternating sides) ───────────────────────────────────────

function PhaseItem({ phase, index }: { phase: Phase; index: number }) {
  const s = STATUS_STYLE[phase.status];
  const right = index % 2 === 1;

  return (
    <li className="relative md:grid md:grid-cols-2 md:gap-10">
      <span
        className={`absolute left-4 md:left-1/2 top-0 -translate-x-1/2 h-7 w-7 rounded-full border-2 flex items-center justify-center text-[12px] font-semibold tabular-nums z-10 ${s.node}`}
      >
        {phase.status === 'done' ? <Check size={13} strokeWidth={3} /> : index + 1}
      </span>

      <div className={`pl-12 md:pl-0 ${right ? 'md:col-start-2 md:order-last' : 'md:text-right md:pr-10'}`}>
        <span
          className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${s.stepBadge}`}
        >
          Step {index + 1}
        </span>
        <h3 className="mt-1.5 text-[22px] font-semibold">{phase.name}</h3>
        {phase.description && (
          <p className="mt-1 text-[14px] text-text-muted leading-relaxed">{phase.description}</p>
        )}

        {phase.what_we_need && (
          <div className={`mt-3 rounded-[10px] border border-accent/20 bg-accent-surface/40 px-3 py-2.5 text-left ${right ? '' : 'md:text-right'}`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-text">
              What we need from you
            </p>
            <p className="mt-0.5 text-[13px] text-text-primary">{phase.what_we_need}</p>
          </div>
        )}

        {phase.progress_percent != null && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-text-muted">Progress</span>
              <span className="text-text-secondary tabular-nums">{phase.progress_percent}%</span>
            </div>
            <div className="h-1 rounded-full bg-surface-hover overflow-hidden">
              <div
                className="h-full bg-accent-text transition-all duration-300"
                style={{ width: `${phase.progress_percent}%` }}
              />
            </div>
          </div>
        )}

        {phase.actions.length > 0 && (
          <div className={`mt-3 flex flex-wrap gap-2 ${right ? '' : 'md:justify-end'}`}>
            {phase.actions.map((a, i) => (
              <a
                key={i}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
                  a.variant === 'secondary'
                    ? 'border border-nativz-border bg-surface-primary text-text-primary hover:bg-surface-hover'
                    : 'bg-accent-text text-background hover:brightness-110'
                }`}
              >
                {a.label}
              </a>
            ))}
          </div>
        )}
      </div>

      <div className={`hidden md:flex items-start ${right ? 'md:order-first md:justify-end md:pr-10' : 'md:col-start-2'}`}>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${s.pill}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {s.label}
        </span>
      </div>

      <span
        className={`md:hidden inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold mt-2 ml-12 ${s.pill}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {s.label}
      </span>
    </li>
  );
}
