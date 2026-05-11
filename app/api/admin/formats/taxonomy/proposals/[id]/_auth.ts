// Shared super-admin gate + proposal-load helper for the three action
// endpoints (approve / reject / merge). Kept inline under the route
// folder so it does not leak into the public lib/ API surface.

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type Role = { role: string; is_super_admin: boolean | null };

export interface ProposalRow {
  id: string;
  kind: 'hook_type' | 'structure' | 'archetype' | 'pacing';
  slug: string;
  display_name: string;
  proposed_description: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'merged';
}

export async function gateAndLoadProposal(id: string): Promise<
  | { kind: 'ok'; user_id: string; proposal: ProposalRow }
  | { kind: 'err'; res: ReturnType<typeof NextResponse.json> }
> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { kind: 'err', res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single<Role>();
  const isSuper = me?.role === 'super_admin' || me?.is_super_admin === true;
  if (!isSuper) {
    return { kind: 'err', res: NextResponse.json({ error: 'super_admin required' }, { status: 403 }) };
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return { kind: 'err', res: NextResponse.json({ error: 'Invalid id' }, { status: 400 }) };
  }
  const { data: proposal, error } = await admin
    .from('format_taxonomy_proposals')
    .select('id, kind, slug, display_name, proposed_description, status')
    .eq('id', id)
    .single<ProposalRow>();
  if (error || !proposal) {
    return { kind: 'err', res: NextResponse.json({ error: 'proposal not found' }, { status: 404 }) };
  }
  if (proposal.status !== 'pending') {
    return {
      kind: 'err',
      res: NextResponse.json({ error: `proposal already ${proposal.status}` }, { status: 409 }),
    };
  }
  return { kind: 'ok', user_id: user.id, proposal };
}
