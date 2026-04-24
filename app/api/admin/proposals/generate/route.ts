import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/revenue/auth';
import { randomSuffix, slugify } from '@/lib/proposals/slug';
import { publishProposal, savePublishedProposal, type ProposalTemplateRow } from '@/lib/proposals/publisher';
import { sendProposal } from '@/lib/proposals/send';
import { logLifecycleEvent } from '@/lib/lifecycle/state-machine';

export const dynamic = 'force-dynamic';
// GitHub writes + resend call can take a few seconds on first publish.
export const maxDuration = 60;

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
    .select('id, agency, name, source_repo, source_folder, public_base_url, active')
    .eq('id', body.template_id)
    .maybeSingle<ProposalTemplateRow & { active: boolean }>();
  if (tplErr) return NextResponse.json({ error: tplErr.message }, { status: 500 });
  if (!templateRow || !templateRow.active) {
    return NextResponse.json({ error: 'Template not found or inactive' }, { status: 404 });
  }

  let clientTradeName: string | null = null;
  let clientDomain: string | null = null;
  let clientSlug: string | null = null;
  if (body.client_id) {
    const { data: client } = await admin
      .from('clients')
      .select('id, name, slug, domain')
      .eq('id', body.client_id)
      .maybeSingle();
    if (client) {
      clientTradeName = (client.name as string | null) ?? null;
      clientDomain = (client.domain as string | null) ?? null;
      clientSlug = (client.slug as string | null) ?? null;
    }
  }

  const title =
    body.title?.trim() || `${templateRow.name}${clientTradeName ? ` — ${clientTradeName}` : ''}`;
  const slugBase =
    slugify(`${templateRow.name} ${clientTradeName ?? body.signer_name}`) || 'proposal';
  const slug = `${slugBase}-${randomSuffix(6)}`;
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
      status: 'draft',
      template_id: templateRow.id,
      agency: templateRow.agency,
      created_by: userId,
    })
    .select('id, slug')
    .single();
  if (insertErr || !inserted) {
    return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 });
  }

  const publishResult = await publishProposal({
    proposalId: inserted.id,
    template: {
      id: templateRow.id,
      agency: templateRow.agency,
      name: templateRow.name,
      source_repo: templateRow.source_repo,
      source_folder: templateRow.source_folder,
      public_base_url: templateRow.public_base_url,
    },
    signer: {
      name: body.signer_name,
      email: body.signer_email,
      title: body.signer_title ?? null,
    },
    client: {
      legalName: body.signer_legal_entity ?? null,
      tradeName: clientTradeName,
      address: body.signer_address ?? null,
      domain: clientDomain,
    },
    slugHint: clientSlug ?? body.signer_name,
  }).catch((err: unknown) => ({
    ok: false as const,
    error: err instanceof Error ? err.message : 'publishProposal threw',
  }));

  if (!publishResult.ok) {
    return NextResponse.json(
      { error: `Publish failed: ${publishResult.error}`, proposal_id: inserted.id, slug: inserted.slug },
      { status: 502 },
    );
  }

  await savePublishedProposal(admin, inserted.id, publishResult, templateRow.agency);
  await admin.from('proposal_events').insert({
    proposal_id: inserted.id,
    type: 'published',
    metadata: {
      repo: publishResult.repo,
      folder: publishResult.folder,
      url: publishResult.url,
      files_written: publishResult.filesWritten,
    },
  });

  // Lifecycle event fires only when the email actually goes out — publishing
  // alone is not "sent to the signer".
  let sendUrl: string | null = publishResult.url;
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
            metadata: { proposal_id: inserted.id, slug: inserted.slug, url: publishResult.url },
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
    repo: publishResult.repo,
    folder: publishResult.folder,
    sent: body.send_email && !sendError,
    send_error: sendError,
  });
}
