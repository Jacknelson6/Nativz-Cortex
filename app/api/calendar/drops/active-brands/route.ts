import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data } = await admin
    .from('content_drops')
    .select('client_id')
    .in('status', ['ingesting', 'analyzing', 'generating', 'ready', 'scheduled']);

  const brandIds = Array.from(
    new Set((data ?? []).map((d) => d.client_id as string).filter(Boolean)),
  );
  return NextResponse.json({ brandIds });
}
