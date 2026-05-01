import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPostingService } from '@/lib/posting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DELETE /api/public/connection-invites/[token]/disconnect/[platform]
 *
 * Public endpoint for the self-serve invite page so a client can remove
 * a wrong account they accidentally connected (e.g. linked their personal
 * Instagram instead of the brand Instagram).
 *
 * Scoped tightly so the token is the only authority:
 *   1. Token must resolve to a valid, non-expired invite.
 *   2. Platform must be in `invite.platforms` (asked-for list).
 *   3. Platform must be in `invite.completed_platforms` (so a guesser
 *      can't disconnect a profile that wasn't connected via this invite).
 *   4. Disconnects the matching `social_profiles` row for the invite's
 *      `client_id` + platform via the Late API, clears tokens, marks
 *      `is_active=false` so it stops being eligible for posting.
 *   5. Strips the platform from `completed_platforms` and clears
 *      `completed_at` so the invite page flips back to "Connect" and the
 *      OAuth callback can re-mark it on a fresh attempt.
 */

const ZernioPlatform = z.enum(['tiktok', 'instagram', 'facebook', 'youtube']);

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ token: string; platform: string }> },
) {
  try {
    const { token, platform: rawPlatform } = await ctx.params;
    if (!token || token.length > 64) {
      return NextResponse.json({ error: 'invalid token' }, { status: 404 });
    }

    const platformParse = ZernioPlatform.safeParse(rawPlatform);
    if (!platformParse.success) {
      return NextResponse.json(
        { error: 'unsupported platform' },
        { status: 400 },
      );
    }
    const platform = platformParse.data;

    const admin = createAdminClient();
    const { data: invite } = await admin
      .from('connection_invites')
      .select(
        'id, client_id, platforms, completed_platforms, completed_at, expires_at',
      )
      .eq('token', token)
      .maybeSingle();
    if (!invite) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    if (
      invite.expires_at &&
      new Date(invite.expires_at as string).getTime() < Date.now()
    ) {
      return NextResponse.json({ error: 'expired' }, { status: 410 });
    }

    const askedFor = (invite.platforms as string[]) ?? [];
    if (!askedFor.includes(platform)) {
      return NextResponse.json(
        { error: 'platform not in invite' },
        { status: 400 },
      );
    }
    const completed = new Set<string>(
      (invite.completed_platforms as string[]) ?? [],
    );
    if (!completed.has(platform)) {
      // Nothing to disconnect via this invite. Treat as a no-op success
      // so the UI can resync without surfacing a confusing error.
      return NextResponse.json({ success: true, alreadyDisconnected: true });
    }

    // Find the active profile for this client + platform. Multiple may
    // exist historically, only act on the connected one.
    const { data: profiles } = await admin
      .from('social_profiles')
      .select('id, late_account_id, is_active')
      .eq('client_id', invite.client_id as string)
      .eq('platform', platform);

    const target = (profiles ?? []).find(
      (p) => !!p.late_account_id && p.is_active !== false,
    );

    if (target?.late_account_id) {
      try {
        const service = getPostingService();
        await service.disconnectProfile(target.late_account_id as string);
      } catch (lateErr) {
        // Non-fatal: surface to logs so ops can clean up the Zernio side
        // manually if Late was already disconnected upstream.
        console.error(
          '[invite-disconnect] Late disconnect failed, continuing:',
          lateErr,
        );
      }
    }

    if (target?.id) {
      const { error: profileErr } = await admin
        .from('social_profiles')
        .update({
          is_active: false,
          access_token: null,
          refresh_token: null,
          page_access_token: null,
          late_account_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', target.id as string);
      if (profileErr) {
        return NextResponse.json(
          { error: 'failed to disconnect profile' },
          { status: 500 },
        );
      }
    }

    completed.delete(platform);
    const { error: inviteErr } = await admin
      .from('connection_invites')
      .update({
        completed_platforms: Array.from(completed),
        // Always blank `completed_at` on a disconnect: even if other
        // platforms remain green, the invite is no longer "complete" as
        // a unit, and the next reconnect of this same platform should
        // re-fire the notify hooks.
        completed_at: null,
      })
      .eq('id', invite.id as string);
    if (inviteErr) {
      return NextResponse.json(
        { error: 'failed to update invite' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(
      'DELETE /api/public/connection-invites/[token]/disconnect/[platform] error:',
      err,
    );
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'failed to disconnect' },
      { status: 500 },
    );
  }
}
