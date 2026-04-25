import type { Task, TaskClient, TaskAssignee } from '@/components/tasks/types';

export type ProjectType = 'task' | 'shoot' | 'edit' | 'content' | 'paid_media' | 'strategy';

export type ScheduledStatus = 'draft' | 'scheduled' | 'completed' | 'cancelled';
export type EditStatus = 'not_started' | 'in_edit' | 'review' | 'revisions' | 'approved' | 'delivered';
export type PlanStatus = 'pending' | 'generating' | 'ready' | 'sent' | 'failed';

/**
 * A Project is a Task with optional shoot/edit-specific metadata. The DB column
 * `task_type` discriminates which fields apply.
 */
export interface Project extends Task {
  // Shoot-specific
  shoot_location: string | null;
  shoot_start_at: string | null;
  shoot_end_at: string | null;
  shoot_notes: string | null;
  scheduled_status: ScheduledStatus | null;
  google_event_id: string | null;
  google_calendar_event_created: boolean | null;
  invitees: { email: string }[] | null;
  plan_status: PlanStatus | null;
  plan_generated_at: string | null;
  plan_sent_at: string | null;
  raw_footage_uploaded: boolean | null;
  raw_footage_url: string | null;
  // Edit-specific
  edit_status: EditStatus | null;
  edit_revision_count: number | null;
  edit_source_url: string | null;
  edit_deliverable_url: string | null;
  edit_due_at: string | null;
  parent_shoot_id: string | null;
  // Generic PM
  sort_order: number | null;
  started_at: string | null;
  completed_at: string | null;
}

export type ProjectViewMode = 'board' | 'table' | 'calendar';

export type ProjectTypeFilter = 'all' | ProjectType;

export const TYPE_PILLS: { value: ProjectTypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'shoot', label: 'Shoots' },
  { value: 'edit', label: 'Edits' },
  { value: 'task', label: 'Tasks' },
  { value: 'content', label: 'Content' },
  { value: 'paid_media', label: 'Paid media' },
  { value: 'strategy', label: 'Strategy' },
];

export const STATUS_LABELS: Record<Project['status'], string> = {
  backlog: 'Backlog',
  in_progress: 'In progress',
  review: 'Review',
  done: 'Done',
};

export const SCHEDULED_LABELS: Record<ScheduledStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const EDIT_LABELS: Record<EditStatus, string> = {
  not_started: 'Not started',
  in_edit: 'In edit',
  review: 'Review',
  revisions: 'Revisions',
  approved: 'Approved',
  delivered: 'Delivered',
};

/**
 * Tasks API stores generic tasks with `task_type='other'`. The Project page
 * surfaces those under the `task` pill. Normalize between the two.
 */
export function normalizeProjectType(raw: string | null | undefined): ProjectType {
  if (!raw || raw === 'other') return 'task';
  if (
    raw === 'shoot' || raw === 'edit' || raw === 'content' ||
    raw === 'paid_media' || raw === 'strategy'
  ) return raw;
  return 'task';
}

export function denormalizeProjectType(t: ProjectType): string {
  return t === 'task' ? 'other' : t;
}

export type { TaskClient, TaskAssignee };
