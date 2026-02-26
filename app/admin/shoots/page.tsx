'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Plus,
  Film,
  Mail,
  ChevronDown,
  ExternalLink,
  X,
  Sparkles,
  RefreshCw,
  Video,
  Lightbulb,
  Target,
  ChevronUp,
  Download,
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VideoIdea {
  title: string;
  hook: string;
  format: string;
  talkingPoints: string[];
  shotList: string[];
  whyItWorks: string;
}

interface ShootPlanData {
  title: string;
  summary: string;
  videoIdeas: VideoIdea[];
  generalTips: string[];
  equipmentSuggestions: string[];
}

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
  // Plan data (fetched from DB)
  planData?: ShootPlanData | null;
  planStatus?: string | null;
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
// Client-side cache for content calendar data
// ---------------------------------------------------------------------------

const CLIENT_CACHE_KEY = 'shoots_content_calendar';
const CLIENT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getClientCache(): { groups: unknown; items: unknown } | null {
  try {
    const raw = sessionStorage.getItem(CLIENT_CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CLIENT_CACHE_TTL) {
      sessionStorage.removeItem(CLIENT_CACHE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setClientCache(data: { groups: unknown; items: unknown }) {
  try {
    sessionStorage.setItem(CLIENT_CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // sessionStorage full or unavailable
  }
}

function clearClientCache() {
  try {
    sessionStorage.removeItem(CLIENT_CACHE_KEY);
  } catch {
    // ignore
  }
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

  function handleRefresh() {
    clearClientCache();
    fetchData(false);
    fetchPlans();
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
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleRefresh} title="Refresh data">
            <RefreshCw size={14} />
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

                  return (
                    <div
                      key={di}
                      className={`
                        group/cell relative min-h-[90px] border-r border-nativz-border last:border-r-0 p-1.5
                        ${!day ? 'bg-surface-hover/30' : ''}
                        ${isDayPast && day ? 'opacity-50' : ''}
                      `}
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
                            <button
                              onClick={() => {
                                const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                setScheduleDate(dateStr);
                                setShootToSchedule(null);
                                setScheduleModalOpen(true);
                              }}
                              className="cursor-pointer flex items-center justify-center w-5 h-5 rounded-full bg-white/[0.08] text-text-muted opacity-0 group-hover/cell:opacity-100 hover:bg-accent/30 hover:text-accent-text transition-all duration-150"
                              title="Schedule shoot"
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                          <div className="mt-0.5 space-y-0.5">
                            {dayEvents.map((event) => (
                              <button
                                key={event.mondayItemId}
                                onClick={() => setSelectedShoot(event)}
                                className={`
                                  cursor-pointer w-full text-left rounded-md px-1.5 py-1 text-[10px] font-medium
                                  ${event.planData
                                    ? 'bg-purple-500/15 border border-purple-500/25 text-purple-300'
                                    : 'bg-white/[0.08] border border-white/10 text-white/80'
                                  }
                                  hover:bg-white/[0.12] hover:border-white/15 transition-colors
                                  flex items-center gap-1 overflow-hidden
                                  ${isDayPast ? 'opacity-60' : ''}
                                `}
                                title={event.clientName + (event.planData ? ' — plan ready' : '')}
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
                                {event.planData && (
                                  <Sparkles size={9} className="shrink-0 text-purple-400 ml-auto" />
                                )}
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shoot List Item — with expandable plan preview
// ---------------------------------------------------------------------------

function ShootListItem({
  item,
  index,
  onSelect,
  onIdeate,
}: {
  item: ShootItem;
  index: number;
  onSelect: () => void;
  onIdeate: () => void;
}) {
  const [planExpanded, setPlanExpanded] = useState(false);
  const date = item.date ? new Date(item.date + 'T00:00:00') : null;
  const plan = item.planData;

  return (
    <div
      className="animate-stagger-in"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <Card className="space-y-0">
        <div className="flex items-center gap-3">
          {/* Date badge */}
          {date && (
            <button
              onClick={onSelect}
              className="cursor-pointer flex flex-col items-center justify-center rounded-lg bg-accent/10 text-accent px-2.5 py-1.5 min-w-[48px] hover:bg-accent/20 transition-colors"
            >
              <span className="text-base font-bold leading-none">{date.getDate()}</span>
              <span className="text-[9px] font-medium uppercase mt-0.5">
                {date.toLocaleDateString('en-US', { month: 'short' })}
              </span>
            </button>
          )}

          {/* Avatar */}
          <button onClick={onSelect} className="cursor-pointer hover:opacity-80 transition-opacity">
            <ShootAvatar item={item} />
          </button>

          {/* Content */}
          <button onClick={onSelect} className="cursor-pointer flex-1 min-w-0 text-left">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-text-primary truncate">{item.clientName}</p>
              {item.abbreviation && (
                <span className="shrink-0 text-[10px] font-medium text-text-muted">{item.abbreviation}</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <AgencyBadge agency={item.agency || undefined} />
            </div>
          </button>

          {/* Ideate / View plan */}
          {plan ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPlanExpanded(!planExpanded)}
            >
              <Sparkles size={14} />
              {plan.videoIdeas?.length ?? 0} ideas
              {planExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={onIdeate}
            >
              <Sparkles size={14} />
              Ideate
            </Button>
          )}
        </div>

        {/* Expanded plan preview */}
        {plan && planExpanded && (
          <ShootPlanPreview plan={plan} clientName={item.clientName} />
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline Shoot Plan Preview
// ---------------------------------------------------------------------------

function ShootPlanPreview({ plan, clientName }: { plan: ShootPlanData; clientName: string }) {
  const [expandedIdea, setExpandedIdea] = useState<number | null>(0);

  function handleDownload() {
    const lines: string[] = [
      plan.title || `${clientName} Shoot Plan`,
      '='.repeat(50),
      '',
      plan.summary || '',
      '',
    ];

    plan.videoIdeas?.forEach((idea, i) => {
      lines.push(`--- Video ${i + 1}: ${idea.title} ---`);
      lines.push(`Format: ${idea.format}`);
      lines.push(`Hook: ${idea.hook}`);
      lines.push('');
      if (idea.talkingPoints?.length) {
        lines.push('Talking points:');
        idea.talkingPoints.forEach((p) => lines.push(`  - ${p}`));
        lines.push('');
      }
      if (idea.shotList?.length) {
        lines.push('Shot list:');
        idea.shotList.forEach((s) => lines.push(`  - ${s}`));
        lines.push('');
      }
      if (idea.whyItWorks) {
        lines.push(`Why it works: ${idea.whyItWorks}`);
        lines.push('');
      }
    });

    if (plan.generalTips?.length) {
      lines.push('--- General tips ---');
      plan.generalTips.forEach((t) => lines.push(`  - ${t}`));
      lines.push('');
    }

    if (plan.equipmentSuggestions?.length) {
      lines.push('--- Equipment suggestions ---');
      plan.equipmentSuggestions.forEach((e) => lines.push(`  - ${e}`));
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${clientName.replace(/\s+/g, '-').toLowerCase()}-shoot-plan.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Shoot plan downloaded');
  }

  return (
    <div className="mt-3 pt-3 border-t border-nativz-border space-y-3 animate-expand-in">
      {/* Plan header */}
      <div className="flex items-center justify-between">
        <div>
          {plan.title && (
            <h4 className="text-sm font-semibold text-text-primary">{plan.title}</h4>
          )}
          {plan.summary && (
            <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{plan.summary}</p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={handleDownload}>
          <Download size={12} />
          Download
        </Button>
      </div>

      {/* Video Ideas */}
      {(plan.videoIdeas ?? []).length > 0 && (
        <div className="space-y-1.5">
          <h5 className="flex items-center gap-1.5 text-[10px] font-medium text-text-muted uppercase tracking-wide">
            <Video size={11} />
            Video ideas ({plan.videoIdeas.length})
          </h5>

          {plan.videoIdeas.map((idea, i) => {
            const isExpanded = expandedIdea === i;

            return (
              <div
                key={i}
                className="rounded-lg border border-nativz-border bg-surface-hover/30 overflow-hidden"
              >
                <button
                  onClick={() => setExpandedIdea(isExpanded ? null : i)}
                  className="cursor-pointer w-full flex items-center justify-between gap-3 p-2.5 text-left"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-500/15 text-[9px] font-bold text-purple-400">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-text-primary truncate">{idea.title}</p>
                      {!isExpanded && idea.format && (
                        <p className="text-[10px] text-text-muted truncate">{idea.format}</p>
                      )}
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp size={12} className="shrink-0 text-text-muted" />
                  ) : (
                    <ChevronDown size={12} className="shrink-0 text-text-muted" />
                  )}
                </button>

                {isExpanded && (
                  <div className="px-2.5 pb-2.5 space-y-2.5 border-t border-nativz-border pt-2.5">
                    {idea.format && <Badge variant="purple">{idea.format}</Badge>}

                    {idea.hook && (
                      <div>
                        <p className="text-[9px] font-medium text-text-muted uppercase tracking-wide mb-0.5">Hook</p>
                        <p className="text-xs text-text-primary italic">&ldquo;{idea.hook}&rdquo;</p>
                      </div>
                    )}

                    {idea.talkingPoints?.length > 0 && (
                      <div>
                        <p className="text-[9px] font-medium text-text-muted uppercase tracking-wide mb-1 flex items-center gap-1">
                          <Lightbulb size={9} /> Talking points
                        </p>
                        <ul className="space-y-0.5">
                          {idea.talkingPoints.map((point, pi) => (
                            <li key={pi} className="flex items-start gap-1.5 text-xs text-text-secondary">
                              <span className="text-accent-text mt-0.5">-</span>
                              {point}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {idea.shotList?.length > 0 && (
                      <div>
                        <p className="text-[9px] font-medium text-text-muted uppercase tracking-wide mb-1 flex items-center gap-1">
                          <Camera size={9} /> Shot list
                        </p>
                        <ul className="space-y-0.5">
                          {idea.shotList.map((shot, si) => (
                            <li key={si} className="flex items-start gap-1.5 text-xs text-text-secondary">
                              <span className="text-purple-400 mt-0.5">-</span>
                              {shot}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {idea.whyItWorks && (
                      <div className="rounded-md bg-accent/5 border border-accent/10 px-2.5 py-1.5">
                        <p className="text-[9px] font-medium text-text-muted uppercase tracking-wide mb-0.5 flex items-center gap-1">
                          <Target size={9} /> Why it works
                        </p>
                        <p className="text-[11px] text-text-secondary">{idea.whyItWorks}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tips & Equipment */}
      {(plan.generalTips ?? []).length > 0 && (
        <div>
          <h5 className="flex items-center gap-1.5 text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1">
            <Lightbulb size={11} /> Tips
          </h5>
          <ul className="space-y-0.5">
            {plan.generalTips.map((tip, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-text-secondary">
                <span className="text-amber-400 mt-0.5">-</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(plan.equipmentSuggestions ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {plan.equipmentSuggestions.map((eq, i) => (
            <Badge key={i} variant="info">{eq}</Badge>
          ))}
        </div>
      )}
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
                  <AgencyBadge agency={shoot.agency || undefined} />
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

          {/* Shoot Plan (inline) */}
          {shoot.planData && (
            <div>
              <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Sparkles size={12} className="text-purple-400" />
                Shoot plan
              </h3>
              <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
                <ShootPlanPreview plan={shoot.planData} clientName={shoot.clientName} />
              </div>
            </div>
          )}

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
            <GlassButton
              onClick={() => onIdeate(shoot)}
              className="w-full justify-center"
            >
              <Sparkles size={14} />
              {shoot.planData ? 'Regenerate shoot plan' : 'Ideate shoot plan'}
            </GlassButton>

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
