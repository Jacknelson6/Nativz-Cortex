import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNED_URL_TTL_SECONDS = 60 * 10;

async function requireAdmin(userId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();
  return data?.role === 'admin' || data?.role === 'super_admin';
}

async function resolveClient(slugOrId: string) {
  const admin = createAdminClient();
  const column = UUID_RE.test(slugOrId) ? 'id' : 'slug';
  const { data } = await admin
    .from('clients')
    .select('id')
    .eq(column, slugOrId)
    .single();
  return data;
}

/**
 * Mints a short-lived signed URL for a brand asset OR an onboarding upload.
 * The query param `source=onboarding_upload` flips the bucket + table lookup
 * so the merged list in the UI can hand both kinds of rows to the same
 * download button.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; assetId: string }> },
) {
  const { id, assetId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await requireAdmin(user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const client = await resolveClient(id);
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const source = req.nextUrl.searchParams.get('source') ?? 'brand_asset';
  const admin = createAdminClient();

  let storagePath: string | null = null;
  let bucket: 'brand-assets' | 'onboarding-uploads' = 'brand-assets';

  if (source === 'onboarding_upload') {
    bucket = 'onboarding-uploads';
    const { data: upload } = await admin
      .from('onboarding_uploads')
      .select('storage_path, tracker_id, onboarding_trackers!inner(client_id)')
      .eq('id', assetId)
      .maybeSingle<{
        storage_path: string;
        tracker_id: string;
        onboarding_trackers: { client_id: string } | { client_id: string }[];
      }>();

    if (upload) {
      const tracker = Array.isArray(upload.onboarding_trackers)
        ? upload.onboarding_trackers[0]
        : upload.onboarding_trackers;
      if (tracker?.client_id === client.id) {
        storagePath = upload.storage_path;
      }
    }
  } else {
    const { data: asset } = await admin
      .from('client_brand_assets')
      .select('storage_path')
      .eq('id', assetId)
      .eq('client_id', client.id)
      .maybeSingle();
    if (asset) storagePath = asset.storage_path;
  }

  if (!storagePath) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }

  const { data: signed, error: signErr } = await admin.storage
    .from(bucket)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json(
      { error: signErr?.message ?? 'Failed to sign URL' },
      { status: 500 },
    );
  }

  return NextResponse.json({ url: signed.signedUrl });
}
