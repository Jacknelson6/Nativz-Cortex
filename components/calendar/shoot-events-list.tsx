'use client';

import { useState, useEffect, useRef } from 'react';
import { Calendar, MapPin, User, Loader2, Sparkles, Clock, CheckCircle2, AlertCircle, Building2, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { ShootPlanPreview } from './shoot-plan-preview';
import { createClient } from '@/lib/supabase/client';
import type { ShootEvent } from '@/lib/types/strategy';

type ShootEventWithClient = ShootEvent & {
  client_name: string | null;
  client_slug: string | null;
};

interface ClientOption {
  id: string;
  name: string;
}

export function ShootEventsList() {
  const [events, setEvents] = useState<ShootEventWithClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchEvents();
    fetchClients();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdownId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function fetchClients() {
    const supabase = createClient();
    const { data } = await supabase
      .from('clients')
      .select('id, name')
      .eq('is_active', true)
      .order('name');
    if (data) setClients(data);
  }

  async function assignClient(shootId: string, clientId: string) {
    setAssigningId(shootId);
    setOpenDropdownId(null);
    try {
      const res = await fetch(`/api/shoots/${shootId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId }),
      });
      if (!res.ok) {
        toast.error('Failed to assign client');
        return;
      }
      const client = clients.find((c) => c.id === clientId);
      toast.success(`Assigned to ${client?.name ?? 'client'}`);
      await fetchEvents();
    } catch {
      toast.error('Something went wrong');
    } finally {
      setAssigningId(null);
    }
  }

  async function fetchEvents() {
    try {
      const res = await fetch('/api/calendar/events');
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }

  async function generatePlan(shootId: string) {
    setGeneratingId(shootId);
    try {
      const res = await fetch(`/api/shoots/${shootId}/plan`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Plan generation failed');
        return;
      }
      toast.success('Shoot plan generated and saved to vault');
      // Refresh events list
      await fetchEvents();
    } catch {
      toast.error('Something went wrong. Try again.');
    } finally {
      setGeneratingId(null);
    }
  }

  function formatDate(iso: string) {
    const date = new Date(iso);
    const now = new Date();
    const diff = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    const formatted = date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

    if (diff === 0) return `Today — ${formatted}`;
    if (diff === 1) return `Tomorrow — ${formatted}`;
    if (diff <= 7) return `${diff} days — ${formatted}`;
    return formatted;
  }

  const statusConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
    pending: { icon: <Clock size={12} />, label: 'No plan yet', color: 'text-text-muted' },
    generating: { icon: <Loader2 size={12} className="animate-spin" />, label: 'Generating...', color: 'text-accent' },
    sent: { icon: <CheckCircle2 size={12} />, label: 'Plan ready', color: 'text-emerald-400' },
    skipped: { icon: <AlertCircle size={12} />, label: 'Skipped', color: 'text-text-muted' },
  };

  if (loading) {
    return (
      <Card>
        <div className="flex items-center gap-3 py-8 justify-center">
          <Loader2 size={16} className="animate-spin text-text-muted" />
          <span className="text-sm text-text-muted">Loading shoot events...</span>
        </div>
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <EmptyState
        icon={<Calendar size={32} />}
        title="No upcoming shoots"
        description="Sync your Google Calendar to detect shoot events, or they'll appear here as they're added."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-primary">
          Upcoming shoots
        </h2>
        <span className="text-xs text-text-muted">{events.length} events</span>
      </div>

      {events.map((event) => {
        const status = statusConfig[event.plan_status] ?? statusConfig.pending;
        const isGenerating = generatingId === event.id;
        const shootDate = new Date(event.shoot_date);
        const daysUntil = Math.ceil((shootDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        const isUrgent = daysUntil <= 3;

        return (
          <Card key={event.id} className="group">
            <div className="flex items-start gap-4">
              {/* Date badge */}
              <div className={`
                flex flex-col items-center justify-center rounded-xl px-3 py-2 min-w-[56px]
                ${isUrgent ? 'bg-red-500/10 text-red-400' : 'bg-accent/10 text-accent'}
              `}>
                <span className="text-lg font-bold leading-none">
                  {shootDate.getDate()}
                </span>
                <span className="text-[10px] font-medium uppercase mt-0.5">
                  {shootDate.toLocaleDateString('en-US', { month: 'short' })}
                </span>
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-text-primary truncate">
                    {event.title}
                  </h3>
                  {isUrgent && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 font-medium whitespace-nowrap">
                      {daysUntil === 0 ? 'TODAY' : daysUntil === 1 ? 'TOMORROW' : `${daysUntil}d`}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
                  <span className="flex items-center gap-1">
                    <Calendar size={10} />
                    {formatDate(event.shoot_date)}
                  </span>
                  {event.location && (
                    <span className="flex items-center gap-1">
                      <MapPin size={10} />
                      {event.location}
                    </span>
                  )}
                  {event.client_name && (
                    <span className="flex items-center gap-1">
                      <User size={10} />
                      {event.client_name}
                    </span>
                  )}
                </div>

                {/* Plan status */}
                <div className="flex items-center gap-2 mt-2">
                  <span className={`flex items-center gap-1 text-xs font-medium ${status.color}`}>
                    {status.icon}
                    {status.label}
                  </span>

                  {event.plan_status === 'pending' && event.client_id && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => generatePlan(event.id)}
                      disabled={isGenerating}
                      className="ml-auto h-7 text-xs"
                    >
                      {isGenerating ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : (
                        <Sparkles size={10} />
                      )}
                      {isGenerating ? 'Generating...' : 'Generate plan'}
                    </Button>
                  )}

                  {event.plan_status === 'pending' && !event.client_id && (
                    <div className="relative ml-auto" ref={openDropdownId === event.id ? dropdownRef : undefined}>
                      {assigningId === event.id ? (
                        <span className="flex items-center gap-1.5 text-xs text-text-muted">
                          <Loader2 size={10} className="animate-spin" />
                          Assigning...
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setOpenDropdownId(openDropdownId === event.id ? null : event.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-amber-500/40 px-2.5 py-1 text-[11px] text-amber-400 hover:border-amber-400 hover:bg-amber-500/5 transition-colors"
                        >
                          <Building2 size={10} />
                          Assign client
                          <ChevronDown size={10} className={`transition-transform ${openDropdownId === event.id ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                      {openDropdownId === event.id && (
                        <div className="absolute right-0 top-full z-20 mt-1 min-w-[180px] max-h-[200px] overflow-y-auto rounded-lg border border-nativz-border bg-surface py-1 shadow-dropdown animate-fade-in">
                          {clients.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-text-muted">No clients found</p>
                          ) : (
                            clients.map((client) => (
                              <button
                                key={client.id}
                                type="button"
                                onClick={() => assignClient(event.id, client.id)}
                                className="block w-full px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-hover transition-colors"
                              >
                                {client.name}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {event.plan_status === 'sent' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-7 text-xs"
                      onClick={() => setExpandedPlanId(expandedPlanId === event.id ? null : event.id)}
                    >
                      {expandedPlanId === event.id ? (
                        <ChevronUp size={10} />
                      ) : (
                        <Eye size={10} />
                      )}
                      {expandedPlanId === event.id ? 'Hide plan' : 'View plan'}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Inline plan preview */}
            {expandedPlanId === event.id && event.plan_status === 'sent' && (
              <div className="mt-4 pt-4 border-t border-nativz-border animate-fade-in">
                <ShootPlanPreview shootId={event.id} />
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
