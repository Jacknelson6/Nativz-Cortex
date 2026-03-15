import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-keys/validate';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/v1/shoots/[id]
 *
 * Fetch a single shoot event by UUID, with the associated client name and slug.
 *
 * @auth API key (Bearer token via Authorization header)
 * @param id - Shoot event UUID
 * @returns {{ shoot: ShootEvent & { clients: { id, name, slug } } }}
 */
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
