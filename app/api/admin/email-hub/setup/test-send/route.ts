import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api/require-admin';
import { sendUserEmail } from '@/lib/email/send-user-email';

export const maxDuration = 15;

const Schema = z.object({
  to: z.string().email(),
  agency: z.enum(['nativz', 'anderson']),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const brand = parsed.data.agency === 'anderson' ? 'Anderson Collaborative' : 'Nativz';
  const result = await sendUserEmail({
    to: parsed.data.to,
    subject: `[Test] Email Hub is wired up — ${brand}`,
    bodyMarkdown: `Hey {{user.first_name}},

This is a one-off test send from the **Email Hub** Setup tab, delivered via Resend on the ${brand} domain.

If you got this, from-address routing, webhooks, and the layout wrapper are all healthy.

– {{sender.name}}`,
    mergeContext: {
      recipient: { full_name: null, email: parsed.data.to },
      sender: {
        full_name: auth.adminRow.full_name,
        email: auth.adminRow.email,
      },
      client: { name: null },
    },
    agency: parsed.data.agency,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, resend_id: result.id });
}
