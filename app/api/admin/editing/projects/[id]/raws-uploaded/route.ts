/**
 * Raws uploaded shortcut.
 *
 * POST /api/admin/editing/projects/:id/raws-uploaded
 *   body: { drive_folder_url?: string | null }
 *
 * Single-button shortcut for the videographer flow:
 *   1. (optional) stamp drive_folder_url on the project
 *   2. stamp raws_uploaded_at if not already set
 *   3. advance phase to "Raw uploaded" if the current phase is
 *      Planning / Shoot booked / Shoot done — i.e. anywhere upstream
 *      of editing. Leaves phase alone if we're already further along.
 *   4. fire Google Chat fan-out for the phase change (if one happened)
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import type { EditingProjectPhase } from '@/lib/editing/types';
import { notifyPhaseChange } from '@/lib/content-projects/phase-webhook';

export const dynamic = 'force-dynamic';

const Body = z.object({
  drive_folder_url: z.string().url().nullable().optional(),
});

const UPSTREAM_PHASES: ReadonlySet<EditingProjectPhase> = new Set([
  'Planning',
  'Shoot booked',
  'Shoot done',
]);

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

  const json = (await req.json().catch(() => ({}))) as unknown;
  const parsed = Body.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', detail: parsed.error.message },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: row, error: readErr } = await admin
    .from('editing_projects')
    .select(
      `id, name, phase, raws_uploaded_at, drive_folder_url, client_id,
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

  const currentPhase = row.phase as EditingProjectPhase | null;
  const shouldAdvance =
    currentPhase !== null && UPSTREAM_PHASES.has(currentPhase);

  const update: Record<string, unknown> = {
    raws_uploaded_at: (row.raws_uploaded_at as string | null) ?? new Date().toISOString(),
  };
  if (parsed.data.drive_folder_url !== undefined) {
    update.drive_folder_url = parsed.data.drive_folder_url;
  }
  if (shouldAdvance) {
    update.phase = 'Raw uploaded' satisfies EditingProjectPhase;
  }

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

  if (shouldAdvance) {
    const { data: actor } = await admin
      .from('users')
      .select('full_name, email')
      .eq('id', user.id)
      .maybeSingle();
    const origin = req.headers.get('origin') ?? req.headers.get('referer') ?? null;
    const cleanOrigin = origin ? new URL(origin).origin : null;
    const client = row.client as
      | { name?: string | null; google_chat_webhook_url?: string | null }
      | null;
    const driveUrl =
      (parsed.data.drive_folder_url as string | null | undefined) ??
      ((row.drive_folder_url as string | null) ?? null);

    await notifyPhaseChange(admin, {
      projectId: row.id as string,
      projectName: (row.name as string) ?? 'Untitled project',
      clientId: row.client_id as string,
      clientName: client?.name ?? null,
      clientWebhookUrl: client?.google_chat_webhook_url ?? null,
      fromPhase: currentPhase,
      toPhase: 'Raw uploaded',
      actorId: user.id,
      actorName: actor?.full_name ?? actor?.email ?? null,
      origin: cleanOrigin,
      extra: driveUrl ? { 'Drive folder': driveUrl } : undefined,
    });
  }

  return NextResponse.json({
    ok: true,
    phase: shouldAdvance ? 'Raw uploaded' : currentPhase,
    advanced: shouldAdvance,
  });
}
