import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Draft engine — pure pricing math that turns a draft's service_lines +
 * applied pricing rules into subtotal / total / deposit cents. Called
 * from every mutating tool / API so the preview iframe can render
 * straight from the row without recomputing.
 *
 * Pricing rules are applied in this order:
 *   1. Per-line rules of kind unit_price_override (replace per-unit)
 *   2. Per-line rules of kind pct (apply % off line subtotal)
 *   3. Per-line rules of kind flat_cents (subtract flat off line)
 *   4. Sum lines into subtotal
 *   5. Proposal-scoped rules in same order over subtotal
 *   6. Subtotal − discounts = total
 *   7. Deposit = 50% of total for one-off, or first-period charge
 *      (= total / 1) for subscription
 *
 * Each step writes the affecting rule_id into per-line / proposal-level
 * `applied_rule_ids` arrays so the preview can render "Discount: …" rows.
 */

export type ServiceLine = {
  id: string;
  service_id: string | null;
  service_slug_snapshot: string | null;
  name_snapshot: string;
  quantity: number;
  /** Per-unit price at insert time (post-override). Mutated by overrides. */
  unit_price_cents: number;
  billing_unit_snapshot: BillingUnit;
  applied_rule_ids: string[];
  /** Computed each pass; not persisted. */
  line_subtotal_cents?: number;
  line_total_cents?: number;
  note?: string;
};

export type CustomBlock = {
  id: string;
  kind: 'markdown' | 'image';
  content: string;        // markdown source OR image URL
  position: number;       // sort order
  caption?: string;       // for image kind
};

export type BillingUnit =
  | 'per_video'
  | 'per_post'
  | 'per_month'
  | 'per_year'
  | 'per_quarter'
  | 'flat'
  | 'per_hour'
  | 'per_unit';

export type PricingRule = {
  id: string;
  service_id: string | null;
  agency: 'anderson' | 'nativz';
  scope: 'service' | 'proposal';
  trigger_kind: 'min_quantity' | 'min_total_cents' | 'cadence' | 'manual';
  trigger_value: Record<string, unknown>;
  discount_kind: 'pct' | 'flat_cents' | 'unit_price_override';
  discount_value: Record<string, unknown>;
  label: string;
};

export type DraftRow = {
  id: string;
  agency: 'anderson' | 'nativz';
  service_lines: ServiceLine[];
  custom_blocks: CustomBlock[];
  payment_model: 'one_off' | 'subscription';
  cadence: 'week' | 'month' | 'quarter' | 'year' | null;
  subtotal_cents: number | null;
  total_cents: number | null;
  deposit_cents: number | null;
};

export type RecomputeResult = {
  subtotal_cents: number;
  total_cents: number;
  deposit_cents: number;
  service_lines: ServiceLine[];
  applied_proposal_rule_ids: string[];
};

type AdminClient = SupabaseClient;

/**
 * Recompute totals on a draft row in place. Called by every mutating
 * tool. Writes back subtotal/total/deposit + the updated service_lines
 * (with line subtotals + applied_rule_ids).
 */
