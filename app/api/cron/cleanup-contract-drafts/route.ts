import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';

export const maxDuration = 60;

const DRAFT_TTL_HOURS = 6;

/**
 * GET /api/cron/cleanup-contract-drafts
 *
 * Deletes `client_contracts` rows stuck in `status = 'draft'` past the TTL,
 * along with their Supabase Storage objects. Covers the case where a user
 * starts an upload, sees the review modal, then closes the tab without
 * saving or cancelling — the draft row + file would otherwise persist.
 *
 * @auth Bearer CRON_SECRET (mandatory)
 */
async function handleGet(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - DRAFT_TTL_HOURS * 60 * 60 * 1000).toISOString();

  const { data: stale, error: selectErr } = await admin
    .from('client_contracts')
    .select('id, file_path')
    .eq('status', 'draft')
    .lt('uploaded_at', cutoff);

  if (selectErr) {
    console.error('[cron/cleanup-contract-drafts] select error:', selectErr);
    return NextResponse.json({ error: selectErr.message }, { status: 500 });
  }

  if (!stale || stale.length === 0) {
    return NextResponse.json({ deleted: 0, storage_removed: 0 });
  }

  const paths = stale
    .map((r) => (r as { file_path: string | null }).file_path)
    .filter((p): p is string => !!p);

  let storageRemoved = 0;
  if (paths.length) {
    const { data: removed, error: removeErr } = await admin.storage
      .from('client-contracts')
      .remove(paths);
    if (removeErr) {
      console.error('[cron/cleanup-contract-drafts] storage remove error:', removeErr);
    } else {
      storageRemoved = removed?.length ?? 0;
    }
  }

  const ids = stale.map((r) => (r as { id: string }).id);
  const { error: deleteErr } = await admin
    .from('client_contracts')
    .delete()
    .in('id', ids);

  if (deleteErr) {
    console.error('[cron/cleanup-contract-drafts] row delete error:', deleteErr);
    return NextResponse.json({ error: deleteErr.message, storage_removed: storageRemoved }, { status: 500 });
  }

  return NextResponse.json({
    deleted: ids.length,
    storage_removed: storageRemoved,
    cutoff,
  });
}

export const GET = withCronTelemetry({ route: '/api/cron/cleanup-contract-drafts' }, handleGet);
