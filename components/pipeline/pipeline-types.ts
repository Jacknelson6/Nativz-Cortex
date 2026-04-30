// ─── Pipeline Types & Constants ──────────────────────────────────────────────

export interface PipelineItem {
  id: string;
  client_id: string | null;
  client_name: string;
  month_label: string;
  month_date: string;
  agency: string | null;
  strategist: string | null;
  videographer: string | null;
  editing_manager: string | null;
  editor: string | null;
  smm: string | null;
  // NAT-27 dual-write FK columns — populated alongside the display names
  // whenever the writer has a team_members match. Consumers can prefer the
  // id when present.
  strategist_id?: string | null;
  videographer_id?: string | null;
  editing_manager_id?: string | null;
  editor_id?: string | null;
  smm_id?: string | null;
  assignment_status: string;
  raws_status: string;
  editing_status: string;
  client_approval_status: string;
  boosting_status: string;
  shoot_date: string | null;
  strategy_due_date: string | null;
  raws_due_date: string | null;
  smm_due_date: string | null;
  calendar_sent_date: string | null;
  edited_videos_folder_url: string | null;
  raws_folder_url: string | null;
  later_calendar_link: string | null;
  project_brief_url: string | null;
  notes: string | null;
  // NAT-26 — per-track timestamps for stall detection. jsonb keyed by
  // status-column name, values are ISO strings. Optional so pre-migration
  // API responses (which may not select the column) still typecheck.
  stage_changed_at?: Record<string, unknown> | null;
  updated_at?: string | null;
}

export interface TeamMember {
  id: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
}

export type PipelineViewMode = 'board' | 'list' | 'table';

export interface StatusConfig {
  value: string;
  label: string;
  color: string;
}

// ─── Status Arrays ────────────────────────────────────────────────────────────

export const ASSIGNMENT_STATUSES: StatusConfig[] = [
  { value: 'can_assign', label: 'Can assign', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { value: 'assigned', label: 'Assigned', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  { value: 'need_shoot', label: 'Need shoot', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
];

export const RAWS_STATUSES: StatusConfig[] = [
  { value: 'need_to_schedule', label: 'Need to schedule', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  { value: 'waiting_on_shoot', label: 'Waiting on shoot', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { value: 'uploaded', label: 'Uploaded', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
];

export const EDITING_STATUSES: StatusConfig[] = [
  { value: 'not_started', label: 'Not started', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  { value: 'editing', label: 'Editing', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { value: 'edited', label: 'Edited', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { value: 'em_approved', label: 'EM approved', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' },
  { value: 'revising', label: 'Revising', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { value: 'blocked', label: 'Blocked', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { value: 'scheduled', label: 'Scheduled', color: 'bg-emerald-700/20 text-emerald-400 border-emerald-500/30' },
  { value: 'done', label: 'Done', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
];

export const APPROVAL_STATUSES: StatusConfig[] = [
  { value: 'not_sent', label: 'Not sent', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  { value: 'waiting_on_approval', label: 'Waiting on approval', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { value: 'client_approved', label: 'Client approved', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  { value: 'needs_revision', label: 'Needs revision', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { value: 'revised', label: 'Revised', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { value: 'sent_to_paid_media', label: 'Sent to paid media', color: 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30' },
];

export const BOOSTING_STATUSES: StatusConfig[] = [
  { value: 'not_boosting', label: 'Not boosting', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  { value: 'working_on_it', label: 'Working on it', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { value: 'done', label: 'Done', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
];

// ─── Role Board Config ────────────────────────────────────────────────────────

export interface RoleBoardConfig {
  statusField: keyof PipelineItem;
  assignmentField: keyof PipelineItem;
  statuses: StatusConfig[];
}

export const ROLE_BOARD_CONFIGS: Record<string, RoleBoardConfig> = {
  editor: {
    statusField: 'editing_status',
    assignmentField: 'editor',
    statuses: EDITING_STATUSES,
  },
  editing_manager: {
    statusField: 'editing_status',
    assignmentField: 'editing_manager',
    statuses: EDITING_STATUSES,
  },
  smm: {
    statusField: 'boosting_status',
    assignmentField: 'smm',
    statuses: BOOSTING_STATUSES,
  },
  videographer: {
    statusField: 'raws_status',
    assignmentField: 'videographer',
    statuses: RAWS_STATUSES,
  },
  strategist: {
    statusField: 'assignment_status',
    assignmentField: 'strategist',
    statuses: ASSIGNMENT_STATUSES,
  },
};

export const DEFAULT_BOARD_CONFIG: RoleBoardConfig = ROLE_BOARD_CONFIGS.editor;

// ─── Status Actions ───────────────────────────────────────────────────────────

export interface StatusAction {
  label: string;
  targetStatus: string;
}

export const EDITING_STATUS_ACTIONS: Record<string, StatusAction[]> = {
  not_started: [
    { label: 'Start editing', targetStatus: 'editing' },
  ],
  editing: [
    { label: 'Mark as edited', targetStatus: 'edited' },
    { label: 'Mark as blocked', targetStatus: 'blocked' },
  ],
  edited: [
    { label: 'Approve (EM)', targetStatus: 'em_approved' },
    { label: 'Request revision', targetStatus: 'revising' },
  ],
  em_approved: [
    { label: 'Mark as scheduled', targetStatus: 'scheduled' },
  ],
  revising: [
    { label: 'Mark as edited', targetStatus: 'edited' },
  ],
  blocked: [
    { label: 'Resume editing', targetStatus: 'editing' },
  ],
  scheduled: [
    { label: 'Mark as done', targetStatus: 'done' },
  ],
  done: [],
};

// ─── Helper Functions ─────────────────────────────────────────────────────────

/** Returns overall completion percentage (0–100) for a pipeline item */
export function getCompletionProgress(item: PipelineItem): number {
  let done = 0;
  const total = 5;
  if (item.assignment_status === 'assigned') done++;
  if (item.raws_status === 'uploaded') done++;
  if (['em_approved', 'scheduled', 'done'].includes(item.editing_status)) done++;
  if (['client_approved', 'sent_to_paid_media'].includes(item.client_approval_status)) done++;
  if (item.boosting_status === 'done') done++;
  return Math.round((done / total) * 100);
}

/** Returns a left-border color class based on overall row progress */
export function getRowProgressBorder(item: PipelineItem): string {
  const doneStatuses = ['done', 'scheduled'];
  const allDone =
    item.assignment_status === 'assigned' &&
    item.raws_status === 'uploaded' &&
    doneStatuses.includes(item.editing_status) &&
    ['client_approved', 'sent_to_paid_media'].includes(item.client_approval_status) &&
    item.boosting_status === 'done';
  if (allDone) return 'border-l-green-500';
  const anyStarted =
    item.assignment_status !== 'can_assign' ||
    item.raws_status !== 'need_to_schedule' ||
    item.editing_status !== 'not_started' ||
    item.client_approval_status !== 'not_sent' ||
    item.boosting_status !== 'not_boosting';
  if (anyStarted) return 'border-l-amber-500';
  return 'border-l-gray-600';
}

/** Extract first valid URL from a string that may have prefixed text (e.g. "April - https://...") */
export function extractUrl(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : raw;
}
