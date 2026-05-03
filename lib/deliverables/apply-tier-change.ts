/**
 * applyTierChange, idempotent tier assignment for a client.
 *
 * Single entry point for changing a client's `package_tier_id`. Used by:
 *   1. The Stripe webhook handler when `customer.subscription.updated` shows
 *      a price_id change (tier upgrade/downgrade).
 *   2. The admin tier picker (manual override or initial assignment).
 *
 * What it does:
 *   - Resolves the new tier's allotments per deliverable type.
 *   - For each (client, deliverable_type) row that already exists, computes
 *     the prorated delta from the old vs new monthly counts and writes a
 *     single `adjust` row (positive or negative) per type, scoped to the
 *     remaining days in the current period.
 *   - For deliverable types the new tier covers but the client doesn't yet
 *     have a balance row for, creates a fresh row with the new allowance
 *     and a prorated grant.
 *   - Rewrites `monthly_allowance` + `rollover_policy` on every affected
 *     row so the next monthly_reset cron picks up the new tier numbers.
 *   - Stamps `package_tier_id` on each (client, type) row.
 *   - Cleans up orphans on downgrade: balance rows whose deliverable_type
 *     isn't in the new tier's allotments get monthly_allowance = 0,
 *     auto_grant_enabled = false, package_tier_id = newTierId, and a
 *     prorated debit so the remainder of the period winds down to zero.
 *     Without this step the next monthly_reset cron would keep granting
 *     stale allowances under the old tier (e.g. ugc_video carrying after
 *     a Full Social → Studio downgrade).
 *
 * Idempotency:
 *   The webhook can fire multiple times for the same subscription update
 *   (Stripe retries, replays). We dedupe on the
 *   `(client_id, deliverable_type_id, idempotency_key)` shape: every adjust
 *   row carries `idempotency_key = `tier-change:${clientId}:${newTierId}:${periodStartedAt}``
 *   so re-running the helper inside the same period is a no-op.
 *
 * Half-up rounding:
 *   `(new_count - old_count) * (days_remaining / days_in_period)` is rounded
 *   half-up to the nearest integer per type. A 12-day-remaining of 30, with
 *   delta = +10, gives floor((10 * 12 / 30) + 0.5) = 4. Negative deltas
 *   round symmetrically (i.e. -10 with the same window gives -4).
 *
 * Returns a per-type summary the caller can use for the operator email.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface AppliedTierChangeRow {
  deliverableTypeId: string;
  deliverableTypeSlug: string;
  oldMonthlyCount: number | null;
  newMonthlyCount: number;
  proratedDelta: number;
  /** True when a fresh balance row was created for this type. */
  rowCreated: boolean;
  /** True when the adjust row was a no-op (idempotency-key match). */
  alreadyApplied: boolean;
}

export interface ApplyTierChangeResult {
  clientId: string;
  newTierId: string;
  newTierSlug: string;
  newTierDisplayName: string;
  rows: AppliedTierChangeRow[];
}

interface TierAllotment {
  deliverable_type_id: string;
  monthly_count: number;
  rollover_policy: 'none' | 'cap' | 'unlimited';
  rollover_cap: number | null;
}

interface BalanceRowSnapshot {
  deliverable_type_id: string;
  monthly_allowance: number;
  current_balance: number;
  package_tier_id: string | null;
  period_started_at: string;
  period_ends_at: string;
  next_reset_at: string;
}

interface DeliverableTypeRowLite {
  id: string;
  slug: string;
}

function halfUpRound(n: number): number {
  // Half-up across the sign: -2.5 → -3, +2.5 → +3.
  return Math.sign(n) * Math.floor(Math.abs(n) + 0.5);
}

/**
 * Compute the prorated delta given the day window. Edge cases:
 *   - days_in_period = 0 (shouldn't happen but defensive): treat as full delta
 *   - now > period_ends_at (period already ended): zero delta, the next
 *     monthly_reset will pick up the new allowance organically.
 */
