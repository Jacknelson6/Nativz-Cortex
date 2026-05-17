/**
 * Phase transition endpoint for editing projects.
 *
 * POST /api/admin/editing/projects/:id/phase
 *   body: { to_phase: EditingProjectPhase }
 *
 * Validates the transition against the phase state machine, updates the
 * row, fires the Google Chat fan-out (per-client + Ops), and mirrors the
 * change to activity_log. Webhooks are fire-and-forget so a Chat outage
 * never blocks the response.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { EDITING_PHASES, type EditingProjectPhase } from '@/lib/editing/types';
import { isValidTransition } from '@/lib/content-projects/phase-state-machine';
import { notifyPhaseChange } from '@/lib/content-projects/phase-webhook';

export const dynamic = 'force-dynamic';

const Body = z.object({
  to_phase: z.enum(EDITING_PHASES as unknown as [EditingProjectPhase, ...EditingProjectPhase[]]),
  /** Optional free-text extra context surfaced in the Chat card body. */
  note: z.string().max(500).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', detail: parsed.error.message },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Read the row + the bits we need for the webhook payload in one shot.
  const { data: row, error: readErr } = await admin
    .from('editing_projects')
    .select(
      `id, name, phase, client_id,
       client:clients!editing_projects_client_id_fkey(name, google_chat_webhook_url)`,
    )
    .eq('id', id)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json(
      { error: 'db_error', detail: readErr.message },
      { status: 500 },
    );
  }
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const fromPhase = row.phase as EditingProjectPhase | null;
  const toPhase = parsed.data.to_phase;

  if (!fromPhase) {
    return NextResponse.json(
      { error: 'no_current_phase', detail: 'project row missing phase column' },
      { status: 500 },
    );
  }
  if (!isValidTransition(fromPhase, toPhase)) {
    return NextResponse.json(
      {
        error: 'invalid_transition',
        detail: `cannot move from "${fromPhase}" to "${toPhase}"`,
      },
      { status: 409 },
    );
  }

  // Update phase. Mirror approved_at when entering Approved so the
  // legacy status field stays consistent without forcing both writes
  // from the UI.
  const update: Record<string, unknown> = { phase: toPhase };
  if (toPhase === 'Approved') update.approved_at = new Date().toISOString();
  if (toPhase === 'Done') update.scheduled_at = new Date().toISOString();
  if (toPhase === 'Raw uploaded') update.raws_uploaded_at = new Date().toISOString();

  const { error: updateErr } = await admin
    .from('editing_projects')
    .update(update)
    .eq('id', id);
  if (updateErr) {
    return NextResponse.json(
      { error: 'update_failed', detail: updateErr.message },
      { status: 500 },
    );
  }

  // Look up the actor's display name for the Chat card.
  const { data: actor } = await admin
    .from('users')
    .select('full_name, email')
    .eq('id', user.id)
    .maybeSingle();

  // Best-effort origin so the card "Open in Cortex" button can deep-link.
  const origin = req.headers.get('origin') ?? req.headers.get('referer') ?? null;
  const cleanOrigin = origin ? new URL(origin).origin : null;

  const client = row.client as
    | { name?: string | null; google_chat_webhook_url?: string | null }
    | null;

  await notifyPhaseChange(admin, {
    projectId: row.id as string,
    projectName: (row.name as string) ?? 'Untitled project',
    clientId: row.client_id as string,
    clientName: client?.name ?? null,
    clientWebhookUrl: client?.google_chat_webhook_url ?? null,
    fromPhase,
    toPhase,
    actorId: user.id,
    actorName: actor?.full_name ?? actor?.email ?? null,
    origin: cleanOrigin,
    extra: parsed.data.note ? { Note: parsed.data.note } : undefined,
  });

  return NextResponse.json({ ok: true, phase: toPhase });
}
