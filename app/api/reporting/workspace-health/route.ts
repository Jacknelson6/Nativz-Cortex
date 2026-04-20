import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ZernioPostingService } from '@/lib/posting';

/**
 * GET /api/reporting/workspace-health
 *
 * Proxies /v1/accounts/health — workspace-wide token + analytics health
 * summary. Admin-only; surfaces "N accounts need reconnect" before a
 * cron run goes sideways.
 *
 * Enriches each row with the matching client.name from our DB by
 * joining on late_profile_id so the admin UI can show "Crystal Creek
 * Cattle / Facebook needs reconnect" rather than a raw Zernio id.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const adminClient = createAdminClient();
  const { data: userRow } = await adminClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (userRow?.role !== 'admin' && userRow?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const zernio = new ZernioPostingService();
  const health = await zernio.getWorkspaceHealth();

  const { data: clients } = await adminClient
    .from('clients')
    .select('id, name, slug, late_profile_id')
    .not('late_profile_id', 'is', null);

  const byProfileId = new Map(
    (clients ?? [])
      .filter((c) => c.late_profile_id)
      .map((c) => [c.late_profile_id as string, c]),
  );

  const accounts = health.accounts.map((a) => ({
    ...a,
    client: a.profileId ? byProfileId.get(a.profileId) ?? null : null,
  }));

  return NextResponse.json({ summary: health.summary, accounts });
}
