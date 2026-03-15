'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Trash2,
  ExternalLink,
  FolderOpen,
  HardDrive,
  Calendar,
  FileText,
  Link as LinkIcon,
} from 'lucide-react';
import {
  PipelineItem,
  TeamMember,
  ASSIGNMENT_STATUSES,
  RAWS_STATUSES,
  EDITING_STATUSES,
  APPROVAL_STATUSES,
  BOOSTING_STATUSES,
  EDITING_STATUS_ACTIONS,
  getCompletionProgress,
  extractUrl,
} from './pipeline-types';
import { StatusPill } from './status-pill';
import { PersonCell } from './person-cell';

// ── Props ─────────────────────────────────────────────────────────────────────

interface PipelineDetailPanelProps {
  item: PipelineItem | null;
  onClose: () => void;
  onUpdate: (id: string, field: string, value: string) => void;
  onDelete: (id: string, name: string) => void;
  teamMembers: TeamMember[];
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-text-muted mb-3">
      {children}
    </p>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 min-h-[32px]">
      <span className="text-xs text-text-muted shrink-0 w-32">{label}</span>
      <div className="flex-1 flex justify-end">{children}</div>
    </div>
  );
}

interface LinkFieldProps {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  field: string;
  itemId: string;
  onUpdate: (id: string, field: string, value: string) => void;
}

