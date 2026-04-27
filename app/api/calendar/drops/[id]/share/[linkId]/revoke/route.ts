import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string; linkId: string }> },
) {
  const { id, linkId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  const { data: link } = await admin
    .from('content_drop_share_links')
    .select('id, drop_id')
    .eq('id', linkId)
    .single<{ id: string; drop_id: string }>();
  if (!link) return NextResponse.json({ error: 'share link not found' }, { status: 404 });
  if (link.drop_id !== id) {
    return NextResponse.json({ error: 'share link does not belong to this content calendar' }, { status: 400 });
  }

  const { error } = await admin
    .from('content_drop_share_links')
    .update({ expires_at: new Date().toISOString() })
    .eq('id', linkId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
