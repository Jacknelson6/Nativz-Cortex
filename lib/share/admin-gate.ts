import { NextResponse } from 'next/server';
import {
  getShareContextOrNull,
  resolveBoundIdentity,
  type ShareLinkContext,
  type BoundIdentity,
} from '@/lib/share/identity';

/**
 * PRD 06 §"Server enforcement". Every share-scoped admin endpoint runs
 * the same four-step gate:
 *
 *   1. Resolve Supabase session.
 *   2. Resolve the share link, its client, and its agency.
 *   3. Verify the user is admin / super_admin in that agency.
 *   4. Reject anything else with 403.
 *
 * Returns either a 4xx NextResponse to short-circuit the handler, or
 * the bound identity + context for the caller to consume.
 */

export type AdminShareGate =
  | { ok: false; response: NextResponse }
  | { ok: true; context: ShareLinkContext; identity: BoundIdentity };

export async function requireAdminOnShare(token: string): Promise<AdminShareGate> {
  const context = await getShareContextOrNull(token);
  if (!context) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'not_found' }, { status: 404 }),
    };
  }
  if (context.archivedAt) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'revoked' }, { status: 410 }),
    };
  }
  if (context.expiresAt && new Date(context.expiresAt).getTime() < Date.now()) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'expired' }, { status: 410 }),
    };
  }

  const { identity, sessionPresent } = await resolveBoundIdentity(context);
  if (!identity) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: sessionPresent ? 'forbidden' : 'unauthorized' },
        { status: sessionPresent ? 403 : 401 },
      ),
    };
  }
  if (identity.role !== 'admin' && identity.role !== 'super_admin') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'admin only' }, { status: 403 }),
    };
  }

  return { ok: true, context, identity };
}
