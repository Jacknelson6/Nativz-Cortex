import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

const thumbnailSchema = z.object({
  candidates: z
    .array(
      z.object({
        timestampMs: z.number(),
        score: z.number(),
        reasons: z.array(z.string()),
        dataUrl: z.string(),
      })
    )
    .max(10),
  bestTimestampMs: z.number(),
  thumbnailDataUrl: z.string().refine((s) => s.startsWith('data:image/'), {
    message: 'Must be a data URL starting with data:image/',
  }),
});

/**
 * POST /api/analysis/items/[id]/thumbnail
 *
 * Upload a client-side selected thumbnail for a moodboard item. Accepts scored
 * thumbnail candidates from client-side processing along with the selected frame
 * as a data URL. Uploads the thumbnail to moodboard-thumbnails storage, stores
 * candidate metadata (without dataUrls), and updates thumbnail_url on the item.
 *
 * @auth Required (any authenticated user)
 * @param id - Moodboard item UUID
 * @body candidates - Array of up to 10 scored thumbnail candidates (timestampMs, score, reasons, dataUrl)
 * @body bestTimestampMs - Timestamp of the selected best thumbnail (ms)
 * @body thumbnailDataUrl - Base64 data URL (data:image/...) of the selected thumbnail
 * @returns {{ thumbnail_url: string }}
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = thumbnailSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { candidates, bestTimestampMs, thumbnailDataUrl } = parsed.data;
    const adminClient = createAdminClient();

    // Verify item exists
    const { data: item, error: fetchError } = await adminClient
      .from('moodboard_items')
      .select('id')
      .eq('id', id)
      .single();

    if (fetchError || !item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // Upload thumbnail to Supabase Storage
    const base64Data = thumbnailDataUrl.replace(
      /^data:image\/\w+;base64,/,
      ''
    );
    const buffer = Buffer.from(base64Data, 'base64');
    const filePath = `${id}-${bestTimestampMs}.jpg`;

    const { error: uploadError } = await adminClient.storage
      .from('moodboard-thumbnails')
      .upload(filePath, buffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      console.error('Thumbnail upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload thumbnail' },
        { status: 500 }
      );
    }

    const {
      data: { publicUrl },
    } = adminClient.storage.from('moodboard-thumbnails').getPublicUrl(filePath);

    // Store candidates (without dataUrl to save space) and update thumbnail
    const storedCandidates = candidates.map((c) => ({
      timestampMs: c.timestampMs,
      score: c.score,
      reasons: c.reasons,
    }));

    await adminClient
      .from('moodboard_items')
      .update({
        thumbnail_candidates: {
          candidates: storedCandidates,
          bestTimestampMs,
          selectedUrl: publicUrl,
        },
        thumbnail_url: publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    return NextResponse.json({ thumbnail_url: publicUrl });
  } catch (error) {
    console.error('POST /api/analysis/items/[id]/thumbnail error:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
