import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createFlowForClient } from '@/lib/onboarding/flows';
import { randomSuffix, slugify } from '@/lib/proposals/slug';

const BodySchema = z.object({
  name: z.string().min(2).max(200),
  agency: z.enum(['anderson', 'nativz']).optional(),
  signerName: z.string().min(2).max(200).optional(),
  signerEmail: z.string().email().optional(),
});

/**
 * POST /api/sales/prospects — admin spawns a thin `clients` row for a
 * brand-new prospect AND immediately creates a `needs_proposal` flow so
 * the admin lands on the flow detail page with everything pre-wired.
 *
 * Idempotent on (name, signer_email) — re-submitting the same prospect
 * returns the existing client + flow rather than creating dupes. The
 * caller redirects to /admin/onboarding/[flowId] on success.
 *
 * This sidesteps the auto-create-on-proposal path in `createProposalDraft`
 * for admins who want the brand wired up before generating a proposal.
 * The proposal step itself is unchanged — once attached, the existing
 * sign endpoint links it back to the flow as before.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'bad body' },
      { status: 400 },
    );
  }

  const name = parsed.data.name.trim();
  const agency = parsed.data.agency ?? null;
  const signerEmail = parsed.data.signerEmail?.trim().toLowerCase() ?? null;

  // De-dupe — prefer matching by signer email contact if provided, then
  // by exact-name (case-insensitive). If we find a hit, just (re)use that
  // clients row so the admin doesn't accidentally fork the same brand.
  let clientId: string | null = null;
  if (signerEmail) {
    const { data: byContact } = await admin
      .from('client_contacts')
      .select('client_id')
      .ilike('email', signerEmail)
      .limit(1)
      .maybeSingle();
    if (byContact?.client_id) clientId = byContact.client_id as string;
  }
  if (!clientId) {
    const { data: byName } = await admin
      .from('clients')
      .select('id')
      .ilike('name', name)
      .limit(1)
      .maybeSingle();
    if (byName?.id) clientId = byName.id as string;
  }

  if (!clientId) {
    const slugBase = slugify(name) || 'lead';
    const slug = `${slugBase}-${randomSuffix(6)}`;
    const { data: created, error: createErr } = await admin
      .from('clients')
      .insert({
        name,
        slug,
        agency,
        lifecycle_state: 'lead',
        hide_from_roster: false,
      })
      .select('id')
      .single();
    if (createErr || !created) {
      console.error('[sales:prospects] create client failed', createErr);
      return NextResponse.json(
        { error: createErr?.message ?? 'failed to create client' },
        { status: 500 },
      );
    }
    clientId = created.id as string;

    // If the admin gave us a signer, persist them as the primary contact
    // so the proposal generator + flow detail can prefill from it later.
    if (parsed.data.signerName && signerEmail) {
      await admin.from('client_contacts').insert({
        client_id: clientId,
        name: parsed.data.signerName,
        email: signerEmail,
        is_primary: true,
        role: 'signer',
      });
    }
  }

  const flowResult = await createFlowForClient({
    clientId,
    createdBy: user.id,
    admin,
  });
  if (!flowResult.ok) {
    return NextResponse.json({ error: flowResult.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    clientId,
    flowId: flowResult.flow.id,
    existing: flowResult.existing,
  });
}
