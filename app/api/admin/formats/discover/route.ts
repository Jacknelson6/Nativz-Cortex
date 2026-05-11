// VFF-03 T13: admin-only ad hoc per-brand discovery trigger.
// In-memory rate limit: 3 calls / 10 min / brand.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { discoverForBrand } from '@/lib/analytics/format-sourcing';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ADMIN_ROLES = ['admin', 'super_admin'];

const RequestSchema = z.object({
  client_id: z.string().uuid(),
  platforms: z
    .array(z.enum(['tiktok', 'instagram', 'youtube']))
    .min(1)
    .default(['tiktok', 'instagram', 'youtube']),
});

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 3;
const rateLog = new Map<string, number[]>();

function checkRate(clientId: string): boolean {
  const now = Date.now();
  const hits = (rateLog.get(clientId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_LIMIT) {
    rateLog.set(clientId, hits);
    return false;
  }
  hits.push(now);
  rateLog.set(clientId, hits);
  return true;
}

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const allowed =
    me &&
    (ADMIN_ROLES.includes((me as { role: string }).role) ||
      (me as { is_super_admin?: boolean }).is_super_admin);
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }
  const { client_id, platforms } = parsed.data;

  if (!checkRate(client_id)) {
    return NextResponse.json(
      { error: 'Rate limited (3 calls / 10 min / brand)' },
      { status: 429 },
    );
  }

  const { data: client } = await admin
    .from('clients')
    .select('id')
    .eq('id', client_id)
    .maybeSingle();
  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  const result = await discoverForBrand(client_id, { platforms });
  if (result.signal === 'budget_capped') {
    return NextResponse.json(result, { status: 429 });
  }
  if (result.signal === 'no_context') {
    return NextResponse.json(result, { status: 404 });
  }
  return NextResponse.json(result);
}