function LinkField({ icon, label, value, field, itemId, onUpdate }: LinkFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const url = extractUrl(value);

  // Sync draft when value prop changes (e.g. after external update)
  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  if (editing) {
    return (
      <div className="py-1.5">
        <p className="text-[11px] text-text-muted mb-1">{label}</p>
        <div className="flex gap-2">
          <input
            autoFocus
            type="url"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onUpdate(itemId, field, draft);
                setEditing(false);
              }
              if (e.key === 'Escape') setEditing(false);
            }}
            placeholder="https://"
            className="flex-1 bg-surface-hover border border-nativz-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder-text-muted outline-none focus:border-blue-500/50"
          />
          <button
            onClick={() => { onUpdate(itemId, field, draft); setEditing(false); }}
            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 transition-colors cursor-pointer"
          >
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            className="px-3 py-1.5 rounded-lg border border-nativz-border text-xs text-text-muted hover:bg-surface-hover transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-text-muted shrink-0">{icon}</span>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent-text hover:text-blue-300 truncate max-w-[180px] transition-colors"
            title={url}
          >
            {url.replace(/^https?:\/\//, '')}
          </a>
        ) : (
          <span className="text-xs text-text-muted">{label}</span>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-muted hover:text-text-primary transition-colors"
            title="Open link"
          >
            <ExternalLink size={13} />
          </a>
        )}
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer px-1.5 py-0.5 rounded hover:bg-surface-hover"
        >
          {url ? 'Edit' : 'Add link'}
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PipelineDetailPanel({
  item,
  onClose,
  onUpdate,
  onDelete,
  teamMembers,
}: PipelineDetailPanelProps) {
  const [notes, setNotes] = useState('');
  const [mounted, setMounted] = useState(false);

  // Track client-side mount for portal
  useEffect(() => { setMounted(true); }, []);

  // Sync notes from item
  useEffect(() => {
    setNotes(item?.notes ?? '');
  }, [item]);

  // Close on Escape
  useEffect(() => {
    if (!item) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [item, onClose]);

  if (!mounted) return null;

  const progress = item ? getCompletionProgress(item) : 0;
  const editingActions = item ? (EDITING_STATUS_ACTIONS[item.editing_status] ?? []) : [];

  const panelContent = (
    <AnimatePresence>
      {item && (
        <>
          {/* Backdrop */}
          <motion.div
            key="pipeline-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[100] bg-black/50"
            onClick={onClose}
          />

          {/* Slide-in panel */}
          <motion.div
            key="pipeline-panel"
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 32, mass: 0.9 }}
            className="fixed top-0 right-0 bottom-0 z-[101] w-full max-w-[420px] flex flex-col bg-surface border-l border-nativz-border shadow-[−8px_0_32px_rgba(0,0,0,0.4)] overflow-hidden"
          >
            {/* ── Header ── */}
            <div className="px-5 pt-5 pb-4 border-b border-nativz-border shrink-0">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-text-primary leading-tight truncate">
                    {item.client_name}
                  </h2>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-text-muted">{item.month_label}</span>
                    {item.agency && (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border bg-blue-500/10 text-blue-400 border-blue-500/20">
                        {item.agency}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="shrink-0 p-1.5 rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-primary transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Progress bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-text-muted">Overall progress</span>
                  <span className="text-[11px] font-medium text-text-secondary">{progress}%</span>
                </div>
                <div className="h-1.5 bg-surface-hover rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className={`h-full rounded-full ${
                      progress === 100
                        ? 'bg-green-500'
                        : progress >= 60
                        ? 'bg-blue-500'
                        : progress >= 30
                        ? 'bg-amber-500'
                        : 'bg-gray-500'
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* ── Scrollable body ── */}
            <div className="flex-1 overflow-y-auto">

              {/* Pipeline status */}
              <div className="px-5 py-4 border-b border-nativz-border">
                <SectionLabel>Pipeline status</SectionLabel>
                <div className="space-y-0.5 divide-y divide-white/[0.04]">
                  <FieldRow label="Assignment">
                    <StatusPill
                      value={item.assignment_status}
                      statuses={ASSIGNMENT_STATUSES}
                      field="assignment_status"
                      itemId={item.id}
                      onUpdate={onUpdate}
                    />
                  </FieldRow>
                  <FieldRow label="RAWs">
                    <StatusPill
                      value={item.raws_status}
                      statuses={RAWS_STATUSES}
                      field="raws_status"
                      itemId={item.id}
                      onUpdate={onUpdate}
                    />
                  </FieldRow>
                  <FieldRow label="Editing">
                    <StatusPill
                      value={item.editing_status}
                      statuses={EDITING_STATUSES}
                      field="editing_status"
                      itemId={item.id}
                      onUpdate={onUpdate}
                    />
                  </FieldRow>

                  {/* Contextual editing actions */}
                  {editingActions.length > 0 && (
                    <div className="pt-2 pb-1 flex flex-wrap gap-2">
                      {editingActions.map((action, idx) => {
                        const isDanger = action.targetStatus === 'blocked';
                        const isSecondary = idx > 0 && !isDanger;
                        return (
                          <button
                            key={action.targetStatus}
                            onClick={() => onUpdate(item.id, 'editing_status', action.targetStatus)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                              isDanger
                                ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20'
                                : isSecondary
                                ? 'border border-nativz-border text-text-secondary hover:bg-surface-hover'
                                : 'bg-blue-600 text-white hover:bg-blue-500'
                            }`}
                          >
                            {action.label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <FieldRow label="Client approval">
                    <StatusPill
                      value={item.client_approval_status}
                      statuses={APPROVAL_STATUSES}
                      field="client_approval_status"
                      itemId={item.id}
                      onUpdate={onUpdate}
                    />
                  </FieldRow>
                  <FieldRow label="Boosting">
                    <StatusPill
                      value={item.boosting_status}
                      statuses={BOOSTING_STATUSES}
                      field="boosting_status"
                      itemId={item.id}
                      onUpdate={onUpdate}
                    />
                  </FieldRow>
                </div>
              </div>

              {/* Team */}
              <div className="px-5 py-4 border-b border-nativz-border">
                <SectionLabel>Team</SectionLabel>
                <div className="space-y-0.5 divide-y divide-white/[0.04]">
                  <FieldRow label="Strategist">
                    <PersonCell
                      value={item.strategist}
                      field="strategist"
                      itemId={item.id}
                      teamMembers={teamMembers}
                      onUpdate={onUpdate}
                    />
                  </FieldRow>
                  <FieldRow label="Videographer">
                    <PersonCell
                      value={item.videographer}
                      field="videographer"
                      itemId={item.id}
                      teamMembers={teamMembers}
                      onUpdate={onUpdate}
                    />
                  </FieldRow>
                  <FieldRow label="Editor">
                    <PersonCell
                      value={item.editor}
                      field="editor"
                      itemId={item.id}
                      teamMembers={teamMembers}
                      onUpdate={onUpdate}
                    />
                  </FieldRow>
                  <FieldRow label="Editing manager">
                    <PersonCell
                      value={item.editing_manager}
                      field="editing_manager"
                      itemId={item.id}
                      teamMembers={teamMembers}
                      onUpdate={onUpdate}
                    />
                  </FieldRow>
                  <FieldRow label="SMM">
                    <PersonCell
                      value={item.smm}
                      field="smm"
                      itemId={item.id}
                      teamMembers={teamMembers}
                      onUpdate={onUpdate}
                    />
                  </FieldRow>
                </div>
              </div>

              {/* Dates */}
              <div className="px-5 py-4 border-b border-nativz-border">
                <SectionLabel>Dates</SectionLabel>
                <div className="space-y-3">
                  {(
                    [
                      { label: 'Shoot date', field: 'shoot_date', value: item.shoot_date },
                      { label: 'Strategy due', field: 'strategy_due_date', value: item.strategy_due_date },
                      { label: 'RAWs due', field: 'raws_due_date', value: item.raws_due_date },
                      { label: 'SMM due', field: 'smm_due_date', value: item.smm_due_date },
                      { label: 'Calendar sent', field: 'calendar_sent_date', value: item.calendar_sent_date },
                    ] as const
                  ).map(({ label, field, value }) => (
                    <div key={field} className="flex items-center justify-between gap-3">
                      <label className="text-xs text-text-muted shrink-0 w-28">{label}</label>
                      <input
                        type="date"
                        defaultValue={value ?? ''}
                        onChange={(e) => onUpdate(item.id, field, e.target.value)}
                        className="bg-surface-hover border border-nativz-border rounded-lg px-2.5 py-1 text-xs text-text-primary outline-none focus:border-blue-500/50 transition-colors cursor-pointer [color-scheme:dark]"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Links */}
              <div className="px-5 py-4 border-b border-nativz-border">
                <SectionLabel>Links</SectionLabel>
                <div className="space-y-1 divide-y divide-white/[0.04]">
                  <LinkField
                    icon={<HardDrive size={13} />}
                    label="RAWs folder"
                    value={item.raws_folder_url}
                    field="raws_folder_url"
                    itemId={item.id}
                    onUpdate={onUpdate}
                  />
                  <LinkField
                    icon={<FolderOpen size={13} />}
                    label="Edited videos folder"
                    value={item.edited_videos_folder_url}
                    field="edited_videos_folder_url"
                    itemId={item.id}
                    onUpdate={onUpdate}
                  />
                  <LinkField
                    icon={<Calendar size={13} />}
                    label="Later calendar"
                    value={item.later_calendar_link}
                    field="later_calendar_link"
                    itemId={item.id}
                    onUpdate={onUpdate}
                  />
                  <LinkField
                    icon={<FileText size={13} />}
                    label="Project brief"
                    value={item.project_brief_url}
                    field="project_brief_url"
                    itemId={item.id}
                    onUpdate={onUpdate}
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="px-5 py-4 border-b border-nativz-border">
                <SectionLabel>Notes</SectionLabel>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() => onUpdate(item.id, 'notes', notes)}
                  placeholder="Add notes..."
                  rows={4}
                  className="w-full bg-surface-hover border border-nativz-border rounded-xl px-3 py-2.5 text-xs text-text-primary placeholder-text-muted/50 outline-none focus:border-blue-500/50 resize-none transition-colors"
                />
              </div>

              {/* Footer — delete */}
              <div className="px-5 py-3">
                <button
                  onClick={() => onDelete(item.id, item.client_name)}
                  className="flex items-center gap-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 px-3 py-2 rounded-lg transition-colors cursor-pointer w-full"
                >
                  <Trash2 size={14} />
                  Delete pipeline entry
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(panelContent, document.body);
}
