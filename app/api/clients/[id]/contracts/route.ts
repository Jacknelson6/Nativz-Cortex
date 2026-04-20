import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { extractTextFromFile, extractContractDeliverables } from '@/lib/contracts/extract';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
]);

async function requireAdmin(userId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('users')
    .select('role, email')
    .eq('id', userId)
    .single();
  const ok = data?.role === 'admin' || data?.role === 'super_admin';
  return { ok, email: data?.email ?? null };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Accept either a client slug or UUID. The route now lives under `[id]` to
 * keep Next.js happy (NAT-52), so callers passing a slug still work.
 */
async function resolveClient(slugOrId: string) {
  const admin = createAdminClient();
  const column = UUID_RE.test(slugOrId) ? 'id' : 'slug';
  const { data } = await admin
    .from('clients')
    .select('id, organization_id')
    .eq(column, slugOrId)
    .single();
  return data;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { ok } = await requireAdmin(user.id);
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const client = await resolveClient(id);
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const { data: contracts } = await admin
    .from('client_contracts')
    .select('*')
    .eq('client_id', client.id)
    .order('uploaded_at', { ascending: false });

  const ids = (contracts ?? []).map((c) => c.id);
  const { data: deliverables } = ids.length
    ? await admin
        .from('client_contract_deliverables')
        .select('*')
        .in('contract_id', ids)
        .order('sort_order', { ascending: true })
    : { data: [] as never[] };

  return NextResponse.json({ contracts: contracts ?? [], deliverables: deliverables ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { ok, email } = await requireAdmin(user.id);
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const client = await resolveClient(id);
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 20 MB)' }, { status: 413 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 415 });
  }

  const admin = createAdminClient();

  const { data: draft, error: draftErr } = await admin
    .from('client_contracts')
    .insert({
      client_id: client.id,
      status: 'draft',
      file_name: file.name,
      file_size: file.size,
      file_mime: file.type,
      uploaded_by: user.id,
    })
    .select('id')
    .single();
  if (draftErr || !draft) {
    return NextResponse.json({ error: draftErr?.message ?? 'Failed to create draft' }, { status: 500 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = `${client.organization_id ?? 'no-org'}/${client.id}/${draft.id}/${file.name}`;
  const { error: uploadErr } = await admin.storage
    .from('client-contracts')
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });

  if (uploadErr) {
    await admin.from('client_contracts').delete().eq('id', draft.id);
    return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 });
  }

  let result: Awaited<ReturnType<typeof extractContractDeliverables>>;
  try {
    const text = await extractTextFromFile(buffer, file.type);
    result = await extractContractDeliverables(text, {
      feature: 'contract-extract',
      userId: user.id,
      userEmail: email ?? undefined,
    });
  } catch (err) {
    result = {
      result: { services: [], deliverables: [], effective_start: null, effective_end: null, suggested_label: null },
      parseMeta: { error: err instanceof Error ? err.message : String(err) },
    };
  }

  await admin
    .from('client_contracts')
    .update({ file_path: storagePath, parse_meta: result.parseMeta })
    .eq('id', draft.id);

  return NextResponse.json({
    contract_id: draft.id,
    draft: result.result,
  });
}
