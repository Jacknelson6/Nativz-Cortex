import { NextRequest, NextResponse, after } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateFileSignature } from '@/lib/security/validate-file-type';
import { extractAdPrompt } from '@/lib/ad-creatives/extract-prompt';
import { rateLimitByUser } from '@/lib/security/rate-limit';

export const maxDuration = 300;

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB per file
const MAX_FILES = 50;

/**
 * POST /api/clients/[id]/ad-creatives/templates/bulk
 *
 * Bulk upload multiple ad images for prompt extraction.
 * Each image is uploaded to Supabase Storage and an ad_prompt_templates record
 * is created immediately. Gemini Vision extraction runs in the background via after().
 *
 * @auth Required (admin)
 * @param id - Client UUID
 * @body files - Multiple image files (multipart/form-data; JPEG | PNG | WebP; max 10 MB each; max 50 files)
 * @body ad_category - Ad category for all templates
 * @returns {{ templates: Array<{ id: string, name: string, status: string }>, failed: Array<{ name: string, error: string }> }}
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

    // Rate limit: AI endpoint (vision analysis for each file)
    const rl = rateLimitByUser(user.id, '/api/clients/ad-creatives/templates/bulk', 'ai');
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
    const adCategory = formData.get('ad_category');
    if (!adCategory || typeof adCategory !== 'string') {
      return NextResponse.json({ error: 'Ad category is required' }, { status: 400 });
    }

    // Collect all files from FormData
    const files: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (key === 'files' && value instanceof File) {
        files.push(value);
      }
    }

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Too many files. Maximum is ${MAX_FILES}.` },
        { status: 400 },
      );
    }

    const templates: { id: string; name: string; status: string }[] = [];
    const failed: { name: string; error: string }[] = [];
    const templateIdsForExtraction: { id: string; imageUrl: string }[] = [];

    // Process each file
    for (const file of files) {
      const fileName = file.name || 'unnamed';

      // Validate type
      if (!ALLOWED_TYPES.includes(file.type)) {
        failed.push({ name: fileName, error: 'Invalid file type. Use JPEG, PNG, or WebP.' });
        continue;
      }

      // Validate size
      if (file.size > MAX_SIZE) {
        failed.push({ name: fileName, error: 'File too large. Maximum size is 10 MB.' });
        continue;
      }

      // Validate magic bytes
      const arrayBuffer = await file.arrayBuffer();
      const { valid, detectedType } = validateFileSignature(arrayBuffer, ALLOWED_TYPES);
      if (!valid) {
        failed.push({
          name: fileName,
          error: `File content does not match an allowed image type. Detected: ${detectedType ?? 'unknown'}`,
        });
        continue;
      }

      // Upload to storage
      const ext = file.name.split('.').pop() || 'png';
      const storagePath = `${clientId}/${crypto.randomUUID()}.${ext}`;
      const buffer = Buffer.from(arrayBuffer);

      const { error: uploadErr } = await admin.storage
        .from('ad-creatives')
        .upload(storagePath, buffer, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadErr) {
        console.error('Bulk upload storage error:', uploadErr);
        failed.push({ name: fileName, error: 'Upload failed. Try again.' });
        continue;
      }

      const { data: publicUrl } = admin.storage
        .from('ad-creatives')
        .getPublicUrl(storagePath);

      // Generate a template name from the filename (strip extension)
      const templateName = fileName.replace(/\.\w+$/, '').replace(/[_-]/g, ' ').trim() || 'Imported ad';

      // Create template record with empty prompt_schema
      const { data: template, error: insertErr } = await admin
        .from('ad_prompt_templates')
        .insert({
          client_id: clientId,
          name: templateName,
          reference_image_url: publicUrl.publicUrl,
          prompt_schema: {},
          aspect_ratio: '1:1',
          ad_category: adCategory,
          tags: ['bulk_import'],
          created_by: user.id,
        })
        .select('id')
        .single();

      if (insertErr || !template) {
        console.error('Bulk upload insert error:', insertErr);
        failed.push({ name: fileName, error: 'Failed to create template record.' });
        continue;
      }

      templates.push({ id: template.id, name: templateName, status: 'extracting' });
      templateIdsForExtraction.push({ id: template.id, imageUrl: publicUrl.publicUrl });
    }

    // Run AI extraction in background for all successful uploads
    if (templateIdsForExtraction.length > 0) {
      after(async () => {
        // Process with concurrency limit of 3
        const concurrency = 3;
        const queue = [...templateIdsForExtraction];

        async function processNext() {
          const item = queue.shift();
          if (!item) return;

          try {
            const promptSchema = await extractAdPrompt(item.imageUrl);
            await admin
              .from('ad_prompt_templates')
              .update({ prompt_schema: promptSchema, updated_at: new Date().toISOString() })
              .eq('id', item.id);
          } catch (err) {
            console.error('Bulk extraction failed for template:', item.id, err);
          }

          // Process next item in queue
          await processNext();
        }

        // Start concurrent workers
        const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () =>
          processNext(),
        );
        await Promise.all(workers);
      });
    }

    return NextResponse.json({ templates, failed });
  } catch (error) {
    console.error('POST /api/clients/[id]/ad-creatives/templates/bulk error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
