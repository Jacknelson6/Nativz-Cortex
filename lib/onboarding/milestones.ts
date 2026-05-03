/**
 * Onboarding milestone detection + admin fanout.
 *
 * The public PATCH handler at /api/public/onboarding/[token] holds the
 * "client just advanced a step" choke point. Each PATCH call has a
 * before / after snapshot of the row. This module compares the two and
 * fires:
 *
 *   - admin in-app notifications (notifyAdmins, scoped by client)
 *   - client-facing "you're done" email (only on status -> completed)
 *
 * Admin notifications use type 'onboarding_milestone' and link to the
 * detail page at /admin/onboarding/[id].
 *
 * Triggers we care about (intentionally narrow - one notification per
 * meaningful transition; we do NOT spam admins after every screen save):
 *
 *   SMM:
 *     - step crosses social_connect (idx 2 -> 3): "X connected their socials"
 *     - step crosses kickoff_pick   (idx 5 -> 6): "X picked a kickoff time"
 *
 *   Editing:
 *     - step crosses asset_link     (idx 2 -> 3): "X dropped their assets"
 *
 *   Either kind:
 *     - status flips to 'completed': "X finished onboarding" + client email
 *
 * Detection compares only `prev.current_step` and `prev.status` to their
 * `next.*` counterparts. Re-entering an earlier step (back nav) does NOT
 * re-fire a milestone since prev.current_step won't be lower than the
 * crossing threshold.
 */

import type { OnboardingRow } from './types';
import { SCREENS } from './screens';
import { notifyAdmins } from '@/lib/notifications';
import { sendOnboardingCompleteEmail } from './email';
import { logEmail } from './api';

interface Milestone {
  /** Short title for the notification + admin feed. */
  title: string;
  /** Optional second-line body. Truncated by createNotification. */
  body?: string;
}

function clientLabel(name: string | null | undefined): string {
  return name && name.trim().length > 0 ? name.trim() : 'A client';
}

/**
 * Returns the screen index *whose completion* causes a step transition
 * to `nextStep`. The stepper writes step_state for screen N then
 * advances current_step to N+1, so when current_step changes from
 * `prev` to `next`, the screen that just finished is `prev`.
 */
function justFinishedScreenKey(
  row: OnboardingRow,
  prevStep: number,
): string | null {
  const screen = SCREENS[row.kind][prevStep];
  return screen?.key ?? null;
}

/**
 * Compute the list of milestones to fire on this transition. Empty
 * array when nothing meaningful changed. Pure function.
 */
export function detectMilestones(
  prev: OnboardingRow,
  next: OnboardingRow,
  clientName: string | null,
): Milestone[] {
  const out: Milestone[] = [];
  const label = clientLabel(clientName);

  // Status flip to 'completed' is the headline event.
  if (prev.status !== 'completed' && next.status === 'completed') {
    out.push({
      title: `${label} finished onboarding`,
      body:
        next.kind === 'smm'
          ? 'Brand basics, socials, content prefs, and kickoff time all in. Ready for handoff.'
          : 'Project brief, assets, and turnaround acknowledged. Ready to start editing.',
    });
    // Don't fan out the per-step milestones below when we already
    // announced the completion - keeps the inbox clean.
    return out;
  }

  // Step transitions. We only care when the step actually advanced
  // forward; back nav (next.current_step < prev.current_step) is a no-op.
  if (next.current_step > prev.current_step) {
    // Walk every screen the client crossed in this PATCH (usually one,
    // sometimes more if the screen issued advance_to + complete in
    // sequence). For each crossed screen, look up its milestone.
    for (let s = prev.current_step; s < next.current_step; s += 1) {
      const justDone = justFinishedScreenKey(next, s);
      if (!justDone) continue;

      if (next.kind === 'smm') {
        if (justDone === 'social_connect') {
          out.push({
            title: `${label} connected their social accounts`,
            body: 'Socials are linked in Zernio. Ready to schedule content.',
          });
        } else if (justDone === 'kickoff_pick') {
          out.push({
            title: `${label} picked a kickoff time`,
            body: 'Confirm the calendar invite and prep the kickoff agenda.',
          });
        }
      } else if (next.kind === 'editing') {
        if (justDone === 'asset_link') {
          out.push({
            title: `${label} dropped their editing assets`,
            body: 'Raw footage link is in. Editor can begin pulling selects.',
          });
        }
      }
    }
  }

  return out;
}

/**
 * Fire admin notifications + client completion email for any milestones
 * detected on this transition. Best-effort: failures are logged and
 * never thrown so a flaky email never blocks the client's PATCH.
 */
export async function notifyMilestones(opts: {
  prev: OnboardingRow;
  next: OnboardingRow;
  clientName: string | null;
}): Promise<void> {
  const milestones = detectMilestones(opts.prev, opts.next, opts.clientName);
  if (milestones.length === 0) return;

  const linkPath = `/admin/onboarding/${opts.next.id}`;

  // Fire admin in-app notifications. notifyAdmins handles the
  // scoped-by-client + owner fanout + preference filtering.
  await Promise.all(
    milestones.map((m) =>
      notifyAdmins({
        type: 'onboarding_milestone',
        title: m.title,
        body: m.body,
        linkPath,
        clientId: opts.next.client_id,
      }).catch((err) => {
        console.warn('[onboarding/milestones] notifyAdmins failed:', err);
      }),
    ),
  );

  // Fire the client-facing completion email exactly once on status flip.
  if (opts.prev.status !== 'completed' && opts.next.status === 'completed') {
    try {
      const sentList = await sendOnboardingCompleteEmail({
        onboarding: opts.next,
      });
      for (const sent of sentList) {
        await logEmail({
          onboarding_id: opts.next.id,
          kind: 'complete',
          to_email: sent.to,
          subject: sent.subject,
          body_preview: sent.body_preview,
          resend_id: sent.resend_id,
          ok: sent.ok,
          error: sent.error,
          triggered_by: null,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // A brand with zero POC contacts is a normal state for fresh
      // clients (and every E2E seed). Don't dump a stack for it.
      if (msg.includes('no contacts on the brand profile')) {
        console.info(
          '[onboarding/milestones] completion email skipped: no POC contacts on client',
          opts.next.client_id,
        );
      } else {
        console.warn('[onboarding/milestones] completion email failed:', err);
      }
    }
  }
}
