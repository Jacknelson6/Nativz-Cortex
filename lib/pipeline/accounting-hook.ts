import { createAdminClient } from '@/lib/supabase/admin';
import { currentPeriod } from '@/lib/accounting/periods';
import { notifyAdmins } from '@/lib/notifications';

/**
 * When a pipeline item's editing_status transitions to 'done' with an `editor`
 * assigned, pre-create a zero-dollar payroll_entries row so the EM can fill in
 * the amount at period close. Idempotent on (source, source_id) so replayed
 * advance calls don't stack duplicates.
 *
 * Runs after the advance response is returned to the client — call via
 * `after()` so a slow team_member lookup never blocks the pipeline UX.
 */
export async function autoLinkEditingDoneToPayroll(opts: {
  pipelineId: string;
  editorName: string | null;
  clientId: string | null;
  clientName: string | null;
}): Promise<void> {
  const { pipelineId, editorName, clientId, clientName } = opts;
  if (!editorName?.trim()) return;

  const admin = createAdminClient();

  // Resolve editor → team_members row. Pipeline stores the name as TEXT today
  // (NAT-27 tracks the FK migration); fuzzy-match on normalised full_name.
  const normalisedEditor = editorName.trim().toLowerCase();
  const { data: candidates } = await admin
    .from('team_members')
    .select('id, full_name, user_id, is_active')
    .eq('is_active', true);
  const teamMember = (candidates ?? []).find(
    (m) => (m.full_name ?? '').trim().toLowerCase() === normalisedEditor,
  );
  if (!teamMember) {
    console.log(
      `[pipeline→accounting] No active team_members row for editor "${editorName}"; skipping auto-link.`,
    );
    return;
  }

  // Pick the current open (draft) period for whoever the EM is working on
  // right now. Create one if none exists — matches /api/accounting/periods
  // GET's auto-seed behaviour.
  const now = currentPeriod();
  const { data: existingPeriod, error: periodErr } = await admin
    .from('payroll_periods')
    .upsert(
      {
        start_date: now.startDate,
        end_date: now.endDate,
        half: now.half,
        status: 'draft',
      },
      { onConflict: 'start_date,end_date', ignoreDuplicates: false },
    )
    .select('id, status')
    .single();
  if (periodErr || !existingPeriod) {
    console.error('[pipeline→accounting] Failed to resolve payroll period', periodErr);
    return;
  }
  if (existingPeriod.status !== 'draft') {
    // Current period is already locked / paid — don't back-date into it.
    console.log(
      `[pipeline→accounting] Current period ${existingPeriod.id} is ${existingPeriod.status}; skipping.`,
    );
    return;
  }

  // Idempotent insert keyed on (source, source_id).
  const { error: entryErr } = await admin.from('payroll_entries').upsert(
    {
      period_id: existingPeriod.id,
      entry_type: 'editing',
      team_member_id: teamMember.id,
      client_id: clientId,
      video_count: 1,
      rate_cents: 0,
      amount_cents: 0,
      margin_cents: 0,
      description: `Auto-created from pipeline item ${pipelineId}${clientName ? ` (${clientName})` : ''}`,
      source: 'content_pipeline',
      source_id: pipelineId,
    },
    { onConflict: 'source,source_id', ignoreDuplicates: true },
  );
  if (entryErr) {
    console.error('[pipeline→accounting] Failed to upsert payroll entry', entryErr);
    return;
  }

  await notifyAdmins({
    type: 'task_completed',
    title: `Editor ${editorName} finished an edit — ready for payroll`,
    body: clientName
      ? `${clientName}: fill in the editing amount on the current period.`
      : 'Fill in the editing amount on the current period.',
    linkPath: '/admin/tools/accounting',
    clientId: clientId ?? undefined,
  });
}
