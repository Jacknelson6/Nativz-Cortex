'use client';

import { useState } from 'react';
import { Trash2, FolderOpen, HardDrive, Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StatusPill } from './status-pill';
import { PersonCell } from './person-cell';
import {
  PipelineItem,
  TeamMember,
  RoleBoardConfig,
  extractUrl,
  getCompletionProgress,
} from './pipeline-types';

interface PipelineBoardProps {
  items: PipelineItem[];
  teamMembers: TeamMember[];
  boardConfig: RoleBoardConfig;
  onUpdate: (id: string, field: string, value: string) => void;
  onSelect: (item: PipelineItem) => void;
  onDelete: (id: string, name: string) => void;
}

export function PipelineBoard({
  items,
  teamMembers,
  boardConfig,
  onUpdate,
  onSelect,
  onDelete,
}: PipelineBoardProps) {
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Group items into columns by the role's statusField
  const columns = boardConfig.statuses.map(status => ({
    ...status,
    items: items.filter(
      item => (item[boardConfig.statusField] as string) === status.value
    ),
  }));

  function handleDragStart(e: React.DragEvent, itemId: string) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', itemId);
    setDraggingId(itemId);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDragOverCol(null);
  }

  function handleDragOver(e: React.DragEvent, colValue: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCol !== colValue) setDragOverCol(colValue);
  }

  function handleDragLeave(e: React.DragEvent, colValue: string) {
    if (dragOverCol === colValue && !e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverCol(null);
    }
  }

  function handleDrop(e: React.DragEvent, colValue: string) {
    e.preventDefault();
    const itemId = e.dataTransfer.getData('text/plain');
    setDragOverCol(null);
    setDraggingId(null);
    if (itemId) {
      const item = items.find(i => i.id === itemId);
      const currentValue = item ? (item[boardConfig.statusField] as string) : null;
      if (item && currentValue !== colValue) {
        onUpdate(itemId, boardConfig.statusField as string, colValue);
      }
    }
  }

  return (
    <div className="flex-1 overflow-x-auto">
      <div className="flex gap-3 p-4 min-w-max h-full">
        {columns.map(col => (
          <div
            key={col.value}
            className={`w-[240px] flex flex-col shrink-0 rounded-xl transition-colors ${
              dragOverCol === col.value ? 'bg-accent/5 ring-1 ring-accent/20' : ''
            }`}
            onDragOver={e => handleDragOver(e, col.value)}
            onDragLeave={e => handleDragLeave(e, col.value)}
            onDrop={e => handleDrop(e, col.value)}
          >
            {/* Column header */}
            <div className="flex items-center gap-2 px-2 py-2 mb-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${col.color.split(' ')[0]}`} />
              <span className="text-xs font-semibold text-text-secondary">{col.label}</span>
              <span className="text-[10px] text-text-muted ml-auto">{col.items.length}</span>
            </div>

            {/* Cards */}
            <div className="flex-1 space-y-2 overflow-y-auto px-1 pb-1">
              {col.items.map(item => {
                const progress = getCompletionProgress(item);
                const editedFolderUrl = extractUrl(item.edited_videos_folder_url);
                const rawsFolderUrl = extractUrl(item.raws_folder_url);
                const calendarUrl = extractUrl(item.later_calendar_link);

                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={e => handleDragStart(e, item.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => onSelect(item)}
                    className={`rounded-xl border border-nativz-border bg-surface p-3 space-y-2 group hover:border-accent/30 transition-all cursor-pointer ${
                      draggingId === item.id ? 'opacity-40 scale-95' : ''
                    }`}
                  >
                    {/* Client name + agency badge */}
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-medium text-text-primary truncate">
                        {item.client_name}
                      </span>
                      {item.agency && (
                        <Badge
                          variant={item.agency === 'Nativz' ? 'info' : 'success'}
                          className="text-[10px] px-1 py-0 shrink-0"
                        >
                          {item.agency}
                        </Badge>
                      )}
                    </div>

                    {/* Role-specific assignee */}
                    <div
                      className="flex items-center gap-1.5"
                      onClick={e => e.stopPropagation()}
                    >
                      <PersonCell
                        value={item[boardConfig.assignmentField] as string | null}
                        field={boardConfig.assignmentField as string}
                        itemId={item.id}
                        teamMembers={teamMembers}
                        onUpdate={onUpdate}
                      />
                    </div>

                    {/* Progress bar */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 rounded-full bg-surface-hover overflow-hidden">
                        <div
                          className="h-full rounded-full bg-accent-text transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-text-muted">{progress}%</span>
                    </div>

                    {/* Shoot date */}
                    {item.shoot_date && (
                      <p className="text-[10px] text-text-muted">
                        Shoot:{' '}
                        {new Date(item.shoot_date + 'T00:00:00').toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                    )}

                    {/* Link icons row + delete */}
                    <div className="flex items-center gap-1">
                      {editedFolderUrl && (
                        <a
                          href={editedFolderUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          title="Edited videos folder"
                          className="p-1 rounded text-text-muted hover:text-accent-text hover:bg-surface-hover transition-colors"
                        >
                          <FolderOpen size={11} />
                        </a>
                      )}
                      {rawsFolderUrl && (
                        <a
                          href={rawsFolderUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          title="Raws folder"
                          className="p-1 rounded text-text-muted hover:text-accent-text hover:bg-surface-hover transition-colors"
                        >
                          <HardDrive size={11} />
                        </a>
                      )}
                      {calendarUrl && (
                        <a
                          href={calendarUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          title="Later calendar link"
                          className="p-1 rounded text-text-muted hover:text-accent-text hover:bg-surface-hover transition-colors"
                        >
                          <Calendar size={11} />
                        </a>
                      )}

                      {/* Spacer */}
                      <div className="flex-1" />

                      {/* Delete — visible on hover */}
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          onDelete(item.id, item.client_name);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-500/10 text-text-muted hover:text-red-400 cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Empty column drop zone */}
              {col.items.length === 0 && (
                <div className="h-20 rounded-lg border border-dashed border-nativz-border/50 flex items-center justify-center">
                  <span className="text-[10px] text-text-muted/50">Drop here</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
