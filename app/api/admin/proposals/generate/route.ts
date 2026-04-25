import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/revenue/auth';
import { createProposalDraft } from '@/lib/proposals/create';

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

  const result = await createProposalDraft(
    {
      templateId: body.template_id,
      clientId: body.client_id ?? null,
      title: body.title ?? null,
      signerName: body.signer_name,
      signerEmail: body.signer_email,
      signerTitle: body.signer_title ?? null,
      signerLegalEntity: body.signer_legal_entity ?? null,
      signerAddress: body.signer_address ?? null,
      sendEmail: body.send_email,
      createdBy: userId,
    },
    admin,
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  }

  return NextResponse.json({
    ok: true,
    proposal_id: result.proposalId,
    slug: result.slug,
    url: result.url,
    sent: result.sent,
    send_error: result.sendError,
  });
}
