import {
  AlertTriangle,
  AtSign,
  CheckCircle,
  Clock,
  Film,
  ImageUp,
  MessageSquare,
  Type,
  type LucideIcon,
} from 'lucide-react';

/**
 * PRD 07 §"Shared thread parity". One source of truth for the
 * tone + icon + label of every comment status that can show up in
 * either share-link thread (calendar drops or editing projects).
 *
 * The calendar surface has the wider status set (caption_edit,
 * tag_edit, cover_edit, schedule_change). The editing surface only
 * surfaces the core video-review statuses. Either page can call this
 * with any status string and get a sensible fallback for unknown
 * values, so the two threads can render identical chrome without
 * each maintaining its own switch ladder.
 */

export type ShareCommentStatus =
  | 'approved'
  | 'changes_requested'
  | 'comment'
  | 'video_revised'
  | 'caption_edit'
  | 'tag_edit'
  | 'cover_edit'
  | 'schedule_change';

export interface CommentStyle {
  tone: string;
  Icon: LucideIcon;
  label: string;
}

export function resolveCommentStyle(
  status: ShareCommentStatus | string,
  opts: { resolved?: boolean } = {},
): CommentStyle {
  if (opts.resolved) {
    return {
      tone: 'text-status-success',
      Icon: CheckCircle,
      label: 'Revised',
    };
  }
  switch (status) {
    case 'approved':
      return {
        tone: 'text-status-success',
        Icon: CheckCircle,
        label: 'Approved',
      };
    case 'changes_requested':
      return {
        tone: 'text-status-warning',
        Icon: AlertTriangle,
        label: 'Revision requested',
      };
    case 'video_revised':
      return {
        tone: 'text-accent-text',
        Icon: Film,
        label: 'Marked revised',
      };
    case 'caption_edit':
      return {
        tone: 'text-accent-text',
        Icon: Type,
        label: 'Caption edit',
      };
    case 'tag_edit':
      return {
        tone: 'text-accent-text',
        Icon: AtSign,
        label: 'Tag edit',
      };
    case 'cover_edit':
      return {
        tone: 'text-accent-text',
        Icon: ImageUp,
        label: 'Cover edit',
      };
    case 'schedule_change':
      return {
        tone: 'text-accent-text',
        Icon: Clock,
        label: 'Schedule change',
      };
    case 'comment':
    default:
      return {
        tone: 'text-text-secondary',
        Icon: MessageSquare,
        label: 'Comment',
      };
  }
}
