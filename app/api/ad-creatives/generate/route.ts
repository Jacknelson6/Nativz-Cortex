import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateReferenceDrivenAdBatch } from '@/lib/ad-creatives/monthly-gift-ads';
import { mapImageErrorToResponse } from '@/lib/ad-creatives/error-response';

export const maxDuration = 300;

const bodySchema = z.object({
  clientId: z.string().uuid(),
  prompt: z.string().min(3).max(4000),
  count: z.coerce.number().int().min(1).max(50).default(20),
  renderImages: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isAdmin =
    me?.is_super_admin === true ||
    me?.role === 'admin' ||
    me?.role === 'super_admin';
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await generateReferenceDrivenAdBatch({
      clientId: parsed.data.clientId,
      prompt: parsed.data.prompt,
      count: parsed.data.count,
      userId: user.id,
      userEmail: user.email ?? null,
      renderImages: parsed.data.renderImages ?? true,
      pipeline: 'chatgpt_image_chat',
    });

    return NextResponse.json({
      batchId: result.batchId,
      status: result.status,
      concepts: result.concepts,
      referenceAdsUsed: result.referenceAds.length,
    });
  } catch (err) {
    const mapped = mapImageErrorToResponse(err);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
