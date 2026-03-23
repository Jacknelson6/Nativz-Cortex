'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Camera,
  CheckSquare,
  Loader2,
  Eye,
  EyeOff,
  Calendar as CalendarIcon,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

// ─── Types ───────────────────────────────────────────────────────────

interface CalendarTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  shoot_date: string | null;
  task_type: string;
  client_id: string | null;
  assignee_id: string | null;
  clients: { id: string; name: string; slug: string } | null;
  team_members: { id: string; full_name: string; avatar_url: string | null } | null;
}

interface CalendarShoot {
  id: string;
  title: string;
  shoot_date: string;
  location: string | null;
  notes: string | null;
  scheduled_status: string;
  client_id: string;
  clients: { id: string; name: string; slug: string };
}

interface ClientOption {
  id: string;
  name: string;
  slug: string;
}

interface DayItem {
  type: 'task' | 'shoot';
  id: string;
  title: string;
  clientName: string | null;
  clientId: string | null;
  status: string;
  priority?: string;
  taskType?: string;
  location?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function getClientColor(name: string | null): string {
  if (!name) return 'hsl(220, 15%, 40%)';
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function isSameDay(dateStr: string, year: number, month: number, day: number): boolean {
  const d = new Date(dateStr + 'T00:00:00');
  return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TASK_TYPE_OPTIONS = [
  { value: 'content', label: 'Content' },
  { value: 'shoot', label: 'Shoot' },
  { value: 'edit', label: 'Edit' },
  { value: 'paid_media', label: 'Paid media' },
  { value: 'strategy', label: 'Strategy' },
  { value: 'other', label: 'Other' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

// ─── Component ───────────────────────────────────────────────────────

export function ContentCalendar() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [tasks, setTasks] = useState<CalendarTask[]>([]);
  const [shoots, setShoots] = useState<CalendarShoot[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);

  // Modals
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [addModalType, setAddModalType] = useState<'task' | 'shoot' | null>(null);
  const [detailItem, setDetailItem] = useState<DayItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formClientId, setFormClientId] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formTaskType, setFormTaskType] = useState('content');
  const [formPriority, setFormPriority] = useState('medium');
  const [formLocation, setFormLocation] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // ─── Data fetching ─────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    const startDate = formatDate(new Date(currentYear, currentMonth, 1));
    const endDate = formatDate(new Date(currentYear, currentMonth + 1, 0));

    try {
      const [tasksRes, shootsRes, clientsRes] = await Promise.all([
        fetch(`/api/tasks?due_date_from=${startDate}&due_date_to=${endDate}`),
        fetch(`/api/shoots?date_from=${startDate}&date_to=${endDate}`),
        fetch('/api/clients?active=true'),
      ]);

      if (tasksRes.ok) {
        const data = await tasksRes.json();
        setTasks(data.tasks ?? data ?? []);
      }
      if (shootsRes.ok) {
        const data = await shootsRes.json();
        setShoots(data.shoots ?? data ?? []);
      }
      if (clientsRes.ok) {
        const data = await clientsRes.json();
        setClients(data.clients ?? data ?? []);
      }
    } catch {
      // Fail silently — data stays empty
    } finally {
      setLoading(false);
    }
  }, [currentMonth, currentYear]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Organize items by day ─────────────────────────────────────────

  const dayItemsMap = useMemo(() => {
    const map = new Map<number, DayItem[]>();
    const daysInMonth = getDaysInMonth(currentYear, currentMonth);

    for (let day = 1; day <= daysInMonth; day++) {
      const items: DayItem[] = [];

      for (const task of tasks) {
        const dateStr = task.due_date ?? task.shoot_date;
        if (!dateStr) continue;
        if (!isSameDay(dateStr, currentYear, currentMonth, day)) continue;
        if (!showCompleted && task.status === 'done') continue;

        items.push({
          type: 'task',
          id: task.id,
          title: task.title,
          clientName: task.clients?.name ?? null,
          clientId: task.client_id,
          status: task.status,
          priority: task.priority,
          taskType: task.task_type,
        });
      }

      for (const shoot of shoots) {
        if (!isSameDay(shoot.shoot_date, currentYear, currentMonth, day)) continue;
        if (!showCompleted && shoot.scheduled_status === 'completed') continue;

        items.push({
          type: 'shoot',
          id: shoot.id,
          title: shoot.title,
          clientName: shoot.clients?.name ?? null,
          clientId: shoot.client_id,
          status: shoot.scheduled_status,
          location: shoot.location,
        });
      }

      if (items.length > 0) map.set(day, items);
    }

    return map;
  }, [tasks, shoots, currentYear, currentMonth, showCompleted]);

  // ─── Navigation ────────────────────────────────────────────────────

  function prevMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  }

