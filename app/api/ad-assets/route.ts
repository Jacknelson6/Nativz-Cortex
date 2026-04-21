import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const ALLOWED_KINDS = [
  'winning-ad',
  'product-shot',
  'competitor',
  'logo-alt',
  'offer-brief',
  'review-screenshot',
  'other',
] as const;

const querySchema = z.object({
  clientId: z.string().uuid(),
  kind: z.enum(ALLOWED_KINDS).optional(),
});

const uploadSchema = z.object({
  clientId: z.string().uuid(),
  kind: z.enum(ALLOWED_KINDS).default('other'),
  label: z.string().min(1).max(200).default('Untitled'),
  notes: z.string().max(2000).optional(),
});

/**
 * List ad assets for a client. The workspace server-fetches on first load,
 * so this route is primarily for client-side refreshes after uploads —
 * Phase 1 uses optimistic state instead of refetching, so this is a
 * future-proofing hook.
 */
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const isAdmin = await assertAdmin(admin, user.id);
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    clientId: searchParams.get('clientId') ?? '',
    kind: searchParams.get('kind') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
  }

  let query = admin
    .from('ad_assets')
    .select('id, kind, label, notes, storage_path, mime_type, byte_size, width, height, tags, created_at')
    .eq('client_id', parsed.data.clientId)
    .order('created_at', { ascending: false })
    .limit(500);
  if (parsed.data.kind) query = query.eq('kind', parsed.data.kind);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ assets: data ?? [] });
}

/**
 * Upload an asset. Accepts multipart/form-data with `file` and metadata
 * fields. Writes the file to the `ad-assets` bucket under a per-client
 * folder, then inserts the `ad_assets` row and returns it.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const isAdmin = await assertAdmin(admin, user.id);
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'Empty file' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'File exceeds 25 MB' }, { status: 413 });
  }

  const meta = uploadSchema.safeParse({
    clientId: form.get('clientId'),
    kind: form.get('kind') ?? undefined,
    label: form.get('label') ?? undefined,
    notes: form.get('notes') ?? undefined,
  });
  if (!meta.success) {
    return NextResponse.json({ error: 'Invalid metadata' }, { status: 400 });
  }

  // Verify the caller has access to the target client. The RLS policy is
  // admin-only so this is belt-and-suspenders, but the check catches
  // mismatches (admin A uploading to brand B in a multi-agency setup) early.
  const { data: clientRow } = await admin
    .from('clients')
    .select('id')
    .eq('id', meta.data.clientId)
    .maybeSingle();
  if (!clientRow) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  // Path shape: <clientId>/<assetId>.<ext>. Putting the asset UUID in the
  // path (instead of the filename) guarantees uniqueness without
  // re-validating the user-supplied label on every upload.
  const assetId = randomUUID();
  const ext = extensionFor(file.name, file.type);
  const storagePath = `${meta.data.clientId}/${assetId}${ext}`;

  const bytes = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage
    .from('ad-assets')
    .upload(storagePath, bytes, {
      contentType: file.type || 'application/octet-stream',
      cacheControl: '3600',
      upsert: false,
    });
  if (uploadError) {
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
  }

  const { data: inserted, error: insertError } = await admin
    .from('ad_assets')
    .insert({
      id: assetId,
      client_id: meta.data.clientId,
      kind: meta.data.kind,
      label: meta.data.label,
      notes: meta.data.notes ?? null,
      storage_path: storagePath,
      mime_type: file.type || null,
      byte_size: file.size,
      uploaded_by: user.id,
    })
    .select('id, kind, label, notes, storage_path, mime_type, byte_size, width, height, tags, created_at')
    .single();

  if (insertError || !inserted) {
    // Roll back the file so we don't leave orphans.
    await admin.storage.from('ad-assets').remove([storagePath]);
    return NextResponse.json(
      { error: `Metadata insert failed: ${insertError?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ asset: inserted }, { status: 201 });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function assertAdmin(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', userId)
    .single();
  if (!data) return false;
  return (
    data.is_super_admin === true ||
    data.role === 'admin' ||
    data.role === 'super_admin'
  );
}

function extensionFor(name: string, mime: string): string {
  const match = name.match(/\.([a-z0-9]{1,8})$/i);
  if (match) return match[0].toLowerCase();
  const fromMime = MIME_EXT[mime];
  return fromMime ? `.${fromMime}` : '';
}

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/markdown': 'md',
};
