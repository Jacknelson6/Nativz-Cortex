'use client';

import { useState, useEffect, useCallback } from 'react';
import { Camera, CalendarDays, X, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClientGap {
  client_id: string;
  client_name: string;
  client_slug: string;
  strategist_name: string | null;
  strategist_id: string | null;
}

interface GapsData {
  needs_shoot: ClientGap[];
  needs_meeting: ClientGap[];
  day_of_month: number;
  month_name: string;
}

interface SchedulingBannersProps {
  onQuickCreateShoot: (clientId: string, clientName: string) => void;
  onQuickCreateMeeting: (clientId: string, clientName: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SchedulingBanners({ onQuickCreateShoot, onQuickCreateMeeting }: SchedulingBannersProps) {
  const [data, setData] = useState<GapsData | null>(null);
  const [dismissedShoots, setDismissedShoots] = useState(false);
  const [dismissedMeetings, setDismissedMeetings] = useState(false);
  const [expandedShoots, setExpandedShoots] = useState(false);
  const [expandedMeetings, setExpandedMeetings] = useState(false);

  const fetchGaps = useCallback(async () => {
    try {
      const res = await fetch('/api/calendar/gaps');
      if (!res.ok) return;
      const json = await res.json();
      setData(json);
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    fetchGaps();
  }, [fetchGaps]);

  // Re-fetch when a shoot/meeting is created (triggered by parent via key change)
  // Parent can call refetchGaps exposed here

  if (!data) return null;

  const { needs_shoot, needs_meeting, day_of_month, month_name } = data;
  const hasShootBanner = needs_shoot.length > 0 && !dismissedShoots;
  const hasMeetingBanner = needs_meeting.length > 0 && !dismissedMeetings;

  if (!hasShootBanner && !hasMeetingBanner) return null;

  const isUrgent = day_of_month >= 5;

  return (
    <div className="flex flex-col gap-2 px-4 py-2">
      {/* Shoots banner */}
      {hasShootBanner && (
        <div
          className={`rounded-lg border px-4 py-3 ${
            isUrgent
              ? 'border-amber-500/30 bg-amber-500/8'
              : 'border-amber-500/20 bg-amber-500/5'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-2.5">
              {isUrgent ? (
                <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
              ) : (
                <Camera size={16} className="text-amber-500 mt-0.5 shrink-0" />
              )}
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {isUrgent
                    ? `${needs_shoot.length} client${needs_shoot.length === 1 ? '' : 's'} still need${needs_shoot.length === 1 ? 's' : ''} shoots this month`
                    : `Time to schedule ${month_name} shoots — ${needs_shoot.length} client${needs_shoot.length === 1 ? '' : 's'} remaining`}
                </p>
                {/* Collapsed preview: show first 3 names */}
                {!expandedShoots && needs_shoot.length > 0 && (
                  <p className="text-xs text-text-muted mt-1">
                    {needs_shoot
                      .slice(0, 3)
                      .map((c) => c.client_name)
                      .join(', ')}
                    {needs_shoot.length > 3 && ` +${needs_shoot.length - 3} more`}
                  </p>
                )}
                {/* Expanded: full list with strategist badges */}
                {expandedShoots && (
                  <div className="mt-2 space-y-1.5">
                    {needs_shoot.map((client) => (
                      <div key={client.client_id} className="flex items-center gap-2">
                        <button
                          onClick={() => onQuickCreateShoot(client.client_id, client.client_name)}
                          className="text-xs font-medium text-accent-text hover:underline"
                        >
                          {client.client_name}
                        </button>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                            client.strategist_name
                              ? 'bg-surface-hover text-text-secondary'
                              : 'bg-amber-500/15 text-amber-600'
                          }`}
                        >
                          {client.strategist_name ?? 'Unassigned'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setExpandedShoots(!expandedShoots)}
                className="rounded p-1 text-text-muted hover:bg-surface-hover transition-colors"
              >
                {expandedShoots ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              <button
                onClick={() => setDismissedShoots(true)}
                className="rounded p-1 text-text-muted hover:bg-surface-hover transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Meetings banner */}
      {hasMeetingBanner && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-2.5">
              <CalendarDays size={16} className="text-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {needs_meeting.length} client{needs_meeting.length === 1 ? '' : 's'} need
                  {needs_meeting.length === 1 ? 's' : ''} a biweekly meeting scheduled
                </p>
                {!expandedMeetings && needs_meeting.length > 0 && (
                  <p className="text-xs text-text-muted mt-1">
                    {needs_meeting
                      .slice(0, 3)
                      .map((c) => c.client_name)
                      .join(', ')}
                    {needs_meeting.length > 3 && ` +${needs_meeting.length - 3} more`}
                  </p>
                )}
                {expandedMeetings && (
                  <div className="mt-2 space-y-1.5">
                    {needs_meeting.map((client) => (
                      <div key={client.client_id} className="flex items-center gap-2">
                        <button
                          onClick={() => onQuickCreateMeeting(client.client_id, client.client_name)}
                          className="text-xs font-medium text-accent-text hover:underline"
                        >
                          {client.client_name}
                        </button>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                            client.strategist_name
                              ? 'bg-surface-hover text-text-secondary'
                              : 'bg-blue-500/15 text-blue-600'
                          }`}
                        >
                          {client.strategist_name ?? 'Unassigned'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setExpandedMeetings(!expandedMeetings)}
                className="rounded p-1 text-text-muted hover:bg-surface-hover transition-colors"
              >
                {expandedMeetings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              <button
                onClick={() => setDismissedMeetings(true)}
                className="rounded p-1 text-text-muted hover:bg-surface-hover transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
