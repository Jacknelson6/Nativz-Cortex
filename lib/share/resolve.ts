import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Unified share-link resolver. Every public share surface mints a token
 * into its own table; this fans out across them in parallel and returns
 * the canonical path so `/s/<token>` can 302 there.
 *
 * Adding a new share kind: append a row to LOOKUPS. The token MUST be
 * indexed on the column referenced here (every existing entry already
 * is) so the parallel fan-out stays in the single-digit ms range.
 */

export type ShareKind =
  | 'calendar'
  | 'editing'
  | 'calendar_review'
  | 'post_review'
  | 'report'
  | 'ad_creatives'
  | 'moodboard'
  | 'nerd'
  | 'search'
  | 'analyze_social'
  | 'onboarding'
  | 'connection_invite'
  | 'calendar_connect'
  | 'team_invite'
  | 'portal_invite'
  | 'payroll_submit'
  | 'payroll_view';

interface Lookup {
  kind: ShareKind;
  table: string;
  column: 'token' | 'share_token' | 'invite_token';
  path: (token: string) => string;
}

const LOOKUPS: Lookup[] = [
  { kind: 'calendar', table: 'content_drop_share_links', column: 'token', path: (t) => `/c/${t}` },
  { kind: 'editing', table: 'editing_project_share_links', column: 'token', path: (t) => `/c/edit/${t}` },
  { kind: 'calendar_review', table: 'client_review_links', column: 'token', path: (t) => `/shared/calendar/${t}` },
  { kind: 'post_review', table: 'post_review_links', column: 'token', path: (t) => `/shared/post/${t}` },
  { kind: 'report', table: 'report_links', column: 'token', path: (t) => `/shared/report/${t}` },
  { kind: 'ad_creatives', table: 'ad_concept_share_tokens', column: 'token', path: (t) => `/shared/ad-creatives/${t}` },
  { kind: 'moodboard', table: 'moodboard_share_links', column: 'token', path: (t) => `/shared/moodboard/${t}` },
  { kind: 'nerd', table: 'nerd_conversation_share_links', column: 'token', path: (t) => `/shared/nerd/${t}` },
  { kind: 'search', table: 'search_share_links', column: 'token', path: (t) => `/shared/search/${t}` },
  { kind: 'analyze_social', table: 'audit_share_links', column: 'token', path: (t) => `/shared/analyze-social/${t}` },
  { kind: 'onboarding', table: 'onboardings', column: 'share_token', path: (t) => `/onboarding/${t}` },
  { kind: 'connection_invite', table: 'connection_invites', column: 'token', path: (t) => `/connect/invite/${t}` },
  { kind: 'calendar_connect', table: 'calendar_connections', column: 'invite_token', path: (t) => `/shared/calendar-connect/${t}` },
  { kind: 'team_invite', table: 'team_invite_tokens', column: 'token', path: (t) => `/shared/join/${t}` },
  { kind: 'portal_invite', table: 'invite_tokens', column: 'token', path: (t) => `/join/${t}` },
  { kind: 'payroll_submit', table: 'payroll_submission_tokens', column: 'token', path: (t) => `/submit-payroll/${t}` },
  { kind: 'payroll_view', table: 'payroll_view_tokens', column: 'token', path: (t) => `/comptroller/${t}` },
];

export async function resolveShareToken(
  token: string,
): Promise<{ kind: ShareKind; path: string } | null> {
  if (!token) return null;
  const admin = createAdminClient();
  const results = await Promise.all(
    LOOKUPS.map(async (l) => {
      const { data } = await admin
        .from(l.table)
        .select(l.column)
        .eq(l.column, token)
        .maybeSingle();
      return data ? l : null;
    }),
  );
  const hit = results.find((r): r is Lookup => r !== null);
  if (!hit) return null;
  return { kind: hit.kind, path: hit.path(token) };
}

/**
 * Canonical share URL builder. Use everywhere a share link is minted so
 * we have one slug shape across emails and UI: `<APP_URL>/s/<token>`.
 */
export function shareUrl(appUrl: string, token: string): string {
  const base = appUrl.replace(/\/$/, '');
  return `${base}/s/${token}`;
}
