import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Shared admin gate for server actions. Returns `{ ok: true }` when the
 * caller is an admin / super-admin, else `{ ok: false, error }`. Keeps the
 * per-section action files (refresh-*, invalidate-*) tiny.
 */
export async function requireAdmin(): Promise<
  { ok: true } | { ok: false; error: 'unauthenticated' | 'forbidden' }
> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (me?.role !== 'admin' && !me?.is_super_admin) {
    return { ok: false, error: 'forbidden' };
  }
  return { ok: true };
}

/**
 * Route-handler variant. Returns either the resolved user on success, or
 * a `NextResponse` the caller can short-circuit on (401 or 403). Keeps
 * API-route files free of the getUser + role-check boilerplate.
 *
 * Usage:
 *   const gate = await requireAdminRoute();
 *   if (gate instanceof NextResponse) return gate;
 *   // gate.user is available here
 */
export async function requireAdminRoute(): Promise<
  { user: User; isSuperAdmin: boolean } | NextResponse
> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (me?.role !== 'admin' && !me?.is_super_admin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return { user, isSuperAdmin: Boolean(me?.is_super_admin) };
}

/**
 * Server-action variant of the super-admin gate. Use for accounting/payroll
 * server actions where only Jack/Cole/Trevor should be allowed in.
 */
export async function requireSuperAdmin(): Promise<
  { ok: true } | { ok: false; error: 'unauthenticated' | 'forbidden' }
> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('is_super_admin')
    .eq('id', user.id)
    .single();

  if (!me?.is_super_admin) return { ok: false, error: 'forbidden' };
  return { ok: true };
}

/**
 * Route-handler variant. Returns the user on success or a NextResponse the
 * caller can short-circuit on (401 or 403). Use this for accounting and
 * payroll API routes that hold sensitive financial data.
 */
export async function requireSuperAdminRoute(): Promise<
  { user: User } | NextResponse
> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('is_super_admin')
    .eq('id', user.id)
    .single();

  if (!me?.is_super_admin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return { user };
}
