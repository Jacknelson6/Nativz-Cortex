import { NextResponse } from 'next/server';
import { resolveShareIdentity } from '@/lib/share/identity';

export const dynamic = 'force-dynamic';

/**
 * Gateway resolver for `/c/[token]` and `/c/edit/[token]`.
 *
 * Returns the decision matrix from PRD 02 §"Server resolution":
 *  - { state: 'auto_bound', identity } when the session matches the
 *    share link's agency. Both share pages bypass the gateway modal.
 *  - { state: 'gateway', sessionPresent, agencyMismatch } when the
 *    visitor must choose login / guest. Wrong-agency sessions surface
 *    as `agencyMismatch: true` so the modal can show "this account
 *    doesn't have access" copy without leaking the bound user back.
 *  - { state: 'expired' | 'archived' | 'not_found' } for terminal states.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const resolution = await resolveShareIdentity(token);

  if (resolution.state === 'not_found') {
    return NextResponse.json({ state: 'not_found' }, { status: 404 });
  }
  if (resolution.state === 'expired') {
    return NextResponse.json({ state: 'expired' }, { status: 410 });
  }
  if (resolution.state === 'archived') {
    return NextResponse.json({ state: 'archived' }, { status: 410 });
  }
  if (resolution.state === 'auto_bound') {
    return NextResponse.json({
      state: 'auto_bound',
      identity: {
        userId: resolution.identity.userId,
        displayName: resolution.identity.displayName,
        email: resolution.identity.email,
        role: resolution.identity.role,
      },
      shareKind: resolution.context.kind,
    });
  }
  return NextResponse.json({
    state: 'gateway',
    sessionPresent: resolution.sessionPresent,
    agencyMismatch: resolution.agencyMismatch,
    shareKind: resolution.context.kind,
    // Surfacing the agency string lets the modal render a generic
    // "agency-scoped login" hint without exposing the client's name.
    agencyAvailable: resolution.context.agency !== null,
  });
}
