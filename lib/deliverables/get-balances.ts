/**
 * getDeliverableBalances, per-client, per-type balance loader.
 *
 * Returns one entry per active deliverable type so UI code can write
 * `balances.find(b => b.deliverableTypeSlug === 'edited_video')` without
 * hand-rolling lookups against ids. Phase B's deliverables shell renders
 * one card per entry returned here.
 *
 * Shape: "every active type, with a balance row OR a zeroed placeholder."
 * That keeps the UI from having to special-case "client has never had a
 * UGC balance"; the placeholder is `hasRow: false` and renders as a
 * "not enabled" card.
 *
 * Reasoning behind the placeholder: a client only gets balance rows once
 * something is granted (top-up, monthly reset, manual adjust). Phase A
 * only seeds edited_video. Phase B+ packages will start seeding ugc_video
 * / static_graphic via per-tier setup. Until then the placeholder is the
 * honest "this type is available, you don't have any."
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeliverableTypeSlug } from '@/lib/credits/types';
import { listDeliverableTypes } from './types-cache';

export interface DeliverableBalance {
  deliverableTypeId: string;
  deliverableTypeSlug: DeliverableTypeSlug;
  displayName: string;
  sortOrder: number;
  /** True when there's an actual balance row; false when this is a placeholder. */
  hasRow: boolean;
  currentBalance: number;
  monthlyAllowance: number;
  rolloverPolicy: 'none' | 'cap' | 'unlimited';
  rolloverCap: number | null;
  autoGrantEnabled: boolean;
  /** ISO timestamp; non-null when the cron has been told to skip this row. */
  pausedUntil: string | null;
  /** Free-form admin reason; mirrors paused_until visibility. */
  pauseReason: string | null;
  periodStartedAt: string | null;
  nextResetAt: string | null;
}

interface BalanceRow {
  deliverable_type_id: string;
  current_balance: number;
  monthly_allowance: number;
  rollover_policy: 'none' | 'cap' | 'unlimited';
  rollover_cap: number | null;
  auto_grant_enabled: boolean;
  paused_until: string | null;
  pause_reason: string | null;
  period_started_at: string;
  next_reset_at: string;
}

export async function getDeliverableBalances(
  admin: SupabaseClient,
  clientId: string,
): Promise<DeliverableBalance[]> {
  const [types, balanceResult] = await Promise.all([
    listDeliverableTypes(admin),
    admin
      .from('client_credit_balances')
      .select(
        'deliverable_type_id, current_balance, monthly_allowance, rollover_policy, rollover_cap, auto_grant_enabled, paused_until, pause_reason, period_started_at, next_reset_at',
      )
      .eq('client_id', clientId)
      .returns<BalanceRow[]>(),
  ]);

  const byType = new Map<string, BalanceRow>();
  for (const row of balanceResult.data ?? []) {
    byType.set(row.deliverable_type_id, row);
  }

  return types.map((t) => {
    const row = byType.get(t.id);
    if (!row) {
      return {
        deliverableTypeId: t.id,
        deliverableTypeSlug: t.slug,
        displayName: t.display_name,
        sortOrder: t.sort_order,
        hasRow: false,
        currentBalance: 0,
        monthlyAllowance: 0,
        rolloverPolicy: 'none',
        rolloverCap: null,
        autoGrantEnabled: true,
        pausedUntil: null,
        pauseReason: null,
        periodStartedAt: null,
        nextResetAt: null,
      };
    }
    return {
      deliverableTypeId: t.id,
      deliverableTypeSlug: t.slug,
      displayName: t.display_name,
      sortOrder: t.sort_order,
      hasRow: true,
      currentBalance: row.current_balance,
      monthlyAllowance: row.monthly_allowance,
      rolloverPolicy: row.rollover_policy,
      rolloverCap: row.rollover_cap,
      autoGrantEnabled: row.auto_grant_enabled,
      pausedUntil: row.paused_until,
      pauseReason: row.pause_reason,
      periodStartedAt: row.period_started_at,
      nextResetAt: row.next_reset_at,
    };
  });
}
