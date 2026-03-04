import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getPostingService } from '@/lib/posting';
import { z } from 'zod';
import type { SocialPlatform } from '@/lib/posting/types';

const ConnectSchema = z.object({
  platform: z.enum(['facebook', 'instagram', 'tiktok', 'youtube']),
  client_id: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = ConnectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const service = getPostingService();
    const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/scheduler/connect/callback?client_id=${parsed.data.client_id}&platform=${parsed.data.platform}`;
    const result = await service.connectProfile({
      platform: parsed.data.platform as SocialPlatform,
      callbackUrl,
    });

    return NextResponse.json({ authUrl: result.authorizationUrl });
  } catch (error) {
    console.error('POST /api/scheduler/connect error:', error);
    return NextResponse.json({ error: 'Failed to start connection' }, { status: 500 });
  }
}
