import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getNotificationDefinition } from '@/lib/notifications/registry';
import { AGENCY_CONFIG, type AgencyBrand } from '@/lib/agency/detect';

const VALID_BRANDS = new Set<AgencyBrand>(Object.keys(AGENCY_CONFIG) as AgencyBrand[]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  if (me?.role !== 'admin' && !me?.is_super_admin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { key } = await params;
  const def = getNotificationDefinition(key);
  if (!def) return NextResponse.json({ error: 'unknown notification' }, { status: 404 });
  if (!def.preview) {
    return NextResponse.json({ error: 'preview not available for this notification' }, { status: 404 });
  }

  const url = new URL(req.url);
  const requested = (url.searchParams.get('brand') ?? 'nativz') as AgencyBrand;
  const brand: AgencyBrand = VALID_BRANDS.has(requested) ? requested : 'nativz';

  const result = await def.preview(brand);
  if (!result || !result.html) {
    return NextResponse.json({ error: 'no html produced' }, { status: 500 });
  }

  return new NextResponse(result.html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'x-preview-subject': result.subject ?? '',
      'cache-control': 'no-store',
    },
  });
}
