import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { patchContractBodySchema } from '@/lib/contracts/types';
import { recomputeClientServices } from '@/lib/contracts/recompute-services';

export const dynamic = 'force-dynamic';

async function guard(
  slug: string,
  id: string,
  userId: string,
): Promise<{ status: number; error?: string; clientId?: string }> {
  const admin = createAdminClient();
  const { data: me } = await admin.from('users').select('role').eq('id', userId).single();
  if (me?.role !== 'admin' && me?.role !== 'super_admin') {
    return { status: 403, error: 'Forbidden' };
  }
  const { data: client } = await admin.from('clients').select('id').eq('slug', slug).single();
  if (!client) return { status: 404, error: 'Client not found' };
  const { data: contract } = await admin
    .from('client_contracts')
    .select('id, client_id, file_path')
    .eq('id', id)
    .single();
  if (!contract || contract.client_id !== client.id) {
    return { status: 404, error: 'Contract not found' };
  }
  return { status: 200, clientId: client.id };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const g = await guard(slug, id, user.id);
  if (g.status !== 200) return NextResponse.json({ error: g.error }, { status: g.status });

  const body = await req.json().catch(() => null);
  const parsed = patchContractBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 });
  }

  const admin = createAdminClient();
  const updates: Record<string, unknown> = {};
  if (parsed.data.label !== undefined) updates.label = parsed.data.label;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.effective_start !== undefined) updates.effective_start = parsed.data.effective_start ?? null;
  if (parsed.data.effective_end !== undefined) updates.effective_end = parsed.data.effective_end ?? null;
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes ?? null;

  if (Object.keys(updates).length) {
    const { error } = await admin.from('client_contracts').update(updates).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (parsed.data.deliverables) {
    await admin.from('client_contract_deliverables').delete().eq('contract_id', id);
    if (parsed.data.deliverables.length) {
      const rows = parsed.data.deliverables.map((d, i) => ({
        contract_id: id,
        service_tag: d.service_tag.trim(),
        name: d.name.trim(),
        quantity_per_month: d.quantity_per_month,
        notes: d.notes ?? null,
        sort_order: i,
      }));
      const { error } = await admin.from('client_contract_deliverables').insert(rows);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const services = await recomputeClientServices(g.clientId!);
  return NextResponse.json({ ok: true, services });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const g = await guard(slug, id, user.id);
  if (g.status !== 200) return NextResponse.json({ error: g.error }, { status: g.status });

  const admin = createAdminClient();
  const { data: contract } = await admin
    .from('client_contracts')
    .select('file_path')
    .eq('id', id)
    .single();

  if (contract?.file_path) {
    await admin.storage.from('client-contracts').remove([contract.file_path]);
  }

  const { error } = await admin.from('client_contracts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const services = await recomputeClientServices(g.clientId!);
  return NextResponse.json({ ok: true, services });
}
