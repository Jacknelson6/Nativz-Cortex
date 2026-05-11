// VFF-04: reject reason enum + sentence-case labels for the admin UI.

export type RejectReason =
  | 'low_views'
  | 'too_long'
  | 'too_short'
  | 'low_engagement'
  | 'paid_ad'
  | 'reposted'
  | 'metadata_incomplete'
  | 'not_short_form'
  | 'off_topic'
  | 'gate_error';

export const REJECT_REASON_LABELS: Record<RejectReason, string> = {
  low_views: 'Low views',
  too_long: 'Too long',
  too_short: 'Too short',
  low_engagement: 'Low engagement',
  paid_ad: 'Paid ad',
  reposted: 'Reposted',
  metadata_incomplete: 'Missing metadata',
  not_short_form: 'Not short-form',
  off_topic: 'Off topic',
  gate_error: 'Gate error',
};

export function rejectReasonLabel(slug: string | null | undefined): string {
  if (!slug) return 'Unknown';
  return (REJECT_REASON_LABELS as Record<string, string>)[slug] ?? slug;
}
