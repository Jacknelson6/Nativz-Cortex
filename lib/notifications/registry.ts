/**
 * Notification registry — single source of truth for every automated
 * notification Cortex sends (cron-driven and event-driven).
 *
 * The admin UI at /admin/settings → Notifications reads this list and joins
 * it against the notification_settings table to render a row per entry with:
 *   • toggle (enabled/disabled — defaults to enabled)
 *   • parameter knobs (the params object below)
 *   • email/chat preview
 *   • schedule (read-only — managed in vercel.json)
 *
 * To add a new notification:
 *   1. Add an entry below with a stable `key`.
 *   2. Implement `preview(agency, sample)` that returns { subject?, html?, text? }
 *      so the UI can render it. Return null for entries that don't have a
 *      previewable payload yet.
 *   3. In the sender (cron route or event handler), call
 *      getNotificationSetting(key) and bail early if disabled.
 *   4. Read parameter knobs from the resolved settings so admins can tune
 *      windows without a deploy.
 */

import type { AgencyBrand } from '@/lib/agency/detect';

export type NotificationKind = 'email' | 'chat' | 'in_app';
export type NotificationTrigger = 'cron' | 'event';

export interface NotificationParamSpec {
  label: string;
  description?: string;
  type: 'duration_hours' | 'duration_minutes' | 'string' | 'boolean' | 'email_list';
  default: number | string | boolean | string[];
  min?: number;
  max?: number;
}

export interface NotificationPreviewResult {
  subject?: string;
  html?: string;
  text?: string;
}

export interface NotificationDefinition {
  key: string;
  label: string;
  description: string;
  kind: NotificationKind;
  trigger: NotificationTrigger;
  cronSchedule?: string;
  cronPath?: string;
  recipientLabel: string;
  params?: Record<string, NotificationParamSpec>;
  /**
   * Renders a preview. Returns null when a preview isn't wired yet so the
   * UI can show "Preview coming soon" without crashing. Implementations
   * should be pure — no DB writes, no real email sends.
   */
  preview?: (agency: AgencyBrand) => Promise<NotificationPreviewResult | null>;
}

