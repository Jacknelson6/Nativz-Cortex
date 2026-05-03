/**
 * Credits notification orchestration.
 *
 * Two thresholds, both with strict per-period dedup so a noisy week of
 * approvals doesn't spam the same warning over and over:
 *
 *   - Low balance: balance transitions from `>= 2` to `<= 1`.
 *   - Overdraft:  balance transitions from `>= 0` to `< 0`.
 *
 * The transition guard (passing in `previousBalance`) is the cheap part.
 * The expensive part is the per-period flag — we use a conditional UPDATE
 * on `client_credit_balances` so concurrent consumes can't double-send.
 * Whichever process wins the UPDATE race owns the email send; the loser
 * sees zero rows updated and bails. This is the "we tried" semantics
 * documented in `tasks/credits-spec.md`: the flag is stamped BEFORE the
 * Resend call, so a network error doesn't leave us in a state where
 * re-firing the email is allowed.
 *
 * Send failures are logged to `failed_email_attempts` for the daily admin
 * digest, never auto-retried (most failures are bad recipient lists, not
 * transient).
 *
 * The `nativz` agency-aware sender lives in `lib/email/resend.ts`. This
 * file resolves the recipients + period state and delegates rendering.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendScopeApproachingEmail, sendScopeOverEmail } from '@/lib/email/resend';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { deliverableCopy } from '@/lib/deliverables/copy';
import { getDeliverableTypeSlug } from '@/lib/deliverables/types-cache';

// Same role exclusions as the revised-videos email — keep these in sync with
// EXCLUDE_ROLE_PATTERNS in app/api/calendar/share/[token]/comment/route.ts and
// app/api/cron/calendar-reminders/route.ts. Paid-media-only POCs don't care
// about organic content; "Avoid bulk" is a manual flag for hand-curated comms.
const EXCLUDE_ROLE_PATTERNS = [/paid media only/i, /avoid bulk/i];

type Threshold = 'low_balance' | 'overdraft';

interface ResolvedRecipients {
  emails: string[];
  pocFirstNames: string[];
  /** Set when we fell back to a contact flagged is_primary because the POC
   *  filter returned zero contacts. Surfaced to the server log so we can
   *  tell the difference between "filtered" and "had to fall back". */
  fallbackUsed: boolean;
}

function firstName(full: string): string {
  return (full.split(/\s+/)[0] || full).trim();
}

/**
 * Resolve recipients for a credit warning. Strategy:
 *   1. Pull every contact for the client.
 *   2. Filter out paid-media-only / avoid-bulk roles.
 *   3. Filter to rows with a non-empty email.
 *   4. If empty, fall back to contacts where `is_primary = true` (still
 *      respecting the exclude filter — a primary POC marked "avoid bulk"
 *      probably wants to stay quiet).
 *   5. Return `{ emails: [], ... }` when there's nothing usable; caller
 *      handles the "silent client" log.
 *
 * The spec mentions `client.primary_email`, but that column doesn't exist
 * in our schema (verified via grep against migrations). The semantically
 * equivalent fallback is `contacts.is_primary = true`, which is what the
 * primary-POC UI ships today.
 */
async function resolveRecipients(
  admin: SupabaseClient,
  clientId: string,
): Promise<ResolvedRecipients> {
  const { data: contacts } = await admin
    .from('contacts')
    .select('name, email, role, is_primary')
    .eq('client_id', clientId)
    .returns<Array<{
      name: string;
      email: string | null;
      role: string | null;
      is_primary: boolean | null;
    }>>();

  const all = contacts ?? [];

  const eligible = all.filter(
    (c) =>
      !!c.email && !EXCLUDE_ROLE_PATTERNS.some((re) => re.test(c.role ?? '')),
  );

  if (eligible.length > 0) {
    return {
      emails: eligible.map((c) => c.email!) as string[],
      pocFirstNames: eligible.map((c) => firstName(c.name)),
      fallbackUsed: false,
    };
  }

  // Fallback: any primary contact, even if their role didn't match the POC
  // filter. We still respect the exclude patterns so a "primary, avoid bulk"
  // contact stays silent.
  const fallback = all.filter(
    (c) =>
      c.is_primary === true &&
      !!c.email &&
      !EXCLUDE_ROLE_PATTERNS.some((re) => re.test(c.role ?? '')),
  );
  return {
    emails: fallback.map((c) => c.email!) as string[],
    pocFirstNames: fallback.map((c) => firstName(c.name)),
    fallbackUsed: fallback.length > 0,
  };
}

interface MaybeNotifyArgs {
  clientId: string;
  /** Balance BEFORE the consume that just landed. Used to detect transition. */
  previousBalance: number;
  /** Balance AFTER the consume. */
  newBalance: number;
  /**
   * Per-type discriminator after migration 221. The balance + period flag
   * columns live on the (client_id, deliverable_type_id) row so each type
   * gets its own dedup window.
   */
  deliverableTypeId: string;
}

/**
 * Run after a successful consume. Decides whether to fire either of the
 * two threshold emails, atomically stamping the period flag so concurrent
 * consumes can't double-send.
 *
 * Hooks call this in a `try/catch` because failures here must never block
 * the comment write — same semantics as `consumeForApproval` itself.
 */