export async function recomputeDraft(
  draft: DraftRow,
  admin: AdminClient = createAdminClient(),
): Promise<RecomputeResult> {
  const lines = draft.service_lines.slice();

  // Pull every rule that could possibly apply: rules attached to this
  // draft's service ids + proposal-scoped rules for this agency.
  const serviceIds = lines.map((l) => l.service_id).filter((id): id is string => !!id);
  const ruleQ = admin
    .from('proposal_pricing_rules')
    .select('id, service_id, agency, scope, trigger_kind, trigger_value, discount_kind, discount_value, label')
    .eq('agency', draft.agency)
    .eq('active', true);
  const { data: rulesData } = serviceIds.length
    ? await ruleQ.or(`service_id.in.(${serviceIds.join(',')}),scope.eq.proposal`)
    : await ruleQ.eq('scope', 'proposal');
  const rules = (rulesData ?? []) as PricingRule[];

  const rulesByService = new Map<string, PricingRule[]>();
  const proposalRules: PricingRule[] = [];
  for (const r of rules) {
    if (r.scope === 'service' && r.service_id) {
      const arr = rulesByService.get(r.service_id) ?? [];
      arr.push(r);
      rulesByService.set(r.service_id, arr);
    } else if (r.scope === 'proposal') {
      proposalRules.push(r);
    }
  }

  // Per-line passes.
  for (const line of lines) {
    line.applied_rule_ids = [];
    const lineRules = line.service_id ? rulesByService.get(line.service_id) ?? [] : [];

    // Sort: override > pct > flat. (Override changes the multiplier base.)
    const ordered = [...lineRules].sort((a, b) => orderRank(a) - orderRank(b));

    let unit = line.unit_price_cents;
    for (const r of ordered) {
      if (!triggers(r, { quantity: line.quantity })) continue;
      if (r.discount_kind === 'unit_price_override') {
        const v = (r.discount_value as { new_unit_cents?: number }).new_unit_cents ?? unit;
        unit = v;
        line.unit_price_cents = unit;
        line.applied_rule_ids.push(r.id);
      }
    }
    let subtotal = unit * line.quantity;
    line.line_subtotal_cents = subtotal;

    for (const r of ordered) {
      if (r.discount_kind === 'unit_price_override') continue;
      if (!triggers(r, { quantity: line.quantity })) continue;
      if (r.discount_kind === 'pct') {
        const pct = (r.discount_value as { pct?: number }).pct ?? 0;
        subtotal = Math.max(0, Math.round(subtotal * (1 - pct / 100)));
        line.applied_rule_ids.push(r.id);
      } else if (r.discount_kind === 'flat_cents') {
        const cents = (r.discount_value as { cents?: number }).cents ?? 0;
        subtotal = Math.max(0, subtotal - cents);
        line.applied_rule_ids.push(r.id);
      }
    }
    line.line_total_cents = subtotal;
  }

  let subtotalCents = lines.reduce((sum, l) => sum + (l.line_total_cents ?? 0), 0);
  const appliedProposalRuleIds: string[] = [];

  // Proposal-scope passes.
  const proposalOrdered = [...proposalRules].sort((a, b) => orderRank(a) - orderRank(b));
  for (const r of proposalOrdered) {
    const ctx = {
      quantity: 0,
      total_cents: subtotalCents,
      cadence: draft.cadence,
      payment_model: draft.payment_model,
    };
    if (!triggers(r, ctx)) continue;
    if (r.discount_kind === 'unit_price_override') continue; // not meaningful at proposal scope
    if (r.discount_kind === 'pct') {
      const pct = (r.discount_value as { pct?: number }).pct ?? 0;
      subtotalCents = Math.max(0, Math.round(subtotalCents * (1 - pct / 100)));
      appliedProposalRuleIds.push(r.id);
    } else if (r.discount_kind === 'flat_cents') {
      const cents = (r.discount_value as { cents?: number }).cents ?? 0;
      subtotalCents = Math.max(0, subtotalCents - cents);
      appliedProposalRuleIds.push(r.id);
    }
  }

  const totalCents = subtotalCents;
  // Deposit: 50% on one-off, first-period charge on subscription
  // (= per-period rate, which is total because subscription totals are
  // already per-period in the line definition).
  const depositCents = draft.payment_model === 'subscription'
    ? totalCents
    : Math.round(totalCents * 0.5);

  return {
    subtotal_cents: lines.reduce((sum, l) => sum + (l.line_subtotal_cents ?? 0), 0),
    total_cents: totalCents,
    deposit_cents: depositCents,
    service_lines: lines,
    applied_proposal_rule_ids: appliedProposalRuleIds,
  };
}

function orderRank(r: PricingRule): number {
  switch (r.discount_kind) {
    case 'unit_price_override': return 0;
    case 'pct': return 1;
    case 'flat_cents': return 2;
  }
}

function triggers(r: PricingRule, ctx: { quantity?: number; total_cents?: number; cadence?: string | null; payment_model?: string }): boolean {
  switch (r.trigger_kind) {
    case 'min_quantity': {
      const q = (r.trigger_value as { quantity?: number }).quantity ?? 0;
      return (ctx.quantity ?? 0) >= q;
    }
    case 'min_total_cents': {
      const c = (r.trigger_value as { cents?: number }).cents ?? 0;
      return (ctx.total_cents ?? 0) >= c;
    }
    case 'cadence': {
      const wanted = (r.trigger_value as { cadence?: string }).cadence;
      if (!wanted) return false;
      // 'annual' rule fires if subscription cadence is 'year' or one_off
      // payment_model with cadence='year' isn't a thing — stick to subscription.
      if (wanted === 'annual') return ctx.cadence === 'year';
      if (wanted === 'monthly') return ctx.cadence === 'month';
      return ctx.cadence === wanted;
    }
    case 'manual':
      // Manual rules are applied by writing the rule id into a line's
      // applied_rule_ids list directly. The recomputer doesn't fire them
      // automatically — but if they're already in the list, the trigger
      // returns false here and they won't double-apply.
      return false;
  }
}

/**
 * Convenience: load a draft, recompute, write back. Called from API
 * routes after every mutation.
 */
export async function persistRecomputedDraft(
  draftId: string,
  admin: AdminClient = createAdminClient(),
): Promise<{ ok: true; draft: DraftRow } | { ok: false; error: string }> {
  const { data: draft, error } = await admin
    .from('proposal_drafts')
    .select('*')
    .eq('id', draftId)
    .maybeSingle();
  if (error || !draft) return { ok: false, error: error?.message ?? 'draft not found' };

  const r = await recomputeDraft(draft as DraftRow, admin);
  const { error: updErr, data: updated } = await admin
    .from('proposal_drafts')
    .update({
      service_lines: r.service_lines,
      subtotal_cents: r.subtotal_cents,
      total_cents: r.total_cents,
      deposit_cents: r.deposit_cents,
    })
    .eq('id', draftId)
    .select('*')
    .single();
  if (updErr || !updated) return { ok: false, error: updErr?.message ?? 'update failed' };
  return { ok: true, draft: updated as DraftRow };
}
