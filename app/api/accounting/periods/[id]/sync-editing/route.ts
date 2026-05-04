import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { autoPopulateEditingForPeriod } from '@/lib/accounting/auto-populate-editing';

/**
 * POST /api/accounting/periods/[id]/sync-editing
 *
 * Super-admin-only. Runs `autoPopulateEditingForPeriod` against the given
 * period. Returns the inserted / updated / skipped counts so the caller can
 * surface a toast.
 *
 * Wired to the "Sync editing from approved deliverables" button in the
 * period detail header, and to the auto-fire path when a period detail page
 * loads with zero auto editing rows yet.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: userRow } = await admin
    .from('users')
    .select('is_super_admin')
    .eq('id', user.id)
    .single();
  if (!userRow?.is_super_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result = await autoPopulateEditingForPeriod(admin, id);
  return NextResponse.json(result);
}
