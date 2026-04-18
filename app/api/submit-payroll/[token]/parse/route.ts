/**
 * POST /api/submit-payroll/[token]/parse
 *
 * Public — token is the credential. Runs the same LLM parse as the
 * admin import but locks the payee to the token's team_member, so a
 * submitter can't accidentally (or intentionally) attribute entries to
 * someone else.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createOpenRouterRichCompletion } from '@/lib/ai/openrouter-rich';

export const maxDuration = 60;

const bodySchema = z.object({
  text: z.string().min(1).max(20_000),
});

interface LlmRow {
  entry_type?: string;
  client_name?: string | null;
  video_count?: number | string | null;
  rate_dollars?: number | string | null;
  amount_dollars?: number | string | null;
  description?: string | null;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const { data: tok } = await adminClient
    .from('payroll_submission_tokens')
    .select('id, team_member_id, period_id, default_entry_type, expires_at')
    .eq('token', token)
    .single();

  if (!tok) return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
  if (new Date(tok.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Link expired' }, { status: 410 });
  }

  const [{ data: member }, { data: clients }] = await Promise.all([
    adminClient
      .from('team_members')
      .select('id, full_name')
      .eq('id', tok.team_member_id)
      .single(),
    adminClient
      .from('clients')
      .select('id, name'),
  ]);

  const defaultType = (tok.default_entry_type ?? 'editing') as 'editing' | 'smm' | 'affiliate' | 'blogging';
  const clientNames = (clients ?? []).map((c) => c.name);
  const memberName = member?.full_name ?? 'You';

  const systemPrompt = `You parse payroll submissions for a video-production agency. The submitter is ${memberName}. Extract the line items they're claiming pay for.

Return exactly this JSON — no prose, no markdown fences:
{
  "rows": [
    {
      "entry_type": "editing" | "smm" | "affiliate" | "blogging",
      "client_name": "string | null — the client the work was for, or null",
      "video_count": number (0 if not applicable),
      "rate_dollars": number | null (per-unit rate, if stated),
      "amount_dollars": number (total dollars owed for this line),
      "description": "string | null — short note about the work"
    }
  ]
}

Rules:
- amount_dollars is REQUIRED. Compute amount = rate × count when needed.
- Use "${defaultType}" as entry_type when not specified.
- Skip header / sub-total / grand-total / blank rows.
- Known clients (prefer exact matches): ${clientNames.join(', ') || '(none)'}.
- If a client isn't on the list, return the name as-written.
- Strip "$" and commas from numbers.`;

  let completion;
  try {
    completion = await createOpenRouterRichCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: parsed.data.text },
      ],
      maxTokens: 4000,
      feature: 'accounting-submit-parse',
      temperature: 0.1,
      timeoutMs: 45_000,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[submit-payroll/parse] LLM call failed', message);
    return NextResponse.json({ error: `Parse failed: ${message}` }, { status: 502 });
  }

  const cleaned = completion.text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  let rows: LlmRow[] = [];
  try {
    const parsedJson = JSON.parse(cleaned);
    rows = Array.isArray(parsedJson.rows) ? parsedJson.rows : [];
  } catch {
    return NextResponse.json(
      { error: 'Could not parse the AI response. Try a cleaner paste.' },
      { status: 502 },
    );
  }

  const clientByName = new Map(
    (clients ?? []).map((c) => [c.name.trim().toLowerCase(), c.id]),
  );

  const proposals = rows.map((row) => {
    const clientName = (row.client_name ?? '').trim();
    const videoCount = toInt(row.video_count);
    const rateDollars = toNum(row.rate_dollars);
    let amountDollars = toNum(row.amount_dollars);
    if ((!amountDollars || amountDollars === 0) && rateDollars && videoCount) {
      amountDollars = rateDollars * videoCount;
    }
    const entryType = allowedType(row.entry_type, defaultType);
    const clientId = clientName ? clientByName.get(clientName.toLowerCase()) ?? null : null;

    return {
      entry_type: entryType,
      client_id: clientId,
      client_name_raw: clientName || null,
      video_count: videoCount,
      rate_cents: rateDollars ? Math.round(rateDollars * 100) : 0,
      amount_cents: amountDollars ? Math.round(amountDollars * 100) : 0,
      description: row.description?.trim() || null,
    };
  }).filter((p) => p.amount_cents > 0);

  return NextResponse.json({ proposals });
}

function toInt(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseInt(String(v).replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}
function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function allowedType(
  v: string | undefined,
  fallback: 'editing' | 'smm' | 'affiliate' | 'blogging',
): 'editing' | 'smm' | 'affiliate' | 'blogging' {
  const candidates: Array<'editing' | 'smm' | 'affiliate' | 'blogging'> = [
    'editing', 'smm', 'affiliate', 'blogging',
  ];
  const lowered = (v ?? '').toLowerCase();
  return candidates.find((c) => c === lowered) ?? fallback;
}
