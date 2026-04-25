/**
 * Single source of truth for status pill / badge styling across the email hub.
 *
 * Why one file: banners, emails, sent-log, and setup each had their own
 * palette before — "delivered" was emerald in one place and sky in another;
 * "sent" used `bg-nz-cyan/10` in sent-log but `text-blue-500` in emails.
 * Fix once, apply everywhere.
 *
 * Convention: `pill` is the full chip (background + border + text), `text`
 * is the standalone color for inline icons / numbers.
 */

export type StatusTone =
  | 'neutral'
  | 'info'
  | 'progress'
  | 'success'
  | 'warning'
  | 'danger'
  | 'event'
  | 'promo';

export const TONE_PILL: Record<StatusTone, string> = {
  neutral:  'bg-surface-hover/40 text-text-muted border-nativz-border',
  info:     'bg-sky-500/10 text-sky-500 border-sky-500/30',
  progress: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
  success:  'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
  warning:  'bg-amber-500/10 text-amber-500 border-amber-500/30',
  danger:   'bg-rose-500/10 text-rose-500 border-rose-500/30',
  event:    'bg-violet-500/10 text-violet-400 border-violet-500/30',
  promo:    'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/30',
};

export const TONE_TEXT: Record<StatusTone, string> = {
  neutral:  'text-text-muted',
  info:     'text-sky-500',
  progress: 'text-blue-500',
  success:  'text-emerald-500',
  warning:  'text-amber-500',
  danger:   'text-rose-500',
  event:    'text-violet-400',
  promo:    'text-fuchsia-400',
};

export const TONE_SURFACE: Record<StatusTone, string> = {
  neutral:  'bg-surface text-text-primary border-nativz-border',
  info:     'bg-sky-500/10 text-sky-500 border-nativz-border',
  progress: 'bg-blue-500/10 text-blue-500 border-nativz-border',
  success:  'bg-emerald-500/10 text-emerald-500 border-nativz-border',
  warning:  'bg-amber-500/10 text-amber-500 border-nativz-border',
  danger:   'bg-rose-500/10 text-rose-500 border-nativz-border',
  event:    'bg-violet-500/10 text-violet-400 border-nativz-border',
  promo:    'bg-fuchsia-500/10 text-fuchsia-400 border-nativz-border',
};

/** Map an email-delivery status string → tone. Covers Resend webhook events
 *  + internal pipeline states. Unknown strings fall back to neutral. */
export function deliveryStatusTone(status: string, repliedAt?: string | null): StatusTone {
  if (repliedAt) return 'success';
  switch (status) {
    case 'failed':
    case 'bounced':
    case 'complained':
      return 'danger';
    case 'delivered':
      return 'success';
    case 'opened':
      return 'info';
    case 'sent':
      return 'progress';
    case 'scheduled':
      return 'progress';
    case 'draft':
      return 'neutral';
    default:
      return 'neutral';
  }
}

/** Banner lifecycle status → tone. */
export function bannerStatusTone(status: 'live' | 'scheduled' | 'expired' | 'paused'): StatusTone {
  switch (status) {
    case 'live':      return 'success';
    case 'scheduled': return 'info';
    case 'expired':   return 'neutral';
    case 'paused':    return 'warning';
  }
}

/** Banner *style* (info/warning/etc) → tone. Used by composer + runtime
 *  renderer so previews always match shipped banners. */
export function bannerStyleTone(style: 'info' | 'warning' | 'success' | 'error' | 'event' | 'promo'): StatusTone {
  switch (style) {
    case 'info':    return 'info';
    case 'warning': return 'warning';
    case 'success': return 'success';
    case 'error':   return 'danger';
    case 'event':   return 'event';
    case 'promo':   return 'promo';
  }
}
