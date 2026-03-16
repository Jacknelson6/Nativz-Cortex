'use client';

import { FolderOpen, HardDrive, Calendar, Trash2 } from 'lucide-react';
import {
  PipelineItem,
  TeamMember,
  EDITING_STATUSES,
  APPROVAL_STATUSES,
  getRowProgressBorder,
  extractUrl,
} from './pipeline-types';
import { StatusPill } from './status-pill';
import { PersonCell } from './person-cell';
import { Badge } from '@/components/ui/badge';

interface PipelineListProps {
  items: PipelineItem[];
  teamMembers: TeamMember[];
  onUpdate: (id: string, field: string, value: string) => void;
  onSelect: (item: PipelineItem) => void;
  onDelete: (id: string, name: string) => void;
}

function formatShootDate(dateStr: string | null): { label: string; overdue: boolean } {
  if (!dateStr) return { label: '—', overdue: false };
  const date = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const overdue = date < now;
  const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return { label, overdue };
}

function isEditingDone(editingStatus: string): boolean {
  return ['em_approved', 'scheduled', 'done'].includes(editingStatus);
}

export function PipelineList({ items, teamMembers, onUpdate, onSelect, onDelete }: PipelineListProps) {
  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="sticky top-0 bg-background z-10 border-b border-nativz-border">
            <th className="text-left px-4 py-2 text-[11px] font-medium text-text-muted w-[220px]">
              Client
            </th>
            <th className="text-left px-3 py-2 text-[11px] font-medium text-text-muted w-[120px]">
              Editor
            </th>
            <th className="text-left px-3 py-2 text-[11px] font-medium text-text-muted w-[140px]">
              Editing
            </th>
            <th className="text-left px-3 py-2 text-[11px] font-medium text-text-muted w-[160px]">
              Approval
            </th>
            <th className="text-left px-3 py-2 text-[11px] font-medium text-text-muted w-[90px]">
              Shoot
            </th>
            <th className="text-left px-3 py-2 text-[11px] font-medium text-text-muted w-[100px]">
              Links
            </th>
            <th className="w-[40px]" />
          </tr>
        </thead>
        <tbody>
          {items.map(item => {
            const borderClass = getRowProgressBorder(item);
            const { label: shootLabel, overdue: shootOverdue } = formatShootDate(item.shoot_date);
            const shootPast = shootOverdue && !isEditingDone(item.editing_status);

            const editedUrl = extractUrl(item.edited_videos_folder_url);
            const rawsUrl = extractUrl(item.raws_folder_url);
            const calendarUrl = extractUrl(item.later_calendar_link);

            const agencyVariant =
              item.agency === 'Nativz' ? 'info' :
              item.agency === 'AC' ? 'success' :
              'default';

            return (
              <tr
                key={item.id}
                className={`group border-b border-nativz-border hover:bg-surface-hover/50 transition-colors cursor-pointer border-l-2 ${borderClass}`}
                onClick={() => onSelect(item)}
              >
                {/* Client */}
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium text-text-primary truncate">
                      {item.client_name}
                    </span>
                    {item.agency && (
                      <Badge variant={agencyVariant} className="shrink-0 text-[10px] py-0 px-1.5">
                        {item.agency}
                      </Badge>
                    )}
                  </div>
                </td>

                {/* Editor */}
                <td
                  className="px-3 py-2.5"
                  onClick={e => e.stopPropagation()}
                >
                  <PersonCell
                    value={item.editor}
                    field="editor"
                    itemId={item.id}
                    teamMembers={teamMembers}
                    onUpdate={onUpdate}
                  />
                </td>

                {/* Editing status */}
                <td
                  className="px-3 py-2.5"
                  onClick={e => e.stopPropagation()}
                >
                  <StatusPill
                    value={item.editing_status}
                    statuses={EDITING_STATUSES}
                    field="editing_status"
                    itemId={item.id}
                    onUpdate={onUpdate}
                  />
                </td>

                {/* Approval status */}
                <td
                  className="px-3 py-2.5"
                  onClick={e => e.stopPropagation()}
                >
                  <StatusPill
                    value={item.client_approval_status}
                    statuses={APPROVAL_STATUSES}
                    field="client_approval_status"
                    itemId={item.id}
                    onUpdate={onUpdate}
                  />
                </td>

                {/* Shoot date */}
                <td className="px-3 py-2.5">
                  <span
                    className={`text-xs tabular-nums ${
                      shootPast ? 'text-red-400 font-medium' : 'text-text-secondary'
                    }`}
                  >
                    {shootLabel}
                  </span>
                </td>

                {/* Links */}
                <td
                  className="px-3 py-2.5"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex items-center gap-1.5">
                    {editedUrl && (
                      <a
                        href={editedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Edited videos folder"
                        className="text-text-muted hover:text-text-primary transition-colors"
                        onClick={e => e.stopPropagation()}
                      >
                        <FolderOpen size={14} />
                      </a>
                    )}
                    {rawsUrl && (
                      <a
                        href={rawsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Raws folder"
                        className="text-text-muted hover:text-text-primary transition-colors"
                        onClick={e => e.stopPropagation()}
                      >
                        <HardDrive size={14} />
                      </a>
                    )}
                    {calendarUrl && (
                      <a
                        href={calendarUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Later calendar"
                        className="text-text-muted hover:text-text-primary transition-colors"
                        onClick={e => e.stopPropagation()}
                      >
                        <Calendar size={14} />
                      </a>
                    )}
                  </div>
                </td>

                {/* Actions */}
                <td
                  className="px-2 py-2.5"
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onDelete(item.id, item.client_name);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-red-400 cursor-pointer p-1 rounded"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {items.length === 0 && (
        <div className="py-16 text-center text-text-muted text-sm">
          No pipeline items found.
        </div>
      )}
    </div>
  );
}
