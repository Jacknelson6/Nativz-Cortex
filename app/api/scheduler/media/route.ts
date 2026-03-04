import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPostingService } from '@/lib/posting';
import { z } from 'zod';

const ConfirmUploadSchema = z.object({
  client_id: z.string().uuid(),
  filename: z.string(),
  public_url: z.string().url(),
  file_size_bytes: z.number(),
  mime_type: z.string(),
});

// POST: Get presigned upload URL or confirm upload
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const action = body.action ?? 'get-upload-url';

    if (action === 'get-upload-url') {
      const service = getPostingService();
      const { uploadUrl, publicUrl } = await service.getMediaUploadUrl(body.contentType);
      return NextResponse.json({ uploadUrl, publicUrl });
    }

    if (action === 'confirm-upload') {
      const parsed = ConfirmUploadSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
      }
      const data = parsed.data;
      const adminClient = createAdminClient();

      const { data: media, error: dbError } = await adminClient
        .from('scheduler_media')
        .insert({
          client_id: data.client_id,
          uploaded_by: user.id,
          filename: data.filename,
          storage_path: '',
          late_media_url: data.public_url,
          thumbnail_url: null,
          file_size_bytes: data.file_size_bytes,
          mime_type: data.mime_type,
          is_used: false,
        })
        .select()
        .single();

      if (dbError) {
        console.error('DB insert error:', dbError);
        return NextResponse.json({ error: 'Failed to save media record' }, { status: 500 });
      }

      return NextResponse.json({ ...media, public_url: data.public_url });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('POST /api/scheduler/media error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET: List media for a client
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('client_id');
    const unusedOnly = searchParams.get('unused') === 'true';

    if (!clientId) {
      return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    let query = adminClient
      .from('scheduler_media')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (unusedOnly) {
      query = query.eq('is_used', false);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Media list error:', error);
      return NextResponse.json({ error: 'Failed to load media' }, { status: 500 });
    }

    return NextResponse.json({ media: data ?? [] });
  } catch (error) {
    console.error('GET /api/scheduler/media error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