export async function maybeSendBalanceWarning(
  admin: SupabaseClient,
  args: MaybeNotifyArgs,
): Promise<void> {
  const { clientId, previousBalance, newBalance, deliverableTypeId } = args;

  // Detect transitions first — cheaper than any DB call.
  const crossedLow = previousBalance >= 2 && newBalance <= 1;
  const crossedOverdraft = previousBalance >= 0 && newBalance < 0;
  if (!crossedLow && !crossedOverdraft) return;

  // Overdraft takes precedence — if we crossed both in one consume (e.g.
  // balance went 1 -> 0 in a single step is not overdraft, but a freak
  // concurrent state could land us at -1 from 1), we want the more severe
  // notification.
  const threshold: Threshold = crossedOverdraft ? 'overdraft' : 'low_balance';

  // Need the period_id + monthly_allowance + agency for both the dedup
  // stamp and the email body. Single round-trip.
  const { data: balance } = await admin
    .from('client_credit_balances')
    .select(
      'client_id, current_balance, monthly_allowance, period_started_at, next_reset_at, low_balance_email_period_id, overdraft_email_period_id',
    )
    .eq('client_id', clientId)
    .eq('deliverable_type_id', deliverableTypeId)
    .maybeSingle<{
      client_id: string;
      current_balance: number;
      monthly_allowance: number;
      period_started_at: string;
      next_reset_at: string;
      low_balance_email_period_id: string | null;
      overdraft_email_period_id: string | null;
    }>();

  if (!balance) {
    console.warn(
      `[credits.email] no balance row for client ${clientId}; skipping notification`,
    );
    return;
  }

  // Period id == period_started_at::date as text. Matches the format used
  // by the consume_credit RPC's grant idempotency keys.
  const periodId = balance.period_started_at.slice(0, 10);

  const flagColumn =
    threshold === 'overdraft'
      ? 'overdraft_email_period_id'
      : 'low_balance_email_period_id';
  const sentAtColumn =
    threshold === 'overdraft'
      ? 'overdraft_email_sent_at'
      : 'low_balance_email_sent_at';
  const currentFlag =
    threshold === 'overdraft'
      ? balance.overdraft_email_period_id
      : balance.low_balance_email_period_id;

  if (currentFlag === periodId) {
    // Already sent this period. Common path on a busy week of approvals.
    return;
  }

  // Atomic stamp. Conditional `is.null,neq.<periodId>` so two concurrent
  // consumes can't both win the race. Whichever lands first stamps; the
  // other's UPDATE returns zero rows.
  const nowIso = new Date().toISOString();
  const { data: stamped } = await admin
    .from('client_credit_balances')
    .update({
      [flagColumn]: periodId,
      [sentAtColumn]: nowIso,
    })
    .eq('client_id', clientId)
    .eq('deliverable_type_id', deliverableTypeId)
    .or(`${flagColumn}.is.null,${flagColumn}.neq.${periodId}`)
    .select('client_id')
    .maybeSingle<{ client_id: string }>();

  if (!stamped) {
    // Lost the race — another concurrent consume just stamped. Bail.
    return;
  }

  // We won the race; send the email. Failures get logged to
  // failed_email_attempts but the period flag stays stamped ("we tried").
  const recipients = await resolveRecipients(admin, clientId);

  if (recipients.emails.length === 0) {
    console.warn(
      `[credits.email] no eligible recipients for client ${clientId} (${threshold}); period flag stamped, skipping send`,
    );
    return;
  }

  // Need client display name + agency for branding.
  const { data: client } = await admin
    .from('clients')
    .select('name, agency')
    .eq('id', clientId)
    .maybeSingle<{ name: string | null; agency: string | null }>();
  const clientName = client?.name ?? 'Your brand';
  const agency = getBrandFromAgency(client?.agency ?? null);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  const deliverablesUrl = `${appUrl}/deliverables`;
  const nextResetLabel = new Date(balance.next_reset_at).toLocaleDateString(
    'en-US',
    { month: 'short', day: 'numeric' },
  );

  // Resolve the deliverable type's client-facing copy so the email names
  // the bucket that's running low (no more "credits" in client-visible
  // strings).
  const slug = await getDeliverableTypeSlug(admin, deliverableTypeId);
  const copy = deliverableCopy(slug);
  const templateKey =
    threshold === 'overdraft' ? 'scope_over' : 'scope_approaching';

  try {
    const result =
      threshold === 'overdraft'
        ? await sendScopeOverEmail({
            to: recipients.emails,
            pocFirstNames: recipients.pocFirstNames,
            clientName,
            deliverableNounPlural: copy.plural,
            deliverableShortLabel: copy.shortLabel,
            currentBalance: newBalance,
            nextResetLabel,
            deliverablesUrl,
            agency,
            clientId,
          })
        : await sendScopeApproachingEmail({
            to: recipients.emails,
            pocFirstNames: recipients.pocFirstNames,
            clientName,
            deliverableNounPlural: copy.plural,
            deliverableShortLabel: copy.shortLabel,
            currentBalance: newBalance,
            monthlyAllowance: balance.monthly_allowance,
            nextResetLabel,
            deliverablesUrl,
            agency,
            clientId,
          });

    if (!result.ok) {
      await admin.from('failed_email_attempts').insert({
        client_id: clientId,
        deliverable_type_id: deliverableTypeId,
        template: templateKey,
        period_id: periodId,
        recipients: recipients.emails,
        error_message: result.error ?? 'unknown send error',
      });
      console.error(
        `[credits.email] ${threshold} send failed for client ${clientId}: ${result.error}`,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown send error';
    await admin.from('failed_email_attempts').insert({
      client_id: clientId,
      deliverable_type_id: deliverableTypeId,
      template: templateKey,
      period_id: periodId,
      recipients: recipients.emails,
      error_message: message,
    });
    console.error(`[credits.email] ${threshold} send threw for client ${clientId}:`, err);
  }
}
