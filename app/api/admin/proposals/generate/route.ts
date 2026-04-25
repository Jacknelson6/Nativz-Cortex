import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/revenue/auth';
import { randomSuffix, slugify } from '@/lib/proposals/slug';
import { sendProposal } from '@/lib/proposals/send';
import { publicProposalUrl } from '@/lib/proposals/public-url';
import { logLifecycleEvent } from '@/lib/lifecycle/state-machine';

export const dynamic = 'force-dynamic';
// Resend send + DB writes typically finish in <5s; keep headroom.
export const maxDuration = 30;

const bodySchema = z.object({
  template_id: z.string().uuid(),
  client_id: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1).max(200).optional(),
  signer_name: z.string().trim().min(1).max(200),
  signer_email: z.string().trim().email(),
  signer_title: z.string().trim().max(200).optional().nullable(),
  signer_legal_entity: z.string().trim().max(200).optional().nullable(),
  signer_address: z.string().trim().max(300).optional().nullable(),
  send_email: z.boolean().optional().default(true),
});

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin, userId } = auth;

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
  }
  const body = parsed.data;

  const { data: templateRow, error: tplErr } = await admin
    .from('proposal_templates')
    .select('id, agency, name, source_folder, active')
    .eq('id', body.template_id)
    .maybeSingle<{
      id: string;
      agency: 'anderson' | 'nativz';
      name: string;
      source_folder: string;
      active: boolean;
    }>();
  if (tplErr) return NextResponse.json({ error: tplErr.message }, { status: 500 });
  if (!templateRow || !templateRow.active) {
    return NextResponse.json({ error: 'Template not found or inactive' }, { status: 404 });
  }

  let clientTradeName: string | null = null;
  if (body.client_id) {
    const { data: client } = await admin
      .from('clients')
      .select('id, name, slug')
      .eq('id', body.client_id)
      .maybeSingle();
    if (client) {
      clientTradeName = (client.name as string | null) ?? null;
    }
  }

  const title =
    body.title?.trim() || `${templateRow.name}${clientTradeName ? ` — ${clientTradeName}` : ''}`;
  const slugBase =
    slugify(`${templateRow.name} ${clientTradeName ?? body.signer_name}`) || 'proposal';
  const slug = `${slugBase}-${randomSuffix(6)}`;

  // Self-host: the public URL is just /proposals/<slug> on the agency's
  // Cortex domain. No GitHub commit, no Cloudflare Pages deploy delay.
  const publicUrl = publicProposalUrl(templateRow.agency, slug);

  const { data: inserted, error: insertErr } = await admin
    .from('proposals')
    .insert({
      title,
      slug,
      client_id: body.client_id ?? null,
      signer_name: body.signer_name,
      signer_email: body.signer_email,
      signer_title: body.signer_title ?? null,
      signer_legal_entity: body.signer_legal_entity ?? null,
      signer_address: body.signer_address ?? null,
      status: 'sent',
      sent_at: new Date().toISOString(),
      published_at: new Date().toISOString(),
      template_id: templateRow.id,
      agency: templateRow.agency,
      external_url: publicUrl,
      external_repo: null,
      external_folder: null,
      created_by: userId,
    })
    .select('id, slug')
    .single();
  if (insertErr || !inserted) {
    return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 });
  }

  await admin.from('proposal_events').insert({
    proposal_id: inserted.id,
    type: 'published',
    metadata: { url: publicUrl, agency: templateRow.agency },
  });

  // Fire the branded email (only if requested). Lifecycle event fires only
  // when an email actually went out — publishing alone doesn't count as
  // "sent to the signer".
  let sendUrl: string | null = publicUrl;
  let sendError: string | null = null;
  if (body.send_email) {
    const sendResult = await sendProposal(inserted.id, { admin });
    if (!sendResult.ok) {
      sendError = sendResult.error;
    } else {
      sendUrl = sendResult.url;
      if (body.client_id) {
        await logLifecycleEvent(
          body.client_id,
          'proposal.sent',
          `Proposal sent: ${title}`,
          {
            metadata: { proposal_id: inserted.id, slug: inserted.slug, url: publicUrl },
            admin,
          },
        );
      }
    }
  }

  return NextResponse.json({
    ok: true,
    proposal_id: inserted.id,
    slug: inserted.slug,
    url: sendUrl,
    sent: body.send_email && !sendError,
    send_error: sendError,
  });
}
