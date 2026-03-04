import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPostingService } from '@/lib/posting';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('client_id');
    const platform = searchParams.get('platform');

    if (!clientId || !platform) {
      return NextResponse.redirect(new URL('/admin/scheduler?error=missing_params', request.url));
    }

    // After OAuth, Late will have added the account. Fetch updated profiles and sync to our DB.
    const service = getPostingService();
    const profiles = await service.getConnectedProfiles();
    const adminClient = createAdminClient();

    // Upsert profiles for this client
    for (const profile of profiles) {
      await adminClient
        .from('social_profiles')
        .upsert({
          client_id: clientId,
          platform: profile.platform,
          platform_user_id: profile.platformUserId,
          username: profile.username,
          avatar_url: profile.avatarUrl,
          late_account_id: profile.id,
          is_active: profile.isActive,
        }, { onConflict: 'client_id,platform,platform_user_id' });
    }

    return NextResponse.redirect(new URL('/admin/scheduler?connected=true', request.url));
  } catch (error) {
    console.error('GET /api/scheduler/connect/callback error:', error);
    return NextResponse.redirect(new URL('/admin/scheduler?error=connection_failed', request.url));
  }
}
