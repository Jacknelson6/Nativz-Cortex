import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  DEFAULT_REFERENCE_ADS_DRIVE_URL,
  syncReferenceAdsFromDrive,
} from '@/lib/ad-creatives/reference-ad-library';

export const maxDuration = 300;

const bodySchema = z.object({
  driveUrl: z.string().url().optional(),
  limit: z.number().int().min(1).max(500).optional(),
  analyze: z.boolean().optional(),
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

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await syncReferenceAdsFromDrive({
      userId: user.id,
      driveUrl: parsed.data.driveUrl ?? DEFAULT_REFERENCE_ADS_DRIVE_URL,
      limit: parsed.data.limit,
      analyze: parsed.data.analyze,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reference ad sync failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
