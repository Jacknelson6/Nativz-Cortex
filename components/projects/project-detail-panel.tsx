'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Trash2,
  Camera,
  Scissors,
  CheckSquare,
  ExternalLink,
  Calendar,
  MapPin,
  User,
  Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  type Project,
  STATUS_LABELS,
  SCHEDULED_LABELS,
  EDIT_LABELS,
  normalizeProjectType,
  type EditStatus,
  type ScheduledStatus,
} from './types';
import { formatDueDate, isDueOverdue } from '@/components/tasks/task-constants';

interface ProjectDetailPanelProps {
  project: Project | null;
  onClose: () => void;
  onUpdate: (project: Project) => void;
  onDelete: (id: string) => void;
}

const TYPE_ICON = {
  shoot: Camera, edit: Scissors, task: CheckSquare,
  content: CheckSquare, paid_media: CheckSquare, strategy: CheckSquare,
} as const;

// Single source of truth for form-control chrome inside the panel — keeps
// every input/select/textarea visually identical to the toolbar pattern in
// /admin/clients and ProjectsClient. If the toolbar styling changes, this
// constant changes too.
const FIELD_INPUT =
  'rounded-md border border-nativz-border bg-surface-primary px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-border focus:outline-none focus:ring-1 focus:ring-accent-border transition-colors';

export function ProjectDetailPanel({ project, onClose, onUpdate, onDelete }: ProjectDetailPanelProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (project) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [project, onClose]);

  if (!mounted) return null;

  const node = (
    <AnimatePresence>
      {project && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 280 }}
            className="fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto bg-surface border-l border-nativz-border shadow-elevated"
          >
            <PanelBody
              project={project}
              onClose={onClose}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(node, document.body);
}

