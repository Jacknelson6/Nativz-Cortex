'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Plus,
  ChevronDown,
  Mail,
  Sparkles,
  RefreshCw,
  GripVertical,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GlassButton } from '@/components/ui/glass-button';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { ScheduleShootsModal } from '@/components/shoots/schedule-shoot-modal';
import { IdeateShootModal } from '@/components/shoots/ideate-shoot-modal';
import { AgencyBadge } from '@/components/clients/agency-badge';
import { toast } from 'sonner';

import type { ShootItem, ShootPlanData } from '@/components/shoots/types';
import {
  WEEKDAYS,
  getMonthName,
  isSameDay,
  isPast,
  isShootPast,
  getAbbr,
  getEditingBadge,
  getClientCache,
  setClientCache,
  clearClientCache,
} from '@/components/shoots/helpers';
import { ShootAvatar } from '@/components/shoots/shoot-avatar';
import { ShootListItem } from '@/components/shoots/shoot-list-item';
import { ShootDetailPanel } from '@/components/shoots/shoot-detail-panel';

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [scheduleDate, setScheduleDate] = useState<string | null>(null);
  const [ideateModalOpen, setIdeateModalOpen] = useState(false);
  const [shootToIdeate, setShootToIdeate] = useState<ShootItem | null>(null);

  // Plan data from DB keyed by mondayItemId
  const [planDataMap, setPlanDataMap] = useState<Record<string, ShootPlanData>>({});

  // Fetch shoot plans from DB
  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch('/api/calendar/events');
      if (!res.ok) return;
      const events = await res.json();
      const map: Record<string, ShootPlanData> = {};
      for (const ev of events) {
        if (ev.monday_item_id && ev.plan_data) {
          map[ev.monday_item_id] = ev.plan_data;
        }
      }
      setPlanDataMap(map);
    } catch {
      // Silent fail — plans just won't show
    }
  }, []);

  // Fetch from Monday Content Calendars
  const fetchData = useCallback(async (useCache = true) => {
    try {
      setLoading(true);
      setError(null);

      // Check client-side cache first
      if (useCache) {
        const cached = getClientCache();
        if (cached) {
          setGroups((cached.groups as { id: string; title: string }[]) ?? []);
          setItems((cached.items as ShootItem[]) ?? []);
          setLoading(false);
          // Still fetch plans in background
          fetchPlans();
          return;
        }
      }

      const res = await fetch('/api/shoots/content-calendar');
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to load shoots');
        return;
      }
      const data = await res.json();
      setGroups(data.groups ?? []);
      setItems(data.items ?? []);
      setClientCache(data);
    } catch {
      setError('Failed to load shoot calendar');
    } finally {
      setLoading(false);
    }
  }, [fetchPlans]);

  useEffect(() => {
    fetchData();
    fetchPlans();
  }, [fetchData, fetchPlans]);

  // Merge plan data into items
  const enrichedItems = useMemo(() => {
    return items.map((item) => ({
      ...item,
      planData: planDataMap[item.mondayItemId] ?? null,
      planStatus: planDataMap[item.mondayItemId] ? 'sent' : null,
    }));
  }, [items, planDataMap]);

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

  const [syncing, setSyncing] = useState(false);

  function handleRefresh() {
    clearClientCache();
    fetchData(false);
    fetchPlans();
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch('/api/shoots/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Sync failed');
        return;
      }
      if (data.synced === 0) {
        toast.info(data.message || 'No shoot events found in Google Calendar');
      } else {
        toast.success(`Synced ${data.synced} shoot${data.synced !== 1 ? 's' : ''} from Google Calendar`);
        // Refresh the list to show synced events
        handleRefresh();
      }
    } catch {
      toast.error('Failed to sync with Google Calendar');
    } finally {
      setSyncing(false);
    }
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

    for (const item of enrichedItems) {
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
  }, [enrichedItems, currentMonth]);

  // Split into upcoming and past
  const { upcoming, past } = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const sorted = [...enrichedItems]
      .filter((i) => i.date)
      .sort((a, b) => (a.date! > b.date! ? 1 : -1));

    return {
      upcoming: sorted.filter((i) => new Date(i.date + 'T00:00:00') >= now),
      past: sorted.filter((i) => new Date(i.date + 'T00:00:00') < now).reverse(),
    };
  }, [enrichedItems]);

  const today = new Date();

  function openIdeate(item: ShootItem) {
    setShootToIdeate(item);
    setIdeateModalOpen(true);
  }

  function handleIdeateGenerated() {
    // Refresh plan data from DB
    fetchPlans();
  }

  // ---------------------------------------------------------------------------
  // Drag-to-reschedule state
  // ---------------------------------------------------------------------------
  const [draggedShoot, setDraggedShoot] = useState<ShootItem | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null); // "YYYY-MM-DD"
  const [rescheduleConfirm, setRescheduleConfirm] = useState<{
    shoot: ShootItem;
    newDate: string;
  } | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const dragCounterRef = useRef(0);

  function handleDragStart(e: React.DragEvent, shoot: ShootItem) {
    setDraggedShoot(shoot);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', shoot.mondayItemId);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.4';
    }
  }

  function handleDragEnd(e: React.DragEvent) {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
    setDraggedShoot(null);
    setDropTarget(null);
    dragCounterRef.current = 0;
  }

  function handleCellDragEnter(e: React.DragEvent, dateStr: string) {
    e.preventDefault();
    dragCounterRef.current++;
    setDropTarget(dateStr);
  }

  function handleCellDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleCellDragLeave() {
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setDropTarget(null);
    }
  }

  function handleCellDrop(e: React.DragEvent, dateStr: string) {
    e.preventDefault();
    setDropTarget(null);
    dragCounterRef.current = 0;
    if (!draggedShoot) return;

    // Don't reschedule to same date
    if (draggedShoot.date === dateStr) {
      setDraggedShoot(null);
      return;
    }

    // Check for duplicate — same client already on target date
    const targetDayEvents = enrichedItems.filter((i) => i.date === dateStr);
    const isDuplicate = targetDayEvents.some(
      (i) => i.clientName.toLowerCase() === draggedShoot.clientName.toLowerCase() && i.mondayItemId !== draggedShoot.mondayItemId
    );
    if (isDuplicate) {
      toast.error(`${draggedShoot.clientName} already has a shoot on this date`);
      setDraggedShoot(null);
      return;
    }

    // Show confirmation dialog
    setRescheduleConfirm({ shoot: draggedShoot, newDate: dateStr });
    setDraggedShoot(null);
  }

  async function confirmReschedule() {
    if (!rescheduleConfirm) return;
    setRescheduling(true);

    try {
      const res = await fetch('/api/shoots/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monday_item_id: rescheduleConfirm.shoot.mondayItemId,
          new_date: rescheduleConfirm.newDate,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reschedule');
      }

      // Optimistically update local state
      setItems((prev) =>
        prev.map((i) =>
          i.mondayItemId === rescheduleConfirm.shoot.mondayItemId
            ? { ...i, date: rescheduleConfirm.newDate }
            : i
        )
      );

      // Clear caches so next full refresh gets fresh data
      clearClientCache();

      const newDateFormatted = new Date(rescheduleConfirm.newDate + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      toast.success(`${rescheduleConfirm.shoot.clientName} rescheduled to ${newDateFormatted}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reschedule shoot');
    } finally {
      setRescheduling(false);
      setRescheduleConfirm(null);
    }
  }

  function cancelReschedule() {
    setRescheduleConfirm(null);
  }

  return (
    <div className="cortex-page-gutter space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="ui-page-title">Shoots</h1>
          <p className="text-sm text-text-muted mt-0.5">
            {getMonthName(currentMonth)} — content shoots and key dates
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleRefresh} title="Refresh data">
            <RefreshCw size={14} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
            title="Sync shoots from Google Calendar"
          >
            <CalendarDays size={14} className={syncing ? 'animate-pulse' : ''} />
            {syncing ? 'Syncing...' : 'Sync'}
          </Button>
          <GlassButton onClick={() => { setShootToSchedule(null); setScheduleModalOpen(true); }}>
            <Mail size={14} />
            Schedule shoots
          </GlassButton>
        </div>
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
          <Button size="sm" variant="ghost" onClick={() => fetchData(false)}>Try again</Button>
        </Card>
      )}

      {!loading && !error && enrichedItems.length === 0 && (
        <EmptyState
          icon={<Camera size={32} />}
          title="No shoots scheduled"
          description="Connect your Monday.com Content Calendars board to see upcoming shoots here."
        />
      )}

      {/* Calendar + List (always shown together) */}
      {!loading && !error && enrichedItems.length > 0 && (
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
                  const cellDateStr = day
                    ? `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    : null;
                  const isDropTarget = cellDateStr && dropTarget === cellDateStr;

                  return (
                    <div
                      key={di}
                      className={`
                        group/cell relative min-h-[90px] border-r border-nativz-border last:border-r-0 p-1.5
                        ${!day ? 'bg-surface-hover/30' : ''}
                        ${isDayPast && day ? 'opacity-50' : ''}
                        ${isDropTarget ? 'bg-accent/10 ring-1 ring-inset ring-accent/40' : ''}
                        ${day && draggedShoot ? 'transition-colors' : ''}
                      `}
                      onDragEnter={day && cellDateStr ? (e) => handleCellDragEnter(e, cellDateStr) : undefined}
                      onDragOver={day ? handleCellDragOver : undefined}
                      onDragLeave={day ? handleCellDragLeave : undefined}
                      onDrop={day && cellDateStr ? (e) => handleCellDrop(e, cellDateStr) : undefined}
                    >
                      {day && (
                        <>
                          <div className="flex items-center justify-between">
                            <span className={`
                              inline-flex items-center justify-center text-xs font-medium w-6 h-6 rounded-full
                              ${isToday ? 'bg-accent text-white' : 'text-text-secondary'}
                            `}>
                              {day}
                            </span>
                            {dayEvents.length === 0 && (
                              <button
                                onClick={() => {
                                  setScheduleDate(cellDateStr!);
                                  setShootToSchedule(null);
                                  setScheduleModalOpen(true);
                                }}
                                className="cursor-pointer flex items-center justify-center w-5 h-5 rounded-full bg-white/[0.08] text-text-muted opacity-0 group-hover/cell:opacity-100 hover:bg-accent/30 hover:text-accent-text transition-all duration-150"
                                title="Schedule shoot"
                              >
                                <Plus size={12} />
                              </button>
                            )}
                          </div>
                          <div className="mt-0.5 space-y-0.5">
                            {dayEvents.map((event) => (
                              <div
                                key={event.mondayItemId}
                                draggable={!isDayPast}
                                onDragStart={!isDayPast ? (e) => handleDragStart(e, event) : undefined}
                                onDragEnd={handleDragEnd}
                                className="group/shoot"
                              >
                                <button
                                  onClick={() => setSelectedShoot(event)}
                                  className={`
                                    cursor-pointer w-full text-left rounded-md px-1.5 py-1 text-[10px] font-medium
                                    ${event.planData
                                      ? 'bg-accent2-surface border border-accent2/25 text-accent2-text'
                                      : 'bg-white/[0.08] border border-white/10 text-white/80'
                                    }
                                    hover:bg-white/[0.12] hover:border-white/15 transition-colors
                                    flex items-center gap-1 overflow-hidden
                                    ${isDayPast ? 'opacity-60 cursor-default' : 'cursor-grab active:cursor-grabbing'}
                                  `}
                                  title={event.clientName + (event.planData ? ' — plan ready' : '') + (!isDayPast ? ' — drag to reschedule' : '')}
                                >
                                  {!isDayPast && (
                                    <GripVertical size={8} className="shrink-0 text-white/30 opacity-0 group-hover/shoot:opacity-100 transition-opacity -ml-0.5" />
                                  )}
                                  {event.clientLogoUrl ? (
                                    <div className="relative h-3.5 w-3.5 shrink-0 overflow-hidden rounded-sm">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={event.clientLogoUrl} alt="" className="h-full w-full object-cover" />
                                    </div>
                                  ) : (
                                    <span className="font-bold shrink-0">{getAbbr(event)}</span>
                                  )}
                                  <span className="truncate">{event.clientName}</span>
                                  {event.planData && (
                                    <Sparkles size={9} className="shrink-0 text-accent2-text ml-auto" />
                                  )}
                                </button>
                              </div>
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
                {upcoming.map((item, i) => (
                  <ShootListItem
                    key={item.mondayItemId}
                    item={item}
                    index={i}
                    onSelect={() => setSelectedShoot(item)}
                    onIdeate={() => openIdeate(item)}
                  />
                ))}
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
                              <span className="text-[10px] font-medium uppercase mt-0.5">
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
                              <AgencyBadge agency={item.agency || undefined} />
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

      {/* Schedule Shoots Modal */}
      <ScheduleShootsModal
        open={scheduleModalOpen}
        onClose={() => { setScheduleModalOpen(false); setShootToSchedule(null); }}
        initialClientId={shootToSchedule?.clientId || null}
      />

      {/* Ideate Shoot Modal */}
      <IdeateShootModal
        open={ideateModalOpen}
        onClose={() => { setIdeateModalOpen(false); setShootToIdeate(null); }}
        onGenerated={handleIdeateGenerated}
        shoot={shootToIdeate ? {
          clientName: shootToIdeate.clientName,
          clientId: shootToIdeate.clientId,
          shootDate: shootToIdeate.date,
          industry: shootToIdeate.clientIndustry,
          mondayItemId: shootToIdeate.mondayItemId,
        } : null}
      />

      {/* Reschedule confirmation dialog */}
      {rescheduleConfirm && (
        <>
          <div className="fixed inset-0 z-50 bg-black/50" onClick={cancelReschedule} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-xl border border-nativz-border bg-surface shadow-elevated p-6 space-y-4 animate-fade-slide-in">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
                  <CalendarDays size={20} className="text-accent-text" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">Reschedule shoot</h3>
                  <p className="text-xs text-text-muted">This will update Monday.com</p>
                </div>
              </div>

              <div className="rounded-lg border border-nativz-border bg-surface-hover/30 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <ShootAvatar item={rescheduleConfirm.shoot} size="sm" />
                  <span className="text-sm font-medium text-text-primary">{rescheduleConfirm.shoot.clientName}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <span>
                    {rescheduleConfirm.shoot.date
                      ? new Date(rescheduleConfirm.shoot.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                      : 'No date'}
                  </span>
                  <span className="text-accent-text">→</span>
                  <span className="text-text-primary font-medium">
                    {new Date(rescheduleConfirm.newDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="flex-1"
                  onClick={cancelReschedule}
                  disabled={rescheduling}
                >
                  Cancel
                </Button>
                <GlassButton
                  className="flex-1 justify-center"
                  onClick={confirmReschedule}
                  disabled={rescheduling}
                >
                  {rescheduling ? 'Rescheduling...' : 'Confirm'}
                </GlassButton>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
