/**
 * Server-side helpers for the v2 onboarding system.
 *
 * Every helper here uses `createAdminClient()` because the public stepper
 * is share-token-gated and runs through these helpers; admin callers
 * also use them. RLS is enabled on the underlying tables but admin
 * service role bypasses it. Auth is enforced at the API route boundary
 * (check user role for admin routes; check share_token for public).
 *
 * Helpers are intentionally narrow. The stepper UI owns the step_state
 * shape; this module just persists, advances, and reads.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import {
  doneIndex,
  screenAt,
  totalScreens,
  type OnboardingKind,
} from './screens';
import type {
  EmailLogKind,
  OnboardingRow,
  OnboardingStatus,
  TeamAssignmentRow,
  TeamRole,
} from './types';

const ONBOARDING_COLUMNS =
  'id, client_id, kind, platforms, current_step, share_token, step_state, status, started_at, completed_at, created_at, updated_at';

function dbOk<T>(data: T | null, error: { message?: string } | null, label: string): T {
  if (error) {
    throw new Error(`[onboarding/${label}] ${error.message ?? 'db error'}`);
  }
  if (data == null) {
    throw new Error(`[onboarding/${label}] no row returned`);
  }
  return data;
}

/* ---------- create / read ---------------------------------------------- */

export async function createOnboarding(opts: {
  client_id: string;
  kind: OnboardingKind;
  platforms?: string[];
}): Promise<OnboardingRow> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('onboardings')
    .insert({
      client_id: opts.client_id,
      kind: opts.kind,
      platforms: opts.platforms ?? [],
      current_step: 0,
      step_state: {},
      status: 'in_progress' as OnboardingStatus,
    })
    .select(ONBOARDING_COLUMNS)
    .single();
  return dbOk(data as OnboardingRow | null, error, 'create');
}

export async function getOnboardingById(id: string): Promise<OnboardingRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('onboardings')
    .select(ONBOARDING_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`[onboarding/getById] ${error.message}`);
  return (data as OnboardingRow | null) ?? null;
}

export async function getOnboardingByToken(token: string): Promise<OnboardingRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('onboardings')
    .select(ONBOARDING_COLUMNS)
    .eq('share_token', token)
    .maybeSingle();
  if (error) throw new Error(`[onboarding/getByToken] ${error.message}`);
  return (data as OnboardingRow | null) ?? null;
}

export async function listOnboardings(opts?: {
  status?: OnboardingStatus | OnboardingStatus[];
  kind?: OnboardingKind;
  client_id?: string;
}): Promise<OnboardingRow[]> {
  const admin = createAdminClient();
  let query = admin.from('onboardings').select(ONBOARDING_COLUMNS);

  if (opts?.client_id) query = query.eq('client_id', opts.client_id);
  if (opts?.kind) query = query.eq('kind', opts.kind);
  if (opts?.status) {
    if (Array.isArray(opts.status)) query = query.in('status', opts.status);
    else query = query.eq('status', opts.status);
  }

  const { data, error } = await query.order('updated_at', { ascending: false });
  if (error) throw new Error(`[onboarding/list] ${error.message}`);
  return (data as OnboardingRow[] | null) ?? [];
}

/* ---------- step state mutations --------------------------------------- */

/**
 * Merge a partial step_state patch into the row. The caller is
 * responsible for shape. Optimistic concurrency is intentionally
 * absent: the stepper writes one screen's slot at a time, and a
 * later-screen write does not collide with an earlier-screen write
 * because they use distinct top-level keys.
 */
export async function patchStepState(
  id: string,
  patch: Record<string, unknown>,
): Promise<OnboardingRow> {
  const admin = createAdminClient();
  const current = await getOnboardingById(id);
  if (!current) throw new Error('[onboarding/patchStepState] row not found');

  const merged = { ...current.step_state, ...patch };
  const { data, error } = await admin
    .from('onboardings')
    .update({ step_state: merged })
    .eq('id', id)
    .select(ONBOARDING_COLUMNS)
    .single();
  return dbOk(data as OnboardingRow | null, error, 'patchStepState');
}

/**
 * Advance current_step. If `to` is omitted we advance by one. If we land
 * on the terminal "done" screen we also flip status to 'completed' and
 * stamp completed_at.
 */
export async function advanceStep(
  id: string,
  opts?: { to?: number },
): Promise<OnboardingRow> {
  const current = await getOnboardingById(id);
  if (!current) throw new Error('[onboarding/advanceStep] row not found');

  const target = opts?.to ?? current.current_step + 1;
  if (target < 0 || target >= totalScreens(current.kind)) {
    throw new Error(`[onboarding/advanceStep] target ${target} out of range`);
  }
  // No-op if we're already there.
  if (target === current.current_step) return current;

  const isDone = target === doneIndex(current.kind);
  const update: Record<string, unknown> = { current_step: target };
  if (isDone) {
    update.status = 'completed';
    update.completed_at = new Date().toISOString();
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('onboardings')
    .update(update)
    .eq('id', id)
    .select(ONBOARDING_COLUMNS)
    .single();
  return dbOk(data as OnboardingRow | null, error, 'advanceStep');
}

export async function setStatus(id: string, status: OnboardingStatus): Promise<OnboardingRow> {
  const admin = createAdminClient();
  const update: Record<string, unknown> = { status };
  if (status === 'completed') update.completed_at = new Date().toISOString();
  const { data, error } = await admin
    .from('onboardings')
    .update(update)
    .eq('id', id)
    .select(ONBOARDING_COLUMNS)
    .single();
  return dbOk(data as OnboardingRow | null, error, 'setStatus');
}

/* ---------- team assignments ------------------------------------------- */

export async function listTeamAssignments(client_id: string): Promise<TeamAssignmentRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('client_team_assignments')
    .select('id, client_id, team_member_id, role, is_primary, created_at')
    .eq('client_id', client_id)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`[onboarding/listTeam] ${error.message}`);
  return (data as TeamAssignmentRow[] | null) ?? [];
}

