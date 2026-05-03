/**
 * Subtle credits status pill.
 *
 * Renders inline near the approve buttons on the share-link review page.
 * Per spec, this is a *soft* signal — never blocks approval, never throws
 * a modal. Three states:
 *
 *   - Healthy (balance > 1):   "8 credits left this month"  · neutral chrome
 *   - Low     (balance == 1):  "1 credit left this month"   · neutral chrome
 *                              (we already sent the email at the >=2 → <=1
 *                              transition; pill copy stays calm)
 *   - Zero    (balance == 0):  "0 left, contact us to top up" · amber
 *   - Over    (balance < 0):   "0 left, contact us to top up" · amber
 *
 * Hidden when `credits === null` (client has no balance row yet, e.g.
 * brand new accounts that haven't been backfilled).
 */

interface BalancePillProps {
  credits: {
    current_balance: number;
    monthly_allowance: number;
  } | null;
}

export function BalancePill({ credits }: BalancePillProps) {
  if (!credits) return null;

  const balance = credits.current_balance;
  const isOver = balance <= 0;

  const label = isOver
    ? '0 left, contact us to top up'
    : `${balance} ${balance === 1 ? 'credit' : 'credits'} left this month`;

  // Amber when over so the pill catches the eye without being alarming.
  // Healthy state stays muted: the reviewer's primary job is still to
  // approve videos, the pill is supporting context only.
  const tone = isOver
    ? 'border-amber-300/40 bg-amber-300/10 text-amber-300'
    : 'border-nativz-border bg-surface text-text-secondary';

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone}`}
      title={
        isOver
          ? 'You\'re over this month\'s credit allowance. Approvals still work, billing will reflect the overage.'
          : `${credits.monthly_allowance} credits granted this month`
      }
    >
      {label}
    </span>
  );
}
