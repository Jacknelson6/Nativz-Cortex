'use client';

import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Section } from './section';
import { formatTimestamp } from './format';

/**
 * Sub-dialog that replays the exact HTML body of an archived share-link
 * email. Used by both the SMM (calendar-link-detail) and Editing
 * (editing-project-detail) modals so the "Past emails" experience is
 * identical across surfaces.
 *
 * The HTML is rendered inside a sandboxed iframe — the email may
 * contain client-side JS or form actions, and the archive should be a
 * read-only replay rather than a live document. `sandbox=""` blocks
 * scripts, top-level navigation, and form submission while still
 * letting the layout render.
 */

export interface ArchivedEmail {
  id: string;
  kind: string;
  subject: string;
  html_body: string;
  plain_body: string | null;
  recipients: { email: string; name?: string | null }[];
  sent_by: string | null;
  sent_by_label: string | null;
  sent_at: string;
}

export const EMAIL_KIND_LABEL: Record<string, string> = {
  initial: 'Initial send',
  resend: 'Resend',
  delivery: 'Delivery',
  rereview: 'Re-review',
  manual_followup: 'Manual followup',
  auto_followup_open: 'Auto followup (open nudge)',
  auto_followup_action: 'Auto followup (action nudge)',
  auto_followup_final: 'Auto followup (final)',
  all_approved: 'All approved',
  revisions_complete: 'Revisions complete',
};

export function EmailArchiveDialog({
  email,
  onClose,
}: {
  email: ArchivedEmail | null;
  onClose: () => void;
}) {
  const open = !!email;
  return (
    <Dialog open={open} onClose={onClose} title="" maxWidth="2xl" bodyClassName="p-0">
      {email ? (
        <div className="flex h-full max-h-[80vh] flex-col">
          <div className="border-b border-nativz-border py-4 pl-6 pr-14">
            <p className="text-lg font-semibold text-text-primary">
              {email.subject}
            </p>
            <p className="mt-0.5 text-xs text-text-muted">
              {EMAIL_KIND_LABEL[email.kind] ?? email.kind} ·{' '}
              {formatTimestamp(email.sent_at)}
              {email.sent_by_label ? ` · sent by ${email.sent_by_label}` : ''}
            </p>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-6">
            <Section label={`Recipients (${email.recipients.length})`}>
              {email.recipients.length === 0 ? (
                <p className="text-xs text-text-muted">No recipients recorded.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {email.recipients.map((r) => (
                    <span
                      key={r.email}
                      className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-surface px-2.5 py-1 text-[11px] text-text-secondary"
                      title={r.email}
                    >
                      <span className="font-medium text-text-primary">
                        {r.name ?? r.email}
                      </span>
                      {r.name && (
                        <span className="text-text-muted">· {r.email}</span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </Section>

            <Section label="Rendered email">
              <iframe
                title="Archived email"
                srcDoc={email.html_body}
                sandbox=""
                className="h-[480px] w-full rounded-md border border-nativz-border bg-white"
              />
              <p className="mt-2 text-[11px] text-text-muted">
                Exact HTML that was delivered. Sandboxed: links and scripts are inert.
              </p>
            </Section>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-nativz-border px-6 py-4">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
