'use client';

import {
  ChevronLeft,
  ChevronRight,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CalendarViewMode, CalendarLayer, EventType } from './types';

interface CalendarHeaderProps {
  currentDate: Date;
  view: CalendarViewMode;
  layers: CalendarLayer[];
  onViewChange: (view: CalendarViewMode) => void;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  onToggleLayer: (type: EventType | 'external') => void;
  onToggleAllLayers: (enabled: boolean) => void;
}

const VIEW_OPTIONS: { value: CalendarViewMode; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'day', label: 'Day' },
  { value: 'agenda', label: 'Agenda' },
];

function getHeaderLabel(date: Date, view: CalendarViewMode): string {
  if (view === 'day') {
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }
  if (view === 'week') {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const weekStart = new Date(d.getFullYear(), d.getMonth(), diff);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    if (weekStart.getMonth() === weekEnd.getMonth()) {
      return `${weekStart.toLocaleDateString('en-US', { month: 'long' })} ${weekStart.getDate()}–${weekEnd.getDate()}, ${weekStart.getFullYear()}`;
    }
    return `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
  // month / agenda
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function CalendarHeader({
  currentDate,
  view,
  layers,
  onViewChange,
  onNavigate,
  onToggleLayer,
  onToggleAllLayers,
}: CalendarHeaderProps) {
  const allEnabled = layers.every((l) => l.enabled);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-b border-nativz-border bg-surface">
      {/* Left: title + nav */}
      <div className="flex items-center gap-3">
        <h1 className="ui-section-title whitespace-nowrap">
          {getHeaderLabel(currentDate, view)}
        </h1>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onNavigate('prev')}
            className="rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => onNavigate('today')}
            className="rounded-lg px-2.5 py-1 text-xs font-medium text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => onNavigate('next')}
            className="rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Right: view toggle + layers */}
      <div className="flex items-center gap-3">
        {/* Layer toggles */}
        <div className="hidden md:flex items-center gap-1.5">
          <button
            onClick={() => onToggleAllLayers(!allEnabled)}
            className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium transition-colors ${
              allEnabled ? 'bg-white/10 text-text-secondary' : 'text-text-muted hover:bg-surface-hover'
            }`}
          >
            <Layers size={11} />
            All
          </button>
          {layers.map((layer) => (
            <button
              key={layer.type}
              onClick={() => onToggleLayer(layer.type as EventType | 'external')}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium transition-all ${
                layer.enabled ? '' : 'opacity-40 hover:opacity-70'
              }`}
              style={{
                backgroundColor: layer.enabled ? `${layer.color}20` : undefined,
                color: layer.enabled ? layer.color : undefined,
                // ring color via box-shadow since ringColor isn't a CSS property
                boxShadow: layer.enabled ? `inset 0 0 0 1px ${layer.color}40` : undefined,
              }}
            >
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: layer.color }}
              />
              {layer.label}
              {layer.count > 0 && (
                <span className="text-[10px] opacity-60">{layer.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* View mode toggle */}
        <div className="flex rounded-lg bg-background p-0.5">
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onViewChange(opt.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                view === opt.value
                  ? 'bg-surface-hover text-text-primary'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
