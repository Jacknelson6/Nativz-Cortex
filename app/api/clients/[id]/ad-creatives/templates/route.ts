import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateFileSignature } from '@/lib/security/validate-file-type';
import { extractAdPrompt } from '@/lib/ad-creatives/extract-prompt';
import { rateLimitByUser } from '@/lib/security/rate-limit';

export const maxDuration = 300;

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB for ad images

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  /** Ad wizard loads client library in one request (see ad-wizard.tsx limit=500). */
  limit: z.coerce.number().int().min(1).max(2000).default(24),
});

/**
 * GET /api/clients/[id]/ad-creatives/templates
 *
 * List custom ad prompt templates for a client.
 *
 * @auth Required
 * @param id - Client UUID
 * @query page - Page number (default 1)
 * @query limit - Items per page (default 24, max 2000)
 * @returns {{ templates: AdPromptTemplate[], total: number, page: number, limit: number }}
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: clientId } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = querySchema.safeParse(searchParams);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query parameters', details: parsed.error.flatten() }, { status: 400 });
    }

    const { page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    const admin = createAdminClient();
    const { data: templates, count, error } = await admin
      .from('ad_prompt_templates')
      .select('*', { count: 'exact' })
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('GET /api/clients/[id]/ad-creatives/templates error:', error);
      return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
    }

    return NextResponse.json({
      templates: templates ?? [],
      total: count ?? 0,
      page,
      limit,
    });
  } catch (error) {
    console.error('GET /api/clients/[id]/ad-creatives/templates error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/clients/[id]/ad-creatives/templates
 *
 * Upload a winning ad image and extract its prompt schema via AI vision.
 * The image is stored in Supabase Storage, then extractAdPrompt() analyzes it
 * in the background. The template record is created immediately with status 'extracting',
 * and updated once extraction completes.
 *
 * @auth Required (admin)
 * @param id - Client UUID
 * @body file - Image file (multipart/form-data; JPEG | PNG | WebP; max 10 MB)
 * @body name - Template name
 * @body ad_category - Ad category
 * @body tags - Comma-separated tag list (optional)
 * @returns {{ templateId: string, status: 'extracting' }}
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: clientId } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Rate limit: AI endpoint (vision analysis)
    const rl = rateLimitByUser(user.id, '/api/clients/ad-creatives/templates', 'ai');
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
          },
        },
      );
    }

    const admin = createAdminClient();

    // Verify client exists
    const { data: client } = await admin.from('clients').select('id').eq('id', clientId).single();
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

    const formData = await request.formData();
    const file = formData.get('file');
    const name = formData.get('name');
    const adCategory = formData.get('ad_category');
    const tagsRaw = formData.get('tags');

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Template name is required' }, { status: 400 });
    }
    if (!adCategory || typeof adCategory !== 'string') {
      return NextResponse.json({ error: 'Ad category is required' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Use JPEG, PNG, or WebP.' },
        { status: 400 },
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10 MB.' },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const { valid, detectedType } = validateFileSignature(arrayBuffer, ALLOWED_TYPES);
    if (!valid) {
      return NextResponse.json(
        { error: `File content does not match an allowed image type. Detected: ${detectedType ?? 'unknown'}` },
        { status: 400 },
      );
    }

    // Upload to storage
    const ext = file.name.split('.').pop() || 'png';
    const filename = `${clientId}/${crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadErr } = await admin.storage
      .from('ad-creatives')
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadErr) {
      console.error('Storage upload error:', uploadErr);
      return NextResponse.json({ error: 'Upload failed. Try again.' }, { status: 500 });
    }

    const { data: publicUrl } = admin.storage
      .from('ad-creatives')
      .getPublicUrl(filename);

    const tags = tagsRaw && typeof tagsRaw === 'string'
      ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

    // Create template record with empty prompt_schema (will be filled by extraction)
    const { data: template, error: insertErr } = await admin
      .from('ad_prompt_templates')
      .insert({
        client_id: clientId,
        name: name.trim(),
        reference_image_url: publicUrl.publicUrl,
        prompt_schema: {},
        aspect_ratio: '1:1', // Will be determined during extraction if needed
        ad_category: adCategory,
        tags,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (insertErr || !template) {
      console.error('Failed to create template:', insertErr);
      return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
    }

    // Run AI extraction in background
    after(async () => {
      try {
        const promptSchema = await extractAdPrompt(publicUrl.publicUrl);
        await admin
          .from('ad_prompt_templates')
          .update({ prompt_schema: promptSchema, updated_at: new Date().toISOString() })
          .eq('id', template.id);
      } catch (err) {
        console.error('Ad prompt extraction failed for template:', template.id, err);
        // Template remains with empty prompt_schema — user can retry or fill manually
      }
    });

    return NextResponse.json({ templateId: template.id, status: 'extracting' });
  } catch (error) {
    console.error('POST /api/clients/[id]/ad-creatives/templates error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
