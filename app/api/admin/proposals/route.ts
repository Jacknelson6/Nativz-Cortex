import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/revenue/auth';
import { randomSuffix, slugify } from '@/lib/proposals/slug';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  title: z.string().min(1).max(200),
  client_id: z.string().uuid().optional().nullable(),
  signer_name: z.string().max(200).optional().nullable(),
  signer_email: z.string().email().optional().nullable(),
  signer_title: z.string().max(200).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin, userId } = auth;

  const raw = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const base = slugify(parsed.data.title) || 'proposal';
  const slug = `${base}-${randomSuffix(6)}`;

  const { data, error } = await admin
    .from('proposals')
    .insert({
      title: parsed.data.title,
      slug,
      client_id: parsed.data.client_id ?? null,
      signer_name: parsed.data.signer_name ?? null,
      signer_email: parsed.data.signer_email ?? null,
      signer_title: parsed.data.signer_title ?? null,
      status: 'draft',
      body_markdown: defaultBody(),
      terms_markdown: defaultTerms(),
      created_by: userId,
    })
    .select('id, slug')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id, slug: data.slug });
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin } = auth;

  const status = req.nextUrl.searchParams.get('status');
  let q = admin
    .from('proposals')
    .select(
      'id, slug, title, status, total_cents, currency, sent_at, signed_at, paid_at, expires_at, client_id, clients(name, slug)',
    )
    .order('created_at', { ascending: false })
    .limit(200);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ proposals: data ?? [] });
}

function defaultBody(): string {
  return [
    '## Summary',
    '',
    'Short project summary goes here — what we\'re doing and why it matters.',
    '',
    '## Scope',
    '',
    '- Deliverable 1',
    '- Deliverable 2',
    '- Deliverable 3',
  ].join('\n');
}

function defaultTerms(): string {
  return [
    '## Terms',
    '',
    '- **Payment:** Deposit invoiced upon signature. Monthly retainer billed on the 1st.',
    '- **Term:** Month-to-month unless otherwise specified.',
    '- **Cancellation:** 30-day written notice.',
    '',
    'By signing below, both parties agree to the scope and terms above.',
  ].join('\n');
}
