import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { confirmContractBodySchema } from '@/lib/contracts/types';
import { recomputeClientServices } from '@/lib/contracts/recompute-services';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; contractId: string }> },
) {
  const { id, contractId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (me?.role !== 'admin' && me?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const column = UUID_RE.test(id) ? 'id' : 'slug';
  const { data: client } = await admin
    .from('clients')
    .select('id')
    .eq(column, id)
    .single();
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const { data: contract } = await admin
    .from('client_contracts')
    .select('id, client_id')
    .eq('id', contractId)
    .single();
  if (!contract || contract.client_id !== client.id) {
    return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = confirmContractBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 });
  }

  const {
    label,
    status,
    effective_start,
    effective_end,
    notes,
    deliverables,
  } = parsed.data;

  const { error: delErr } = await admin
    .from('client_contract_deliverables')
    .delete()
    .eq('contract_id', contractId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  if (deliverables.length) {
    const rows = deliverables.map((d, i) => ({
      contract_id: contractId,
      service_tag: d.service_tag.trim(),
      name: d.name.trim(),
      quantity_per_month: d.quantity_per_month,
      notes: d.notes ?? null,
      sort_order: i,
    }));
    const { error: insErr } = await admin.from('client_contract_deliverables').insert(rows);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  const { error: updErr } = await admin
    .from('client_contracts')
    .update({
      label,
      status,
      effective_start: effective_start ?? null,
      effective_end: effective_end ?? null,
      notes: notes ?? null,
    })
    .eq('id', contractId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  const services = await recomputeClientServices(client.id);
  return NextResponse.json({ ok: true, services });
}
