import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const querySchema = z.object({
  is_favorite: z.enum(['true', 'false']).optional(),
  aspect_ratio: z.string().optional(),
  batch_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

const patchSchema = z.object({
  creativeId: z.string().uuid(),
  is_favorite: z.boolean(),
});

const deleteSchema = z.object({
  creativeId: z.string().uuid(),
});

/**
 * GET /api/clients/[id]/ad-creatives
 *
 * List ad creatives for a client with pagination and filtering.
 *
 * @auth Required
 * @param id - Client UUID
 * @query is_favorite - Filter favorites
 * @query aspect_ratio - Filter by aspect ratio
 * @query batch_id - Filter by batch
 * @query page - Page number (default 1)
 * @query limit - Items per page (default 24, max 100)
 * @returns {{ creatives: AdCreative[], total: number, page: number, limit: number }}
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

    const { is_favorite, aspect_ratio, batch_id, page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    const admin = createAdminClient();

    let query = admin
      .from('ad_creatives')
      .select('*', { count: 'exact' })
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (is_favorite !== undefined) query = query.eq('is_favorite', is_favorite === 'true');
    if (aspect_ratio) query = query.eq('aspect_ratio', aspect_ratio);
    if (batch_id) query = query.eq('batch_id', batch_id);

    const { data: creatives, count, error } = await query;

    if (error) {
      console.error('GET /api/clients/[id]/ad-creatives error:', error);
      return NextResponse.json({ error: 'Failed to fetch creatives' }, { status: 500 });
    }

    return NextResponse.json({
      creatives: creatives ?? [],
      total: count ?? 0,
      page,
      limit,
    });
  } catch (error) {
    console.error('GET /api/clients/[id]/ad-creatives error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/clients/[id]/ad-creatives
 *
 * Toggle favorite status on an ad creative.
 *
 * @auth Required
 * @param id - Client UUID
 * @body creativeId - UUID of the creative to update
 * @body is_favorite - Boolean favorite status
 * @returns {{ creative: AdCreative }}
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: clientId } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: creative, error } = await admin
      .from('ad_creatives')
      .update({ is_favorite: parsed.data.is_favorite })
      .eq('id', parsed.data.creativeId)
      .eq('client_id', clientId)
      .select('*')
      .single();

    if (error || !creative) {
      return NextResponse.json({ error: 'Creative not found' }, { status: 404 });
    }

    return NextResponse.json({ creative });
  } catch (error) {
    console.error('PATCH /api/clients/[id]/ad-creatives error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/clients/[id]/ad-creatives
 *
 * Delete an ad creative and its storage file.
 *
 * @auth Required (admin)
 * @param id - Client UUID
 * @body creativeId - UUID of the creative to delete
 * @returns {{ success: true }}
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: clientId } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const admin = createAdminClient();

    // Fetch the creative to get the storage path before deleting
    const { data: creative, error: fetchErr } = await admin
      .from('ad_creatives')
      .select('id, image_url')
      .eq('id', parsed.data.creativeId)
      .eq('client_id', clientId)
      .single();

    if (fetchErr || !creative) {
      return NextResponse.json({ error: 'Creative not found' }, { status: 404 });
    }

    // Delete the storage file if it's in our bucket
    if (creative.image_url) {
      try {
        const url = new URL(creative.image_url);
        // Extract the storage path from the public URL
        // Format: .../storage/v1/object/public/ad-creatives/<path>
        const match = url.pathname.match(/\/storage\/v1\/object\/public\/ad-creatives\/(.+)/);
        if (match) {
          await admin.storage.from('ad-creatives').remove([match[1]]);
        }
      } catch {
        // Non-fatal: log but continue with DB deletion
        console.warn('Failed to delete storage file for creative:', creative.id);
      }
    }

    // Delete the DB record
    const { error: deleteErr } = await admin
      .from('ad_creatives')
      .delete()
      .eq('id', creative.id)
      .eq('client_id', clientId);

    if (deleteErr) {
      console.error('Failed to delete creative:', deleteErr);
      return NextResponse.json({ error: 'Failed to delete creative' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/clients/[id]/ad-creatives error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
