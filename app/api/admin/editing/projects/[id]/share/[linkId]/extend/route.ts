import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';

/**
 * POST /api/admin/editing/projects/:id/share/:linkId/extend
 *
 * Refreshes an editing-project share link by pushing `expires_at` 30
 * days forward. Used by the dialog's "Refresh link" button so admins
 * can revive an expired or about-to-expire link without minting a
 * brand-new token (preserves comments, views, archive history).
 *
 * Symmetric to the DELETE on the parent route which archives the link
 * (`archived_at`); this just adjusts expiry. Archived links are not
 * extendable — admins should mint a fresh link for those.
 */

const EXTEND_DAYS = 30;

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string; linkId: string }> },
) {
  const { id, linkId } = await ctx.params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: link } = await admin
    .from('editing_project_share_links')
    .select('id, archived_at')
    .eq('id', linkId)
    .eq('project_id', id)
    .single<{ id: string; archived_at: string | null }>();
  if (!link) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (link.archived_at) {
    return NextResponse.json(
      { error: 'archived', detail: 'Mint a new link instead.' },
      { status: 400 },
    );
  }

  const newExpires = new Date(Date.now() + EXTEND_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await admin
    .from('editing_project_share_links')
    .update({ expires_at: newExpires })
    .eq('id', link.id);
  if (error) {
    return NextResponse.json({ error: 'extend_failed', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, expires_at: newExpires });
}
