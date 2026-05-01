/**
 * Shared types for the editing pipeline. Mirrors the columns on
 * `editing_projects` + `editing_project_videos` so route handlers and
 * the editor UI share one shape.
 */

export type EditingProjectType =
  | 'organic_content'
  | 'social_ads'
  | 'ctv_ads'
  | 'general'
  | 'other';

export type EditingProjectStatus =
  | 'editing'
  | 'need_approval'
  | 'revising'
  | 'approved'
  | 'done'
  | 'archived';

export interface EditingProjectVideo {
  id: string;
  project_id: string;
  storage_path: string | null;
  public_url: string | null;
  drive_file_id: string | null;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  duration_s: number | null;
  thumbnail_url: string | null;
  version: number;
  position: number;
  uploaded_by: string | null;
  created_at: string;
}

/**
 * Raw clips uploaded by the videographer. Mirrors `EditingProjectVideo`
 * minus version/position (raw footage is append-only) plus an optional
 * `label` so a strategist can tag a clip ("hero shot", "B-roll").
 */
export interface EditingProjectRawVideo {
  id: string;
  project_id: string;
  storage_path: string | null;
  public_url: string | null;
  drive_file_id: string | null;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  duration_s: number | null;
  thumbnail_url: string | null;
  label: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface EditingProject {
  id: string;
  client_id: string;
  client_name: string | null;
  client_slug: string | null;
  client_logo_url: string | null;
  name: string;
  project_type: EditingProjectType;
  status: EditingProjectStatus;
  assignee_id: string | null;
  assignee_email: string | null;
  assignee_name: string | null;
  /**
   * Pipeline role assignments (added in migration 203, repointed to
   * `team_members` in migration 212). All optional; not every project
   * has all three roles wired the moment it lands. `assignee_id` is the
   * legacy editor slot, kept for backward compat.
   */
  videographer_id: string | null;
  videographer_email: string | null;
  videographer_name: string | null;
  strategist_id: string | null;
  strategist_email: string | null;
  strategist_name: string | null;
  /** Strategist-authored brief, separate from internal `notes`. */
  project_brief: string | null;
  /** ISO date (YYYY-MM-DD) of the on-set capture day, or null. */
  shoot_date: string | null;
  drive_folder_url: string | null;
  notes: string | null;
  drop_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  ready_at: string | null;
  approved_at: string | null;
  scheduled_at: string | null;
  archived_at: string | null;
  video_count: number;
  /** Count of raw clips uploaded via editing_project_raw_videos. */
  raw_video_count: number;
}

export const EDITING_STATUS_LABEL: Record<EditingProjectStatus, string> = {
  editing: 'Editing',
  need_approval: 'Need approval',
  revising: 'Revising',
  approved: 'Approved',
  done: 'Done',
  archived: 'Archived',
};

export const EDITING_TYPE_LABEL: Record<EditingProjectType, string> = {
  organic_content: 'Organic content',
  social_ads: 'Social ads',
  ctv_ads: 'CTV ads',
  general: 'General',
  other: 'Other',
};
