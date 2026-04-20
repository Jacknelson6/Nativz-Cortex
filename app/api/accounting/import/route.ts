/**
 * POST /api/accounting/import
 *
 * Takes a chunk of unstructured text (pasted from a Google Sheet, Notion,
 * Slack, whatever) and asks an LLM to structure it into proposed payroll
 * entries. Does NOT save anything — the client uses the preview to
 * confirm + edit, then posts to /api/accounting/entries/bulk.
 *
 * Body:
 *   { period_id, text, default_entry_type? }
 *
 * Response:
 *   { proposals: ProposedEntry[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createOpenRouterRichCompletion } from '@/lib/ai/openrouter-rich';
import { selectPayrollTeamMembers } from '@/lib/accounting/team-directory';

export const maxDuration = 60;

const bodySchema = z.object({
  period_id: z.string().uuid(),
  text: z.string().min(1).max(20_000),
  default_entry_type: z.enum(['editing', 'smm', 'affiliate', 'blogging']).optional(),
});

interface LlmRow {
  entry_type?: string;
  payee_name?: string | null;
  client_name?: string | null;
  video_count?: number | string | null;
  rate_dollars?: number | string | null;
  amount_dollars?: number | string | null;
  description?: string | null;
}

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 as const };
  const adminClient = createAdminClient();
  const { data: userRow } = await adminClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (userRow?.role !== 'admin') return { error: 'Forbidden', status: 403 as const };
  return { user, adminClient };
}

export async function POST(request: NextRequest) {
  const ctx = await requireAdmin();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // Pull the directory of known payees + clients so we can feed the LLM a
  // closed list (it hallucinates names less when it has to pick from one).
  const [{ data: rawMembers }, { data: clients }] = await Promise.all([
    ctx.adminClient
      .from('team_members')
      .select('id, full_name, role, is_active, user_id, created_at')
      .eq('is_active', true),
    ctx.adminClient
      .from('clients')
      .select('id, name'),
  ]);

  const members = selectPayrollTeamMembers(rawMembers ?? []);
  const memberNames = members.map((m) => m.full_name);
  const clientNames = (clients ?? []).map((c) => c.name);

  const defaultType = parsed.data.default_entry_type ?? 'editing';

  const systemPrompt = `You parse pasted payroll data for a video-production agency. Extract line items from the text and return JSON.

Return exactly this shape — no prose, no markdown fences:
{
  "rows": [
    {
      "entry_type": "editing" | "smm" | "affiliate" | "blogging",
      "payee_name": "string — the person or freelancer the payout is going to",
      "client_name": "string | null — the client the work was for, or null",
      "video_count": number (0 if not applicable),
      "rate_dollars": number | null (per-unit rate, if stated),
      "amount_dollars": number (total dollars owed for this line),
      "description": "string | null — short note about the work"
    }
  ]
}

Rules:
- amount_dollars is REQUIRED. If only a rate and count are given, compute amount = rate × count.
- Use "${defaultType}" as entry_type when the text doesn't specify.
- Skip rows that look like headers, sub-totals, grand totals, or blank lines.
- Known team members (prefer exact matches): ${memberNames.join(', ') || '(none)'}.
- Known clients (prefer exact matches): ${clientNames.join(', ') || '(none)'}.
- If a payee / client isn't in the known list, return the name as-written anyway — the server will fall back to freeform labels.
- Numbers: strip "$" and commas before parsing; return plain numbers.`;

  let completion;
  try {
    completion = await createOpenRouterRichCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: parsed.data.text },
      ],
      maxTokens: 4000,
      feature: 'accounting-import',
      userId: ctx.user.id,
      temperature: 0.1,
      timeoutMs: 45_000,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[accounting/import] LLM call failed', message);
    return NextResponse.json({ error: `Parse failed: ${message}` }, { status: 502 });
  }

  // Extract the first JSON blob; sometimes the model wraps in markdown
  // fences despite the system prompt, so strip those.
  const cleaned = completion.text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  let llmRows: LlmRow[] = [];
  try {
    const parsedJson = JSON.parse(cleaned);
    llmRows = Array.isArray(parsedJson.rows) ? parsedJson.rows : [];
  } catch {
    return NextResponse.json(
      { error: 'Could not parse the AI response. Try pasting a cleaner sample.' },
      { status: 502 },
    );
  }

  const memberByName = new Map(
    members.map((m) => [normaliseName(m.full_name), m.id]),
  );
  const clientByName = new Map(
    (clients ?? []).map((c) => [normaliseName(c.name), c.id]),
  );

  const proposals = llmRows.map((row) => {
    const payeeName = (row.payee_name ?? '').trim();
    const clientName = (row.client_name ?? '').trim();
    const videoCount = toInt(row.video_count);
    const rateDollars = toNum(row.rate_dollars);
    let amountDollars = toNum(row.amount_dollars);
    if ((!amountDollars || amountDollars === 0) && rateDollars && videoCount) {
      amountDollars = rateDollars * videoCount;
    }
    const entryType = allowedType(row.entry_type, defaultType);

    const memberId = payeeName ? memberByName.get(normaliseName(payeeName)) ?? null : null;
    const clientId = clientName ? clientByName.get(normaliseName(clientName)) ?? null : null;

    return {
      entry_type: entryType,
      team_member_id: memberId,
      payee_label: memberId ? null : payeeName || null,
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

function normaliseName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
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
