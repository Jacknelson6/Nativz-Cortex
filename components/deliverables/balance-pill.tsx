/**
 * Per-type balance pill rendered on the share-link review page.
 *
 * Replaces `components/credits/balance-pill.tsx`. Three differences:
 *
 *   1. Multi-type. Shows "12 Edited · 3 UGC · 47 Graphics left" instead
 *      of a single number. Each segment is independent, if a type is
 *      out, only that segment goes amber.
 *   2. Speaks deliverable language. The word "credit" never appears
 *      anywhere this pill renders.
 *   3. The directional pivot bans silent overage. When the type tied to
 *      the current approve action hits 0 the pill goes amber, the tooltip
 *      explains the soft block, and the consuming view disables its
 *      approve button. That gating happens in the parent (the share-link
 *      page already knows which type is being approved); this component
 *      is presentational only.
 *
 * Hidden when `balances` is empty (brand new account, no types yet).
 */

import type { DeliverableBalance } from '@/lib/deliverables/get-balances';
import { deliverableCopy } from '@/lib/deliverables/copy';

interface BalancePillProps {
  balances: DeliverableBalance[];
  /**
   * The type the current approve action will consume. The matching segment
   * gets the amber treatment when balance <= 0; other segments stay neutral.
   * Optional, when omitted the pill renders all segments in neutral chrome
   * with per-segment amber for any zero balance.
   */
  approvingTypeSlug?: DeliverableBalance['deliverableTypeSlug'];
}

export function BalancePill({ balances, approvingTypeSlug }: BalancePillProps) {
  const visible = balances.filter((b) => b.hasRow);
  if (visible.length === 0) return null;

  // Sort matches the list sort (sortOrder ascending) so segment order is
  // consistent across surfaces.
  const sorted = visible.slice().sort((a, b) => a.sortOrder - b.sortOrder);

  const anyZero = sorted.some((b) => b.currentBalance <= 0);
  const approvingTypeOut =
    approvingTypeSlug != null &&
    sorted.find((b) => b.deliverableTypeSlug === approvingTypeSlug)?.currentBalance != null &&
    (sorted.find((b) => b.deliverableTypeSlug === approvingTypeSlug)?.currentBalance ?? 0) <= 0;

  const tone = approvingTypeOut
    ? 'border-amber-300/40 bg-amber-300/10 text-amber-300'
    : anyZero
      ? 'border-amber-300/30 bg-amber-300/5 text-amber-300/90'
      : 'border-nativz-border bg-surface text-text-secondary';

  const segments = sorted.map((b) => {
    const copy = deliverableCopy(b.deliverableTypeSlug);
    const noun = b.currentBalance === 1 ? copy.singular : copy.plural;
    return `${b.currentBalance} ${noun.toLowerCase()}`;
  });

  const tooltip = approvingTypeOut
    ? approvingTypeSlug
      ? `Out of ${deliverableCopy(approvingTypeSlug).plural} for this period. Buy an add-on to keep approving.`
      : 'Out of this type for the period.'
    : sorted
        .map((b) => {
          const copy = deliverableCopy(b.deliverableTypeSlug);
          return `${b.currentBalance} of ${b.monthlyAllowance} ${copy.plural} remaining`;
        })
        .join(' · ');

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone}`}
      title={tooltip}
    >
      {segments.join(' · ')} left
    </span>
  );
}
