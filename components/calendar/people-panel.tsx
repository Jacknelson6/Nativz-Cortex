'use client';

import { useState, useEffect } from 'react';
import { ChevronRight, Users, Plus, RefreshCw, X, Loader2, Link2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { CalendarPerson } from './types';
import { PERSON_COLORS } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarConnection {
  id: string;
  display_name: string;
  display_color: string;
  connection_type: 'team' | 'client';
  is_active: boolean;
}

interface PeoplePanelProps {
  people: CalendarPerson[];
  onTogglePerson: (connectionId: string) => void;
  onRefresh: (connectionIds: string[]) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PeoplePanel({ people, onTogglePerson, onRefresh }: PeoplePanelProps) {
  const [open, setOpen] = useState(false);
  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch calendar connections when panel opens
  useEffect(() => {
    if (!open) return;
    fetchConnections();
  }, [open]);

  async function fetchConnections() {
    setLoadingConnections(true);
    try {
      // Use the existing calendar connections from the people prop
      // If we want to load more from the DB, we can add an API call here
      setConnections([]);
    } finally {
      setLoadingConnections(false);
    }
  }

  async function handleRefreshAll() {
    setRefreshing(true);
    const ids = people.map(p => p.connectionId);
    try {
      await onRefresh(ids);
      toast.success('Calendars refreshed');
    } finally {
      setRefreshing(false);
    }
  }

  async function handleInviteClient() {
    setInviting(true);
    try {
      const res = await fetch('/api/calendar/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Failed to create invite');
      const data = await res.json();
      if (data.url) {
        await navigator.clipboard.writeText(data.url);
        toast.success('Invite link copied to clipboard');
      }
    } catch {
      toast.error('Failed to create invite link');
    } finally {
      setInviting(false);
    }
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(!open)}
        className={`fixed right-0 top-1/2 -translate-y-1/2 z-30 flex items-center gap-1 rounded-l-lg px-1.5 py-3 bg-surface border border-r-0 border-nativz-border text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors ${open ? 'opacity-0 pointer-events-none' : ''}`}
      >
        <Users size={14} />
        <ChevronRight size={12} className="rotate-180" />
      </button>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="h-full border-l border-nativz-border bg-surface overflow-hidden shrink-0"
          >
            <div className="w-[280px] h-full flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-3 border-b border-nativz-border">
                <h3 className="text-sm font-semibold text-text-primary">People</h3>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleRefreshAll}
                    disabled={refreshing || people.length === 0}
                    className="rounded-md p-1 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors disabled:opacity-40"
                    title="Refresh all calendars"
                  >
                    <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    className="rounded-md p-1 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* People list */}
              <div className="flex-1 overflow-y-auto px-3 py-2">
                {/* Team section */}
                <div className="mb-4">
                  <p className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-2">
                    Team
                  </p>
                  {people.filter(p => p.connectionType === 'team').length === 0 ? (
                    <p className="text-xs text-text-muted py-2">No team calendars connected</p>
                  ) : (
                    <div className="space-y-1">
                      {people
                        .filter(p => p.connectionType === 'team')
                        .map(person => (
                          <PersonRow
                            key={person.connectionId}
                            person={person}
                            onToggle={() => onTogglePerson(person.connectionId)}
                          />
                        ))}
                    </div>
                  )}
                </div>

                {/* Client section */}
                <div>
                  <p className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-2">
                    Clients
                  </p>
                  {people.filter(p => p.connectionType === 'client').length === 0 ? (
                    <p className="text-xs text-text-muted py-2">No client calendars connected</p>
                  ) : (
                    <div className="space-y-1">
                      {people
                        .filter(p => p.connectionType === 'client')
                        .map(person => (
                          <PersonRow
                            key={person.connectionId}
                            person={person}
                            onToggle={() => onTogglePerson(person.connectionId)}
                          />
                        ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer: invite button */}
              <div className="px-3 py-3 border-t border-nativz-border">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleInviteClient}
                  disabled={inviting}
                >
                  {inviting ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Link2 size={13} />
                  )}
                  {inviting ? 'Creating link...' : 'Invite client calendar'}
                </Button>
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
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-surface-hover transition-colors cursor-pointer"
    >
      {/* Color dot / toggle */}
      <div
        className={`h-3 w-3 rounded-full border-2 transition-colors ${
          person.enabled ? '' : 'opacity-30'
        }`}
        style={{
          backgroundColor: person.enabled ? person.color : 'transparent',
          borderColor: person.color,
        }}
      />
      {/* Name */}
      <span className={`text-xs font-medium flex-1 truncate ${person.enabled ? 'text-text-primary' : 'text-text-muted'}`}>
        {person.name}
      </span>
      {/* Event count */}
      <span className="text-[10px] text-text-muted">
        {person.events.length}
      </span>
    </button>
  );
}