export const NOTIFICATION_REGISTRY: NotificationDefinition[] = [
  {
    key: 'calendar_comment_digest',
    label: 'Daily review digest (calendar + editing)',
    description:
      'Daily summary of every comment, approval, and revision request from the past 24h across content calendars and editing project share links.',
    kind: 'email',
    trigger: 'cron',
    cronSchedule: '0 13 * * *',
    cronPath: '/api/cron/calendar-comment-digest',
    recipientLabel: 'jack@nativz.io',
    preview: async (agency) => {
      const { previewCalendarCommentDigest } = await import(
        './previews/calendar-comment-digest'
      );
      return previewCalendarCommentDigest(agency);
    },
  },
  {
    key: 'calendar_comment_chat',
    label: 'Comment Chat ping (per comment)',
    description:
      'Real-time Google Chat post to the client space when a reviewer leaves a comment or requests changes on the share link.',
    kind: 'chat',
    trigger: 'event',
    recipientLabel: 'Client Google Chat space',
    preview: async () => {
      const { previewCalendarCommentChat } = await import(
        './previews/calendar-comment-chat'
      );
      return previewCalendarCommentChat();
    },
  },
  {
    key: 'calendar_all_approved_chat',
    label: 'All-approved Chat ping',
    description:
      'Single Google Chat post to the client space when every post in a share link has been approved.',
    kind: 'chat',
    trigger: 'event',
    recipientLabel: 'Client Google Chat space',
    preview: async () => {
      const { previewCalendarAllApprovedChat } = await import(
        './previews/calendar-comment-chat'
      );
      return previewCalendarAllApprovedChat();
    },
  },
  {
    key: 'calendar_followup_cadence',
    label: 'Calendar follow-up cadence (3-stage, no comments left)',
    description:
      'Anchored on the most recent client-facing send. T+72h follow-up 1, T+120h follow-up 2, T+168h follow-up 3 (final call). Any comment, approval, or change request from the reviewer cancels the cadence.',
    kind: 'email',
    trigger: 'cron',
    cronSchedule: '0 14 * * *',
    cronPath: '/api/cron/calendar-reminders',
    recipientLabel: 'Client primary contacts',
    preview: async (agency) => {
      const { previewCalendarCadenceFollowup } = await import(
        './previews/calendar-reminders'
      );
      return previewCalendarCadenceFollowup(agency);
    },
  },
  {
    key: 'calendar_auto_approve',
    label: 'Calendar auto-approve at T+216h',
    description:
      'After the 3-stage follow-up cadence completes with no client activity, auto-approve every still-pending post on the share link and ping ops via Google Chat + in-app notification.',
    kind: 'chat',
    trigger: 'cron',
    cronSchedule: '0 14 * * *',
    cronPath: '/api/cron/calendar-reminders',
    recipientLabel: 'Ops Google Chat space + admin notifications',
    preview: async () => {
      const { previewCalendarAutoApproveChat } = await import(
        './previews/calendar-comment-chat'
      );
      return previewCalendarAutoApproveChat();
    },
  },
  {
    key: 'editing_followup_cadence',
    label: 'Editing follow-up cadence (3-stage, no comments left)',
    description:
      'Anchored on the most recent editing share-link send. T+72h follow-up 1, T+120h follow-up 2, T+168h follow-up 3 (last check). Any reviewer comment, approval, or change request cancels the cadence.',
    kind: 'email',
    trigger: 'cron',
    cronSchedule: '0 14 * * *',
    cronPath: '/api/cron/editing-reminders',
    recipientLabel: 'Client primary contacts',
    preview: async (agency) => {
      const { previewEditingCadenceFollowup } = await import(
        './previews/calendar-reminders'
      );
      return previewEditingCadenceFollowup(agency);
    },
  },
  {
    key: 'editing_auto_approve',
    label: 'Editing auto-approve at T+216h',
    description:
      'After the 3-stage follow-up cadence completes with no client activity, auto-approve every still-pending video on the share link and ping ops via Google Chat + in-app notification.',
    kind: 'chat',
    trigger: 'cron',
    cronSchedule: '0 14 * * *',
    cronPath: '/api/cron/editing-reminders',
    recipientLabel: 'Ops Google Chat space + admin notifications',
    preview: async () => {
      const { previewEditingAutoApproveChat } = await import(
        './previews/calendar-comment-chat'
      );
      return previewEditingAutoApproveChat();
    },
  },
  {
    key: 'editing_comment_chat',
    label: 'Editing comment Chat ping (per comment)',
    description:
      'Real-time Google Chat post to the client space when a reviewer leaves a comment, approval, or change request on an editing project share link.',
    kind: 'chat',
    trigger: 'event',
    recipientLabel: 'Client Google Chat space',
    preview: async () => {
      const { previewEditingCommentChat } = await import(
        './previews/calendar-comment-chat'
      );
      return previewEditingCommentChat();
    },
  },
  {
    key: 'calendar_revisions_complete',
    label: 'Revisions complete email',
    description:
      'Auto-email to the client when the editing team marks all outstanding revisions as complete on a content calendar.',
    kind: 'email',
    trigger: 'event',
    recipientLabel: 'Client primary contact',
    preview: async (agency) => {
      const { previewCalendarRevisionsComplete } = await import(
        './previews/calendar-reminders'
      );
      return previewCalendarRevisionsComplete(agency);
    },
  },
  {
    key: 'editing_revisions_complete',
    label: 'Editing revisions complete email',
    description:
      'Auto-email to the client when the editing team marks all outstanding revisions as complete on an editing project share link.',
    kind: 'email',
    trigger: 'event',
    recipientLabel: 'Client primary contact',
    preview: async (agency) => {
      const { previewEditingRevisionsComplete } = await import(
        './previews/calendar-reminders'
      );
      return previewEditingRevisionsComplete(agency);
    },
  },
  {
    key: 'editing_all_approved_chat',
    label: 'Editing all-approved Chat ping',
    description:
      'Single Google Chat post when every video on an editing project share link has been approved.',
    kind: 'chat',
    trigger: 'event',
    recipientLabel: 'Ops Google Chat space',
    preview: async () => {
      const { previewCalendarAllApprovedChat } = await import(
        './previews/calendar-comment-chat'
      );
      return previewCalendarAllApprovedChat();
    },
  },
  {
    key: 'topic_search_notify',
    label: 'Topic search ready',
    description: 'Email when an async topic search finishes generating ideas.',
    kind: 'email',
    trigger: 'cron',
    cronSchedule: '*/5 * * * *',
    cronPath: '/api/cron/topic-search-notify',
    recipientLabel: 'Search initiator',
  },
  {
    key: 'weekly_affiliate_report',
    label: 'Weekly affiliate report',
    description: 'Weekly performance summary for affiliates.',
    kind: 'email',
    trigger: 'cron',
    cronSchedule: '*/15 * * * *',
    cronPath: '/api/cron/weekly-affiliate-report',
    recipientLabel: 'Per-client recipient list',
  },
  {
    key: 'weekly_social_report',
    label: 'Weekly social report',
    description: 'Weekly social performance summary per client.',
    kind: 'email',
    trigger: 'cron',
    cronSchedule: '*/15 * * * *',
    cronPath: '/api/cron/weekly-social-report',
    recipientLabel: 'Per-client recipient list',
  },
  {
    key: 'onboarding_notifications',
    label: 'Onboarding step changes',
    description:
      'Notify when an onboarding step transitions (assignment, completion, blocker).',
    kind: 'email',
    trigger: 'cron',
    cronSchedule: '*/1 * * * *',
    cronPath: '/api/cron/onboarding-notifications',
    recipientLabel: 'Owner of the step',
  },
  {
    key: 'onboarding_flow_reminders',
    label: 'Onboarding reminder',
    description:
      'Hourly reminder for stalled onboarding steps that have been sitting without progress.',
    kind: 'email',
    trigger: 'cron',
    cronSchedule: '0 * * * *',
    cronPath: '/api/cron/onboarding-flow-reminders',
    recipientLabel: 'Step owner',
  },
];

export function getNotificationDefinition(key: string): NotificationDefinition | null {
  return NOTIFICATION_REGISTRY.find((n) => n.key === key) ?? null;
}
