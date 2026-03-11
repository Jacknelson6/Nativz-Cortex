// Unified Calendar Hub types

export type CalendarViewMode = 'month' | 'week' | 'day' | 'agenda';
export type EventType = 'shoot' | 'meeting' | 'task';

export interface CalendarEvent {
  id: string;
  title: string;
  type: EventType;
  start: string;   // ISO datetime
  end?: string;     // ISO datetime
  allDay?: boolean;
  clientId?: string | null;
  clientName?: string | null;
  strategistName?: string | null;
  status?: string;
  priority?: string;
  location?: string | null;
  /** True if this is a computed occurrence of a recurring meeting (not stored in DB) */
  isRecurrenceInstance?: boolean;
  /** Raw source data for opening detail views */
  source?: Record<string, unknown>;
}

export interface ExternalCalendarEvent {
  id: string;
  title: string;  // "Busy" for client calendars
  start: string;
  end: string;
  isAllDay?: boolean;
}

export interface CalendarPerson {
  connectionId: string;
  name: string;
  color: string;
  connectionType: 'team' | 'client';
  events: ExternalCalendarEvent[];
  enabled: boolean;
}

export interface CalendarLayer {
  type: EventType | 'external';
  label: string;
  color: string;
  enabled: boolean;
  count: number;
}

export const EVENT_COLORS: Record<EventType, string> = {
  shoot: '#f59e0b',    // amber-500
  meeting: '#3b82f6',  // blue-500
  task: '#10b981',     // emerald-500
};

export const EVENT_BG_COLORS: Record<EventType, string> = {
  shoot: 'rgba(245, 158, 11, 0.15)',
  meeting: 'rgba(59, 130, 246, 0.15)',
  task: 'rgba(16, 185, 129, 0.15)',
};

export const PERSON_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f97316',
  '#06b6d4', '#84cc16', '#f43f5e', '#14b8a6',
];

export const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8am to 8pm
