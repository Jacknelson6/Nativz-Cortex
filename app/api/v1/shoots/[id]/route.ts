import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-keys/validate';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await validateApiKey(request);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: shoot, error } = await admin
    .from('shoot_events')
    .select('*, clients(id, name, slug)')
    .eq('id', id)
    .single();

  if (error || !shoot) {
    return NextResponse.json({ error: 'Shoot not found' }, { status: 404 });
  }

  return NextResponse.json({ shoot });
}
