import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateFileSignature } from '@/lib/security/validate-file-type';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB — product reference photos

/**
 * POST /api/clients/[id]/ad-creatives/wizard-product-image
 *
 * Upload a product reference image for the ad generation wizard (e.g. when scrape has no image).
 * Stores in `brand-assets` under `{clientId}/ad-wizard-products/`.
 *
 * @auth Required (admin)
 * @body multipart/form-data — field `file` (JPEG | PNG | WebP; max 5 MB)
 * @returns {{ url: string }} Public URL
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: clientId } = await params;

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { data: client } = await adminClient.from('clients').select('id').eq('id', clientId).single();
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Use JPEG, PNG, or WebP.' },
        { status: 400 },
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 5 MB.' },
        { status: 400 },
      );
    }

    const ext =
      file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const storagePath = `${clientId}/ad-wizard-products/${crypto.randomUUID()}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const { valid, detectedType } = validateFileSignature(arrayBuffer, ALLOWED_TYPES);
    if (!valid) {
      return NextResponse.json(
        {
          error: `File content does not match an allowed image type. Detected: ${detectedType ?? 'unknown'}`,
        },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await adminClient.storage
      .from('brand-assets')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('wizard-product-image upload:', uploadError);
      return NextResponse.json({ error: 'Upload failed. Try again.' }, { status: 500 });
    }

    const { data: publicUrl } = adminClient.storage.from('brand-assets').getPublicUrl(storagePath);

    return NextResponse.json({ url: publicUrl.publicUrl });
  } catch (error) {
    console.error('POST /api/clients/[id]/ad-creatives/wizard-product-image error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
