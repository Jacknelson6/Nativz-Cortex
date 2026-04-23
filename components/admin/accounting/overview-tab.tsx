import { CalendarDays, DollarSign, Lock, CheckCircle2 } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { SectionTile } from '@/components/admin/section-tabs';
import { centsToDollars } from '@/lib/accounting/periods';

/**
 * At-a-glance accounting tiles. Counts pull from payroll_periods +
 * payroll_entries, scoped to the last 90 days so historical rows don't
 * dominate the "current state" read.
 */
async function loadStats() {
  try {
    const admin = createAdminClient();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [periodsRes, entriesRes] = await Promise.all([
      admin
        .from('payroll_periods')
        .select('id, status, start_date')
        .gte('start_date', ninetyDaysAgo),
      admin
        .from('payroll_entries')
        .select('period_id, amount_cents, margin_cents'),
    ]);

    const periods = periodsRes.data ?? [];
    const entries = entriesRes.data ?? [];

  const periodIds = new Set(periods.map((p) => p.id));
  const recentEntries = entries.filter((e) => periodIds.has(e.period_id));

  const totalPayoutCents = recentEntries.reduce((s, e) => s + Number(e.amount_cents ?? 0), 0);
  const totalMarginCents = recentEntries.reduce((s, e) => s + Number(e.margin_cents ?? 0), 0);
  const draftCount = periods.filter((p) => p.status === 'draft').length;
  const lockedCount = periods.filter((p) => p.status === 'locked').length;
  const paidCount = periods.filter((p) => p.status === 'paid').length;

    return {
      periodCount: periods.length,
      draftCount,
      lockedCount,
      paidCount,
      totalPayoutCents,
      totalMarginCents,
      entryCount: recentEntries.length,
    };
  } catch (err) {
    console.error('[accounting overview] loadStats failed (returning empty):', err);
    return {
      periodCount: 0,
      draftCount: 0,
      lockedCount: 0,
      paidCount: 0,
      totalPayoutCents: 0,
      totalMarginCents: 0,
      entryCount: 0,
    };
  }
}

export async function AccountingOverviewTab() {
  const s = await loadStats();
  const base = '/admin/accounting';

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        Bi-monthly payroll state for the last 90 days. Click a tile to drill in.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SectionTile
          href={`${base}?tab=periods`}
          icon={<CalendarDays size={18} />}
          title="Periods"
          status={s.periodCount > 0 ? 'ok' : 'soon'}
          primary={`${s.periodCount} period${s.periodCount === 1 ? '' : 's'} (90d)`}
          secondary={`${s.draftCount} draft · ${s.lockedCount} locked · ${s.paidCount} paid`}
        />
        <SectionTile
          href={`${base}?tab=periods`}
          icon={<DollarSign size={18} />}
          title="Payouts (90d)"
          primary={centsToDollars(s.totalPayoutCents)}
          secondary={`${s.entryCount} entr${s.entryCount === 1 ? 'y' : 'ies'}`}
        />
        <SectionTile
          href={`${base}?tab=periods`}
          icon={<DollarSign size={18} />}
          title="Margin (90d)"
          primary={centsToDollars(s.totalMarginCents)}
          secondary="Across all locked + paid periods"
        />
        <SectionTile
          href={`${base}?tab=periods`}
          icon={<Lock size={18} />}
          title="Locked"
          status={s.lockedCount > 0 ? 'warn' : 'ok'}
          primary={`${s.lockedCount} period${s.lockedCount === 1 ? '' : 's'} awaiting payout`}
          secondary="Locked periods are ready to pay"
        />
        <SectionTile
          href={`${base}?tab=periods`}
          icon={<CheckCircle2 size={18} />}
          title="Paid"
          primary={`${s.paidCount} period${s.paidCount === 1 ? '' : 's'} closed (90d)`}
          secondary="Full payout cycle complete"
        />
        <SectionTile
          href={`${base}?tab=year`}
          icon={<CalendarDays size={18} />}
          title="Year view"
          primary="Full calendar year"
          secondary="Monthly payout + margin roll-up"
        />
      </div>
    </div>
  );
}
