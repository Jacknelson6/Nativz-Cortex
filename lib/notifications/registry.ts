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
    label: 'Daily content calendar digest',
    description:
      'Daily summary of every comment, approval, and revision request from the past 24h on client content calendars.',
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
    key: 'calendar_no_open_nudge',
    label: 'Reminder — share link not opened',
    description:
      'Email nudge when the client has not opened the most recent share link within the configured window.',
    kind: 'email',
    trigger: 'cron',
    cronSchedule: '0 14 * * *',
    cronPath: '/api/cron/calendar-reminders',
    recipientLabel: 'Client primary contact',
    params: {
      windowHours: {
        label: 'Hours before reminder',
        description: 'How long after the share link is sent (with no opens) before the email fires.',
        type: 'duration_hours',
        default: 48,
        min: 4,
        max: 240,
      },
    },
    preview: async (agency) => {
      const { previewCalendarNoOpenNudge } = await import('./previews/calendar-reminders');
      return previewCalendarNoOpenNudge(agency);
    },
  },
  {
    key: 'calendar_no_action_nudge',
    label: 'Reminder — opened but no action',
    description:
      'Email nudge when the client has opened the share link but left no approvals or revisions within the window.',
    kind: 'email',
    trigger: 'cron',
    cronSchedule: '0 14 * * *',
    cronPath: '/api/cron/calendar-reminders',
    recipientLabel: 'Client primary contact',
    params: {
      windowHours: {
        label: 'Hours before reminder',
        description: 'How long after the share link is sent (no approvals AND no revisions) before the email fires.',
        type: 'duration_hours',
        default: 72,
        min: 4,
        max: 240,
      },
    },
    preview: async (agency) => {
      const { previewCalendarNoActionNudge } = await import('./previews/calendar-reminders');
      return previewCalendarNoActionNudge(agency);
    },
  },
  {
    key: 'calendar_final_call',
    label: 'Final call before publishing',
    description:
      '24h before the earliest scheduled post, email + chat the client (and chat us) that content is shipping unless we hear back.',
    kind: 'email',
    trigger: 'cron',
    cronSchedule: '0 14 * * *',
    cronPath: '/api/cron/calendar-reminders',
    recipientLabel: 'Client primary contact + both chat spaces',
    params: {
      hoursBeforeFirstPost: {
        label: 'Hours before first scheduled post',
        type: 'duration_hours',
        default: 24,
        min: 2,
        max: 168,
      },
    },
    preview: async (agency) => {
      const { previewCalendarFinalCall } = await import('./previews/calendar-reminders');
      return previewCalendarFinalCall(agency);
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
