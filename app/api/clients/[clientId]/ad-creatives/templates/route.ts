import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { extractTemplateSchema } from '@/lib/ad-creatives/extract-template-schema';

export const dynamic = 'force-dynamic';

const BUCKET = 'ad-template-references';
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

const TEMPLATE_SELECT =
  'id, client_id, name, reference_image_url, prompt_schema, aspect_ratio, ad_category, tags, extraction_status, extraction_error, created_at, updated_at';

const uploadSchema = z.object({
  name: z.string().min(1).max(200),
  ad_category: z.string().min(1).max(64).default('promotional'),
  tags: z.string().max(500).optional(),
});

/**
 * GET /api/clients/[clientId]/ad-creatives/templates
 *
 * Lists the brand's pattern-library templates ordered newest-first.
 * The polling loop in ad-template-library.tsx hits this every 3s while
 * any row has extraction_status='pending', then stops once everything
 * has settled to 'ready' or 'failed'.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await ctx.params;
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const admin = createAdminClient();
  const limit = Math.min(
    Math.max(parseInt(new URL(req.url).searchParams.get('limit') ?? '500', 10) || 500, 1),
    1000,
  );

  const { data, error } = await admin
    .from('ad_prompt_templates')
    .select(TEMPLATE_SELECT)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ templates: data ?? [] });
}

/**
 * POST /api/clients/[clientId]/ad-creatives/templates
 *
 * Multipart upload of a reference screenshot. Writes the file to the
 * ad-template-references bucket, inserts the row with
 * extraction_status='pending', then schedules the Gemini extraction
 * via after() so the response returns in <500ms while the vision pass
 * runs in the background. The frontend polls GET above to flip the
 * card from "Extracting" to "Ready" (or surface the failed state).
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await ctx.params;
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

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
    return NextResponse.json({ error: 'File exceeds 10 MB' }, { status: 413 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: 'Unsupported file type. Use PNG, JPEG, or WebP.' },
      { status: 415 },
    );
  }

  const meta = uploadSchema.safeParse({
    name: form.get('name'),
    ad_category: form.get('ad_category') ?? undefined,
    tags: form.get('tags') ?? undefined,
  });
  if (!meta.success) {
    return NextResponse.json({ error: 'Invalid metadata' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: clientRow } = await admin
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .maybeSingle();
  if (!clientRow) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  // Path shape: <clientId>/<templateId>.<ext>. UUID in the path keeps
  // the storage layout sortable by brand and the filename free of
  // user-supplied characters.
  const templateId = randomUUID();
  const ext = extensionFor(file.name, file.type);
  const storagePath = `${clientId}/${templateId}${ext}`;

  const bytes = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, bytes, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    });
  if (uploadError) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadError.message}` },
      { status: 500 },
    );
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(storagePath);
  const referenceImageUrl = pub.publicUrl;

  const tags = meta.data.tags
    ? meta.data.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  const { data: inserted, error: insertError } = await admin
    .from('ad_prompt_templates')
    .insert({
      id: templateId,
      client_id: clientId,
      name: meta.data.name.trim(),
      reference_image_url: referenceImageUrl,
      prompt_schema: {},
      aspect_ratio: '1:1',
      ad_category: meta.data.ad_category,
      tags: tags.length > 0 ? tags : null,
      created_by: guard.userId,
      extraction_status: 'pending',
    })
    .select(TEMPLATE_SELECT)
    .single();

  if (insertError || !inserted) {
    await admin.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json(
      { error: `Insert failed: ${insertError?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  // Background extraction. after() runs this on Vercel after the response
  // flushes, inside the same Function instance — no separate queue needed
  // for a single image / 5-15s pass. Failures get persisted onto the row.
  after(async () => {
    await extractTemplateSchema(templateId);
  });

  return NextResponse.json(
    { templateId, status: 'pending', template: inserted },
    { status: 201 },
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requireAdmin(): Promise<
  { error: NextResponse; userId?: undefined } | { error: null; userId: string }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const admin = createAdminClient();
  const { data } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const ok =
    data?.is_super_admin === true ||
    data?.role === 'admin' ||
    data?.role === 'super_admin';
  if (!ok) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { error: null, userId: user.id };
}

function extensionFor(name: string, mime: string): string {
  const match = name.match(/\.([a-z0-9]{1,8})$/i);
  if (match) return match[0].toLowerCase();
  if (mime === 'image/png') return '.png';
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/webp') return '.webp';
  return '';
}
