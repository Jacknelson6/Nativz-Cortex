import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * DELETE /api/ad-creatives/templates/clear-all
 *
 * Wipe all templates from kandy_templates. Requires confirmation via body.
 */
export async function DELETE(req: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (body.confirm !== true) {
    return NextResponse.json({ error: 'Confirmation required (send { confirm: true })' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Count before delete
  const { count } = await admin.from('kandy_templates').select('id', { count: 'exact', head: true });

  // Delete all templates
  const { error } = await admin.from('kandy_templates').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  if (error) {
    console.error('[clear-all] Failed to delete templates:', error);
    return NextResponse.json({ error: 'Failed to clear templates' }, { status: 500 });
  }

  // Also clear storage bucket contents (best-effort)
  try {
    const { data: files } = await admin.storage.from('kandy-templates').list('', { limit: 1000 });
    if (files && files.length > 0) {
      const paths = files.map((f) => f.name);
      await admin.storage.from('kandy-templates').remove(paths);
    }
  } catch {
    // Non-fatal — storage cleanup can be done manually
  }

  return NextResponse.json({ deleted: count ?? 0 });
}
