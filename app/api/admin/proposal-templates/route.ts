import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/revenue/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin } = auth;

  const { data, error } = await admin
    .from('proposal_templates')
    .select('id, agency, name, description, source_repo, source_folder, public_base_url, tiers_preview, active')
    .eq('active', true)
    .order('agency')
    .order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data ?? [] });
}