  function nextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  }

  function goToToday() {
    setCurrentMonth(today.getMonth());
    setCurrentYear(today.getFullYear());
  }

  // ─── Modal handlers ────────────────────────────────────────────────

  function openDayModal(day: number) {
    setSelectedDay(day);
    setAddModalType(null);
  }

  function openAddModal(type: 'task' | 'shoot') {
    setAddModalType(type);
    setFormTitle('');
    setFormClientId('');
    setFormDescription('');
    setFormTaskType('content');
    setFormPriority('medium');
    setFormLocation('');
    setFormNotes('');
  }

  function closeAllModals() {
    setSelectedDay(null);
    setAddModalType(null);
    setDetailItem(null);
  }

  async function handleSaveTask() {
    if (!formTitle.trim() || !selectedDay) return;
    setSaving(true);
    try {
      const dueDate = formatDate(new Date(currentYear, currentMonth, selectedDay));
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formTitle,
          description: formDescription || null,
          client_id: formClientId || null,
          task_type: formTaskType,
          priority: formPriority,
          due_date: dueDate,
          status: 'backlog',
        }),
      });
      if (res.ok) {
        closeAllModals();
        fetchData();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveShoot() {
    if (!formTitle.trim() || !selectedDay) return;
    setSaving(true);
    try {
      const shootDate = formatDate(new Date(currentYear, currentMonth, selectedDay));
      const res = await fetch('/api/shoots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formTitle,
          client_ids: formClientId ? [formClientId] : [],
          shoot_date: shootDate,
          location: formLocation || null,
          notes: formNotes || null,
        }),
      });
      if (res.ok) {
        closeAllModals();
        fetchData();
      }
    } finally {
      setSaving(false);
    }
  }

  // ─── Grid calculation ──────────────────────────────────────────────

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDayOfWeek = getFirstDayOfWeek(currentYear, currentMonth);
  const totalCells = Math.ceil((firstDayOfWeek + daysInMonth) / 7) * 7;

  const monthLabel = new Date(currentYear, currentMonth).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const isToday = (day: number) =>
    day === today.getDate() &&
    currentMonth === today.getMonth() &&
    currentYear === today.getFullYear();

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="ui-page-title">{monthLabel}</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={prevMonth}
              className="rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={goToToday}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
            >
              Today
            </button>
            <button
              onClick={nextMonth}
              className="rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
              aria-label="Next month"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
          >
            {showCompleted ? <Eye size={14} /> : <EyeOff size={14} />}
            {showCompleted ? 'Showing completed' : 'Hiding completed'}
          </button>

          {/* Legend */}
          <div className="hidden sm:flex items-center gap-3 text-xs text-text-muted">
            <span className="flex items-center gap-1">
              <CheckSquare size={12} className="text-blue-400" />
              Task
            </span>
            <span className="flex items-center gap-1">
              <Camera size={12} className="text-amber-400" />
              Shoot
            </span>
          </div>
        </div>
      </div>

      {/* Calendar grid */}
      <Card padding="none" className="overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-nativz-border">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="px-2 py-2.5 text-center text-xs font-medium text-text-muted uppercase tracking-wider"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Day cells */}
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 size={24} className="animate-spin text-text-muted" />
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {Array.from({ length: totalCells }, (_, i) => {
              const day = i - firstDayOfWeek + 1;
              const isCurrentMonth = day >= 1 && day <= daysInMonth;
              const items = isCurrentMonth ? dayItemsMap.get(day) ?? [] : [];
              const todayHighlight = isCurrentMonth && isToday(day);

              return (
                <motion.div
                  key={i}
                  className={`
                    min-h-[90px] sm:min-h-[110px] border-b border-r border-nativz-border/50 p-1 sm:p-1.5
                    ${isCurrentMonth ? 'cursor-pointer hover:bg-surface-hover/50 transition-colors' : 'bg-background/30'}
                    ${i % 7 === 6 ? 'border-r-0' : ''}
                  `}
                  onClick={() => isCurrentMonth && openDayModal(day)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.15, delay: i * 0.008 }}
                >
                  {isCurrentMonth && (
                    <>
                      <div className="flex items-center justify-between mb-0.5">
                        <span
                          className={`
                            text-xs font-medium leading-none
                            ${todayHighlight
                              ? 'flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white'
                              : 'text-text-secondary px-0.5'
                            }
                          `}
                        >
                          {day}
                        </span>
                        {items.length > 0 && (
                          <span className="text-[10px] text-text-muted sm:hidden">
                            {items.length}
                          </span>
                        )}
                      </div>

                      {/* Chips */}
                      <div className="space-y-0.5">
                        {items.slice(0, 3).map((item) => (
                          <button
                            key={`${item.type}-${item.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailItem(item);
                            }}
                            className="w-full text-left group"
                          >
                            <div
                              className={`
                                flex items-center gap-1 rounded px-1 py-0.5 text-[11px] leading-tight truncate
                                transition-all duration-150 hover:brightness-125
                                ${item.status === 'done' || item.status === 'completed'
                                  ? 'opacity-50 line-through'
                                  : ''
                                }
                              `}
                              style={{
                                backgroundColor: `${getClientColor(item.clientName)}20`,
                                color: getClientColor(item.clientName),
                                borderLeft: `2px solid ${getClientColor(item.clientName)}`,
                              }}
                            >
                              {item.type === 'shoot' ? (
                                <Camera size={10} className="shrink-0" />
                              ) : (
                                <CheckSquare size={10} className="shrink-0" />
                              )}
                              <span className="truncate hidden sm:inline">{item.title}</span>
                              <span className="truncate sm:hidden">{item.clientName ?? item.title}</span>
                            </div>
                          </button>
                        ))}
                        {items.length > 3 && (
                          <div className="text-[10px] text-text-muted px-1">
                            +{items.length - 3} more
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ─── Day detail modal (pick task or shoot) ──────────────────── */}
      <Dialog
        open={selectedDay !== null && addModalType === null && detailItem === null}
        onClose={closeAllModals}
        title={selectedDay ? `${new Date(currentYear, currentMonth, selectedDay).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}` : ''}
        maxWidth="md"
      >
        {selectedDay && (
          <div className="space-y-4">
            {/* Items on this day */}
            {(dayItemsMap.get(selectedDay) ?? []).length > 0 && (
              <div className="space-y-2">
                {(dayItemsMap.get(selectedDay) ?? []).map((item) => (
                  <button
                    key={`${item.type}-${item.id}`}
                    onClick={() => setDetailItem(item)}
                    className="w-full text-left"
                  >
                    <div
                      className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-surface-hover"
                      style={{
                        borderLeft: `3px solid ${getClientColor(item.clientName)}`,
                      }}
                    >
                      {item.type === 'shoot' ? (
                        <Camera size={16} className="text-amber-400 shrink-0" />
                      ) : (
                        <CheckSquare size={16} className="text-blue-400 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-medium text-text-primary truncate ${item.status === 'done' || item.status === 'completed' ? 'line-through opacity-50' : ''}`}>
                          {item.title}
                        </p>
                        {item.clientName && (
                          <p className="text-xs text-text-muted">{item.clientName}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {item.priority && (
                          <Badge variant={item.priority === 'urgent' ? 'danger' : item.priority === 'high' ? 'warning' : 'default'}>
                            {item.priority}
                          </Badge>
                        )}
                        <Badge variant={item.type === 'shoot' ? 'warning' : 'info'}>
                          {item.type}
                        </Badge>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Add buttons */}
            <div className="flex items-center gap-2 pt-2 border-t border-nativz-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => openAddModal('task')}
                className="flex-1"
              >
                <CheckSquare size={14} />
                Add task
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openAddModal('shoot')}
                className="flex-1"
              >
                <Camera size={14} />
                Add shoot
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* ─── Add task modal ─────────────────────────────────────────── */}
      <Dialog
        open={addModalType === 'task'}
        onClose={closeAllModals}
        title={`Add task — ${selectedDay ? new Date(currentYear, currentMonth, selectedDay).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}`}
        maxWidth="md"
      >
        <div className="space-y-4">
          <Input
            label="Title"
            id="task-title"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            placeholder="e.g. Film product demo"
            autoFocus
          />
          <Select
            label="Client"
            id="task-client"
            value={formClientId}
            onChange={(e) => setFormClientId(e.target.value)}
            options={[
              { value: '', label: 'No client' },
              ...clients.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Type"
              id="task-type"
              value={formTaskType}
              onChange={(e) => setFormTaskType(e.target.value)}
              options={TASK_TYPE_OPTIONS}
            />
            <Select
              label="Priority"
              id="task-priority"
              value={formPriority}
              onChange={(e) => setFormPriority(e.target.value)}
              options={PRIORITY_OPTIONS}
            />
          </div>
          <Textarea
            label="Description"
            id="task-desc"
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            placeholder="Optional details..."
            rows={3}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={closeAllModals}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveTask} disabled={!formTitle.trim() || saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {saving ? 'Saving...' : 'Add task'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ─── Add shoot modal ────────────────────────────────────────── */}
      <Dialog
        open={addModalType === 'shoot'}
        onClose={closeAllModals}
        title={`Schedule shoot — ${selectedDay ? new Date(currentYear, currentMonth, selectedDay).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}`}
        maxWidth="md"
      >
        <div className="space-y-4">
          <Input
            label="Title"
            id="shoot-title"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            placeholder="e.g. Brand shoot — Acme Co"
            autoFocus
          />
          <Select
            label="Client"
            id="shoot-client"
            value={formClientId}
            onChange={(e) => setFormClientId(e.target.value)}
            options={[
              { value: '', label: 'Select client' },
              ...clients.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <Input
            label="Location"
            id="shoot-location"
            value={formLocation}
            onChange={(e) => setFormLocation(e.target.value)}
            placeholder="e.g. Studio A, Miami"
          />
          <Textarea
            label="Notes"
            id="shoot-notes"
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            placeholder="Shot list, equipment, etc..."
            rows={3}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={closeAllModals}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveShoot} disabled={!formTitle.trim() || saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
              {saving ? 'Scheduling...' : 'Schedule shoot'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ─── Detail modal ───────────────────────────────────────────── */}
      <AnimatePresence>
        {detailItem && (
          <Dialog
            open={!!detailItem}
            onClose={() => setDetailItem(null)}
            title={detailItem.type === 'shoot' ? 'Shoot details' : 'Task details'}
            maxWidth="md"
          >
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="space-y-4"
            >
              <div>
                <h3 className="text-base font-semibold text-text-primary">{detailItem.title}</h3>
                {detailItem.clientName && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <div
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: getClientColor(detailItem.clientName) }}
                    />
                    <span className="text-sm text-text-muted">{detailItem.clientName}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={detailItem.type === 'shoot' ? 'warning' : 'info'}>
                  {detailItem.type === 'shoot' ? 'Shoot' : 'Task'}
                </Badge>
                <Badge variant={
                  detailItem.status === 'done' || detailItem.status === 'completed' ? 'success'
                    : detailItem.status === 'in_progress' ? 'info'
                    : detailItem.status === 'review' ? 'purple'
                    : detailItem.status === 'cancelled' ? 'danger'
                    : 'default'
                }>
                  {detailItem.status.replace('_', ' ')}
                </Badge>
                {detailItem.priority && (
                  <Badge variant={detailItem.priority === 'urgent' ? 'danger' : detailItem.priority === 'high' ? 'warning' : 'default'}>
                    {detailItem.priority}
                  </Badge>
                )}
                {detailItem.taskType && (
                  <Badge variant="mono">{detailItem.taskType.replace('_', ' ')}</Badge>
                )}
              </div>

              {detailItem.location && (
                <p className="text-sm text-text-muted">
                  <span className="text-text-secondary font-medium">Location:</span> {detailItem.location}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-nativz-border">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const href = detailItem.type === 'shoot'
                      ? '/admin/shoots'
                      : '/admin/tasks';
                    window.location.href = href;
                  }}
                >
                  <CalendarIcon size={14} />
                  View in {detailItem.type === 'shoot' ? 'shoots' : 'tasks'}
                </Button>
              </div>
            </motion.div>
          </Dialog>
        )}
      </AnimatePresence>
    </div>
  );
}
