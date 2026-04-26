'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Users, RefreshCw, X, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import type { CalendarPerson } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PeoplePanelProps {
  people: CalendarPerson[];
  onTogglePerson: (connectionId: string) => void;
  onRefresh: (connectionIds: string[]) => void;
}

// Priority tier metadata (1 = required, 2 = preferred, 3 = optional/can-overlap)
const TIER_META: Record<1 | 2 | 3, { label: string; sub: string }> = {
  1: { label: 'Tier 1', sub: 'Required' },
  2: { label: 'Tier 2', sub: 'Preferred' },
  3: { label: 'Tier 3', sub: 'Optional' },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function PeoplePanel({ people, onTogglePerson, onRefresh }: PeoplePanelProps) {
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefreshAll() {
    setRefreshing(true);
    const ids = people.map((p) => p.connectionId);
    try {
      await onRefresh(ids);
      toast.success('Calendars refreshed');
    } finally {
      setRefreshing(false);
    }
  }

  // Group by tier (people without a tier fall to tier 3)
  const tiers: Record<1 | 2 | 3, CalendarPerson[]> = { 1: [], 2: [], 3: [] };
  for (const person of people) {
    const tier = (person.priorityTier ?? 3) as 1 | 2 | 3;
    tiers[tier].push(person);
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(!open)}
        className={`fixed right-0 top-1/2 -translate-y-1/2 z-30 flex items-center gap-1 rounded-l-lg px-1.5 py-3 bg-surface border border-r-0 border-nativz-border text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors ${open ? 'opacity-0 pointer-events-none' : ''}`}
        aria-label="Open people panel"
      >
        <Users size={14} />
        <ChevronRight size={12} className="rotate-180" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ x: 280, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 280, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="h-full w-[280px] border-l border-nativz-border bg-surface overflow-hidden shrink-0"
            role="dialog"
            aria-label="Team members"
          >
            <div className="w-full h-full flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-3 border-b border-nativz-border">
                <h3 className="text-sm font-semibold text-text-primary">People</h3>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleRefreshAll}
                    disabled={refreshing || people.length === 0}
                    className="rounded-md p-1 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors disabled:opacity-40"
                    title="Refresh all calendars"
                    aria-label="Refresh calendars"
                  >
                    <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    className="rounded-md p-1 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
                    aria-label="Close people panel"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* People list, grouped by tier */}
              <div className="flex-1 overflow-y-auto px-3 py-2">
                {people.length === 0 ? (
                  <p className="text-xs text-text-muted py-4 text-center">
                    No people configured. Add one below.
                  </p>
                ) : (
                  ([1, 2, 3] as const).map((tier) => {
                    const group = tiers[tier];
                    if (group.length === 0) return null;
                    const meta = TIER_META[tier];
                    return (
                      <div key={tier} className="mb-4">
                        <div className="flex items-baseline justify-between mb-2">
                          <p className="text-[10px] font-medium text-text-muted uppercase tracking-wider">
                            {meta.label}
                          </p>
                          <span className="text-[10px] text-text-muted">{meta.sub}</span>
                        </div>
                        <div className="space-y-1">
                          {group.map((person) => (
                            <PersonRow
                              key={person.connectionId}
                              person={person}
                              onToggle={() => onTogglePerson(person.connectionId)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer: manage people */}
              <div className="px-3 py-3 border-t border-nativz-border">
                <Link
                  href="/admin/calendar/people"
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-nativz-border bg-transparent px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
                >
                  <Settings size={13} />
                  Manage people
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Person Row ───────────────────────────────────────────────────────────────

function PersonRow({ person, onToggle }: { person: CalendarPerson; onToggle: () => void }) {
  const emailCount = person.emails?.length ?? 0;
  const subline = emailCount > 0
    ? `${emailCount} ${emailCount === 1 ? 'calendar' : 'calendars'} · ${person.events.length} event${person.events.length === 1 ? '' : 's'}`
    : `${person.events.length} event${person.events.length === 1 ? '' : 's'}`;

  return (
    <button
      onClick={onToggle}
      aria-pressed={person.enabled}
      aria-label={`${person.enabled ? 'Hide' : 'Show'} ${person.name}`}
      className="w-full flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-surface-hover transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-text/60"
      title={person.emails?.join(', ')}
    >
      <div
        aria-hidden="true"
        className={`mt-0.5 h-3 w-3 rounded-full border-2 transition-colors shrink-0 ${
          person.enabled ? '' : 'opacity-30'
        }`}
        style={{
          backgroundColor: person.enabled ? person.color : 'transparent',
          borderColor: person.color,
        }}
      />
      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-medium truncate ${person.enabled ? 'text-text-primary' : 'text-text-muted'}`}>
          {person.name}
        </div>
        <div className="text-[10px] text-text-muted truncate">{subline}</div>
      </div>
    </button>
  );
}
