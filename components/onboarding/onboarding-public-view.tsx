'use client';

import { Check } from 'lucide-react';

type PhaseStatus = 'not_started' | 'in_progress' | 'done';
type ItemOwner = 'agency' | 'client';
type ItemStatus = 'pending' | 'done';

type Tracker = {
  id: string;
  client_id: string;
  service: string;
  title: string | null;
  status: string;
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
 * Public client-facing onboarding view. Mirrors the layout RankPrompt
 * ships (vertical timeline with alternating left/right phase cards,
 * numbered status nodes, action buttons, "what we need from you"
 * callouts, a checklist below the timeline). Read-only — clients can't
 * edit anything here.
 */
export function OnboardingPublicView({
  tracker,
  phases,
  groups,
  items,
}: {
  tracker: Tracker;
  phases: Phase[];
  groups: Group[];
  items: Item[];
}) {
  const clientName = tracker.clients?.name ?? 'Client';
  const logoUrl = tracker.clients?.logo_url;

  const totalItems = items.length;
  const doneItems = items.filter((it) => it.status === 'done').length;
  const progressPct = totalItems === 0 ? 0 : Math.round((doneItems / totalItems) * 100);

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
          <h1 className="text-[40px] md:text-[48px] font-semibold tracking-tight">
            Your onboarding progress
          </h1>
          <p className="text-[16px] text-text-muted max-w-xl mx-auto">
            Here&apos;s where we are in getting {tracker.service.toLowerCase()} up and running.
          </p>
          {totalItems > 0 && (
            <div className="max-w-md mx-auto pt-3">
              <div className="flex items-center justify-between text-[12px] mb-1.5">
                <span className="text-text-muted">Checklist</span>
                <span className="text-text-secondary tabular-nums">{doneItems} of {totalItems} · {progressPct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-hover overflow-hidden">
                <div
                  className="h-full bg-accent-text transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
        </section>

        {/* Timeline */}
        {phases.length > 0 && (
          <section className="relative py-4">
            {/* Center rail */}
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
            <h2 className="text-[22px] font-semibold">Checklist</h2>
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
                        <li key={it.id} className="flex items-center gap-3 px-4 py-2.5">
                          <span
                            className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                              it.status === 'done'
                                ? 'bg-emerald-500 border-emerald-500'
                                : 'border-nativz-border'
                            }`}
                          >
                            {it.status === 'done' && (
                              <Check size={10} className="text-white" strokeWidth={3} />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p
                              className={`text-[14px] ${
                                it.status === 'done' ? 'line-through text-text-muted' : 'text-text-primary'
                              }`}
                            >
                              {it.task}
                            </p>
                            {it.description && (
                              <p className="text-[12px] text-text-muted mt-0.5">{it.description}</p>
                            )}
                          </div>
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wider shrink-0 ${
                              it.owner === 'client' ? 'text-accent-text' : 'text-text-muted'
                            }`}
                          >
                            {it.owner === 'client' ? 'You' : 'Us'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </section>
        )}

        <footer className="pt-6 text-center text-[11px] text-text-muted/70">
          Powered by Nativz Cortex
        </footer>
      </main>
    </div>
  );
}

// ─── Phase item (alternating sides) ───────────────────────────────────────

function PhaseItem({ phase, index }: { phase: Phase; index: number }) {
  const s = STATUS_STYLE[phase.status];
  // Alternate sides on md+; stack on small screens.
  const right = index % 2 === 1;

  return (
    <li className="relative md:grid md:grid-cols-2 md:gap-10">
      {/* Status node on the rail */}
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

      {/* Status pill on the opposite side */}
      <div className={`hidden md:flex items-start ${right ? 'md:order-first md:justify-end md:pr-10' : 'md:col-start-2'}`}>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${s.pill}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {s.label}
        </span>
      </div>

      {/* On small screens, pill is stacked under the card */}
      <span
        className={`md:hidden inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold mt-2 ml-12 ${s.pill}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {s.label}
      </span>
    </li>
  );
}
