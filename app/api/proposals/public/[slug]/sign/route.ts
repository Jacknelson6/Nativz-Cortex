import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { logLifecycleEvent } from '@/lib/lifecycle/state-machine';
import { checkRateLimit, ipFromRequest } from '@/lib/rate-limit/in-memory';
import { notifyAdmins } from '@/lib/lifecycle/notify';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  signer_name: z.string().min(2).max(200),
  signer_email: z.string().email(),
  signer_title: z.string().max(200).optional().nullable(),
  typed_signature: z.string().min(2).max(200),
  agree_terms: z.literal(true),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const ip = ipFromRequest(req.headers);
  const rl = checkRateLimit(`sign:${ip}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  const admin = createAdminClient();

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { data: proposal } = await admin
    .from('proposals')
    .select('id, client_id, status, signer_email, expires_at, stripe_payment_link_url, title')
    .eq('slug', slug)
    .maybeSingle();
  if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (['signed', 'paid'].includes(proposal.status)) {
    return NextResponse.json({ error: 'Already signed' }, { status: 400 });
  }
  if (!['sent', 'viewed'].includes(proposal.status)) {
    return NextResponse.json({ error: 'Proposal is not available for signing' }, { status: 400 });
  }
  if (proposal.expires_at && new Date(proposal.expires_at) < new Date()) {
    await admin.from('proposals').update({ status: 'expired' }).eq('id', proposal.id);
    return NextResponse.json({ error: 'Proposal expired' }, { status: 400 });
  }

  // Signer email must match the invited one (if admin set it at send time).
  // Stops random visitors with the URL from signing as someone else. Full
  // magic-link / OTP flow is a follow-up; this closes the "anyone can type
  // anything" gap without shipping new infra.
  if (
    proposal.signer_email &&
    proposal.signer_email.trim().toLowerCase() !==
      parsed.data.signer_email.trim().toLowerCase()
  ) {
    return NextResponse.json(
      { error: 'Email must match the invited signer. Reach out if you need this changed.' },
      { status: 400 },
    );
  }

  const ua = req.headers.get('user-agent') ?? null;

  await admin
    .from('proposals')
    .update({
      status: 'signed',
      signed_at: new Date().toISOString(),
      signer_name: parsed.data.signer_name,
      signer_email: parsed.data.signer_email,
      signer_title: parsed.data.signer_title ?? null,
      signature_method: 'typed',
      signature_image: parsed.data.typed_signature,
    })
    .eq('id', proposal.id);

  await admin.from('proposal_events').insert({
    proposal_id: proposal.id,
    type: 'signed',
    ip,
    user_agent: ua,
    metadata: { signer_email: parsed.data.signer_email },
  });

  if (proposal.client_id) {
    await admin
      .from('clients')
      .update({ lifecycle_state: 'contracted' })
      .eq('id', proposal.client_id)
      .eq('lifecycle_state', 'lead');

    await logLifecycleEvent(
      proposal.client_id,
      'proposal.signed',
      `Proposal signed: ${proposal.title}`,
      { metadata: { proposal_id: proposal.id, slug }, admin },
    );

    await admin
      .from('client_contracts')
      .upsert(
        {
          client_id: proposal.client_id,
          label: proposal.title,
          status: 'active',
          external_provider: 'cortex',
          external_id: proposal.id,
          external_url: `/proposals/${slug}`,
          signed_at: new Date().toISOString(),
        },
        { onConflict: 'external_id' },
      );
  }

  // Bonus fix: admin notification on sign. Previously admins had to watch
  // the Activity tab; the signed event is the single most important sales
  // signal, so fire a notification to every admin.
  await notifyAdmins(admin, 'contract_signed', `Proposal signed: ${proposal.title}`, {
    message: `${parsed.data.signer_name} signed "${proposal.title}". Deposit Payment Link ready.`,
  });

  return NextResponse.json({
    ok: true,
    paymentLinkUrl: proposal.stripe_payment_link_url,
  });
}