function PanelBody({
  project,
  onClose,
  onUpdate,
  onDelete,
}: {
  project: Project;
  onClose: () => void;
  onUpdate: (p: Project) => void;
  onDelete: (id: string) => void;
}) {
  const type = normalizeProjectType(project.task_type);
  const Icon = TYPE_ICON[type];

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/tasks/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toast.error('Failed to update');
      return;
    }
    const updated = await res.json();
    onUpdate(updated);
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${project.title}"?`)) return;
    const res = await fetch(`/api/tasks/${project.id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error('Failed to delete');
      return;
    }
    onDelete(project.id);
    onClose();
    toast.success('Deleted');
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-nativz-border px-4 py-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-hover px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-text-secondary">
          <Icon size={11} />
          <span>{type === 'paid_media' ? 'Paid media' : type}</span>
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleDelete}
            aria-label="Delete"
            className="rounded-md p-1.5 text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={14} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        <div>
          <input
            type="text"
            defaultValue={project.title}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== project.title) patch({ title: v });
            }}
            className="w-full bg-transparent text-lg font-semibold text-text-primary outline-none border-b border-transparent focus:border-nativz-border pb-1"
          />
        </div>

        <Field label="Status">
          <select
            value={project.status}
            onChange={(e) => patch({ status: e.target.value })}
            className={`${FIELD_INPUT} cursor-pointer`}
            aria-label="Project status"
          >
            {Object.entries(STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </Field>

        {project.clients && (
          <Field label="Client" icon={Building2}>
            <span className="text-sm text-text-primary">{project.clients.name}</span>
          </Field>
        )}

        {project.team_members && (
          <Field label="Assignee" icon={User}>
            <span className="text-sm text-text-primary">{project.team_members.full_name}</span>
          </Field>
        )}

        {project.due_date && (
          <Field label="Due" icon={Calendar}>
            <span className={`text-sm ${isDueOverdue(project.due_date) ? 'text-red-400' : 'text-text-primary'}`}>
              {formatDueDate(project.due_date)}
            </span>
          </Field>
        )}

        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wider text-text-tertiary mb-1.5">
            Description
          </label>
          <textarea
            defaultValue={project.description ?? ''}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== (project.description ?? '')) patch({ description: v || null });
            }}
            placeholder="Add a description"
            rows={4}
            className={`${FIELD_INPUT} w-full resize-y leading-relaxed`}
          />
        </div>

        {type === 'shoot' && <ShootSection project={project} onPatch={patch} />}
        {type === 'edit' && <EditSection project={project} onPatch={patch} />}
      </div>
    </div>
  );
}

function ShootSection({
  project,
  onPatch,
}: {
  project: Project;
  onPatch: (body: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-4 border-t border-nativz-border pt-4">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">Shoot details</h4>

      <Field label="Stage">
        <select
          value={project.scheduled_status ?? 'draft'}
          onChange={(e) => onPatch({ scheduled_status: e.target.value as ScheduledStatus })}
          className={`${FIELD_INPUT} cursor-pointer`}
          aria-label="Shoot stage"
        >
          {Object.entries(SCHEDULED_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </Field>

      <Field label="Location" icon={MapPin}>
        <input
          type="text"
          defaultValue={project.shoot_location ?? ''}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v !== (project.shoot_location ?? '')) onPatch({ shoot_location: v || null });
          }}
          placeholder="On-location, studio, …"
          className={`${FIELD_INPUT} flex-1`}
        />
      </Field>

      <Field label="Start" icon={Calendar}>
        <input
          type="datetime-local"
          defaultValue={project.shoot_start_at ? toLocalInput(project.shoot_start_at) : ''}
          onChange={(e) => onPatch({ shoot_start_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
          className={FIELD_INPUT}
        />
      </Field>

      <Field label="End" icon={Calendar}>
        <input
          type="datetime-local"
          defaultValue={project.shoot_end_at ? toLocalInput(project.shoot_end_at) : ''}
          onChange={(e) => onPatch({ shoot_end_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
          className={FIELD_INPUT}
        />
      </Field>

      {project.google_event_id && (
        <p className="text-xs text-emerald-400">✓ Google Calendar event created</p>
      )}
      {project.raw_footage_uploaded && (
        <p className="text-xs text-emerald-400">✓ Raw footage uploaded</p>
      )}
    </div>
  );
}

function EditSection({
  project,
  onPatch,
}: {
  project: Project;
  onPatch: (body: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-4 border-t border-nativz-border pt-4">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">Edit details</h4>

      <Field label="Stage">
        <select
          value={project.edit_status ?? 'not_started'}
          onChange={(e) => onPatch({ edit_status: e.target.value as EditStatus })}
          className={`${FIELD_INPUT} cursor-pointer`}
          aria-label="Edit stage"
        >
          {Object.entries(EDIT_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </Field>

      <Field label="Revisions">
        <span className="text-sm font-medium tabular-nums text-text-primary">
          {project.edit_revision_count ?? 0}
        </span>
        <button
          type="button"
          onClick={() => onPatch({ edit_revision_count: (project.edit_revision_count ?? 0) + 1 })}
          className="ml-2 rounded-md border border-nativz-border bg-surface-primary px-2 py-1 text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary hover:border-accent-border/40 transition-colors"
          aria-label="Add revision"
        >
          +1
        </button>
      </Field>

      <Field label="Edit due" icon={Calendar}>
        <input
          type="date"
          defaultValue={project.edit_due_at ? project.edit_due_at.slice(0, 10) : ''}
          onChange={(e) => onPatch({ edit_due_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
          className={FIELD_INPUT}
        />
      </Field>

      <UrlField
        label="Source footage"
        value={project.edit_source_url}
        onSave={(v) => onPatch({ edit_source_url: v })}
      />
      <UrlField
        label="Deliverable"
        value={project.edit_deliverable_url}
        onSave={(v) => onPatch({ edit_deliverable_url: v })}
      />
    </div>
  );
}

function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex w-20 shrink-0 items-center gap-1.5 pt-2 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
        {Icon && <Icon size={11} />}
        <span>{label}</span>
      </div>
      <div className="flex-1 flex items-center gap-1.5 min-w-0">{children}</div>
    </div>
  );
}

function UrlField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string | null;
  onSave: (v: string | null) => void;
}) {
  return (
    <Field label={label} icon={ExternalLink}>
      <input
        type="url"
        defaultValue={value ?? ''}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v !== (value ?? '')) onSave(v || null);
        }}
        placeholder="https://…"
        className={`${FIELD_INPUT} flex-1 min-w-0`}
      />
      {value && (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open link"
          className="shrink-0 rounded-md p-1.5 text-text-tertiary hover:text-accent-text hover:bg-surface-hover transition-colors"
        >
          <ExternalLink size={12} />
        </a>
      )}
    </Field>
  );
}

function toLocalInput(iso: string): string {
  // datetime-local needs YYYY-MM-DDTHH:mm in local TZ.
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
