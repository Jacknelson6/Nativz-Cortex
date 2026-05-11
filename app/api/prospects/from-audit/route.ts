// SPY-01 T08: POST /api/prospects/from-audit
// Idempotent promotion of a brand_audit or prospect_audit row to a prospect.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/prospects/auth';
import { extractProspectFromAudit } from '@/lib/prospects/extract-from-audit';

export const dynamic = 'force-dynamic';

const RequestSchema = z.object({
  source: z.enum(['brand_audit', 'prospect_audit']),
  source_id: z.string().uuid(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }
  const { source, source_id } = parsed.data;

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { admin, userId } = auth;

  const dbSource = source === 'brand_audit' ? 'from_brand_audit' : 'from_prospect_audit';

  // idempotency check
  const { data: existing } = await admin
    .from('prospects')
    .select('id, brand_name, lifecycle_state')
    .eq('source', dbSource)
    .eq('source_ref_id', source_id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ prospect: existing }, { status: 409 });
  }

  // fetch source row
  const table = source === 'brand_audit' ? 'brand_audits' : 'prospect_audits';
  const columns =
    source === 'brand_audit'
      ? 'id, brand_name, category'
      : 'id, tiktok_url, website_url, social_urls, prospect_data';
  const { data: sourceRow, error: srcErr } = await admin
    .from(table)
    .select(columns)
    .eq('id', source_id)
    .maybeSingle();
  if (srcErr || !sourceRow) {
    return NextResponse.json({ error: 'Source audit not found' }, { status: 404 });
  }

  // Type assertion via unknown — runtime shape verified by extractor's null guards.
  const extracted = extractProspectFromAudit({
    source,
    sourceRow: sourceRow as unknown as Parameters<typeof extractProspectFromAudit>[0]['sourceRow'],
  });

  const { data: inserted, error: insErr } = await admin
    .from('prospects')
    .insert({
      ...extracted.prospect,
      lifecycle_state: 'audited',
      created_by: userId,
      owner_user_id: userId,
    })
    .select('*')
    .single();

  if (insErr || !inserted) {
    return NextResponse.json({ error: insErr?.message ?? 'Insert failed' }, { status: 500 });
  }

  const prospectId = (inserted as { id: string }).id;

  if (extracted.socials.length > 0) {
    await admin
      .from('prospect_socials')
      .insert(extracted.socials.map((s) => ({ ...s, prospect_id: prospectId })));
  }

  await admin.from('prospect_touchpoints').insert({
    prospect_id: prospectId,
    kind: 'state_change',
    body: 'Saved from audit',
    metadata: { source, source_id, to_state: 'audited' },
    created_by: userId,
  });

  return NextResponse.json({ prospect: inserted }, { status: 200 });
}
