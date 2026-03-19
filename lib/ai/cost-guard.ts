import { createAdminClient } from '@/lib/supabase/admin';

// ── Budget configuration ────────────────────────────────────────────────────

const DEFAULT_MONTHLY_BUDGET_USD = 500;

/** Per-feature monthly limits (USD). Features not listed here use the global budget only. */
const FEATURE_BUDGETS: Record<string, number> = {
  'brand_dna_generation': 50,
  'video_analysis': 100,
  'script_generation': 100,
  'idea_generation': 100,
};

export interface CostBudgetResult {
  allowed: boolean;
  spent: number;
  limit: number;
  featureSpent?: number;
  featureLimit?: number;
}

/**
 * Check whether the AI cost budget allows another call.
 *
 * Queries `api_usage_logs` for total `cost_usd` in the current calendar month.
 * Respects both a global monthly limit (env `AI_MONTHLY_BUDGET_USD`, default $500)
 * and optional per-feature limits defined in `FEATURE_BUDGETS`.
 */
export async function checkCostBudget(feature: string): Promise<CostBudgetResult> {
  const globalLimit = Number(process.env.AI_MONTHLY_BUDGET_USD) || DEFAULT_MONTHLY_BUDGET_USD;
  const featureLimit = FEATURE_BUDGETS[feature] ?? null;

  const admin = createAdminClient();

  // Start of current calendar month in UTC
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  // Fetch all usage rows for this month in a single query
  const { data: logs, error } = await admin
    .from('api_usage_logs')
    .select('cost_usd, feature')
    .gte('created_at', monthStart);

  if (error) {
    // If we can't verify the budget, fail open with a warning
    console.error('Cost guard: failed to query usage logs, allowing request:', error);
    return { allowed: true, spent: 0, limit: globalLimit };
  }

  const entries = logs ?? [];

  let totalSpent = 0;
  let featureSpent = 0;

  for (const row of entries) {
    const cost = Number(row.cost_usd) || 0;
    totalSpent += cost;
    if (featureLimit !== null && row.feature === feature) {
      featureSpent += cost;
    }
  }

  // Check feature-level budget first (more specific)
  if (featureLimit !== null && featureSpent >= featureLimit) {
    return {
      allowed: false,
      spent: totalSpent,
      limit: globalLimit,
      featureSpent,
      featureLimit,
    };
  }

  // Check global budget
  if (totalSpent >= globalLimit) {
    return {
      allowed: false,
      spent: totalSpent,
      limit: globalLimit,
      featureSpent: featureLimit !== null ? featureSpent : undefined,
      featureLimit: featureLimit ?? undefined,
    };
  }

  return {
    allowed: true,
    spent: totalSpent,
    limit: globalLimit,
    featureSpent: featureLimit !== null ? featureSpent : undefined,
    featureLimit: featureLimit ?? undefined,
  };
}
