'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Plus,
  Film,
  ChevronDown,
  ExternalLink,
  X,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GlassButton } from '@/components/ui/glass-button';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { ScheduleShootModal } from '@/components/shoots/schedule-shoot-modal';
import { IdeateShootModal } from '@/components/shoots/ideate-shoot-modal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShootItem {
  mondayItemId: string;
  clientName: string;
  abbreviation: string;
  groupTitle: string;
  date: string | null;
  rawsStatus: string;
  editingStatus: string;
  assignmentStatus: string;
  clientApproval: string;
  agency: string;
  boostingStatus: string;
  notes: string;
  rawsFolderUrl: string;
  editedVideosFolderUrl: string;
  laterCalendarUrl: string;
  columns: Record<string, string>;
  clientId: string | null;
  clientSlug: string | null;
  clientIndustry: string | null;
  clientLogoUrl: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getMonthName(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isShootPast(dateStr: string | null) {
  if (!dateStr) return false;
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

function isPast(date: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

/** Get abbreviation — prefer parsed from Monday name, fallback to initials */
function getAbbr(item: ShootItem): string {
  if (item.abbreviation) return item.abbreviation;
  const words = item.clientName.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.slice(0, 3).map((w) => w[0]).join('').toUpperCase();
}

/** Client avatar — logo image or abbreviation fallback */
function ShootAvatar({ item, size = 'md', dimmed }: { item: ShootItem; size?: 'sm' | 'md' | 'lg'; dimmed?: boolean }) {
  const sizeClass = size === 'sm' ? 'h-6 w-6' : size === 'lg' ? 'h-10 w-10' : 'h-8 w-8';
  const textSize = size === 'sm' ? 'text-[8px]' : size === 'lg' ? 'text-xs' : 'text-[10px]';

  if (item.clientLogoUrl) {
    return (
      <div className={`relative ${sizeClass} shrink-0 overflow-hidden rounded-lg`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.clientLogoUrl} alt={item.clientName} className="h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <div className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-lg ${textSize} font-bold ${dimmed ? 'bg-white/[0.06] text-text-muted' : 'bg-accent-surface text-accent-text'}`}>
      {getAbbr(item)}
    </div>
  );
}

function getEditingBadge(status: string) {
  const s = status.toLowerCase();
  if (s.includes('edited') || s.includes('done') || s.includes('complete'))
    return { variant: 'success' as const, label: status };
  if (s.includes('editing') || s.includes('progress'))
    return { variant: 'info' as const, label: status };
  if (s.includes('scheduled'))
    return { variant: 'warning' as const, label: status };
  if (s.includes('not started'))
    return { variant: 'default' as const, label: status };
  return { variant: 'default' as const, label: status || 'No status' };
}

function getRawsBadge(status: string) {
  const s = status.toLowerCase();
  if (s.includes('uploaded'))
    return { variant: 'success' as const, label: 'RAWs uploaded' };
  if (s.includes('no shoot'))
    return { variant: 'default' as const, label: 'No shoot' };
  return { variant: 'warning' as const, label: status || 'Pending' };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminShootsPage() {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [items, setItems] = useState<ShootItem[]>([]);
  const [, setGroups] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedShoot, setSelectedShoot] = useState<ShootItem | null>(null);
  const [pastExpanded, setPastExpanded] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [shootToSchedule, setShootToSchedule] = useState<ShootItem | null>(null);
  const [ideateModalOpen, setIdeateModalOpen] = useState(false);
  const [shootToIdeate, setShootToIdeate] = useState<ShootItem | null>(null);

  // Fetch from Monday Content Calendars
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/shoots/content-calendar');
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to load shoots');
        return;
      }
      const data = await res.json();
      setGroups(data.groups ?? []);
      setItems(data.items ?? []);
    } catch {
      setError('Failed to load shoot calendar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Navigation
  function prevMonth() {
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  }
  function nextMonth() {
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  }
  function goToday() {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  }

  // Build calendar grid for current month
  const calendarWeeks = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfWeek = new Date(year, month, 1).getDay();

    const weeks: (number | null)[][] = [];
    let currentWeek: (number | null)[] = Array(firstDayOfWeek).fill(null);

    for (let day = 1; day <= daysInMonth; day++) {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) currentWeek.push(null);
      weeks.push(currentWeek);
    }

    return weeks;
  }, [currentMonth]);

  // Map shoots to calendar days
  const shootsByDay = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const map = new Map<number, ShootItem[]>();

    for (const item of items) {
      if (!item.date) continue;
      const d = new Date(item.date + 'T00:00:00');
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        const existing = map.get(day) || [];
        existing.push(item);
        map.set(day, existing);
      }
    }

    return map;
  }, [items, currentMonth]);

  // Split into upcoming and past
  const { upcoming, past } = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const sorted = [...items]
      .filter((i) => i.date)
      .sort((a, b) => (a.date! > b.date! ? 1 : -1));

    return {
      upcoming: sorted.filter((i) => new Date(i.date + 'T00:00:00') >= now),
      past: sorted.filter((i) => new Date(i.date + 'T00:00:00') < now).reverse(),
    };
  }, [items]);

  const today = new Date();

  function openIdeate(item: ShootItem) {
    setShootToIdeate(item);
    setIdeateModalOpen(true);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Shoots</h1>
          <p className="text-sm text-text-muted mt-0.5">
            {getMonthName(currentMonth)} — content shoots and key dates
          </p>
        </div>
        <GlassButton onClick={() => { setShootToSchedule(null); setScheduleModalOpen(true); }}>
          <Plus size={14} />
          Schedule shoot
        </GlassButton>
      </div>

      {/* Loading / error */}
      {loading && (
        <Card className="flex items-center justify-center py-16">
          <div className="animate-pulse text-sm text-text-muted">Loading content calendar...</div>
        </Card>
      )}

      {error && (
        <Card className="flex flex-col items-center justify-center py-16 gap-3">
          <p className="text-sm text-red-400">{error}</p>
          <Button size="sm" variant="ghost" onClick={fetchData}>Try again</Button>
        </Card>
      )}

      {!loading && !error && items.length === 0 && (
        <EmptyState
          icon={<Camera size={32} />}
          title="No shoots scheduled"
          description="Connect your Monday.com Content Calendars board to see upcoming shoots here."
        />
      )}

      {/* Calendar + List (always shown together) */}
      {!loading && !error && items.length > 0 && (
        <>
          {/* Month navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={prevMonth}
              className="cursor-pointer flex items-center gap-1 text-sm text-text-muted hover:text-text-secondary transition-colors"
            >
              <ChevronLeft size={16} />
              Previous
            </button>
            <button
              onClick={goToday}
              className="cursor-pointer text-sm font-medium text-text-primary hover:text-accent-text transition-colors"
            >
              {getMonthName(currentMonth)}
            </button>
            <button
              onClick={nextMonth}
              className="cursor-pointer flex items-center gap-1 text-sm text-text-muted hover:text-text-secondary transition-colors"
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Calendar grid */}
          <Card className="overflow-hidden">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-nativz-border">
              {WEEKDAYS.map((day) => (
                <div key={day} className="px-2 py-2 text-center text-[10px] font-medium text-text-muted uppercase tracking-wide">
                  {day}
                </div>
              ))}
            </div>

            {/* Weeks */}
            {calendarWeeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 border-b border-nativz-border last:border-b-0">
                {week.map((day, di) => {
                  const dayEvents = day ? shootsByDay.get(day) || [] : [];
                  const cellDate = day
                    ? new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
                    : null;
                  const isToday = cellDate ? isSameDay(cellDate, today) : false;
                  const isDayPast = cellDate ? isPast(cellDate) : false;

                  return (
                    <div
                      key={di}
                      className={`
                        min-h-[90px] border-r border-nativz-border last:border-r-0 p-1.5
                        ${!day ? 'bg-surface-hover/30' : ''}
                        ${isDayPast && day ? 'opacity-50' : ''}
                      `}
                    >
                      {day && (
                        <>
                          <span className={`
                            inline-flex items-center justify-center text-xs font-medium w-6 h-6 rounded-full
                            ${isToday ? 'bg-accent text-white' : 'text-text-secondary'}
                          `}>
                            {day}
                          </span>
                          <div className="mt-0.5 space-y-0.5">
                            {dayEvents.map((event) => (
                              <button
                                key={event.mondayItemId}
                                onClick={() => setSelectedShoot(event)}
                                className={`
                                  cursor-pointer w-full text-left rounded-md px-1.5 py-1 text-[10px] font-medium
                                  bg-white/[0.08] border border-white/10 text-white/80
                                  hover:bg-white/[0.12] hover:border-white/15 transition-colors
                                  flex items-center gap-1 overflow-hidden
                                  ${isDayPast ? 'opacity-60' : ''}
                                `}
                                title={event.clientName}
                              >
                                {event.clientLogoUrl ? (
                                  <div className="relative h-3.5 w-3.5 shrink-0 overflow-hidden rounded-sm">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={event.clientLogoUrl} alt="" className="h-full w-full object-cover" />
                                  </div>
                                ) : (
                                  <span className="font-bold shrink-0">{getAbbr(event)}</span>
                                )}
                                <span className="truncate">{event.clientName}</span>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </Card>

          {/* Upcoming shoots list */}
          <div>
            <h2 className="text-base font-semibold text-text-primary mb-3">
              Upcoming
              <span className="ml-2 text-sm font-normal text-text-muted">({upcoming.length})</span>
            </h2>
            {upcoming.length === 0 ? (
              <Card>
                <p className="text-sm text-text-muted py-6 text-center">No upcoming shoots</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {upcoming.map((item, i) => {
                  const date = item.date ? new Date(item.date + 'T00:00:00') : null;
                  const editing = getEditingBadge(item.editingStatus);
                  const raws = getRawsBadge(item.rawsStatus);

                  return (
                    <div
                      key={item.mondayItemId}
                      className="animate-stagger-in"
                      style={{ animationDelay: `${i * 30}ms` }}
                    >
                      <Card className="flex items-center gap-3">
                        {/* Date badge */}
                        {date && (
                          <button
                            onClick={() => setSelectedShoot(item)}
                            className="cursor-pointer flex flex-col items-center justify-center rounded-lg bg-accent/10 text-accent px-2.5 py-1.5 min-w-[48px] hover:bg-accent/20 transition-colors"
                          >
                            <span className="text-base font-bold leading-none">{date.getDate()}</span>
                            <span className="text-[9px] font-medium uppercase mt-0.5">
                              {date.toLocaleDateString('en-US', { month: 'short' })}
                            </span>
                          </button>
                        )}

                        {/* Avatar */}
                        <button
                          onClick={() => setSelectedShoot(item)}
                          className="cursor-pointer hover:opacity-80 transition-opacity"
                        >
                          <ShootAvatar item={item} />
                        </button>

                        {/* Content */}
                        <button
                          onClick={() => setSelectedShoot(item)}
                          className="cursor-pointer flex-1 min-w-0 text-left"
                        >
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium text-text-primary truncate">{item.clientName}</p>
                            {item.abbreviation && (
                              <span className="shrink-0 text-[10px] font-medium text-text-muted">{item.abbreviation}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {item.agency && (
                              <span className="text-xs text-text-muted">{item.agency}</span>
                            )}
                          </div>
                        </button>

                        {/* Status badges */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {item.rawsStatus && (
                            <Badge variant={raws.variant}>{raws.label}</Badge>
                          )}
                          {item.editingStatus && (
                            <Badge variant={editing.variant}>{editing.label}</Badge>
                          )}
                        </div>

                        {/* Ideate button */}
                        <button
                          onClick={() => openIdeate(item)}
                          className="cursor-pointer shrink-0 flex items-center gap-1.5 rounded-lg border border-purple-500/25 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-400 hover:bg-purple-500/20 hover:border-purple-500/40 transition-colors"
                          title="Generate AI shoot plan"
                        >
                          <Sparkles size={13} />
                          Ideate
                        </button>
                      </Card>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Past shoots */}
          {past.length > 0 && (
            <div>
              <button
                onClick={() => setPastExpanded(!pastExpanded)}
                className="cursor-pointer flex items-center gap-2 text-base font-semibold text-text-primary mb-3"
              >
                <ChevronDown
                  size={16}
                  className={`transition-transform ${pastExpanded ? 'rotate-0' : '-rotate-90'}`}
                />
                Past shoots
                <span className="text-sm font-normal text-text-muted">({past.length})</span>
              </button>
              {pastExpanded && (
                <div className="space-y-2 opacity-60">
                  {past.map((item) => {
                    const date = item.date ? new Date(item.date + 'T00:00:00') : null;
                    const editing = getEditingBadge(item.editingStatus);

                    return (
                      <div key={item.mondayItemId}>
                        <Card className="flex items-center gap-3">
                          {date && (
                            <button
                              onClick={() => setSelectedShoot(item)}
                              className="cursor-pointer flex flex-col items-center justify-center rounded-lg bg-surface-hover text-text-muted px-2.5 py-1.5 min-w-[48px] hover:bg-surface-hover/80 transition-colors"
                            >
                              <span className="text-base font-bold leading-none">{date.getDate()}</span>
                              <span className="text-[9px] font-medium uppercase mt-0.5">
                                {date.toLocaleDateString('en-US', { month: 'short' })}
                              </span>
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedShoot(item)}
                            className="cursor-pointer hover:opacity-80 transition-opacity"
                          >
                            <ShootAvatar item={item} dimmed />
                          </button>
                          <button
                            onClick={() => setSelectedShoot(item)}
                            className="cursor-pointer flex-1 min-w-0 text-left"
                          >
                            <p className="text-sm font-medium text-text-secondary truncate">{item.clientName}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {item.agency && (
                                <span className="text-xs text-text-muted">{item.agency}</span>
                              )}
                            </div>
                          </button>
                          {item.editingStatus && <Badge variant={editing.variant}>{editing.label}</Badge>}
                        </Card>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Shoot Detail Panel (slide-over) */}
      {selectedShoot && (
        <ShootDetailPanel
          shoot={selectedShoot}
          onClose={() => setSelectedShoot(null)}
          onSchedule={(s) => {
            setSelectedShoot(null);
            setShootToSchedule(s);
            setScheduleModalOpen(true);
          }}
          onIdeate={(s) => {
            setSelectedShoot(null);
            openIdeate(s);
          }}
        />
      )}

      {/* Schedule Shoot Modal */}
      <ScheduleShootModal
        open={scheduleModalOpen}
        onClose={() => { setScheduleModalOpen(false); setShootToSchedule(null); }}
        onCreated={fetchData}
        shoot={shootToSchedule ? {
          clientName: shootToSchedule.clientName,
          clientId: shootToSchedule.clientId,
          mondayItemId: isShootPast(shootToSchedule.date) ? undefined : shootToSchedule.mondayItemId,
          date: isShootPast(shootToSchedule.date) ? null : shootToSchedule.date,
          location: '',
          notes: isShootPast(shootToSchedule.date) ? '' : shootToSchedule.notes,
          agency: shootToSchedule.agency || undefined,
        } : undefined}
      />

      {/* Ideate Shoot Modal */}
      <IdeateShootModal
        open={ideateModalOpen}
        onClose={() => { setIdeateModalOpen(false); setShootToIdeate(null); }}
        shoot={shootToIdeate ? {
          clientName: shootToIdeate.clientName,
          clientId: shootToIdeate.clientId,
          shootDate: shootToIdeate.date,
          industry: shootToIdeate.clientIndustry,
        } : null}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shoot Detail Panel
// ---------------------------------------------------------------------------

function ShootDetailPanel({
  shoot,
  onClose,
  onSchedule,
  onIdeate,
}: {
  shoot: ShootItem;
  onClose: () => void;
  onSchedule: (s: ShootItem) => void;
  onIdeate: (s: ShootItem) => void;
}) {
  const date = shoot.date ? new Date(shoot.date + 'T00:00:00') : null;
  const raws = getRawsBadge(shoot.rawsStatus);
  const editing = getEditingBadge(shoot.editingStatus);
  const shootIsPast = isShootPast(shoot.date);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-md border-l border-nativz-border bg-surface shadow-elevated overflow-y-auto animate-fade-slide-in">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <ShootAvatar item={shoot} size="lg" />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-text-primary">{shoot.clientName}</h2>
                  {shoot.abbreviation && (
                    <span className="text-xs font-medium text-text-muted">{shoot.abbreviation}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-sm text-text-muted">{shoot.groupTitle}</span>
                  {shoot.agency && (
                    <Badge variant="default">{shoot.agency}</Badge>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Key details */}
          <div className="space-y-3">
            {date && (
              <div className="flex items-center gap-3">
                <CalendarDays size={16} className="text-text-muted shrink-0" />
                <span className="text-sm text-text-primary">
                  {date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </span>
                {shootIsPast && <Badge variant="default">Past</Badge>}
              </div>
            )}
          </div>

          {/* Status grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-nativz-border bg-surface-hover/30 p-3">
              <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1.5">RAWs</p>
              <Badge variant={raws.variant}>{raws.label}</Badge>
            </div>
            <div className="rounded-lg border border-nativz-border bg-surface-hover/30 p-3">
              <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1.5">Editing</p>
              <Badge variant={editing.variant}>{editing.label}</Badge>
            </div>
            {shoot.assignmentStatus && (
              <div className="rounded-lg border border-nativz-border bg-surface-hover/30 p-3">
                <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1.5">Assignment</p>
                <Badge>{shoot.assignmentStatus}</Badge>
              </div>
            )}
            {shoot.clientApproval && (
              <div className="rounded-lg border border-nativz-border bg-surface-hover/30 p-3">
                <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1.5">Client approval</p>
                <Badge>{shoot.clientApproval}</Badge>
              </div>
            )}
            {shoot.boostingStatus && (
              <div className="rounded-lg border border-nativz-border bg-surface-hover/30 p-3">
                <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1.5">Boosting</p>
                <Badge>{shoot.boostingStatus}</Badge>
              </div>
            )}
          </div>

          {/* Notes */}
          {shoot.notes && (
            <div>
              <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">Notes</h3>
              <p className="text-sm text-text-secondary whitespace-pre-wrap">{shoot.notes}</p>
            </div>
          )}

          {/* Links */}
          {(shoot.rawsFolderUrl || shoot.editedVideosFolderUrl || shoot.laterCalendarUrl) && (
            <div>
              <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">Links</h3>
              <div className="space-y-1.5">
                {shoot.rawsFolderUrl && (
                  <a
                    href={shoot.rawsFolderUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-accent-text hover:underline"
                  >
                    <Film size={14} /> RAWs folder
                  </a>
                )}
                {shoot.editedVideosFolderUrl && (
                  <a
                    href={shoot.editedVideosFolderUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-accent-text hover:underline"
                  >
                    <Film size={14} /> Edited videos folder
                  </a>
                )}
                {shoot.laterCalendarUrl && (
                  <a
                    href={shoot.laterCalendarUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-accent-text hover:underline"
                  >
                    <CalendarDays size={14} /> Later calendar view
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2 pt-2 border-t border-nativz-border">
            {/* Ideate button — always available */}
            <button
              onClick={() => onIdeate(shoot)}
              className="cursor-pointer flex items-center justify-center gap-2 w-full rounded-lg border border-purple-500/25 bg-purple-500/10 px-3 py-2.5 text-sm font-medium text-purple-400 hover:bg-purple-500/20 hover:border-purple-500/40 transition-colors"
            >
              <Sparkles size={14} />
              Ideate shoot plan
            </button>

            {/* Schedule button — context-aware for past vs upcoming */}
            {shootIsPast ? (
              <GlassButton
                onClick={() => onSchedule(shoot)}
                className="w-full justify-center"
              >
                <RefreshCw size={14} />
                Schedule next shoot
              </GlassButton>
            ) : (
              <GlassButton
                onClick={() => onSchedule(shoot)}
                className="w-full justify-center"
              >
                <Camera size={14} />
                Schedule shoot
              </GlassButton>
            )}

            <a
              href={`https://nativz-team.monday.com/boards/9232769015/pulses/${shoot.mondayItemId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full rounded-lg border border-nativz-border px-3 py-2 text-sm text-text-muted hover:text-text-secondary hover:border-text-muted transition-colors"
            >
              <ExternalLink size={14} />
              View in Monday
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
