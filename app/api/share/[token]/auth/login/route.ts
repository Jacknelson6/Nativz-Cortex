import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getShareContextOrNull,
  resolveBoundIdentity,
} from '@/lib/share/identity';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * PRD 04: agency-scoped modal login for share pages.
 *
 * Authenticates the visitor against Supabase, then verifies the resulting
 * user belongs to the share link's agency before letting the session
 * stand. Wrong-agency users are signed back out so we never leave a
 * half-bound session behind. The Supabase cookie is already set by the
 * time we return, so a successful response → page reload → server
 * resolution auto-binds the new session.
 */

const PasswordBody = z.object({
  mode: z.literal('password'),
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});
const MagicBody = z.object({
  mode: z.literal('magic'),
  email: z.string().email().max(200),
});
const Body = z.union([PasswordBody, MagicBody]);

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const context = await getShareContextOrNull(token);
  if (!context) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (context.archivedAt) {
    return NextResponse.json({ error: 'archived' }, { status: 410 });
  }
  if (context.expiresAt && new Date(context.expiresAt).getTime() < Date.now()) {
    return NextResponse.json({ error: 'expired' }, { status: 410 });
  }

  const supabase = await createServerSupabaseClient();

  if (parsed.data.mode === 'magic') {
    // Magic link round-trip. The callback hits `/c/[token]` with the
    // Supabase auth fragment; server resolution picks up the session and
    // performs the agency check on the next load. No need to verify here.
    const redirectPath =
      context.kind === 'editing' ? `/c/edit/${token}` : `/c/${token}`;
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data.email.trim(),
      options: {
        emailRedirectTo: `${getOrigin(req)}${redirectPath}`,
      },
    });
    if (error) {
      return NextResponse.json(
        { error: 'magic_link_failed', message: error.message },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, mode: 'magic_sent' });
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: parsed.data.email.trim(),
    password: parsed.data.password,
  });
  if (signInError) {
    return NextResponse.json(
      { error: 'invalid_credentials' },
      { status: 401 },
    );
  }

  // Cookie is now set. Re-run the agency check against the fresh session.
  const { identity } = await resolveBoundIdentity(context);
  if (!identity) {
    // Wrong agency — sign back out so we don't strand the visitor in a
    // half-bound state where Cortex sees them as logged in but the share
    // page refuses to render their identity. PRD 04 §"Error handling".
    await supabase.auth.signOut();
    return NextResponse.json(
      { error: 'wrong_agency' },
      { status: 403 },
    );
  }

  return NextResponse.json({
    ok: true,
    identity: {
      userId: identity.userId,
      displayName: identity.displayName,
      email: identity.email,
      role: identity.role,
    },
  });
}

export async function DELETE(_req: Request) {
  // "Switch" affordance: clear the Supabase session so the gateway shows
  // again on the next page load. Guest localStorage clearing is client-side.
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}

function getOrigin(req: Request): string {
  try {
    return new URL(req.url).origin;
  } catch {
    return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  }
}
