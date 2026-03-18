'use client';

import {
  Camera,
  CalendarDays,
  Film,
  ExternalLink,
  X,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassButton } from '@/components/ui/glass-button';
import { AgencyBadge } from '@/components/clients/agency-badge';
import type { ShootItem } from './types';
import { ShootAvatar } from './shoot-avatar';
import { isShootPast, getRawsBadge, getEditingBadge } from './helpers';

export function ShootDetailPanel({
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

          {/* Status summary */}
          <div className="flex flex-wrap gap-2">
            <Badge variant={raws.variant}>{raws.label}</Badge>
            <Badge variant={editing.variant}>{editing.label}</Badge>
          </div>

          {/* Plan & Notes Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide">Shoot Plan & Notes</h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[10px] text-accent2-text hover:text-accent2-text hover:bg-accent2-surface"
                onClick={() => onIdeate(shoot)}
              >
                <Sparkles size={12} />
                Ideate shoot plan
              </Button>
            </div>
            <textarea
              className="w-full min-h-[300px] rounded-lg border border-nativz-border bg-surface-hover/20 p-4 text-sm text-text-secondary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-all resize-none"
              placeholder="Paste or generate a shoot plan here..."
              defaultValue={shoot.notes || (shoot.planData ?
                `TITLE: ${shoot.planData.title}\n\nSUMMARY: ${shoot.planData.summary}\n\n` +
                shoot.planData.videoIdeas.map((v, i) =>
                  `VIDEO ${i+1}: ${v.title}\nHOOK: ${v.hook}\nFORMAT: ${v.format}\n\nPOINTS:\n${v.talkingPoints.map(p => `- ${p}`).join('\n')}\n\nSHOTS:\n${v.shotList.map(s => `- ${s}`).join('\n')}`
                ).join('\n\n---\n\n') : '')}
            />
          </div>

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
