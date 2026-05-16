import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 500 * 1024 * 1024;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CATEGORIES = ['footage', 'logo', 'guideline', 'photo', 'font', 'other'] as const;
const CategorySchema = z.enum(CATEGORIES);

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
    .select('id, organization_id')
    .eq(column, slugOrId)
    .single();
  return data;
}

function sanitizeFileName(raw: string): string {
  const cleaned = raw
    .replace(/[/\\]/g, '_')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned.slice(0, 180) || 'asset';
}

function inferCategory(mime: string | null): typeof CATEGORIES[number] {
  if (!mime) return 'other';
  if (mime.startsWith('video/')) return 'footage';
  if (mime.startsWith('image/')) return 'photo';
  if (mime === 'application/pdf') return 'guideline';
  if (mime.startsWith('font/') || mime.includes('opentype') || mime.includes('truetype')) return 'font';
  return 'other';
}

/**
 * GET — merged list of:
 *   1. `client_brand_assets` rows (long-lived admin uploads)
 *   2. `onboarding_uploads` rows from this client's trackers (read-only,
 *      surfaced so onboarding-time uploads aren't stranded in the tracker UI)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await requireAdmin(user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const client = await resolveClient(id);
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const admin = createAdminClient();

  const [assetsRes, trackersRes] = await Promise.all([
    admin
      .from('client_brand_assets')
      .select('id, label, category, storage_path, file_name, mime_type, size_bytes, note, created_at')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false }),
    admin
      .from('onboarding_trackers')
      .select('id, service')
      .eq('client_id', client.id),
  ]);

  const trackerIds = (trackersRes.data ?? []).map((t) => t.id);
  const trackerLabelById = new Map<string, string>(
    (trackersRes.data ?? []).map((t) => [t.id, t.service ?? 'Onboarding']),
  );

  const onboardingUploads = trackerIds.length
    ? await admin
        .from('onboarding_uploads')
        .select('id, tracker_id, storage_path, filename, mime_type, size_bytes, note, created_at')
        .in('tracker_id', trackerIds)
        .order('created_at', { ascending: false })
    : { data: [] as Array<{
        id: string;
        tracker_id: string;
        storage_path: string;
        filename: string;
        mime_type: string | null;
        size_bytes: number | null;
        note: string | null;
        created_at: string;
      }> };

  const assets = (assetsRes.data ?? []).map((row) => ({
    id: row.id,
    source: 'brand_asset' as const,
    bucket: 'brand-assets' as const,
    label: row.label,
    category: row.category,
    storage_path: row.storage_path,
    file_name: row.file_name,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    note: row.note,
    created_at: row.created_at,
  }));

  const onboarding = (onboardingUploads.data ?? []).map((row) => ({
    id: row.id,
    source: 'onboarding_upload' as const,
    bucket: 'onboarding-uploads' as const,
    label: trackerLabelById.get(row.tracker_id) ?? 'Onboarding',
    category: inferCategory(row.mime_type),
    storage_path: row.storage_path,
    file_name: row.filename,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    note: row.note,
    created_at: row.created_at,
  }));

  const merged = [...assets, ...onboarding].sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1,
  );

  return NextResponse.json({ assets: merged });
}

/**
 * POST — multipart upload. Accepts `file`, optional `label`, `category`,
 * `note`. Writes to `brand-assets` bucket + inserts `client_brand_assets` row.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await requireAdmin(user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const client = await resolveClient(id);
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 500 MB)' }, { status: 413 });
  }

  const labelRaw = form.get('label');
  const label = typeof labelRaw === 'string' && labelRaw.trim() ? labelRaw.trim() : null;
  const noteRaw = form.get('note');
  const note = typeof noteRaw === 'string' && noteRaw.trim() ? noteRaw.trim() : null;
  const categoryRaw = form.get('category');
  const categoryParse = CategorySchema.safeParse(
    typeof categoryRaw === 'string' ? categoryRaw : inferCategory(file.type),
  );
  const category = categoryParse.success ? categoryParse.data : inferCategory(file.type);

  const admin = createAdminClient();
  const safeName = sanitizeFileName(file.name);
  const assetId = crypto.randomUUID();
  const storagePath = `${client.organization_id ?? 'no-org'}/${client.id}/${assetId}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await admin.storage
    .from('brand-assets')
    .upload(storagePath, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });

  if (uploadErr) {
    return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 });
  }

  const { data: row, error: insertErr } = await admin
    .from('client_brand_assets')
    .insert({
      id: assetId,
      client_id: client.id,
      label,
      category,
      storage_path: storagePath,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      note,
      uploaded_by: user.id,
    })
    .select('id, label, category, storage_path, file_name, mime_type, size_bytes, note, created_at')
    .single();

  if (insertErr || !row) {
    await admin.storage.from('brand-assets').remove([storagePath]);
    return NextResponse.json(
      { error: insertErr?.message ?? 'Failed to save asset' },
      { status: 500 },
    );
  }

  return NextResponse.json({ asset: row });
}
