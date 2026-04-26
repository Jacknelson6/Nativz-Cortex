import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { renderConceptImageWithOpenAI } from '@/lib/ad-creatives/monthly-gift-ads';
import { mapImageErrorToResponse } from '@/lib/ad-creatives/error-response';

export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isAdmin =
    me?.is_super_admin === true ||
    me?.role === 'admin' ||
    me?.role === 'super_admin';
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  try {
    const concept = await renderConceptImageWithOpenAI(id, {
      userId: user.id,
      userEmail: user.email ?? null,
    });
    return NextResponse.json({ concept });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'Concept not found') {
      return NextResponse.json({ error: message, code: 'concept_not_found' }, { status: 404 });
    }
    if (message === 'Concept has no image prompt') {
      return NextResponse.json({ error: message, code: 'concept_no_prompt' }, { status: 400 });
    }
    const mapped = mapImageErrorToResponse(err);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
