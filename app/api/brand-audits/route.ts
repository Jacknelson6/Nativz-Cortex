import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runBrandAudit } from '@/lib/brand-audits/run';
import { DEFAULT_AUDIT_MODELS, DEFAULT_PROMPT_TEMPLATES } from '@/lib/brand-audits/types';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const ADMIN_ROLES = ['admin', 'super_admin'];

// Each cell is one LLM call + one classifier call; with parallelism the wall
// time is bounded by the slowest cell (~90s timeout). 24 cells leaves enough
// headroom to land inside Vercel's 300s function ceiling for typical runs.
const MAX_AUDIT_CELLS = 24;

const createSchema = z
  .object({
    brand_name: z.string().min(1).max(200),
    category: z.string().max(200).optional().nullable(),
    attached_client_id: z.string().uuid().optional().nullable(),
    prompts: z.array(z.string().min(4).max(2000)).max(10).optional(),
    models: z.array(z.string().min(2).max(120)).max(8).optional(),
  })
  .refine(
    (data) => {
      const promptCount = data.prompts?.length ?? DEFAULT_PROMPT_TEMPLATES.length;
      const modelCount = data.models?.length ?? DEFAULT_AUDIT_MODELS.length;
      return promptCount * modelCount <= MAX_AUDIT_CELLS;
    },
    {
      message: `Total cells (prompts × models) must be ${MAX_AUDIT_CELLS} or fewer`,
      path: ['prompts'],
    },
  );

/** POST /api/brand-audits — create a new audit row, run all model × prompt
 *  combos in parallel, persist the rollup. Returns the finished row id so
 *  the caller can navigate straight to /spying/self-audit/[id]. */
export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const { data: me } = await adminClient
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  if (!me || (!ADMIN_ROLES.includes(me.role) && !me.is_super_admin)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { brand_name, category, attached_client_id, prompts, models } = parsed.data;

  // Insert the row up front so the audit is referenceable even if the run
  // fails halfway through. Status flips to 'running' immediately, then to
  // 'completed' or 'failed' once we're done.
  const { data: created, error: insertErr } = await adminClient
    .from('brand_audits')
    .insert({
      brand_name,
      category: category ?? null,
      attached_client_id: attached_client_id ?? null,
      status: 'running',
      prompts: prompts ?? [],
      models: models ?? [...DEFAULT_AUDIT_MODELS],
      created_by: user.id,
    })
    .select('id')
    .single();

  if (insertErr || !created) {
    return NextResponse.json(
      { error: insertErr?.message || 'Failed to create audit row' },
      { status: 500 },
    );
  }

  const auditId = created.id;

  try {
    const result = await runBrandAudit({
      brandName: brand_name,
      category: category ?? null,
      prompts,
      models,
      userId: user.id,
      userEmail: user.email ?? undefined,
    });

    const { error: updateErr } = await adminClient
      .from('brand_audits')
      .update({
        status: 'completed',
        prompts: result.prompts,
        models: result.models,
        responses: result.responses,
        visibility_score: result.visibility_score,
        sentiment_score: result.sentiment_score,
        sentiment_breakdown: result.sentiment_breakdown,
        top_sources: result.top_sources,
        model_summary: result.model_summary,
        completed_at: new Date().toISOString(),
      })
      .eq('id', auditId);

    if (updateErr) {
      console.error('[brand-audits] update failed:', updateErr);
      return NextResponse.json(
        { id: auditId, warning: 'Run completed but persist failed: ' + updateErr.message },
        { status: 207 },
      );
    }

    return NextResponse.json({ id: auditId, status: 'completed' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await adminClient
      .from('brand_audits')
      .update({ status: 'failed', error_message: message, completed_at: new Date().toISOString() })
      .eq('id', auditId);
    return NextResponse.json({ id: auditId, error: message }, { status: 500 });
  }
}
