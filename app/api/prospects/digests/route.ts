// SPY-10 T14: paginated approval-queue listing.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/require-admin';

export const dynamic = 'force-dynamic';

const Query = z.object({
  status: z.enum(['drafted', 'approved', 'sent', 'expired', 'rejected']).default('drafted'),
  assigned_to_me: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
});

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const parsed = Query.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Bad request', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { status, assigned_to_me, page, page_size } = parsed.data;

  const from = (page - 1) * page_size;
  const to = from + page_size - 1;

  let query = auth.admin
    .from('prospect_digest_drafts')
    .select('id, prospect_id, kind, subject, status, expires_at, created_at, sent_at, payload, prospects!inner(brand_name, owner_user_id)', {
      count: 'exact',
    })
    .eq('status', status)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (assigned_to_me) {
    query = query.eq('prospects.owner_user_id', auth.userId);
  }

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    drafts: data ?? [],
    count: count ?? 0,
    page,
    page_size,
  });
}
