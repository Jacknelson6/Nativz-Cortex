/**
 * Fires Resend emails to a tracker's configured notify_emails[] list after
 * a client action (item tick, file upload, connection confirmed, etc).
 *
 * Deliberately fire-and-forget (`void`) from the caller's POV — we never
 * want a slow Resend hiccup to block the client's UI response. Errors are
 * swallowed + console-logged so a bad email address doesn't cascade into
 * a 500 on the public endpoint.
 *
 * Event kinds that ship:
 *   - item_completed       → "Client ticked 'Task X'"
 *   - file_uploaded        → "Client uploaded filename.mp4"
 *   - connection_confirmed → "Client confirmed access to Instagram"
 *
 * Uncompleted + viewed events are intentionally NOT emailed — too chatty.
 * They still live in onboarding_events for the admin feed.
 */
import { sendOnboardingEmail } from '@/lib/email/resend';

export type NotifiableEventKind =
  | 'item_completed'
  | 'file_uploaded'
  | 'connection_confirmed';

interface NotifyInput {
  notifyEmails: string[];
  clientName: string;
  service: string;
  kind: NotifiableEventKind;
  detail: string;   // one-liner: task name, file name, platform, etc.
  shareUrl: string; // link back to the public page for context
}

export async function notifyManagers(input: NotifyInput): Promise<void> {
  const recipients = (input.notifyEmails ?? []).map((e) => e.trim()).filter(Boolean);
  if (recipients.length === 0) return;

  const verb =
    input.kind === 'item_completed'
      ? 'ticked off a task'
      : input.kind === 'file_uploaded'
        ? 'uploaded a file'
        : 'confirmed an access grant';

  const subject = `${input.clientName}: ${input.detail}`;
  const bodyMarkdown = [
    `# ${input.clientName} just ${verb}.`,
    '',
    `**${input.service}** onboarding · ${input.detail}`,
    '',
    `Take a look and keep momentum going.`,
    '',
    `[Open onboarding →](${input.shareUrl})`,
    '',
    '---',
    '',
    `You're getting this because you're on the notify list for this tracker.`,
  ].join('\n');

  // Fire in parallel so many recipients don't stack the latency. Failures
  // are logged per-recipient and never thrown.
  await Promise.all(
    recipients.map(async (to) => {
      try {
        const result = await sendOnboardingEmail({
          to,
          subject,
          bodyMarkdown,
        });
        if (!result.ok) {
          console.error(`[notifyManagers] Resend failed for ${to}:`, result.error);
        }
      } catch (err) {
        console.error(`[notifyManagers] threw for ${to}:`, err);
      }
    }),
  );
}
