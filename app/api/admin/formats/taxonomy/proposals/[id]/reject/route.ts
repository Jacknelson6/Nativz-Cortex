// VFF-06 T08b: POST /api/admin/formats/taxonomy/proposals/[id]/reject
// super_admin only. Marks proposal status='rejected'.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { gateAndLoadProposal } from '../_auth';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const gate = await gateAndLoadProposal(id);
  if (gate.kind === 'err') return gate.res;
  const { user_id } = gate;

  const admin = createAdminClient();
  const { error } = await admin
    .from('format_taxonomy_proposals')
    .update({
      status: 'rejected',
      reviewed_by: user_id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, status: 'rejected' });
}
