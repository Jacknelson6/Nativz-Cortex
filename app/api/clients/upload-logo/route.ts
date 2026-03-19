import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateFileSignature } from '@/lib/security/validate-file-type';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

/**
 * POST /api/clients/upload-logo
 *
 * Upload a client logo image to Supabase Storage (client-logos bucket).
 * Accepts JPEG, PNG, or WebP images up to 2 MB. Returns the public URL.
 *
 * @auth Required (admin)
 * @body file - Image file (multipart/form-data; JPEG | PNG | WebP; max 2 MB)
 * @returns {{ url: string }} Public URL of the uploaded logo
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can upload logos
    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Use JPEG, PNG, or WebP.' },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 2 MB.' },
        { status: 400 }
      );
    }

    // Generate unique filename
    const ext = file.name.split('.').pop() || 'png';
    const filename = `${crypto.randomUUID()}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const { valid, detectedType } = validateFileSignature(arrayBuffer, ALLOWED_TYPES);
    if (!valid) {
      return NextResponse.json(
        { error: `File content does not match an allowed image type. Detected: ${detectedType ?? 'unknown'}` },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await adminClient.storage
      .from('client-logos')
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json({ error: 'Upload failed. Try again.' }, { status: 500 });
    }

    const { data: publicUrl } = adminClient.storage
      .from('client-logos')
      .getPublicUrl(filename);

    return NextResponse.json({ url: publicUrl.publicUrl });
  } catch (error) {
    console.error('POST /api/clients/upload-logo error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