export async function upsertTeamAssignment(opts: {
  client_id: string;
  team_member_id: string;
  role: TeamRole;
  is_primary?: boolean;
}): Promise<TeamAssignmentRow> {
  const admin = createAdminClient();
  // If marking primary, demote any existing primary for this (client, role).
  if (opts.is_primary) {
    await admin
      .from('client_team_assignments')
      .update({ is_primary: false })
      .eq('client_id', opts.client_id)
      .eq('role', opts.role);
  }

  const { data, error } = await admin
    .from('client_team_assignments')
    .upsert(
      {
        client_id: opts.client_id,
        team_member_id: opts.team_member_id,
        role: opts.role,
        is_primary: opts.is_primary ?? false,
      },
      { onConflict: 'client_id,team_member_id,role' },
    )
    .select('id, client_id, team_member_id, role, is_primary, created_at')
    .single();
  return dbOk(data as TeamAssignmentRow | null, error, 'upsertTeam');
}

export async function removeTeamAssignment(id: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from('client_team_assignments').delete().eq('id', id);
  if (error) throw new Error(`[onboarding/removeTeam] ${error.message}`);
}

/* ---------- email log -------------------------------------------------- */

export async function logEmail(opts: {
  onboarding_id: string;
  kind: EmailLogKind;
  to_email: string;
  subject: string;
  body_preview?: string;
  resend_id?: string | null;
  ok?: boolean;
  error?: string | null;
  triggered_by?: string | null;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from('onboarding_emails_log').insert({
    onboarding_id: opts.onboarding_id,
    kind: opts.kind,
    to_email: opts.to_email,
    subject: opts.subject,
    body_preview: opts.body_preview ?? null,
    resend_id: opts.resend_id ?? null,
    ok: opts.ok ?? true,
    error: opts.error ?? null,
    triggered_by: opts.triggered_by ?? null,
  });
  if (error) {
    // Logging failures should never block the actual send. Console is fine.
    console.warn('[onboarding/logEmail] failed:', error.message);
  }
}

export async function listEmailLog(onboarding_id: string, limit = 50) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('onboarding_emails_log')
    .select('id, onboarding_id, kind, to_email, subject, body_preview, resend_id, ok, error, triggered_by, sent_at')
    .eq('onboarding_id', onboarding_id)
    .order('sent_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`[onboarding/listEmailLog] ${error.message}`);
  return data ?? [];
}

/* ---------- read-side joins for admin tracker -------------------------- */

export interface OnboardingWithClient extends OnboardingRow {
  client: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    agency: string | null;
  } | null;
  last_email_at: string | null;
}

/**
 * Roster for `/admin/onboarding`: every in-flight onboarding plus its
 * client identity and "last email sent at" so we can show "X days
 * since last nudge" without joining email_messages.
 */
export async function listOnboardingsForAdmin(opts?: {
  status?: OnboardingStatus[];
}): Promise<OnboardingWithClient[]> {
  const admin = createAdminClient();
  const statuses: OnboardingStatus[] =
    opts?.status ?? ['in_progress', 'paused'];

  const { data, error } = await admin
    .from('onboardings')
    .select(
      `${ONBOARDING_COLUMNS},
       client:clients ( id, name, slug, logo_url, agency )`,
    )
    .in('status', statuses)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(`[onboarding/listForAdmin] ${error.message}`);

  type Row = OnboardingRow & {
    client:
      | { id: string; name: string; slug: string; logo_url: string | null; agency: string | null }
      | { id: string; name: string; slug: string; logo_url: string | null; agency: string | null }[]
      | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  // Pull last email per onboarding in one round trip.
  const ids = rows.map((r) => r.id);
  const lastEmailMap = new Map<string, string>();
  if (ids.length > 0) {
    const { data: emails } = await admin
      .from('onboarding_emails_log')
      .select('onboarding_id, sent_at')
      .in('onboarding_id', ids)
      .order('sent_at', { ascending: false });
    for (const row of emails ?? []) {
      const oid = row.onboarding_id as string;
      if (!lastEmailMap.has(oid)) lastEmailMap.set(oid, row.sent_at as string);
    }
  }

  return rows.map((r) => ({
    ...r,
    client: Array.isArray(r.client) ? (r.client[0] ?? null) : r.client,
    last_email_at: lastEmailMap.get(r.id) ?? null,
  }));
}

/* ---------- progress helpers ------------------------------------------- */

export interface ProgressDescriptor {
  current_step: number;
  total: number;
  is_done: boolean;
  current_label: string;
  pct: number;
}

export function describeProgress(row: OnboardingRow): ProgressDescriptor {
  const total = totalScreens(row.kind);
  const screen = screenAt(row.kind, row.current_step);
  const isDone = row.current_step >= total - 1;
  return {
    current_step: row.current_step,
    total,
    is_done: isDone,
    current_label: screen?.label ?? 'Unknown',
    pct: total > 1 ? Math.round((row.current_step / (total - 1)) * 100) : 0,
  };
}

/* ---------- guards ----------------------------------------------------- */

export async function requireOnboarding(id: string): Promise<OnboardingRow> {
  const row = await getOnboardingById(id);
  if (!row) throw new Error(`onboarding ${id} not found`);
  return row;
}

export async function requireOnboardingByToken(token: string): Promise<OnboardingRow> {
  const row = await getOnboardingByToken(token);
  if (!row) throw new Error('share token not found');
  return row;
}
