import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPostingService } from '@/lib/posting';
import { getMux } from '@/lib/mux/client';
import { z } from 'zod';

const ConfirmUploadSchema = z.object({
  client_id: z.string().uuid(),
  filename: z.string(),
  public_url: z.string().url().nullable().optional(),
  file_size_bytes: z.number(),
  mime_type: z.string(),
  thumbnail_url: z.string().nullable().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  mux_upload_id: z.string().nullable().optional(),
  mux_asset_id: z.string().nullable().optional(),
  mux_playback_id: z.string().nullable().optional(),
});

/**
 * POST /api/scheduler/media
 *
 * Two-action endpoint for media uploads. With action='get-upload-url', returns a
 * presigned upload URL and public URL from Late. With action='confirm-upload', saves
 * the media record to scheduler_media after the client has uploaded directly to Late.
 *
 * @auth Required (any authenticated user)
 * @body action - 'get-upload-url' | 'confirm-upload' (required)
 * @body contentType - MIME type of the file (for get-upload-url)
 * @body filename - Original filename (for get-upload-url and confirm-upload)
 * @body client_id - Client UUID (for confirm-upload)
 * @body public_url - Late public URL of the uploaded file (for confirm-upload)
 * @body file_size_bytes - File size in bytes (for confirm-upload)
 * @body mime_type - MIME type (for confirm-upload)
 * @body thumbnail_url - Thumbnail URL (for confirm-upload, optional)
 * @returns {{ uploadUrl, publicUrl }} | SchedulerMedia record
 */
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
      const contentType: string = body.contentType ?? 'application/octet-stream';
      // Videos go to Mux. Mux gives us a permanent CDN URL plus 1080p
      // compression, both of which fix the IG-stalls-on-big-files class
      // of bug we saw with Zernio's temp CDN. Images stay on the Zernio
      // path — they're <1MB and never hit the temp-URL TTL window.
      if (contentType.startsWith('video/')) {
        const mux = getMux();
        const upload = await mux.video.uploads.create({
          cors_origin: '*',
          new_asset_settings: {
            playback_policies: ['public'],
            mp4_support: 'capped-1080p',
            video_quality: 'basic',
          },
        });
        return NextResponse.json({
          provider: 'mux',
          uploadUrl: upload.url,
          uploadId: upload.id,
        });
      }
      const service = getPostingService();
      const { uploadUrl, publicUrl } = await service.getMediaUploadUrl(contentType, body.filename);
      return NextResponse.json({ provider: 'zernio', uploadUrl, publicUrl });
    }

    if (action === 'confirm-upload') {
      const parsed = ConfirmUploadSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
      }
      const data = parsed.data;
      // Either path is acceptable: Mux uploads carry mux_upload_id (and
      // late_media_url stays null until the static_renditions webhook
      // stamps it), images carry public_url. Reject neither-given.
      if (!data.public_url && !data.mux_upload_id) {
        return NextResponse.json(
          { error: 'public_url or mux_upload_id required' },
          { status: 400 },
        );
      }
      const adminClient = createAdminClient();

      const { data: media, error: dbError } = await adminClient
        .from('scheduler_media')
        .insert({
          client_id: data.client_id,
          uploaded_by: user.id,
          filename: data.filename,
          storage_path: '',
          late_media_url: data.public_url ?? null,
          thumbnail_url: data.thumbnail_url ?? null,
          file_size_bytes: data.file_size_bytes,
          mime_type: data.mime_type,
          width: data.width ?? null,
          height: data.height ?? null,
          is_used: false,
          mux_upload_id: data.mux_upload_id ?? null,
          mux_asset_id: data.mux_asset_id ?? null,
          mux_playback_id: data.mux_playback_id ?? null,
          mux_status: data.mux_upload_id ? 'preparing' : null,
        })
        .select()
        .single();

      if (dbError) {
        console.error('DB insert error:', dbError);
        return NextResponse.json({ error: 'Failed to save media record' }, { status: 500 });
      }

      return NextResponse.json({ ...media, public_url: data.public_url ?? null });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('POST /api/scheduler/media error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/scheduler/media
 *
 * List scheduler media for a client, ordered by creation date descending. Optionally
 * filters to only show media not yet attached to any post.
 *
 * @auth Required (any authenticated user)
 * @query client_id - Client UUID to filter by (required)
 * @query unused - Pass 'true' to return only unused media (optional)
 * @returns {{ media: SchedulerMedia[] }}
 */
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
