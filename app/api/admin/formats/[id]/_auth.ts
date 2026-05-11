// VFF-09: shared admin-gate helper for the per-video action endpoints.
// Centralizes the supabase.auth.getUser() + role lookup + id uuid
// validation so save/pin/dismiss/use-in-content-lab routes stay thin.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const IdSchema = z.string().uuid();

type Role = { role: string; is_super_admin: boolean | null };

export type GateResult =
  | {
      ok: true;
      user_id: string;
      video_id: string;
      admin: ReturnType<typeof createAdminClient>;
    }
  | { ok: false; res: NextResponse };

export async function gateAdmin(rawId: string): Promise<GateResult> {
  const idParse = IdSchema.safeParse(rawId);
  if (!idParse.success) {
    return { ok: false, res: NextResponse.json({ error: 'Invalid id' }, { status: 400 }) };
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single<Role>();
  const isSuper = me?.role === 'super_admin' || me?.is_super_admin === true;
  const isAdmin = isSuper || me?.role === 'admin';
  if (!isAdmin) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { ok: true, user_id: user.id, video_id: idParse.data, admin };
}

export async function getOrCreateCollection(
  admin: ReturnType<typeof createAdminClient>,
  args: { client_id: string | null; created_by: string | null; name: string },
): Promise<string | null> {
  let q = admin.from('viral_collections').select('id').eq('name', args.name);
  q = args.client_id ? q.eq('client_id', args.client_id) : q.is('client_id', null);
  if (args.created_by) q = q.eq('created_by', args.created_by);
  const { data: existing } = await q.maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const { data: inserted, error } = await admin
    .from('viral_collections')
    .insert({
      client_id: args.client_id,
      created_by: args.created_by,
      name: args.name,
    })
    .select('id')
    .single();
  if (error || !inserted) return null;
  return (inserted as { id: string }).id;
}