function prorate(
  newCount: number,
  oldCount: number,
  periodStartedAt: Date,
  periodEndsAt: Date,
  now: Date,
): number {
  const daysInPeriod =
    (periodEndsAt.getTime() - periodStartedAt.getTime()) / (24 * 60 * 60 * 1000);
  const daysRemaining = (periodEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
  if (daysInPeriod <= 0) return newCount - oldCount;
  if (daysRemaining <= 0) return 0;
  const fraction = Math.min(1, daysRemaining / daysInPeriod);
  return halfUpRound((newCount - oldCount) * fraction);
}

export async function applyTierChange(
  admin: SupabaseClient,
  clientId: string,
  newTierId: string,
  options: { actorUserId?: string | null; now?: Date } = {},
): Promise<ApplyTierChangeResult> {
  const now = options.now ?? new Date();

  const [tierResult, allotResult, balancesResult, typesResult] = await Promise.all([
    admin
      .from('package_tiers')
      .select('id, slug, display_name, agency')
      .eq('id', newTierId)
      .single<{ id: string; slug: string; display_name: string; agency: string }>(),
    admin
      .from('package_tier_allotments')
      .select('deliverable_type_id, monthly_count, rollover_policy, rollover_cap')
      .eq('package_tier_id', newTierId)
      .returns<TierAllotment[]>(),
    admin
      .from('client_credit_balances')
      .select(
        'deliverable_type_id, monthly_allowance, current_balance, package_tier_id, period_started_at, period_ends_at, next_reset_at',
      )
      .eq('client_id', clientId)
      .returns<BalanceRowSnapshot[]>(),
    admin
      .from('deliverable_types')
      .select('id, slug')
      .returns<DeliverableTypeRowLite[]>(),
  ]);

  if (tierResult.error || !tierResult.data) {
    throw new Error(`Tier ${newTierId} not found: ${tierResult.error?.message ?? 'no row'}`);
  }
  const tier = tierResult.data;
  const allotments = allotResult.data ?? [];
  const balances = balancesResult.data ?? [];
  const types = typesResult.data ?? [];

  const slugById = new Map(types.map((t) => [t.id, t.slug]));
  const balanceByType = new Map(balances.map((b) => [b.deliverable_type_id, b]));

  // Fall back to the period-window of any existing balance row when the type
  // isn't yet covered. If the client has zero rows entirely, the new rows
  // open a 30-day window starting now (the monthly cron will keep it aligned
  // to the calendar from then on).
  const referencePeriod: { start: Date; end: Date; nextReset: Date } = (() => {
    const ref = balances[0];
    if (ref) {
      return {
        start: new Date(ref.period_started_at),
        end: new Date(ref.period_ends_at),
        nextReset: new Date(ref.next_reset_at),
      };
    }
    const start = new Date(now);
    const end = new Date(now);
    end.setMonth(end.getMonth() + 1);
    return { start, end, nextReset: end };
  })();

  const rows: AppliedTierChangeRow[] = [];

  for (const allot of allotments) {
    const slug = slugById.get(allot.deliverable_type_id) ?? 'unknown';
    const existing = balanceByType.get(allot.deliverable_type_id);
    const oldMonthlyCount = existing?.monthly_allowance ?? 0;
    const newMonthlyCount = allot.monthly_count;

    const proratedDelta = prorate(
      newMonthlyCount,
      oldMonthlyCount,
      existing ? new Date(existing.period_started_at) : referencePeriod.start,
      existing ? new Date(existing.period_ends_at) : referencePeriod.end,
      now,
    );

    const idempotencyKey = `tier-change:${clientId}:${newTierId}:${
      existing ? existing.period_started_at : referencePeriod.start.toISOString()
    }:${allot.deliverable_type_id}`;

    // Idempotency gate: if a prior tier-change adjust row exists for this
    // (client, tier, period, type), the change has already been applied.
    // Skip both the balance update and the ledger insert. The Postgres
    // unique index (migration 224) is the atomic safety net for the race
    // window; this SELECT short-circuits the common-case replay.
    if (proratedDelta !== 0) {
      const { data: priorRows } = await admin
        .from('credit_transactions')
        .select('id')
        .eq('idempotency_key', idempotencyKey)
        .limit(1);
      if (priorRows && priorRows.length > 0) {
        rows.push({
          deliverableTypeId: allot.deliverable_type_id,
          deliverableTypeSlug: slug,
          oldMonthlyCount: existing ? oldMonthlyCount : null,
          newMonthlyCount,
          proratedDelta,
          rowCreated: false,
          alreadyApplied: true,
        });
        continue;
      }
    }

    // Upsert the balance row first (sets the new tier id + allowance).
    if (existing) {
      const { error: updErr } = await admin
        .from('client_credit_balances')
        .update({
          package_tier_id: newTierId,
          monthly_allowance: newMonthlyCount,
          rollover_policy: allot.rollover_policy,
          rollover_cap: allot.rollover_cap,
          // Apply the prorated delta to current_balance. Negative deltas can
          // push the balance below zero - that's intentional: a downgrade
          // mid-period clawing back unused scope reads as a debt the next
          // month-reset will absorb (or surface in admin if persistent).
          current_balance: existing.current_balance + proratedDelta,
        })
        .eq('client_id', clientId)
        .eq('deliverable_type_id', allot.deliverable_type_id);
      if (updErr) throw new Error(`Balance update failed: ${updErr.message}`);
    } else {
      const { error: insErr } = await admin.from('client_credit_balances').insert({
        client_id: clientId,
        deliverable_type_id: allot.deliverable_type_id,
        package_tier_id: newTierId,
        monthly_allowance: newMonthlyCount,
        rollover_policy: allot.rollover_policy,
        rollover_cap: allot.rollover_cap,
        current_balance: proratedDelta > 0 ? proratedDelta : 0,
        opening_balance_at_period_start: 0,
        period_started_at: referencePeriod.start.toISOString(),
        period_ends_at: referencePeriod.end.toISOString(),
        next_reset_at: referencePeriod.nextReset.toISOString(),
        auto_grant_enabled: true,
      });
      if (insErr) throw new Error(`Balance create failed: ${insErr.message}`);
    }

    // Write an audit row only when there's actually a delta to record.
    // Idempotency: migration 224 widens the partial unique index on
    // credit_transactions.idempotency_key to cover `adjust`, so a duplicate
    // tier-change replay raises Postgres 23505 atomically (no SELECT+INSERT
    // race). We swallow that one specific error and surface alreadyApplied.
    let alreadyApplied = false;
    if (proratedDelta !== 0) {
      const { error: txErr } = await admin
        .from('credit_transactions')
        .insert({
          client_id: clientId,
          deliverable_type_id: allot.deliverable_type_id,
          kind: 'adjust',
          delta: proratedDelta,
          actor_user_id: options.actorUserId ?? null,
          note: `Tier change to ${tier.display_name}: ${oldMonthlyCount} to ${newMonthlyCount} prorated by remaining period`,
          idempotency_key: idempotencyKey,
        });
      if (txErr) {
        if ((txErr as { code?: string }).code === '23505') {
          alreadyApplied = true;
        } else {
          throw new Error(`Tier-change ledger write failed: ${txErr.message}`);
        }
      }
    }

    rows.push({
      deliverableTypeId: allot.deliverable_type_id,
      deliverableTypeSlug: slug,
      oldMonthlyCount: existing ? oldMonthlyCount : null,
      newMonthlyCount,
      proratedDelta,
      rowCreated: !existing,
      alreadyApplied,
    });
  }

  // Orphan cleanup pass.
  //
  // Any balance row whose deliverable_type isn't covered by the new tier
  // (i.e. a Full Social → Studio downgrade leaves ugc_video orphaned) needs
  // to wind down. Without this pass the row keeps its old monthly_allowance
  // and auto_grant_enabled = true, so the next monthly_reset cron will
  // re-grant the stale allowance and the client effectively keeps the old
  // tier's perks for one type indefinitely.
  //
  // Symmetric proration: treat newCount = 0 and apply the same prorate()
  // formula. The remainder of the current period winds down naturally; the
  // next reset writes 0 and the row goes dormant. We also flip
  // auto_grant_enabled = false belt-and-suspenders so a buggy reset cron
  // doesn't accidentally re-grant.
  const allottedTypeIds = new Set(allotments.map((a) => a.deliverable_type_id));
  const orphans = balances.filter(
    (b) => !allottedTypeIds.has(b.deliverable_type_id),
  );
  for (const orphan of orphans) {
    const slug = slugById.get(orphan.deliverable_type_id) ?? 'unknown';
    const oldMonthlyCount = orphan.monthly_allowance;
    const newMonthlyCount = 0;
    const proratedDelta = prorate(
      newMonthlyCount,
      oldMonthlyCount,
      new Date(orphan.period_started_at),
      new Date(orphan.period_ends_at),
      now,
    );

    const idempotencyKey = `tier-change:${clientId}:${newTierId}:${orphan.period_started_at}:${orphan.deliverable_type_id}`;

    // Same idempotency gate as the in-tier loop. We only check when there's
    // a delta to write, but we still want the balance + flag updates to be
    // safe under replay, so the UPDATE itself is naturally idempotent
    // (writes are equal-state on second run).
    if (proratedDelta !== 0) {
      const { data: priorRows } = await admin
        .from('credit_transactions')
        .select('id')
        .eq('idempotency_key', idempotencyKey)
        .limit(1);
      if (priorRows && priorRows.length > 0) {
        rows.push({
          deliverableTypeId: orphan.deliverable_type_id,
          deliverableTypeSlug: slug,
          oldMonthlyCount,
          newMonthlyCount,
          proratedDelta,
          rowCreated: false,
          alreadyApplied: true,
        });
        continue;
      }
    }

    const { error: updErr } = await admin
      .from('client_credit_balances')
      .update({
        package_tier_id: newTierId,
        monthly_allowance: 0,
        rollover_policy: 'none',
        rollover_cap: null,
        auto_grant_enabled: false,
        current_balance: orphan.current_balance + proratedDelta,
      })
      .eq('client_id', clientId)
      .eq('deliverable_type_id', orphan.deliverable_type_id);
    if (updErr) throw new Error(`Orphan balance update failed: ${updErr.message}`);

    let alreadyApplied = false;
    if (proratedDelta !== 0) {
      const { error: txErr } = await admin
        .from('credit_transactions')
        .insert({
          client_id: clientId,
          deliverable_type_id: orphan.deliverable_type_id,
          kind: 'adjust',
          delta: proratedDelta,
          actor_user_id: options.actorUserId ?? null,
          note: `Tier change to ${tier.display_name}: ${slug} no longer covered, ${oldMonthlyCount} prorated wind-down`,
          idempotency_key: idempotencyKey,
        });
      if (txErr) {
        if ((txErr as { code?: string }).code === '23505') {
          alreadyApplied = true;
        } else {
          throw new Error(`Orphan ledger write failed: ${txErr.message}`);
        }
      }
    }

    rows.push({
      deliverableTypeId: orphan.deliverable_type_id,
      deliverableTypeSlug: slug,
      oldMonthlyCount,
      newMonthlyCount,
      proratedDelta,
      rowCreated: false,
      alreadyApplied,
    });
  }

  return {
    clientId,
    newTierId,
    newTierSlug: tier.slug,
    newTierDisplayName: tier.display_name,
    rows,
  };
}
